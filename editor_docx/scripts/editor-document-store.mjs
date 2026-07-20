import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDocxBytes, readZip } from './docx-api-utils.mjs';

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIVE_DOCUMENT_ID_PATTERN = /^doc_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function decodeJsonBase64Url(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sanitizeFilename(value, fallback = 'Untitled document.docx') {
  const raw = path.basename(String(value || fallback)).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  const stem = raw.replace(/\.docx$/i, '').replace(/[. ]+$/g, '') || 'Untitled document';
  return `${stem.slice(0, 200)}.docx`;
}

function validateDocxBytes(bytes) {
  const buffer = Buffer.from(bytes);
  const entries = readZip(buffer);
  if (!entries.has('[Content_Types].xml') || !entries.has('word/document.xml')) {
    throw new Error('Invalid DOCX package');
  }
  return buffer;
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export class EditorDocumentStore {
  constructor(options) {
    this.root = path.resolve(options.root);
    this.tokenSecret = String(options.tokenSecret || '');
    this.tokenTtlMs = Number(options.tokenTtlMs || 60 * 60 * 1000);
    this.maxFileSize = Number(options.maxFileSize || 50 * 1024 * 1024);
    this.maxDocuments = Number(options.maxDocuments || 1000);
    if (this.tokenSecret.length < 32) {
      throw new Error('EDITOR_GATEWAY_TOKEN_SECRET must be at least 32 characters');
    }
  }

  async init() {
    mkdirSync(this.root, { recursive: true });
    await this.cleanupInterruptedWrites();
  }

  isDocumentId(value) {
    return DOCUMENT_ID_PATTERN.test(String(value || ''));
  }

  async createBlank(options = {}) {
    const title = String(options.title || 'Untitled document').trim().slice(0, 500) || 'Untitled document';
    const initialText = String(options.initialText || '');
    const paragraphs = initialText ? initialText.split(/\r?\n/) : [''];
    return this.createFromBytes({
      title,
      filename: sanitizeFilename(title),
      bytes: createDocxBytes({ paragraphs }),
    });
  }

  async createFromBytes({ title, filename, bytes }) {
    const buffer = validateDocxBytes(bytes);
    if (buffer.length > this.maxFileSize) {
      throw new Error(`DOCX exceeds ${this.maxFileSize} bytes`);
    }
    const existing = await readdir(this.root, { withFileTypes: true });
    if (existing.filter((entry) => entry.isDirectory() && this.isDocumentId(entry.name)).length >= this.maxDocuments) {
      throw new Error('Editor document quota exceeded');
    }
    const documentId = randomUUID();
    const directory = this.documentDirectory(documentId);
    mkdirSync(directory, { recursive: false });
    const now = new Date().toISOString();
    const metadata = {
      documentId,
      title: String(title || path.basename(filename || '', '.docx') || 'Untitled document').trim().slice(0, 500),
      filename: sanitizeFilename(filename || title),
      size: buffer.length,
      version: hashBytes(buffer),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.atomicWrite(this.contentPath(documentId), buffer);
      await this.atomicWrite(this.metadataPath(documentId), Buffer.from(JSON.stringify(metadata, null, 2)));
      return metadata;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async get(documentId) {
    this.assertDocumentId(documentId);
    try {
      const metadata = JSON.parse(await readFile(this.metadataPath(documentId), 'utf8'));
      const contentStat = await stat(this.contentPath(documentId));
      return { ...metadata, size: contentStat.size };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        const notFound = new Error('Document not found');
        notFound.code = 'DOCUMENT_NOT_FOUND';
        throw notFound;
      }
      throw error;
    }
  }

  async read(documentId) {
    await this.get(documentId);
    return readFile(this.contentPath(documentId));
  }

  async write(documentId, bytes) {
    const current = await this.get(documentId);
    const buffer = validateDocxBytes(bytes);
    if (buffer.length > this.maxFileSize) {
      throw new Error(`DOCX exceeds ${this.maxFileSize} bytes`);
    }
    const updated = {
      ...current,
      size: buffer.length,
      version: hashBytes(buffer),
      updatedAt: new Date().toISOString(),
    };
    await this.atomicWrite(this.contentPath(documentId), buffer);
    await this.atomicWrite(this.metadataPath(documentId), Buffer.from(JSON.stringify(updated, null, 2)));
    return updated;
  }

  async delete(documentId) {
    await this.get(documentId);
    await rm(this.documentDirectory(documentId), { recursive: true, force: false });
  }

  issueToken(documentId, options = {}) {
    this.assertTokenDocumentId(documentId);
    const now = Date.now();
    const payload = {
      documentId,
      canWrite: options.canWrite !== false,
      iat: now,
      exp: now + this.tokenTtlMs,
      jti: randomUUID(),
    };
    const encoded = encodeBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', this.tokenSecret).update(encoded).digest('base64url');
    return { token: `${encoded}.${signature}`, expiresAt: payload.exp };
  }

  verifyToken(token, documentId, options = {}) {
    this.assertTokenDocumentId(documentId);
    const [encoded, suppliedSignature, extra] = String(token || '').split('.');
    if (!encoded || !suppliedSignature || extra) {
      throw new Error('Invalid editor token');
    }
    const expectedSignature = createHmac('sha256', this.tokenSecret).update(encoded).digest('base64url');
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error('Invalid editor token');
    }
    const payload = decodeJsonBase64Url(encoded);
    if (payload.documentId !== documentId || !Number.isSafeInteger(payload.exp) || payload.exp <= Date.now()) {
      throw new Error('Invalid or expired editor token');
    }
    if (options.requireWrite && payload.canWrite !== true) {
      throw new Error('Editor token is read-only');
    }
    return payload;
  }

  documentDirectory(documentId) {
    return path.join(this.root, documentId);
  }

  contentPath(documentId) {
    return path.join(this.documentDirectory(documentId), 'document.docx');
  }

  metadataPath(documentId) {
    return path.join(this.documentDirectory(documentId), 'metadata.json');
  }

  assertDocumentId(documentId) {
    if (!this.isDocumentId(documentId)) {
      throw new Error('Invalid documentId');
    }
  }

  assertTokenDocumentId(documentId) {
    if (!this.isDocumentId(documentId) && !LIVE_DOCUMENT_ID_PATTERN.test(String(documentId || ''))) {
      throw new Error('Invalid documentId');
    }
  }

  async atomicWrite(targetPath, bytes) {
    const tempPath = `${targetPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, bytes, { flag: 'wx' });
      await rename(tempPath, targetPath);
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  async cleanupInterruptedWrites() {
    if (!existsSync(this.root)) {
      return;
    }
    const documentDirectories = await readdir(this.root, { withFileTypes: true });
    for (const entry of documentDirectories) {
      if (!entry.isDirectory() || !this.isDocumentId(entry.name)) {
        continue;
      }
      const directory = this.documentDirectory(entry.name);
      for (const filename of await readdir(directory)) {
        if (filename.endsWith('.tmp')) {
          await rm(path.join(directory, filename), { force: true });
        }
      }
    }
  }
}

export { sanitizeFilename, validateDocxBytes };
