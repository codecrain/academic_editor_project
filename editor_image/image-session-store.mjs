import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const DEFAULT_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PROJECT_BYTES = 100 * 1024 * 1024;
const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function bytesStartWith(bytes, signature) {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

export function detectImageMimeType(bytes) {
  const value = Buffer.from(bytes || []);
  if (bytesStartWith(value, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && value.length >= 20 && value.subarray(-8).equals(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]))) return 'image/png';
  if (bytesStartWith(value, [0xff, 0xd8, 0xff]) && value.length >= 4 && value.at(-2) === 0xff && value.at(-1) === 0xd9) return 'image/jpeg';
  if ((bytesStartWith(value, Buffer.from('GIF87a')) || bytesStartWith(value, Buffer.from('GIF89a'))) && value.length >= 7 && value.at(-1) === 0x3b) return 'image/gif';
  if (bytesStartWith(value, Buffer.from('RIFF')) && value.length >= 12 && value.subarray(8, 12).equals(Buffer.from('WEBP')) && value.readUInt32LE(4) + 8 === value.length) return 'image/webp';
  return '';
}

function normalizeFilename(filename, mimeType) {
  const fallbackExtension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[mimeType] || '.png';
  const base = String(filename || 'image').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 120) || 'image';
  return /\.(png|jpe?g|gif|webp)$/i.test(base) ? base : `${base}${fallbackExtension}`;
}

function tokenMatches(expected, provided) {
  const left = Buffer.from(String(expected || ''), 'utf8');
  const right = Buffer.from(String(provided || ''), 'utf8');
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export class ImageSessionStore {
  constructor({
    maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
    maxProjectBytes = DEFAULT_MAX_PROJECT_BYTES,
    ttlMs = DEFAULT_SESSION_TTL_MS,
  } = {}) {
    this.maxImageBytes = maxImageBytes;
    this.maxProjectBytes = maxProjectBytes;
    this.ttlMs = ttlMs;
    this.sessions = new Map();
  }

  create({ bytes, filename }) {
    this.prune();
    const sourceBytes = Buffer.from(bytes || []);
    if (!sourceBytes.length) throw new Error('Image session requires non-empty source bytes.');
    if (sourceBytes.length > this.maxImageBytes) throw new Error(`Image source exceeds ${this.maxImageBytes} bytes.`);
    const mimeType = detectImageMimeType(sourceBytes);
    if (!mimeType) throw new Error('Image session supports complete PNG, JPEG, GIF, or WebP bytes only.');
    const id = `img_${randomUUID()}`;
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const record = {
      id,
      token,
      filename: normalizeFilename(filename, mimeType),
      sourceBytes,
      sourceMimeType: mimeType,
      resultBytes: null,
      resultMimeType: '',
      projectBytes: null,
      projectMimeType: '',
      createdAt: now,
      lastAccessedAt: now,
    };
    this.sessions.set(id, record);
    return record;
  }

  get(id, token) {
    this.prune();
    const record = this.sessions.get(String(id || ''));
    if (!record || !tokenMatches(record.token, token)) return null;
    record.lastAccessedAt = Date.now();
    return record;
  }

  save(id, token, bytes) {
    const record = this.get(id, token);
    if (!record) throw new Error('Image session was not found or the capability token is invalid.');
    const resultBytes = Buffer.from(bytes || []);
    if (!resultBytes.length) throw new Error('Image export requires non-empty bytes.');
    if (resultBytes.length > this.maxImageBytes) throw new Error(`Image export exceeds ${this.maxImageBytes} bytes.`);
    const resultMimeType = detectImageMimeType(resultBytes);
    if (!resultMimeType) throw new Error('Image export supports complete PNG, JPEG, GIF, or WebP bytes only.');
    record.resultBytes = resultBytes;
    record.resultMimeType = resultMimeType;
    return record;
  }

  saveProject(id, token, value) {
    const record = this.get(id, token);
    if (!record) throw new Error('Image session was not found or the capability token is invalid.');
    const projectBytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value || ''), 'utf8');
    if (!projectBytes.length) throw new Error('Layered project export requires non-empty JSON bytes.');
    if (projectBytes.length > this.maxProjectBytes) {
      throw new Error(`Layered project export exceeds ${this.maxProjectBytes} bytes.`);
    }
    let project;
    try {
      project = JSON.parse(projectBytes.toString('utf8'));
    } catch {
      throw new Error('Layered project export must be valid UTF-8 JSON.');
    }
    if (!project || typeof project !== 'object' || !project.info || !Array.isArray(project.layers)) {
      throw new Error('Layered project export must contain info and layers.');
    }
    if (!Number.isFinite(Number(project.info.width)) || !Number.isFinite(Number(project.info.height))) {
      throw new Error('Layered project export must contain numeric canvas dimensions.');
    }
    record.projectBytes = projectBytes;
    record.projectMimeType = 'application/vnd.tlooto.image-project+json';
    return record;
  }

  delete(id, token) {
    const record = this.get(id, token);
    if (!record) return false;
    return this.sessions.delete(record.id);
  }

  prune(now = Date.now()) {
    for (const [id, record] of this.sessions) {
      if (now - record.lastAccessedAt > this.ttlMs) this.sessions.delete(id);
    }
  }
}
