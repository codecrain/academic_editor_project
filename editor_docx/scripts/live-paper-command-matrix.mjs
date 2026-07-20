#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOCX_COMMAND_CATALOG,
  DOCX_COMMAND_OPS,
  getDocxCommandCatalog,
  validateDocxCommands,
} from './docx-command-catalog.mjs';
import {
  DocxApiSession,
  generatePngBytes,
} from './docx-api-utils.mjs';
import { EDITOR_MCP_TOOLS } from './editor-mcp.mjs';

const EXPECTED_SERVER_TOOLS = Object.freeze([
  'editor_docx_open',
  'editor_docx_discard',
  'editor_docx_read_json',
  'editor_docx_target_map',
  'editor_docx_target_find',
  'editor_docx_target_inspect',
  'editor_docx_object_inventory',
  'editor_docx_command_catalog',
  'editor_docx_apply',
  'editor_docx_render_pages',
  'editor_docx_quality_check',
  'editor_docx_export_pdf',
  'editor_docx_save_source',
  'editor_docx_artifact_read',
  'editor_docx_artifact_delete',
]);

const MATRIX_CASES = Object.freeze([
  {
    op: 'text.replaceParagraph',
    document: 'korean',
    discoveryTools: true,
    exportPdf: true,
    render: { pages: [19], includeBaseline: true },
  },
  { op: 'text.replace', document: 'korean' },
  { op: 'insertText', document: 'korean' },
  { op: 'deleteRange', document: 'korean' },
  { op: 'appendParagraph', document: 'korean', render: { pages: [19], includeBaseline: true } },
  { op: 'table.writeCell', document: 'korean' },
  { op: 'table.writeRichCell', document: 'korean' },
  { op: 'table.writeCells', document: 'korean', render: { pages: [5], includeBaseline: true } },
  { op: 'table.applyCellStyle', document: 'korean' },
  { op: 'table.create', document: 'korean' },
  { op: 'style.applyText', document: 'korean' },
  { op: 'paragraph.applyStyle', document: 'korean' },
  { op: 'style.clone', document: 'korean', render: { pages: [5], includeBaseline: true } },
  { op: 'applyStyle', document: 'korean' },
  { op: 'setRunStyle', document: 'korean' },
  { op: 'setParagraphStyle', document: 'korean' },
  { op: 'list.writeBullets', document: 'korean' },
  { op: 'list.applyNumbering', document: 'korean', render: { pages: [6], includeBaseline: true } },
  { op: 'layout.fitText', document: 'korean' },
  { op: 'image.replace', document: 'english', render: { pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], includeBaseline: true } },
  { op: 'image.generateAndReplace', document: 'english', render: { pages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], includeBaseline: true } },
  { op: 'setDocumentMetadata', document: 'korean' },
  { op: 'defineStyle', document: 'korean' },
  { op: 'setPageSetup', document: 'korean', render: { pages: [1, 19], includeBaseline: true } },
  { op: 'setHeaderFooter', document: 'korean', render: { pages: [1, 19], includeBaseline: true } },
  { op: 'insertFootnote', document: 'korean', render: { pages: [19], includeBaseline: true } },
]);

const DEEP_INVALID_CASES = Object.freeze([
  { name: 'empty-write-cells', document: 'korean', precondition: 'target_inspect' },
  { name: 'zero-row-table', document: 'korean', precondition: 'none' },
  { name: 'empty-bullet-items', document: 'korean', precondition: 'target_inspect' },
  { name: 'empty-number-items', document: 'korean', precondition: 'target_inspect' },
  { name: 'empty-run-style-target', document: 'korean', precondition: 'target_inspect' },
  { name: 'empty-paragraph-style-target', document: 'korean', precondition: 'target_inspect' },
  { name: 'undefined-named-style', document: 'korean', precondition: 'target_inspect' },
  { name: 'corrupt-png-replacement', document: 'english', precondition: 'object_inventory' },
  { name: 'empty-style-definition', document: 'korean', precondition: 'none' },
  { name: 'incomplete-page-margins', document: 'korean', precondition: 'none' },
  { name: 'empty-footnote-target', document: 'korean', precondition: 'target_inspect' },
]);

const ROLLBACK_CATEGORIES = Object.freeze(['text', 'table', 'style', 'list', 'layout', 'image', 'package']);
const MUTATING_OPS = new Set(DOCX_COMMAND_OPS.filter((op) => op !== 'layout.fitText'));
const DROP_REPORT_KEYS = /^(documentId|artifactId|bytesBase64|bytes|authorization|bearer|token)$/i;
const DROP_REPORT_TERMS = /(?:documentId|artifactId|bytesBase64|authorization|bearer(?:Token)?|token)/gi;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const LONG_BASE64_RE = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{128,}={0,2}(?![A-Za-z0-9+/=])/g;
const SHA256_RE = /^[a-f0-9]{64}$/;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');
const MCP_REQUEST_TIMEOUT_MS = 300_000;
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepEqual(actual, expected, message) {
  assert.equal(stableJson(actual), stableJson(expected), message);
}

function createSanitizer(...initialSecrets) {
  const secrets = new Set(initialSecrets.filter(Boolean).map(String));
  return {
    addSecret(value) {
      if (value !== undefined && value !== null && String(value)) {
        secrets.add(String(value));
      }
    },
    sanitize(value) {
      const cleanString = (input) => {
        let output = String(input);
        for (const secret of secrets) {
          if (secret && output.includes(secret)) {
            output = output.split(secret).join('[REDACTED]');
          }
        }
        return output
          .replace(DROP_REPORT_TERMS, '[REDACTED_FIELD]')
          .replace(UUID_RE, '[REDACTED_ID]')
          .replace(LONG_BASE64_RE, '[REDACTED_BINARY]');
      };
      const walk = (input) => {
        if (input === null || input === undefined || typeof input === 'number' || typeof input === 'boolean') {
          return input;
        }
        if (typeof input === 'string') {
          return cleanString(input);
        }
        if (Buffer.isBuffer(input)) {
          return `[binary omitted: ${input.length} bytes]`;
        }
        if (Array.isArray(input)) {
          return input.map(walk);
        }
        if (typeof input === 'object') {
          const output = {};
          for (const [key, item] of Object.entries(input)) {
            if (!DROP_REPORT_KEYS.test(key)) {
              output[key] = walk(item);
            }
          }
          return output;
        }
        return cleanString(input);
      };
      return walk(value);
    },
  };
}

function parseSseOrJson(text) {
  const source = String(text || '').trim();
  if (!source) {
    return null;
  }
  if (source.startsWith('{') || source.startsWith('[')) {
    return JSON.parse(source);
  }
  const payloads = source.split(/\r?\n\r?\n/)
    .flatMap((event) => event.split(/\r?\n/))
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== '[DONE]');
  assert.ok(payloads.length, 'MCP response was neither JSON nor a data-bearing SSE response.');
  return JSON.parse(payloads.at(-1));
}

function toolErrorText(call) {
  const structured = call?.data;
  if (typeof structured?.message === 'string') {
    return structured.message;
  }
  if (typeof structured?.error === 'string') {
    return structured.error;
  }
  const text = call?.result?.content?.find((item) => item?.type === 'text')?.text;
  return typeof text === 'string' ? text : 'Unknown MCP tool error.';
}

class McpClient {
  constructor({ url, bearerToken, sanitizer }) {
    this.url = url;
    this.bearerToken = bearerToken;
    this.sanitizer = sanitizer;
    this.nextId = 1;
  }

  async request(method, params = {}) {
    let response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
        signal: AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error(`MCP ${method} request timed out after ${MCP_REQUEST_TIMEOUT_MS} ms.`);
      }
      throw error;
    }
    const responseText = await response.text();
    let payload;
    try {
      payload = parseSseOrJson(responseText);
    } catch (error) {
      throw new Error(`MCP returned non-JSON HTTP ${response.status}: ${error.message}`);
    }
    if (!response.ok) {
      throw new Error(`MCP transport failed with HTTP ${response.status}: ${payload?.error?.message || 'unknown error'}`);
    }
    if (payload?.error) {
      throw new Error(`MCP JSON-RPC error ${payload.error.code}: ${payload.error.message}`);
    }
    return payload?.result;
  }

  async initialize() {
    return this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'academic-editor-live-paper-matrix', version: '1.0.0' },
    });
  }

  async listTools() {
    return this.request('tools/list', {});
  }

  async callTool(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args });
    let data = result?.structuredContent;
    if (!data) {
      const text = result?.content?.find((item) => item?.type === 'text')?.text;
      if (typeof text === 'string') {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }
    }
    return {
      ok: result?.isError !== true,
      data: data ?? {},
      result,
    };
  }
}

function parseArgs(argv) {
  const args = { selfTest: false, help: false };
  const needsValue = new Set(['--korean', '--english', '--out']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--self-test') {
      args.selfTest = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (needsValue.has(token)) {
      const value = argv[index + 1];
      assert.ok(value && !value.startsWith('--'), `${token} requires a value.`);
      index += 1;
      if (token === '--korean') args.korean = value;
      if (token === '--english') args.english = value;
      if (token === '--out') args.out = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node live-paper-command-matrix.mjs --korean <current.docx> --english <image-paper.docx> --out <report.json>',
    '',
    'Environment:',
    '  ACADEMIC_EDITOR_MCP_URL',
    '  ACADEMIC_EDITOR_MCP_BEARER_TOKEN',
    '',
    'Offline validation:',
    '  node live-paper-command-matrix.mjs --self-test',
  ].join('\n');
}

function assertToolSucceeded(call, label) {
  assert.equal(call?.ok, true, `${label} failed: ${toolErrorText(call)}`);
  assert.notEqual(call?.data?.ok, false, `${label} returned ok=false: ${toolErrorText(call)}`);
  return call.data;
}

async function readJsonStream(client, documentId, view, options = {}) {
  assert.ok(['summary', 'blocks', 'tables'].includes(view), `Unsupported read_json view: ${view}`);
  const items = [];
  const seenCursors = new Set();
  let cursor = null;
  let revision = null;
  let total = null;
  let pages = 0;
  do {
    const args = cursor
      ? { documentId, cursor }
      : {
        documentId,
        view,
        limit: options.limit ?? (view === 'summary' ? 1 : 100),
        textPreviewChars: options.textPreviewChars ?? 512,
        ...(view === 'tables' ? { cellPreviewLimit: options.cellPreviewLimit ?? 12 } : {}),
      };
    const data = assertToolSucceeded(
      await client.callTool('editor_docx_read_json', args),
      `read_json ${view} page ${pages + 1}`,
    );
    assert.equal(data.view, view, `read_json returned view=${String(data.view)}, expected ${view}.`);
    assert.ok(Array.isArray(data.items), `read_json ${view} did not return an items array.`);
    assert.equal(Number(data.returned), data.items.length, `read_json ${view} returned count mismatch.`);
    const pageRevision = Number(data.revision);
    const pageTotal = Number(data.total);
    assert.ok(Number.isInteger(pageRevision) && pageRevision >= 1, `read_json ${view} returned an invalid revision.`);
    assert.ok(Number.isInteger(pageTotal) && pageTotal >= 0, `read_json ${view} returned an invalid total.`);
    revision ??= pageRevision;
    total ??= pageTotal;
    assert.equal(pageRevision, revision, `read_json ${view} revision changed during pagination.`);
    assert.equal(pageTotal, total, `read_json ${view} total changed during pagination.`);
    items.push(...data.items);
    const nextCursor = data.nextCursor || null;
    if (nextCursor) {
      assert.equal(typeof nextCursor, 'string', `read_json ${view} returned a non-string cursor.`);
      assert.ok(!seenCursors.has(nextCursor), `read_json ${view} repeated a cursor.`);
      seenCursors.add(nextCursor);
    }
    cursor = nextCursor;
    pages += 1;
    assert.ok(pages < 10_000, `read_json ${view} pagination did not terminate.`);
  } while (cursor);
  assert.equal(items.length, total, `read_json ${view} returned ${items.length}/${total} items.`);
  return { revision, view, total, pages, items };
}

async function readRevisionSummary(client, documentId) {
  const stream = await readJsonStream(client, documentId, 'summary');
  assert.equal(stream.total, 1, 'read_json summary must return exactly one item.');
  assert.equal(stream.items.length, 1, 'read_json summary item is missing.');
  return { revision: stream.revision, summary: stream.items[0] };
}

async function readStructuralSnapshot(client, documentId) {
  const blocks = await readJsonStream(client, documentId, 'blocks');
  const tables = await readJsonStream(client, documentId, 'tables');
  assert.equal(tables.revision, blocks.revision, 'Document revision changed between blocks and tables snapshots.');
  return {
    revision: blocks.revision,
    blocks: { total: blocks.total, items: blocks.items },
    tables: { total: tables.total, items: tables.items },
  };
}

async function mapTargetStream(client, documentId, kind) {
  assert.ok(['paragraph', 'cell'].includes(kind), `Unsupported target_map kind: ${kind}`);
  const targets = [];
  const seenCursors = new Set();
  let cursor = null;
  let revision = null;
  let total = null;
  let pages = 0;
  do {
    const args = cursor
      ? { documentId, cursor }
      : { documentId, kind, limit: 120 };
    const data = assertToolSucceeded(
      await client.callTool('editor_docx_target_map', args),
      `target_map ${kind} page ${pages + 1}`,
    );
    assert.equal(data.kind, kind, `target_map returned kind=${String(data.kind)}, expected ${kind}.`);
    assert.ok(Array.isArray(data.targets), `target_map ${kind} did not return a targets array.`);
    assert.equal(Number(data.returned), data.targets.length, `target_map ${kind} returned count mismatch.`);
    const pageRevision = Number(data.revision);
    const pageTotal = Number(data.total);
    assert.ok(Number.isInteger(pageRevision) && pageRevision >= 1, `target_map ${kind} returned an invalid revision.`);
    assert.ok(Number.isInteger(pageTotal) && pageTotal >= 0, `target_map ${kind} returned an invalid total.`);
    revision ??= pageRevision;
    total ??= pageTotal;
    assert.equal(pageRevision, revision, `target_map ${kind} revision changed during pagination.`);
    assert.equal(pageTotal, total, `target_map ${kind} total changed during pagination.`);
    targets.push(...data.targets);
    const nextCursor = data.nextCursor || null;
    if (nextCursor) {
      assert.equal(typeof nextCursor, 'string', `target_map ${kind} returned a non-string cursor.`);
      assert.ok(!seenCursors.has(nextCursor), `target_map ${kind} repeated a cursor.`);
      seenCursors.add(nextCursor);
    }
    cursor = nextCursor;
    pages += 1;
    assert.ok(pages < 10_000, `target_map ${kind} pagination did not terminate.`);
  } while (cursor);
  assert.equal(targets.length, total, `target_map ${kind} returned ${targets.length}/${total} targets.`);
  return { revision, kind, total, pages, targets };
}

async function canonicalPath(candidate) {
  let cursor = path.resolve(candidate);
  const suffix = [];
  while (true) {
    try {
      return path.join(await realpath(cursor), ...suffix);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      suffix.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function optionalStat(candidate) {
  try {
    return await stat(candidate, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertSafeOutputPath(outputPath, sourcePaths) {
  const resolvedOutput = path.resolve(outputPath);
  const canonicalOutput = (await canonicalPath(resolvedOutput)).toLowerCase();
  const outputStat = await optionalStat(resolvedOutput);
  for (const sourcePath of sourcePaths) {
    const resolvedSource = path.resolve(sourcePath);
    const canonicalSource = (await canonicalPath(resolvedSource)).toLowerCase();
    assert.notEqual(canonicalOutput, canonicalSource, 'The report path must not overwrite an input DOCX through an alias or junction.');
    if (outputStat) {
      const sourceStat = await stat(resolvedSource, { bigint: true });
      assert.ok(
        outputStat.dev !== sourceStat.dev || outputStat.ino !== sourceStat.ino,
        'The report path must not refer to the same filesystem object as an input DOCX.',
      );
    }
  }
  return resolvedOutput;
}

async function writeJsonAtomic(outputPath, value, sanitizer, protectedSourcePaths = []) {
  await assertSafeOutputPath(outputPath, protectedSourcePaths);
  const safeValue = sanitizer.sanitize(value);
  const output = `${JSON.stringify(safeValue, null, 2)}\n`;
  assert.ok(!/(?:documentId|artifactId|bytesBase64|authorization|bearer|token)/i.test(output), 'Sensitive identifier or binary field leaked into report JSON.');
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, output, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, outputPath);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

function commandCatalogEntry(op) {
  const entry = DOCX_COMMAND_CATALOG.find((item) => item.op === op);
  assert.ok(entry, `Catalog entry missing for ${op}.`);
  return entry;
}

function paragraphLocation(number) {
  return { paragraph: { section: 0, number } };
}

function nodeTarget(number, { offset = 0, length } = {}) {
  const native = { section: 0, para: number, offset };
  if (length !== undefined) native.length = length;
  return {
    nodeId: `p_${number}`,
    native,
    range: {
      start: { nodeId: `p_${number}`, offset },
      ...(length !== undefined ? { end: { nodeId: `p_${number}`, offset: offset + length } } : {}),
    },
  };
}

function cellLocation(tableId, number) {
  return { tableId, cell: { number } };
}

function uniqueLocations(locations) {
  const seen = new Set();
  return locations.filter((location) => {
    const key = stableJson(location);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inspectText(session, number) {
  return session.inspectTarget(paragraphLocation(number));
}

function inspectCell(session, tableId, number) {
  return session.inspectTarget(cellLocation(tableId, number));
}

function entryText(session, name) {
  return session.entries.get(name)?.toString('utf8') ?? '';
}

function xmlElementText(xml, qualifiedName) {
  const escaped = qualifiedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`));
  return match ? match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
}

function assertPng(bytes, message) {
  assert.ok(Buffer.isBuffer(bytes), `${message}: image bytes missing.`);
  assert.ok(bytes.length > PNG_SIGNATURE.length, `${message}: image is too short.`);
  assert.equal(bytes.subarray(0, PNG_SIGNATURE.length).compare(PNG_SIGNATURE), 0, `${message}: invalid PNG signature.`);
}

function webpDimensions(bytes) {
  assert.ok(bytes.length >= 20, 'WebP is too short.');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', 'WebP RIFF signature is missing.');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'WebP RIFF size does not match its bytes.');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', 'WebP container signature is missing.');
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.subarray(offset, offset + 4).toString('ascii');
    const size = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    assert.ok(dataOffset + size <= bytes.length, `WebP ${type} chunk exceeds the container.`);
    if (type === 'VP8X' && size >= 10) {
      return { width: bytes.readUIntLE(dataOffset + 4, 3) + 1, height: bytes.readUIntLE(dataOffset + 7, 3) + 1 };
    }
    if (type === 'VP8L' && size >= 5 && bytes[dataOffset] === 0x2f) {
      const b1 = bytes[dataOffset + 1];
      const b2 = bytes[dataOffset + 2];
      const b3 = bytes[dataOffset + 3];
      const b4 = bytes[dataOffset + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
      };
    }
    if (type === 'VP8 ' && size >= 10
      && bytes[dataOffset + 3] === 0x9d && bytes[dataOffset + 4] === 0x01 && bytes[dataOffset + 5] === 0x2a) {
      return {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }
    offset = dataOffset + size + (size % 2);
  }
  throw new Error('WebP dimensions could not be decoded from VP8/VP8L/VP8X data.');
}

function assertParagraphRunStyleEqual(actualFingerprint, expectedFingerprint, message) {
  deepEqual(actualFingerprint.basis.paragraph, expectedFingerprint.basis.paragraph, `${message} (paragraph properties)`);
  deepEqual(actualFingerprint.basis.text, expectedFingerprint.basis.text, `${message} (run properties)`);
}

function buildPlan(op, source) {
  const before = new DocxApiSession(source.bytes);
  const originalP603 = op.startsWith('image.') ? '' : inspectText(before, 603).currentText;
  const originalP602 = op.startsWith('image.') ? '' : inspectText(before, 602).currentText;
  const imageName = before.objectInventory().images[0]?.name;
  const plans = {
    'text.replaceParagraph': {
      command: { op, location: paragraphLocation(603), text: 'DOCX MCP QA source marker' },
      inspectLocations: [paragraphLocation(603)],
      expected: { text: 'DOCX MCP QA source marker' },
    },
    'text.replace': {
      command: { op, target: nodeTarget(603, { offset: 0, length: 2 }), text: 'QA' },
      inspectLocations: [nodeTarget(603, { offset: 0, length: 2 })],
      expected: { text: `QA${originalP603.slice(2)}` },
    },
    insertText: {
      command: { op, target: nodeTarget(603, { offset: 0, length: 0 }), text: '[QA] ' },
      inspectLocations: [nodeTarget(603, { offset: 0, length: 0 })],
      expected: { text: `[QA] ${originalP603}` },
    },
    deleteRange: {
      command: { op, target: nodeTarget(603, { offset: 0, length: 3 }) },
      inspectLocations: [nodeTarget(603, { offset: 0, length: 3 })],
      expected: { text: originalP603.slice(3) },
    },
    appendParagraph: {
      command: { op, text: 'DOCX_MCP_QA_APPEND_SENTINEL' },
      inspectLocations: [],
      expected: { text: 'DOCX_MCP_QA_APPEND_SENTINEL' },
    },
    'table.writeCell': {
      command: { op, location: cellLocation('tbl_3', 1), text: '→' },
      inspectLocations: [cellLocation('tbl_3', 1)],
      expected: { text: '→' },
    },
    'table.writeRichCell': {
      command: { op, location: cellLocation('tbl_3', 1), styleSource: cellLocation('tbl_0', 0), text: 'Flow' },
      inspectLocations: [cellLocation('tbl_3', 1), cellLocation('tbl_0', 0)],
      expected: { text: 'Flow' },
    },
    'table.writeCells': {
      command: {
        op,
        tableId: 'tbl_3',
        cells: [
          { cell: { number: 0 }, text: 'Source' },
          { cell: { number: 1 }, text: '→' },
          { cell: { number: 2 }, text: 'Destination' },
        ],
      },
      inspectLocations: [cellLocation('tbl_3', 0), cellLocation('tbl_3', 1), cellLocation('tbl_3', 2)],
      expected: { texts: ['Source', '→', 'Destination'] },
    },
    'table.applyCellStyle': {
      command: { op, target: cellLocation('tbl_3', 1), styleSource: cellLocation('tbl_0', 0) },
      inspectLocations: [cellLocation('tbl_3', 1), cellLocation('tbl_0', 0)],
      expected: {},
    },
    'table.create': {
      command: { op, rows: 2, cols: 3, cellStyle: { width: 1600, borderColor: '#BFBFBF' } },
      inspectLocations: [],
      expected: { rows: 2, cols: 3 },
    },
    'style.applyText': {
      command: { op, target: paragraphLocation(603), styleSource: paragraphLocation(602), text: 'DOCX MCP QA styled text' },
      inspectLocations: [paragraphLocation(603), paragraphLocation(602)],
      expected: { text: 'DOCX MCP QA styled text' },
    },
    'paragraph.applyStyle': {
      command: { op, target: paragraphLocation(603), styleSource: paragraphLocation(602) },
      inspectLocations: [paragraphLocation(603), paragraphLocation(602)],
      expected: { text: originalP603 },
    },
    'style.clone': {
      command: { op, source: cellLocation('tbl_0', 0), target: cellLocation('tbl_3', 0) },
      inspectLocations: [cellLocation('tbl_0', 0), cellLocation('tbl_3', 0)],
      expected: { text: inspectCell(before, 'tbl_3', 0).currentText },
    },
    applyStyle: {
      command: { op, target: nodeTarget(603), styleId: 'BodyText' },
      inspectLocations: [nodeTarget(603)],
      expected: { text: originalP603, styleId: 'BodyText' },
    },
    setRunStyle: {
      command: { op, target: nodeTarget(603), style: { italic: true, textColor: '#A00000', fontSize: 10 } },
      inspectLocations: [nodeTarget(603)],
      expected: { text: originalP603 },
    },
    setParagraphStyle: {
      command: { op, target: nodeTarget(603), style: { align: 'right', spacingAfter: 120 } },
      inspectLocations: [nodeTarget(603)],
      expected: { text: originalP603 },
    },
    'list.writeBullets': {
      command: { op, location: cellLocation('tbl_3', 1), items: ['QA alpha', 'QA beta'], marker: '-' },
      inspectLocations: [cellLocation('tbl_3', 1)],
      expected: { text: '- QA alpha\n- QA beta' },
    },
    'list.applyNumbering': {
      command: { op, location: cellLocation('tbl_4', 1), items: ['QA alpha', 'QA beta'], startAt: 3, suffix: ')' },
      inspectLocations: [cellLocation('tbl_4', 1)],
      expected: { text: '3) QA alpha\n4) QA beta' },
    },
    'layout.fitText': {
      command: {
        op,
        location: cellLocation('tbl_3', 3),
        text: 'A deliberately long QA value that must be wrapped without mutating the DOCX package.',
        options: { maxCharsPerLine: 12, maxLines: 8, truncate: false },
      },
      inspectLocations: [cellLocation('tbl_3', 3)],
      expected: {},
    },
    'image.replace': {
      command: {
        op,
        imageName,
        bytesBase64: generatePngBytes({ width: 360, height: 200, values: [2, 7, 4, 9] }).toString('base64'),
      },
      inspectLocations: [],
      expected: { imageName },
    },
    'image.generateAndReplace': {
      command: {
        op,
        imageName,
        generator: { width: 420, height: 240, background: '#ffffff', accent: '#2f5fbd', values: [4, 9, 3, 7] },
      },
      inspectLocations: [],
      expected: { imageName },
    },
    setDocumentMetadata: {
      command: { op, title: 'DOCX MCP QA manuscript', keywords: 'docx,mcp,qa' },
      inspectLocations: [],
      expected: { title: 'DOCX MCP QA manuscript', keywords: 'docx,mcp,qa' },
    },
    defineStyle: {
      command: {
        op,
        style: {
          styleId: 'DocxMcpQaStyle',
          name: 'DOCX MCP QA Style',
          type: 'paragraph',
          basedOn: 'Normal',
          paragraphStyle: { spacingAfter: 120 },
          runStyle: { bold: true, fontSize: 10 },
        },
      },
      inspectLocations: [],
      expected: { styleId: 'DocxMcpQaStyle' },
    },
    setPageSetup: {
      command: {
        op,
        width: 12240,
        height: 15840,
        margins: { top: 936, right: 979, bottom: 936, left: 979, header: 720, footer: 720, gutter: 0 },
      },
      inspectLocations: [],
      expected: { width: '12240', height: '15840' },
    },
    setHeaderFooter: {
      command: { op, header: 'DOCX MCP QA HEADER', footer: 'DOCX MCP QA FOOTER', align: 'center' },
      inspectLocations: [],
      expected: { header: 'DOCX MCP QA HEADER', footer: 'DOCX MCP QA FOOTER' },
    },
    insertFootnote: {
      command: { op, target: nodeTarget(602), text: 'DOCX MCP QA footnote.' },
      inspectLocations: [nodeTarget(602)],
      expected: { text: 'DOCX MCP QA footnote.', paragraphText: originalP602 },
    },
  };
  const plan = plans[op];
  assert.ok(plan, `No live matrix plan exists for ${op}.`);
  if (op.startsWith('image.')) {
    assert.ok(plan.expected.imageName, `${op} requires an actual image in the English paper.`);
  }
  return { ...plan, inspectLocations: uniqueLocations(plan.inspectLocations) };
}

function verifyPersistedCase({ op, source, artifactBytes, plan, applyData }) {
  const before = new DocxApiSession(source.bytes);
  const after = new DocxApiSession(artifactBytes);
  const beforeJson = before.readJson();
  const afterJson = after.readJson();
  const evidence = {
    artifactSha256: sha256(artifactBytes),
    paragraphCountBefore: beforeJson.blocks.length,
    paragraphCountAfter: afterJson.blocks.length,
    tableCountBefore: beforeJson.tables.length,
    tableCountAfter: afterJson.tables.length,
  };

  if (op === 'text.replaceParagraph' || op === 'text.replace' || op === 'insertText' || op === 'deleteRange') {
    assert.equal(inspectText(after, 603).currentText, plan.expected.text);
    if (op === 'text.replaceParagraph') {
      deepEqual(inspectText(after, 603).styleFingerprint.basis, inspectText(before, 603).styleFingerprint.basis, 'Paragraph replacement changed its style.');
    }
    evidence.targetTextSha256 = sha256(Buffer.from(plan.expected.text, 'utf8'));
  } else if (op === 'appendParagraph') {
    assert.equal(afterJson.blocks.length, beforeJson.blocks.length + 1);
    assert.equal(afterJson.blocks.at(-1).text, plan.expected.text);
    assert.equal(afterJson.tables.length, beforeJson.tables.length);
  } else if (op === 'table.writeCell') {
    assert.equal(inspectCell(after, 'tbl_3', 1).currentText, plan.expected.text);
    deepEqual(after.styleFingerprint(cellLocation('tbl_3', 1)).basis, before.styleFingerprint(cellLocation('tbl_3', 1)).basis, 'Cell write changed paragraph/run style.');
  } else if (op === 'table.writeRichCell') {
    assert.equal(inspectCell(after, 'tbl_3', 1).currentText, plan.expected.text);
    assertParagraphRunStyleEqual(after.styleFingerprint(cellLocation('tbl_3', 1)), before.styleFingerprint(cellLocation('tbl_0', 0)), 'Rich cell did not clone source paragraph/run style.');
    assert.equal(after.cellOuterStyle(cellLocation('tbl_3', 1)), before.cellOuterStyle(cellLocation('tbl_3', 1)), 'Rich cell changed the target outer-cell style.');
  } else if (op === 'table.writeCells') {
    const actual = [0, 1, 2].map((number) => inspectCell(after, 'tbl_3', number).currentText);
    deepEqual(actual, plan.expected.texts, 'Multi-cell write did not persist every cell.');
    assert.equal(applyData.results.length, 3);
  } else if (op === 'table.applyCellStyle') {
    assert.equal(inspectCell(after, 'tbl_3', 1).currentText, inspectCell(before, 'tbl_3', 1).currentText);
    assert.equal(after.cellOuterStyle(cellLocation('tbl_3', 1)), before.cellOuterStyle(cellLocation('tbl_0', 0)), 'Outer cell style did not match source.');
  } else if (op === 'table.create') {
    assert.equal(afterJson.tables.length, beforeJson.tables.length + 1);
    deepEqual(afterJson.tables.at(-1).dims, { rowCount: 2, colCount: 3, cellCount: 6 }, 'Created table dimensions differ.');
  } else if (op === 'style.applyText') {
    assert.equal(inspectText(after, 603).currentText, plan.expected.text);
    deepEqual(inspectText(after, 603).styleFingerprint.basis, inspectText(before, 602).styleFingerprint.basis, 'style.applyText did not clone source style.');
  } else if (op === 'paragraph.applyStyle') {
    assert.equal(inspectText(after, 603).currentText, plan.expected.text);
    deepEqual(inspectText(after, 603).styleFingerprint.basis, inspectText(before, 602).styleFingerprint.basis, 'paragraph.applyStyle did not clone source style.');
  } else if (op === 'style.clone') {
    assert.equal(inspectCell(after, 'tbl_3', 0).currentText, plan.expected.text);
    assertParagraphRunStyleEqual(after.styleFingerprint(cellLocation('tbl_3', 0)), before.styleFingerprint(cellLocation('tbl_0', 0)), 'style.clone did not clone source style.');
    assert.equal(after.cellOuterStyle(cellLocation('tbl_3', 0)), before.cellOuterStyle(cellLocation('tbl_3', 0)), 'style.clone changed outer-cell style.');
  } else if (op === 'applyStyle') {
    assert.equal(inspectText(after, 603).currentText, plan.expected.text);
    assert.equal(after.styleFingerprint(paragraphLocation(603)).basis.paragraph.styleId, plan.expected.styleId);
    assert.ok(afterJson.styleGraph.styles.some((style) => style.styleId === plan.expected.styleId));
  } else if (op === 'setRunStyle') {
    const target = inspectText(after, 603);
    assert.equal(target.currentText, plan.expected.text);
    assert.equal(target.styleFingerprint.basis.text.italic, true);
    assert.equal(target.styleFingerprint.basis.text.textColor, 'A00000');
    assert.equal(target.styleFingerprint.basis.text.fontSizeHalfPoints, '20');
  } else if (op === 'setParagraphStyle') {
    const target = inspectText(after, 603);
    assert.equal(target.currentText, plan.expected.text);
    assert.equal(target.styleFingerprint.basis.paragraph.align, 'right');
    assert.equal(target.styleFingerprint.basis.paragraph.spacingAfter, '120');
  } else if (op === 'list.writeBullets') {
    assert.equal(inspectCell(after, 'tbl_3', 1).currentText, plan.expected.text);
  } else if (op === 'list.applyNumbering') {
    assert.equal(inspectCell(after, 'tbl_4', 1).currentText, plan.expected.text);
  } else if (op === 'layout.fitText') {
    assert.equal(Buffer.compare(source.bytes, artifactBytes), 0, 'layout.fitText mutated the saved DOCX.');
    assert.equal(applyData.revision, 1);
    assert.ok(applyData.results?.[0]?.fit, 'layout.fitText did not return a fit result.');
    evidence.readOnlyByteIdentity = true;
  } else if (op === 'image.replace' || op === 'image.generateAndReplace') {
    const beforeBytes = before.entries.get(plan.expected.imageName);
    const afterBytes = after.entries.get(plan.expected.imageName);
    assertPng(afterBytes, op);
    assert.notEqual(sha256(afterBytes), sha256(beforeBytes), `${op} did not change media bytes.`);
    assert.equal(after.objectInventory().images.length, before.objectInventory().images.length);
    assert.equal(after.objectInventory().pictures.length, before.objectInventory().pictures.length);
    assert.equal(after.objectInventory().relationships.length, before.objectInventory().relationships.length);
    evidence.mediaSha256Before = sha256(beforeBytes);
    evidence.mediaSha256After = sha256(afterBytes);
  } else if (op === 'setDocumentMetadata') {
    const beforeCore = entryText(before, 'docProps/core.xml');
    const afterCore = entryText(after, 'docProps/core.xml');
    assert.equal(xmlElementText(afterCore, 'dc:title'), plan.expected.title);
    assert.equal(xmlElementText(afterCore, 'cp:keywords'), plan.expected.keywords);
    for (const name of ['dc:subject', 'dc:creator', 'dc:description']) {
      assert.equal(xmlElementText(afterCore, name), xmlElementText(beforeCore, name), `${name} was not preserved.`);
    }
  } else if (op === 'defineStyle') {
    assert.ok(afterJson.styleGraph.styles.some((style) => style.styleId === plan.expected.styleId));
    assert.equal(afterJson.styleGraph.styles.length, beforeJson.styleGraph.styles.length + 1);
  } else if (op === 'setPageSetup') {
    assert.match(after.documentXml, /<w:pgSz w:w="12240" w:h="15840"\/>/);
    assert.match(after.documentXml, /<w:pgMar w:top="936" w:right="979" w:bottom="936" w:left="979" w:header="720" w:footer="720" w:gutter="0"\/>/);
  } else if (op === 'setHeaderFooter') {
    assert.match(entryText(after, 'word/header1.xml'), /DOCX MCP QA HEADER/);
    assert.match(entryText(after, 'word/footer1.xml'), /DOCX MCP QA FOOTER/);
    assert.match(entryText(after, 'word/_rels/document.xml.rels'), /relationships\/header/);
    assert.match(entryText(after, 'word/_rels/document.xml.rels'), /relationships\/footer/);
    assert.match(after.documentXml, /<w:headerReference\b/);
    assert.match(after.documentXml, /<w:footerReference\b/);
  } else if (op === 'insertFootnote') {
    assert.equal(inspectText(after, 602).currentText, plan.expected.paragraphText);
    assert.match(entryText(after, 'word/footnotes.xml'), /DOCX MCP QA footnote/);
    assert.match(entryText(after, 'word/_rels/document.xml.rels'), /relationships\/footnotes/);
    assert.match(after.documentXml, /<w:footnoteReference w:id="1"\/>/);
  } else {
    throw new Error(`No persisted verifier exists for ${op}.`);
  }

  return evidence;
}

function renderedPageObjects(payload, includeBaseline) {
  const normalize = (value) => {
    const objects = [];
    if (value?.page) objects.push(value.page);
    if (Array.isArray(value?.pages)) objects.push(...value.pages);
    return objects;
  };
  if (includeBaseline) {
    return {
      baseline: normalize(payload?.baseline),
      current: normalize(payload?.current),
    };
  }
  return { current: normalize(payload) };
}

function assertRenderedPayload(payload, requestedPages, includeBaseline) {
  const groups = renderedPageObjects(payload, includeBaseline);
  const requiredGroups = includeBaseline ? ['baseline', 'current'] : ['current'];
  for (const groupName of requiredGroups) {
    const pages = groups[groupName];
    assert.equal(pages.length, requestedPages.length, `${groupName} render returned the wrong page count.`);
    deepEqual(pages.map((page) => Number(page.page)), requestedPages, `${groupName} render returned unexpected pages.`);
    for (const page of pages) {
      const expectedSha256 = String(page.sha256 || '').toLowerCase();
      const encoded = String(page.bytesBase64 || '');
      assert.match(expectedSha256, SHA256_RE, `${groupName} page hash missing.`);
      assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, `${groupName} page Base64 is malformed.`);
      const bytes = Buffer.from(encoded, 'base64');
      assert.ok(bytes.length > 12, `${groupName} page is empty.`);
      assert.equal(bytes.length, Number(page.byteLength), `${groupName} page byteLength mismatch.`);
      assert.equal(sha256(bytes), expectedSha256, `${groupName} page hash mismatch.`);
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${groupName} page is not a RIFF WebP.`);
      assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${groupName} page is not WebP.`);
      assert.equal(page.format, 'webp', `${groupName} page format mismatch.`);
      assert.equal(page.mimeType, 'image/webp', `${groupName} page MIME mismatch.`);
      assert.ok(Number.isInteger(Number(page.width)) && Number(page.width) > 0, `${groupName} page width is invalid.`);
      assert.ok(Number.isInteger(Number(page.height)) && Number(page.height) > 0, `${groupName} page height is invalid.`);
      deepEqual(webpDimensions(bytes), { width: Number(page.width), height: Number(page.height) }, `${groupName} page dimensions do not match its WebP bytes.`);
    }
  }
  return {
    pages: requestedPages,
    baselineCompared: includeBaseline,
    renderer: payload?.renderer || payload?.current?.renderer || null,
    pageCount: payload?.pageCount || payload?.current?.pageCount || null,
  };
}

function assertCleanQuality(quality) {
  assert.equal(quality?.ok, true, 'quality_check did not return ok=true.');
  assert.notEqual(quality?.stable, false, 'quality_check returned stable=false.');
  assert.ok(Array.isArray(quality?.issues), 'quality_check issues must be an array.');
  const blocking = quality.issues.filter((issue) => issue?.severity !== 'info');
  assert.equal(blocking.length, 0, `quality_check returned ${blocking.length} blocking issue(s).`);
  return {
    revision: quality.revision,
    issueCount: quality.issues.length,
    preexistingInfoCount: quality.issues.filter((issue) => issue?.preexisting === true).length,
  };
}

async function expectToolError(client, name, args, pattern) {
  const call = await client.callTool(name, args);
  assert.equal(call.ok, false, `${name} unexpectedly succeeded.`);
  const message = toolErrorText(call);
  if (pattern) assert.match(message, pattern);
  return { expectedFailure: true, errorClass: pattern?.source || 'tool_error' };
}

async function loadSource(documentKey, sourcePath) {
  const bytes = await readFile(sourcePath);
  const local = new DocxApiSession(bytes);
  const json = local.readJson();
  return {
    key: documentKey,
    path: path.resolve(sourcePath),
    filename: path.basename(sourcePath),
    bytes,
    sha256: sha256(bytes),
    baseline: {
      paragraphCount: json.blocks.length,
      tableCount: json.tables.length,
      imageCount: json.objectGraph.images.length,
      pictureCount: json.objectGraph.pictures.length,
      chartCount: json.objectGraph.charts.length,
    },
  };
}

async function openRemoteSession(context, documentKey, label) {
  const source = context.sources[documentKey];
  const opened = await context.client.callTool('editor_docx_open', {
    filename: `${label.replace(/[^a-z0-9_.-]/gi, '-')}-${source.filename}`,
    bytesBase64: source.bytes.toString('base64'),
  });
  const documentId = String(opened?.data?.documentId || '');
  context.sanitizer.addSecret(documentId);
  const session = documentId ? {
    source,
    documentId,
    artifacts: [],
    cleanupEvidence: { artifactDeletes: 0, discardCompleted: false, sessionWasAlreadyClosed: false },
    cleanupPromise: null,
  } : null;
  if (session) context.activeSessions.add(session);
  try {
    assert.equal(opened.ok, true, `editor_docx_open failed: ${toolErrorText(opened)}`);
    assert.ok(documentId, 'editor_docx_open did not return documentId.');
    assert.equal(Number(opened.data.revision), 1, 'New DOCX session must start at revision 1.');
  } catch (error) {
    if (!session) throw error;
    try {
      await cleanupRemoteSession(context, session);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `${error.message}; additionally failed to discard the opened session.`);
    }
    throw error;
  }
  return session;
}

async function performRemoteSessionCleanup(context, session) {
  const errors = [];
  for (const artifact of session.artifacts) {
    if (artifact.deleted) continue;
    if (!artifact.artifactId || !artifact.sha256) {
      errors.push(new Error('An artifact could not be deleted because its opaque ID or SHA-256 was missing.'));
      continue;
    }
    try {
      const deleted = await context.client.callTool('editor_docx_artifact_delete', {
        artifactId: artifact.artifactId,
        expectedSha256: artifact.sha256,
      });
      if (!deleted.ok && /artifact not found/i.test(toolErrorText(deleted))) {
        artifact.deleted = true;
        session.cleanupEvidence.artifactDeletes += 1;
        continue;
      }
      assert.equal(deleted.ok, true, `artifact_delete failed: ${toolErrorText(deleted)}`);
      assert.equal(deleted.data.deleted, true, 'artifact_delete did not confirm deletion.');
      artifact.deleted = true;
      session.cleanupEvidence.artifactDeletes += 1;
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    const discarded = await context.client.callTool('editor_docx_discard', { documentId: session.documentId });
    assert.equal(discarded.ok, true, `discard failed: ${toolErrorText(discarded)}`);
    assert.equal(discarded.data.status, 'completed');
    assert.equal(discarded.data.sessionClosed, true);
    assert.equal(discarded.data.artifactCreated, false);
    session.cleanupEvidence.discardCompleted = true;
    session.cleanupEvidence.sessionWasAlreadyClosed = discarded.data.deleted === false;
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) {
    throw new AggregateError(errors, `Remote cleanup failed with ${errors.length} error(s).`);
  }
  return session.cleanupEvidence;
}

async function cleanupRemoteSession(context, session) {
  if (session.cleanupPromise) return session.cleanupPromise;
  session.cleanupPromise = performRemoteSessionCleanup(context, session);
  try {
    const evidence = await session.cleanupPromise;
    context.activeSessions.delete(session);
    return evidence;
  } finally {
    session.cleanupPromise = null;
  }
}

async function cleanupAllActiveSessions(context) {
  const sessions = [...context.activeSessions];
  if (!sessions.length) return { attempted: 0, cleaned: 0 };
  const settled = await Promise.allSettled(sessions.map((session) => cleanupRemoteSession(context, session)));
  const failures = settled.filter((result) => result.status === 'rejected');
  if (failures.length) {
    throw new AggregateError(failures.map((result) => result.reason), `Failed to clean ${failures.length} active remote session(s).`);
  }
  return { attempted: sessions.length, cleaned: sessions.length };
}

function installSignalCleanup(context) {
  const state = { signal: null, promise: null, error: null };
  const onSignal = (signal) => {
    if (state.signal) return;
    state.signal = signal;
    context.stopping = true;
    state.promise = cleanupAllActiveSessions(context).catch((error) => {
      state.error = error;
    });
  };
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  return {
    state,
    dispose() {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    },
  };
}

function assertRunContinuing(context) {
  assert.equal(context.stopping, false, 'Live matrix interrupted; no further remote session will be opened.');
}

async function withRemoteSession(context, documentKey, label, callback) {
  const session = await openRemoteSession(context, documentKey, label);
  let result;
  let workError;
  try {
    result = await callback(session);
  } catch (error) {
    workError = error;
  }
  let cleanupError;
  try {
    await cleanupRemoteSession(context, session);
  } catch (error) {
    cleanupError = error;
  }
  if (workError && cleanupError) {
    throw new AggregateError([workError, cleanupError], `${workError.message}; additionally ${cleanupError.message}`);
  }
  if (workError) throw workError;
  if (cleanupError) throw cleanupError;
  return { result, cleanup: session.cleanupEvidence };
}

async function registerReturnedArtifact(context, session, data) {
  if (session.cleanupPromise) {
    await session.cleanupPromise.catch(() => {});
  }
  context.activeSessions.add(session);
  const artifactId = String(data?.artifactId || '');
  const expectedSha256 = String(data?.sha256 || '').toLowerCase();
  context.sanitizer.addSecret(artifactId);
  let tracked = null;
  if (artifactId && SHA256_RE.test(expectedSha256)) {
    tracked = { artifactId, sha256: expectedSha256, deleted: false };
    session.artifacts.push(tracked);
  }
  return { artifactId, expectedSha256, tracked };
}

async function exportPdfReadVerifyDelete(context, session, revision, filename) {
  const exported = await context.client.callTool('editor_docx_export_pdf', {
    documentId: session.documentId,
    baseRevision: revision,
    filename,
  });
  const { artifactId, expectedSha256, tracked } = await registerReturnedArtifact(context, session, exported?.data);
  assert.equal(exported.ok, true, `export_pdf failed: ${toolErrorText(exported)}`);
  assert.ok(artifactId, 'export_pdf did not return artifactId.');
  assert.match(expectedSha256, SHA256_RE, 'export_pdf did not return a valid SHA-256.');
  assert.equal(exported.data.mimeType, 'application/pdf', 'export_pdf returned the wrong MIME type.');
  assert.ok(tracked, 'export_pdf artifact could not be registered for cleanup.');

  const read = await context.client.callTool('editor_docx_artifact_read', { artifactId, expectedSha256 });
  assert.equal(read.ok, true, `PDF artifact_read failed: ${toolErrorText(read)}`);
  assert.equal(String(read.data.sha256 || '').toLowerCase(), expectedSha256);
  assert.equal(read.data.mimeType, 'application/pdf');
  assert.match(String(read.data.bytesBase64 || ''), /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'PDF artifact Base64 is malformed.');
  const bytes = Buffer.from(read.data.bytesBase64, 'base64');
  assert.ok(bytes.length > PDF_SIGNATURE.length, 'PDF artifact is empty.');
  assert.equal(bytes.length, Number(read.data.byteLength), 'PDF artifact byteLength mismatch.');
  assert.equal(sha256(bytes), expectedSha256, 'PDF artifact hash mismatch.');
  assert.equal(bytes.subarray(0, PDF_SIGNATURE.length).compare(PDF_SIGNATURE), 0, 'PDF artifact signature is invalid.');

  const deleted = await context.client.callTool('editor_docx_artifact_delete', { artifactId, expectedSha256 });
  assert.equal(deleted.ok, true, `PDF artifact_delete failed: ${toolErrorText(deleted)}`);
  assert.equal(deleted.data.deleted, true);
  tracked.deleted = true;
  session.cleanupEvidence.artifactDeletes += 1;

  const stillOpen = await readRevisionSummary(context.client, session.documentId);
  assert.equal(stillOpen.revision, revision, 'export_pdf unexpectedly changed the DOCX revision.');
  return { sha256: expectedSha256, byteLength: bytes.length, sessionRemainedOpen: true, artifactDeleted: true };
}

async function saveReadVerifyDelete(context, session, revision, filename) {
  const saved = await context.client.callTool('editor_docx_save_source', {
    documentId: session.documentId,
    baseRevision: revision,
    filename,
  });
  const { artifactId, expectedSha256, tracked } = await registerReturnedArtifact(context, session, saved?.data);
  assert.equal(saved.ok, true, `save_source failed: ${toolErrorText(saved)}`);
  assert.ok(artifactId, 'save_source did not return artifactId.');
  assert.match(expectedSha256, SHA256_RE, 'save_source did not return a valid SHA-256.');
  assert.equal(saved.data.sessionClosed, true, 'save_source did not confirm that the document session closed.');
  assert.ok(tracked, 'save_source artifact could not be registered for cleanup.');

  const read = await context.client.callTool('editor_docx_artifact_read', {
    artifactId,
    expectedSha256,
  });
  assert.equal(read.ok, true, `artifact_read failed: ${toolErrorText(read)}`);
  assert.equal(String(read.data.sha256 || '').toLowerCase(), expectedSha256);
  assert.ok(typeof read.data.bytesBase64 === 'string' && read.data.bytesBase64.length > 0, 'artifact_read did not return DOCX bytes.');
  const artifactBytes = Buffer.from(read.data.bytesBase64, 'base64');
  assert.equal(sha256(artifactBytes), expectedSha256, 'Downloaded artifact hash mismatch.');
  const reopened = new DocxApiSession(artifactBytes);
  const validation = reopened.validationReport();
  assert.equal(validation.sourceFormat, 'docx');

  const deleted = await context.client.callTool('editor_docx_artifact_delete', {
    artifactId,
    expectedSha256,
  });
  assert.equal(deleted.ok, true, `artifact_delete failed: ${toolErrorText(deleted)}`);
  assert.equal(deleted.data.deleted, true);
  tracked.deleted = true;
  session.cleanupEvidence.artifactDeletes += 1;

  await expectToolError(
    context.client,
    'editor_docx_read_json',
    { documentId: session.documentId, view: 'summary' },
    /Document session not found|session.*not found/i,
  );

  return {
    artifactBytes,
    evidence: {
      sha256: expectedSha256,
      byteLength: artifactBytes.length,
      visibleTextHash: read.data.visibleTextHash || saved.data.visibleTextHash || null,
      reopenedParagraphCount: validation.paragraphCount,
      reopenedTableCount: validation.tableCount,
      sessionClosedAfterSave: true,
      artifactDeleted: true,
    },
  };
}

async function satisfyPrecondition(context, session, precondition, plan) {
  if (precondition === 'target_inspect') {
    assert.ok(plan.inspectLocations.length, 'target_inspect command plan did not declare locations.');
    const inspected = await context.client.callTool('editor_docx_target_inspect', {
      documentId: session.documentId,
      locations: plan.inspectLocations,
    });
    assert.equal(inspected.ok, true, `target_inspect failed: ${toolErrorText(inspected)}`);
    return { inspectedLocationCount: plan.inspectLocations.length, revision: inspected.data.revision };
  }
  if (precondition === 'object_inventory') {
    const inventory = await context.client.callTool('editor_docx_object_inventory', { documentId: session.documentId });
    assert.equal(inventory.ok, true, `object_inventory failed: ${toolErrorText(inventory)}`);
    assert.ok(Array.isArray(inventory.data.images) && inventory.data.images.length > 0, 'English paper has no discoverable image.');
    return { imageCount: inventory.data.images.length, revision: inventory.data.revision };
  }
  return { notApplicable: true };
}

async function verifyLayoutStaleRevision(context, plan) {
  const wrapped = await withRemoteSession(context, 'korean', 'stale-layout-fit', async (session) => {
    const before = await readRevisionSummary(context.client, session.documentId);
    const mutation = await context.client.callTool('editor_docx_apply', {
      documentId: session.documentId,
      baseRevision: before.revision,
      commands: [{ op: 'appendParagraph', text: 'STALE_REVISION_SENTINEL' }],
    });
    assert.equal(mutation.ok, true);
    const beforeStale = await readStructuralSnapshot(context.client, session.documentId);
    await expectToolError(
      context.client,
      'editor_docx_apply',
      { documentId: session.documentId, baseRevision: before.revision, commands: [plan.command] },
      /stale_revision/i,
    );
    const afterSummary = await readRevisionSummary(context.client, session.documentId);
    const afterStale = await readStructuralSnapshot(context.client, session.documentId);
    assert.equal(afterSummary.revision, Number(mutation.data.revision));
    assert.equal(stableJson(afterStale), stableJson(beforeStale), 'Rejected stale layout command changed document structure.');
    return { staleBaseRevision: before.revision, currentRevision: mutation.data.revision, structureUnchanged: true };
  });
  return { ...wrapped.result, cleanup: wrapped.cleanup };
}

async function runHappyCase(context, matrixCase, index) {
  const entry = commandCatalogEntry(matrixCase.op);
  const row = {
    index: index + 1,
    op: matrixCase.op,
    category: entry.category,
    document: matrixCase.document,
    precondition: entry.precondition,
    passed: false,
    checks: {},
  };
  try {
    const wrapped = await withRemoteSession(context, matrixCase.document, `happy-${String(index + 1).padStart(2, '0')}-${matrixCase.op}`, async (session) => {
      const source = session.source;
      const plan = buildPlan(matrixCase.op, source);
      const read = await readRevisionSummary(context.client, session.documentId);
      const baseRevision = read.revision;
      assert.equal(baseRevision, 1);

      if (matrixCase.discoveryTools) {
        const paragraphs = await mapTargetStream(context.client, session.documentId, 'paragraph');
        const cells = await mapTargetStream(context.client, session.documentId, 'cell');
        assert.equal(paragraphs.revision, baseRevision, 'Paragraph target_map revision differs from summary.');
        assert.equal(cells.revision, baseRevision, 'Cell target_map revision differs from summary.');
        assert.ok(paragraphs.targets.length > 0, 'target_map returned no paragraph targets.');
        assert.ok(cells.targets.length > 0, 'target_map returned no cell targets.');
        const discoveryText = inspectText(new DocxApiSession(source.bytes), 603).currentText;
        const found = await context.client.callTool('editor_docx_target_find', {
          documentId: session.documentId,
          query: discoveryText,
          match: { caseSensitive: true, occurrence: 1 },
        });
        assert.equal(found.ok, true, `target_find failed: ${toolErrorText(found)}`);
        assert.equal(Number(found.data.target?.native?.paragraph), 603, 'target_find resolved the wrong paragraph.');
        row.checks.discoveryTools = {
          paragraphTargetCount: paragraphs.total,
          paragraphTargetPages: paragraphs.pages,
          cellTargetCount: cells.total,
          cellTargetPages: cells.pages,
          resolvedParagraph: 603,
        };
      }

      const preconditionSnapshot = entry.precondition === 'none'
        ? null
        : await readStructuralSnapshot(context.client, session.documentId);
      if (entry.precondition === 'target_inspect') {
        row.checks.preconditionMissing = await expectToolError(
          context.client,
          'editor_docx_apply',
          { documentId: session.documentId, baseRevision, commands: [plan.command] },
          /inspection_required/i,
        );
      } else if (entry.precondition === 'object_inventory') {
        row.checks.preconditionMissing = await expectToolError(
          context.client,
          'editor_docx_apply',
          { documentId: session.documentId, baseRevision, commands: [plan.command] },
          /object_inventory_required/i,
        );
      } else {
        row.checks.preconditionMissing = { notApplicable: true };
      }
      const unchangedAfterPreconditionFailure = await readRevisionSummary(context.client, session.documentId);
      assert.equal(unchangedAfterPreconditionFailure.revision, baseRevision);
      if (preconditionSnapshot) {
        const afterPreconditionFailure = await readStructuralSnapshot(context.client, session.documentId);
        assert.equal(
          stableJson(afterPreconditionFailure),
          stableJson(preconditionSnapshot),
          'Missing-precondition rejection changed document structure.',
        );
      }

      row.checks.preconditionSatisfied = await satisfyPrecondition(context, session, entry.precondition, plan);
      const applied = await context.client.callTool('editor_docx_apply', {
        documentId: session.documentId,
        baseRevision,
        commands: [plan.command],
      });
      assert.equal(applied.ok, true, `apply failed: ${toolErrorText(applied)}`);
      const expectedRevision = MUTATING_OPS.has(matrixCase.op) ? baseRevision + 1 : baseRevision;
      assert.equal(Number(applied.data.revision), expectedRevision, `${matrixCase.op} returned unexpected revision.`);
      assert.ok(Array.isArray(applied.data.results) && applied.data.results.length > 0, `${matrixCase.op} returned no command results.`);
      row.checks.apply = {
        revisionBefore: baseRevision,
        revisionAfter: applied.data.revision,
        resultCount: applied.data.results.length,
        actions: applied.data.results.map((result) => result.action),
      };

      const afterApplyRead = await readRevisionSummary(context.client, session.documentId);
      assert.equal(afterApplyRead.revision, expectedRevision);
      const afterApplySnapshot = await readStructuralSnapshot(context.client, session.documentId);
      assert.equal(afterApplySnapshot.revision, expectedRevision);

      if (MUTATING_OPS.has(matrixCase.op)) {
        row.checks.staleRevision = await expectToolError(
          context.client,
          'editor_docx_apply',
          { documentId: session.documentId, baseRevision, commands: [plan.command] },
          /stale_revision/i,
        );
      } else {
        row.checks.staleRevision = await verifyLayoutStaleRevision(context, plan);
      }

      const reread = await readRevisionSummary(context.client, session.documentId);
      assert.equal(reread.revision, expectedRevision);
      const afterStaleSnapshot = await readStructuralSnapshot(context.client, session.documentId);
      assert.equal(stableJson(afterStaleSnapshot), stableJson(afterApplySnapshot), 'Rejected stale command changed document structure.');
      const quality = await context.client.callTool('editor_docx_quality_check', {
        documentId: session.documentId,
        baseRevision: expectedRevision,
      });
      assert.equal(quality.ok, true, `quality_check tool failed: ${toolErrorText(quality)}`);
      row.checks.quality = assertCleanQuality(quality.data);

      if (matrixCase.render) {
        const rendered = await context.client.callTool('editor_docx_render_pages', {
          documentId: session.documentId,
          baseRevision: expectedRevision,
          pages: matrixCase.render.pages,
          includeBaseline: matrixCase.render.includeBaseline,
        });
        assert.equal(rendered.ok, true, `render_pages failed: ${toolErrorText(rendered)}`);
        row.checks.render = assertRenderedPayload(rendered.data, matrixCase.render.pages, matrixCase.render.includeBaseline);
      } else {
        row.checks.render = { representativeOnly: true, notSelectedForThisOp: true };
      }

      if (matrixCase.exportPdf) {
        row.checks.pdfArtifact = await exportPdfReadVerifyDelete(
          context,
          session,
          expectedRevision,
          `matrix-${String(index + 1).padStart(2, '0')}.pdf`,
        );
      }

      const finalized = await saveReadVerifyDelete(
        context,
        session,
        expectedRevision,
        `matrix-${String(index + 1).padStart(2, '0')}-${matrixCase.op.replace(/[^a-z0-9]+/gi, '-')}.docx`,
      );
      row.checks.persisted = verifyPersistedCase({
        op: matrixCase.op,
        source,
        artifactBytes: finalized.artifactBytes,
        plan,
        applyData: applied.data,
      });
      row.checks.artifact = finalized.evidence;
      return { sourceSha256: source.sha256 };
    });
    row.checks.cleanup = wrapped.cleanup;
    row.sourceSha256 = wrapped.result.sourceSha256;
    row.passed = true;
  } catch (error) {
    row.error = context.sanitizer.sanitize(error.message);
  }
  return row;
}

function buildDeepInvalidPlan(name, source) {
  const local = new DocxApiSession(source.bytes);
  const imageName = local.objectInventory().images[0]?.name;
  const plans = {
    'empty-write-cells': {
      command: { op: 'table.writeCells', tableId: 'tbl_3', cells: [] },
      inspectLocations: [cellLocation('tbl_3', 1)],
    },
    'zero-row-table': { command: { op: 'table.create', rows: 0, cols: 2 }, inspectLocations: [] },
    'empty-bullet-items': {
      command: { op: 'list.writeBullets', location: cellLocation('tbl_3', 1), items: [] },
      inspectLocations: [cellLocation('tbl_3', 1)],
    },
    'empty-number-items': {
      command: { op: 'list.applyNumbering', location: cellLocation('tbl_4', 1), items: [] },
      inspectLocations: [cellLocation('tbl_4', 1)],
    },
    'empty-run-style-target': {
      command: { op: 'setRunStyle', target: {}, style: { italic: true } },
      inspectLocations: [nodeTarget(603)],
    },
    'empty-paragraph-style-target': {
      command: { op: 'setParagraphStyle', target: {}, style: { align: 'right' } },
      inspectLocations: [nodeTarget(603)],
    },
    'undefined-named-style': {
      command: { op: 'applyStyle', target: nodeTarget(603), styleId: 'DefinitelyMissingStyle' },
      inspectLocations: [nodeTarget(603)],
    },
    'corrupt-png-replacement': {
      command: { op: 'image.replace', imageName, bytesBase64: Buffer.from([1, 2, 3]).toString('base64') },
      inspectLocations: [],
    },
    'empty-style-definition': { command: { op: 'defineStyle', style: {} }, inspectLocations: [] },
    'incomplete-page-margins': {
      command: { op: 'setPageSetup', width: 12240, height: 15840, margins: { top: 936 } },
      inspectLocations: [],
    },
    'empty-footnote-target': {
      command: { op: 'insertFootnote', target: {}, text: 'Must not be inserted.' },
      inspectLocations: [nodeTarget(602)],
    },
  };
  const plan = plans[name];
  assert.ok(plan, `Unknown deep-invalid case ${name}.`);
  if (name === 'corrupt-png-replacement') assert.ok(imageName, 'English paper has no image.');
  return plan;
}

async function runDeepInvalidCase(context, invalidCase) {
  const result = {
    name: invalidCase.name,
    document: invalidCase.document,
    precondition: invalidCase.precondition,
    passed: false,
  };
  try {
    const wrapped = await withRemoteSession(context, invalidCase.document, `invalid-${invalidCase.name}`, async (session) => {
      const plan = buildDeepInvalidPlan(invalidCase.name, session.source);
      const before = await readRevisionSummary(context.client, session.documentId);
      const beforeSnapshot = await readStructuralSnapshot(context.client, session.documentId);
      assert.equal(beforeSnapshot.revision, before.revision);
      if (invalidCase.precondition === 'target_inspect') {
        const inspected = await context.client.callTool('editor_docx_target_inspect', {
          documentId: session.documentId,
          locations: plan.inspectLocations,
        });
        assert.equal(inspected.ok, true);
      } else if (invalidCase.precondition === 'object_inventory') {
        const inventory = await context.client.callTool('editor_docx_object_inventory', { documentId: session.documentId });
        assert.equal(inventory.ok, true);
      }
      const attempted = await context.client.callTool('editor_docx_apply', {
        documentId: session.documentId,
        baseRevision: before.revision,
        commands: [plan.command],
      });
      assert.equal(attempted.ok, false, `${invalidCase.name} unexpectedly mutated or was accepted.`);
      const after = await readRevisionSummary(context.client, session.documentId);
      const afterSnapshot = await readStructuralSnapshot(context.client, session.documentId);
      assert.equal(after.revision, before.revision, 'Rejected deep-invalid command changed revision.');
      assert.equal(stableJson(afterSnapshot), stableJson(beforeSnapshot), 'Rejected deep-invalid command changed document structure.');
      return { errorClass: toolErrorText(attempted).split(':')[0], revisionUnchanged: true, structureUnchanged: true };
    });
    result.evidence = { ...wrapped.result, cleanup: wrapped.cleanup };
    result.passed = true;
  } catch (error) {
    result.error = context.sanitizer.sanitize(error.message);
  }
  return result;
}

function buildRollbackPlan(category, source) {
  const imageName = new DocxApiSession(source.bytes).objectInventory().images[0]?.name;
  const runtimeFailure = {
    op: 'setPageSetup',
    width: 12240,
    height: 15840,
    margins: { top: 936 },
  };
  const plans = {
    text: {
      commands: [
        { op: 'text.replaceParagraph', location: paragraphLocation(603), text: 'ROLLBACK paragraph' },
        { op: 'text.replace', target: nodeTarget(602, { offset: 0, length: 1 }), text: 'R' },
        { op: 'insertText', target: nodeTarget(601, { offset: 0, length: 0 }), text: 'R' },
        { op: 'deleteRange', target: nodeTarget(602, { offset: 1, length: 1 }) },
        { op: 'appendParagraph', text: 'ROLLBACK append' },
      ],
      inspectLocations: [paragraphLocation(603), nodeTarget(602), nodeTarget(601)],
      inventory: false,
    },
    table: {
      commands: [
        { op: 'table.writeCell', location: cellLocation('tbl_3', 1), text: 'R' },
        { op: 'table.writeRichCell', location: cellLocation('tbl_4', 1), styleSource: cellLocation('tbl_0', 0), text: 'R' },
        { op: 'table.writeCells', tableId: 'tbl_8', cells: [{ cell: { number: 0 }, text: 'R0' }, { cell: { number: 1 }, text: 'R1' }] },
        { op: 'table.applyCellStyle', target: cellLocation('tbl_19', 1), styleSource: cellLocation('tbl_0', 0) },
        { op: 'table.create', rows: 2, cols: 2 },
      ],
      inspectLocations: [
        cellLocation('tbl_3', 1), cellLocation('tbl_4', 1), cellLocation('tbl_0', 0),
        cellLocation('tbl_8', 0), cellLocation('tbl_8', 1), cellLocation('tbl_19', 1),
      ],
      inventory: false,
    },
    style: {
      commands: [
        { op: 'style.applyText', target: paragraphLocation(603), styleSource: paragraphLocation(602), text: 'R' },
        { op: 'paragraph.applyStyle', target: paragraphLocation(601), styleSource: paragraphLocation(602) },
        { op: 'style.clone', source: cellLocation('tbl_0', 0), target: cellLocation('tbl_3', 0) },
        { op: 'applyStyle', target: nodeTarget(599), styleId: 'BodyText' },
        { op: 'setRunStyle', target: nodeTarget(598), style: { italic: true } },
        { op: 'setParagraphStyle', target: nodeTarget(597), style: { align: 'right' } },
      ],
      inspectLocations: [
        paragraphLocation(603), paragraphLocation(602), paragraphLocation(601), cellLocation('tbl_0', 0),
        cellLocation('tbl_3', 0), nodeTarget(599), nodeTarget(598), nodeTarget(597),
      ],
      inventory: false,
    },
    list: {
      commands: [
        { op: 'list.writeBullets', location: cellLocation('tbl_3', 1), items: ['R1', 'R2'] },
        { op: 'list.applyNumbering', location: cellLocation('tbl_4', 1), items: ['R1', 'R2'] },
      ],
      inspectLocations: [cellLocation('tbl_3', 1), cellLocation('tbl_4', 1)],
      inventory: false,
    },
    layout: {
      commands: [
        { op: 'appendParagraph', text: 'ROLLBACK layout sentinel' },
        { op: 'layout.fitText', location: cellLocation('tbl_3', 3), text: 'valid fit' },
      ],
      inspectLocations: [cellLocation('tbl_3', 3)],
      inventory: false,
    },
    image: {
      commands: [
        { op: 'image.replace', imageName, bytesBase64: generatePngBytes({ width: 200, height: 100, values: [1, 2] }).toString('base64') },
        { op: 'image.generateAndReplace', imageName, generator: { width: 240, height: 120, values: [3, 7] } },
      ],
      inspectLocations: [],
      inventory: true,
    },
    package: {
      commands: [
        { op: 'setDocumentMetadata', title: 'ROLLBACK metadata' },
        { op: 'defineStyle', style: { styleId: 'RollbackStyle', name: 'Rollback Style' } },
        { op: 'setPageSetup', width: 12240, height: 15840, margins: { top: 936, right: 979, bottom: 936, left: 979 } },
        { op: 'setHeaderFooter', header: 'ROLLBACK header', footer: 'ROLLBACK footer' },
        { op: 'insertFootnote', target: nodeTarget(602), text: 'ROLLBACK footnote' },
      ],
      inspectLocations: [nodeTarget(602)],
      inventory: false,
    },
  };
  const plan = plans[category];
  assert.ok(plan, `Unknown rollback category ${category}.`);
  if (category === 'image') assert.ok(imageName, 'English rollback paper has no image.');
  return {
    ...plan,
    commands: [...plan.commands, runtimeFailure],
    inspectLocations: uniqueLocations(plan.inspectLocations),
    runtimeFailure: 'setPageSetup.margins.right',
  };
}

async function runRollbackCategory(context, category) {
  const documentKey = category === 'image' ? 'english' : 'korean';
  const result = { category, document: documentKey, passed: false };
  try {
    const wrapped = await withRemoteSession(context, documentKey, `rollback-${category}`, async (session) => {
      const plan = buildRollbackPlan(category, session.source);
      const before = await readRevisionSummary(context.client, session.documentId);
      const beforeSnapshot = await readStructuralSnapshot(context.client, session.documentId);
      assert.equal(beforeSnapshot.revision, before.revision);
      if (plan.inspectLocations.length) {
        const inspected = await context.client.callTool('editor_docx_target_inspect', {
          documentId: session.documentId,
          locations: plan.inspectLocations,
        });
        assert.equal(inspected.ok, true);
      }
      if (plan.inventory) {
        const inventory = await context.client.callTool('editor_docx_object_inventory', { documentId: session.documentId });
        assert.equal(inventory.ok, true);
      }
      const attempted = await context.client.callTool('editor_docx_apply', {
        documentId: session.documentId,
        baseRevision: before.revision,
        commands: plan.commands,
      });
      assert.equal(attempted.ok, false, `${category} rollback batch unexpectedly succeeded.`);
      assert.match(toolErrorText(attempted), /setPageSetup requires margins\.right/i, 'Rollback did not reach the intended post-mutation runtime failure.');
      const afterFailure = await readRevisionSummary(context.client, session.documentId);
      const afterFailureSnapshot = await readStructuralSnapshot(context.client, session.documentId);
      assert.equal(afterFailure.revision, before.revision, 'Failed batch changed revision.');
      assert.equal(
        sha256(Buffer.from(stableJson(afterFailureSnapshot), 'utf8')),
        sha256(Buffer.from(stableJson(beforeSnapshot), 'utf8')),
        'Failed batch changed structural read_json state.',
      );

      const quality = await context.client.callTool('editor_docx_quality_check', {
        documentId: session.documentId,
        baseRevision: before.revision,
      });
      assert.equal(quality.ok, true);
      const qualityEvidence = assertCleanQuality(quality.data);
      const finalized = await saveReadVerifyDelete(
        context,
        session,
        before.revision,
        `rollback-${category}.docx`,
      );
      assert.equal(sha256(finalized.artifactBytes), session.source.sha256, 'Failed batch did not save byte-identical original DOCX.');
      assert.equal(Buffer.compare(finalized.artifactBytes, session.source.bytes), 0, 'Failed batch altered original package bytes.');
      return {
        commandCountBeforeFailure: plan.commands.length - 1,
        runtimeFailure: plan.runtimeFailure,
        revisionUnchanged: true,
        byteIdenticalAfterFailure: true,
        quality: qualityEvidence,
        artifact: finalized.evidence,
      };
    });
    result.evidence = { ...wrapped.result, cleanup: wrapped.cleanup };
    result.passed = true;
  } catch (error) {
    result.error = context.sanitizer.sanitize(error.message);
  }
  return result;
}

async function verifyContract(context) {
  const initialized = await context.client.initialize();
  assert.equal(initialized?.serverInfo?.name, 'academic-editor-mcp');
  const listed = await context.client.listTools();
  const tools = listed?.tools ?? [];
  const names = tools.map((tool) => tool.name);
  deepEqual(names, EXPECTED_SERVER_TOOLS, 'MCP tools/list differs from the exact 15-tool contract.');
  deepEqual(tools, EDITOR_MCP_TOOLS, 'MCP tools/list schemas, descriptions, or annotations differ from the local contract.');
  const applyTool = tools.find((tool) => tool.name === 'editor_docx_apply');
  const applyEnum = applyTool?.inputSchema?.properties?.commands?.items?.properties?.op?.enum;
  deepEqual(applyEnum, DOCX_COMMAND_OPS, 'editor_docx_apply op enum differs from the local 26-command catalog.');

  const fullCatalogCall = await context.client.callTool('editor_docx_command_catalog', {});
  assert.equal(fullCatalogCall.ok, true, `command_catalog failed: ${toolErrorText(fullCatalogCall)}`);
  const fullCatalog = fullCatalogCall.data;
  deepEqual(fullCatalog, getDocxCommandCatalog(), 'Remote full catalog envelope or metadata differs from the local catalog.');

  const perOp = [];
  for (const localEntry of DOCX_COMMAND_CATALOG) {
    const call = await context.client.callTool('editor_docx_command_catalog', { op: localEntry.op });
    assert.equal(call.ok, true, `Per-op catalog failed for ${localEntry.op}.`);
    deepEqual(call.data, getDocxCommandCatalog({ op: localEntry.op }), `${localEntry.op} per-op catalog envelope or metadata drifted.`);
    const remoteEntry = call.data.commands[0];
    deepEqual(remoteEntry, localEntry, `${localEntry.op} per-op catalog metadata drifted.`);
    perOp.push({ op: localEntry.op, category: localEntry.category, precondition: localEntry.precondition, passed: true });
  }
  return {
    passed: true,
    serverName: initialized.serverInfo.name,
    serverVersion: initialized.serverInfo.version,
    toolCount: names.length,
    commandCount: fullCatalog.commandCount,
    applyEnumCount: applyEnum.length,
    perOp,
  };
}

function summarize(report) {
  const count = (rows) => ({
    total: rows.length,
    passed: rows.filter((row) => row.passed).length,
    failed: rows.filter((row) => !row.passed).length,
  });
  const happy = count(report.happyPath);
  const deepInvalid = count(report.deepInvalid);
  const rollback = count(report.atomicRollback);
  const overallPassed = report.contract?.passed === true
    && happy.failed === 0
    && deepInvalid.failed === 0
    && rollback.failed === 0
    && report.originalIntegrity?.passed === true
    && report.finalCleanup?.passed === true
    && !report.interrupted
    && !report.fatalError
    && !report.signalCleanupError;
  return { overallPassed, happy, deepInvalid, rollback };
}

async function runLiveMatrix(args) {
  assert.ok(args.korean, '--korean is required.');
  assert.ok(args.english, '--english is required.');
  assert.ok(args.out, '--out is required.');
  const mcpUrl = String(process.env.ACADEMIC_EDITOR_MCP_URL || '').trim();
  const bearerToken = String(process.env.ACADEMIC_EDITOR_MCP_BEARER_TOKEN || '').trim();
  assert.ok(mcpUrl, 'ACADEMIC_EDITOR_MCP_URL is required.');
  assert.ok(/^https?:\/\//i.test(mcpUrl), 'ACADEMIC_EDITOR_MCP_URL must be HTTP(S).');
  assert.ok(bearerToken, 'ACADEMIC_EDITOR_MCP_BEARER_TOKEN is required.');
  const outputPath = await assertSafeOutputPath(args.out, [args.korean, args.english]);
  const sanitizer = createSanitizer(bearerToken);
  const sources = {
    korean: await loadSource('korean', args.korean),
    english: await loadSource('english', args.english),
  };
  assert.equal(sources.korean.baseline.tableCount, 21, 'Korean paper fixture must contain 21 tables.');
  assert.equal(sources.korean.baseline.imageCount, 0, 'Korean paper fixture must contain no images.');
  assert.equal(sources.english.baseline.tableCount, 6, 'English paper fixture must contain 6 tables.');
  assert.equal(sources.english.baseline.imageCount, 1, 'English paper fixture must contain exactly one image.');

  const context = {
    sanitizer,
    sources,
    client: new McpClient({ url: mcpUrl, bearerToken, sanitizer }),
    activeSessions: new Set(),
    stopping: false,
  };
  const signalGuard = installSignalCleanup(context);
  const report = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    script: path.basename(SCRIPT_PATH),
    inputs: Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, {
      path: source.path,
      sha256: source.sha256,
      baseline: source.baseline,
    }])),
    contract: { passed: false },
    happyPath: [],
    deepInvalid: [],
    atomicRollback: [],
    originalIntegrity: { passed: false },
  };

  try {
    report.contract = await verifyContract(context);
    for (let index = 0; index < MATRIX_CASES.length; index += 1) {
      assertRunContinuing(context);
      report.happyPath.push(await runHappyCase(context, MATRIX_CASES[index], index));
      assert.equal(context.activeSessions.size, 0, 'A happy-path session could not be cleaned; stopping before opening another session.');
    }
    for (const invalidCase of DEEP_INVALID_CASES) {
      assertRunContinuing(context);
      report.deepInvalid.push(await runDeepInvalidCase(context, invalidCase));
      assert.equal(context.activeSessions.size, 0, 'A deep-invalid session could not be cleaned; stopping before opening another session.');
    }
    for (const category of ROLLBACK_CATEGORIES) {
      assertRunContinuing(context);
      report.atomicRollback.push(await runRollbackCategory(context, category));
      assert.equal(context.activeSessions.size, 0, 'A rollback session could not be cleaned; stopping before opening another session.');
    }
  } catch (error) {
    report.fatalError = sanitizer.sanitize(error.message);
  } finally {
    let signalGuardDisposed = false;
    try {
      if (signalGuard.state.promise) await signalGuard.state.promise;
      try {
        report.finalCleanup = { passed: true, ...(await cleanupAllActiveSessions(context)) };
      } catch (error) {
        report.finalCleanup = { passed: false, error: sanitizer.sanitize(error.message) };
      }
      if (signalGuard.state.promise) await signalGuard.state.promise;
      signalGuard.dispose();
      signalGuardDisposed = true;
      if (signalGuard.state.signal) {
        report.interrupted = { signal: signalGuard.state.signal };
      }
      if (signalGuard.state.error) {
        report.signalCleanupError = sanitizer.sanitize(signalGuard.state.error.message);
        report.finalCleanup.passed = false;
      }
      try {
        const koreanAfter = await readFile(sources.korean.path);
        const englishAfter = await readFile(sources.english.path);
        assert.equal(sha256(koreanAfter), sources.korean.sha256, 'Korean source DOCX was modified.');
        assert.equal(sha256(englishAfter), sources.english.sha256, 'English source DOCX was modified.');
        report.originalIntegrity = {
          passed: true,
          koreanSha256: sources.korean.sha256,
          englishSha256: sources.english.sha256,
        };
      } catch (error) {
        report.originalIntegrity = { passed: false, error: sanitizer.sanitize(error.message) };
      }
      report.aggregate = summarize(report);
      await writeJsonAtomic(outputPath, report, sanitizer, [sources.korean.path, sources.english.path]);
    } finally {
      if (!signalGuardDisposed) signalGuard.dispose();
    }
  }

  return { report, outputPath };
}

async function runOfflineFixtureSelfTest(args) {
  assert.ok(args.korean && args.english, 'Both --korean and --english are required for fixture self-test.');
  const sources = {
    korean: await loadSource('korean', args.korean),
    english: await loadSource('english', args.english),
  };
  const happy = [];
  for (const matrixCase of MATRIX_CASES) {
    try {
      const source = sources[matrixCase.document];
      const plan = buildPlan(matrixCase.op, source);
      validateDocxCommands([plan.command]);
      const session = new DocxApiSession(source.bytes);
      const applied = session.apply([plan.command]);
      const expectedRevision = MUTATING_OPS.has(matrixCase.op) ? 2 : 1;
      assert.equal(applied.revision, expectedRevision, `Offline ${matrixCase.op} revision mismatch.`);
      assert.ok(applied.results.length > 0, `Offline ${matrixCase.op} returned no results.`);
      const quality = session.qualityCheck({
        baselineJson: new DocxApiSession(source.bytes).readJson(),
      });
      assertCleanQuality(quality);
      const saved = session.save().bytes;
      verifyPersistedCase({
        op: matrixCase.op,
        source,
        artifactBytes: saved,
        plan,
        applyData: applied,
      });
      happy.push({ op: matrixCase.op, passed: true });
    } catch (error) {
      throw new Error(`Offline ${matrixCase.op} self-test failed: ${error.message}`, { cause: error });
    }
  }

  const rollback = [];
  for (const category of ROLLBACK_CATEGORIES) {
    const source = sources[category === 'image' ? 'english' : 'korean'];
    const plan = buildRollbackPlan(category, source);
    validateDocxCommands(plan.commands);
    const prefixSession = new DocxApiSession(source.bytes);
    const prefixApplied = prefixSession.apply(plan.commands.slice(0, -1));
    assert.equal(prefixApplied.revision, 2, `Offline ${category} rollback prefix did not mutate.`);
    assert.notEqual(
      Buffer.compare(prefixSession.save().bytes, source.bytes),
      0,
      `Offline ${category} rollback prefix did not change package bytes.`,
    );
    const session = new DocxApiSession(source.bytes);
    const before = session.save().bytes;
    assert.throws(
      () => session.apply(plan.commands),
      /setPageSetup requires margins\.right/i,
      `Offline ${category} rollback batch did not reach its post-mutation runtime failure.`,
    );
    assert.equal(session.revision, 1, `Offline ${category} rollback changed revision.`);
    assert.equal(Buffer.compare(session.save().bytes, before), 0, `Offline ${category} rollback changed package bytes.`);
    rollback.push({ category, passed: true });
  }

  assert.equal(sha256(await readFile(sources.korean.path)), sources.korean.sha256);
  assert.equal(sha256(await readFile(sources.english.path)), sources.english.sha256);
  return {
    sourceHashes: { korean: sources.korean.sha256, english: sources.english.sha256 },
    happyRows: happy.length,
    rollbackCategories: rollback.length,
    sourceIntegrity: true,
  };
}

async function runBoundedContractSelfTest() {
  const documentId = 'bounded-contract-document';
  const calls = [];
  const success = (data) => ({ ok: true, data });
  const client = {
    async callTool(name, args) {
      calls.push({ name, args: structuredClone(args) });
      if (name === 'editor_docx_read_json') {
        if (args.cursor === 'blocks-next') {
          deepEqual(args, { documentId, cursor: 'blocks-next' }, 'read_json continuation must contain only documentId and cursor.');
          return success({
            ok: true,
            revision: 7,
            view: 'blocks',
            total: 3,
            returned: 1,
            nextCursor: null,
            items: [{ id: 'p_2', textPreview: 'C' }],
          });
        }
        if (args.view === 'summary') {
          deepEqual(args, { documentId, view: 'summary', limit: 1, textPreviewChars: 512 }, 'summary read must be explicit and bounded.');
          return success({
            ok: true,
            revision: 7,
            view: 'summary',
            total: 1,
            returned: 1,
            nextCursor: null,
            items: [{ sourceFormat: 'docx', blockCount: 3, tableCount: 1 }],
          });
        }
        if (args.view === 'blocks') {
          deepEqual(args, { documentId, view: 'blocks', limit: 100, textPreviewChars: 512 }, 'blocks read must start with an explicit bounded query.');
          return success({
            ok: true,
            revision: 7,
            view: 'blocks',
            total: 3,
            returned: 2,
            nextCursor: 'blocks-next',
            items: [{ id: 'p_0', textPreview: 'A' }, { id: 'p_1', textPreview: 'B' }],
          });
        }
        if (args.view === 'tables') {
          deepEqual(
            args,
            { documentId, view: 'tables', limit: 100, textPreviewChars: 512, cellPreviewLimit: 12 },
            'tables read must start with an explicit bounded query.',
          );
          return success({
            ok: true,
            revision: 7,
            view: 'tables',
            total: 1,
            returned: 1,
            nextCursor: null,
            items: [{ id: 'tbl_0', dims: { rowCount: 1, colCount: 1, cellCount: 1 } }],
          });
        }
      }
      if (name === 'editor_docx_target_map') {
        if (args.cursor === 'paragraph-next') {
          deepEqual(args, { documentId, cursor: 'paragraph-next' }, 'paragraph target_map continuation must contain only documentId and cursor.');
          return success({
            ok: true,
            revision: 7,
            kind: 'paragraph',
            tableId: null,
            total: 3,
            returned: 1,
            nextCursor: null,
            targets: [{ id: 'p_2', kind: 'paragraph' }],
          });
        }
        if (args.cursor === 'cell-next') {
          deepEqual(args, { documentId, cursor: 'cell-next' }, 'cell target_map continuation must contain only documentId and cursor.');
          return success({
            ok: true,
            revision: 7,
            kind: 'cell',
            tableId: null,
            total: 2,
            returned: 1,
            nextCursor: null,
            targets: [{ id: 'tbl_0_cell_1', kind: 'cell' }],
          });
        }
        if (args.kind === 'paragraph') {
          deepEqual(args, { documentId, kind: 'paragraph', limit: 120 }, 'paragraph target_map must start with an explicit kind.');
          return success({
            ok: true,
            revision: 7,
            kind: 'paragraph',
            tableId: null,
            total: 3,
            returned: 2,
            nextCursor: 'paragraph-next',
            targets: [{ id: 'p_0', kind: 'paragraph' }, { id: 'p_1', kind: 'paragraph' }],
          });
        }
        if (args.kind === 'cell') {
          deepEqual(args, { documentId, kind: 'cell', limit: 120 }, 'cell target_map must start with an explicit kind.');
          return success({
            ok: true,
            revision: 7,
            kind: 'cell',
            tableId: null,
            total: 2,
            returned: 1,
            nextCursor: 'cell-next',
            targets: [{ id: 'tbl_0_cell_0', kind: 'cell' }],
          });
        }
      }
      throw new Error(`Unexpected bounded-contract self-test call: ${name} ${JSON.stringify(args)}`);
    },
  };

  const summary = await readRevisionSummary(client, documentId);
  const snapshot = await readStructuralSnapshot(client, documentId);
  const paragraphs = await mapTargetStream(client, documentId, 'paragraph');
  const cells = await mapTargetStream(client, documentId, 'cell');
  assert.equal(summary.revision, 7);
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.blocks.items.length, 3);
  assert.equal(snapshot.tables.items.length, 1);
  assert.equal(paragraphs.total, 3);
  assert.equal(paragraphs.pages, 2);
  assert.equal(cells.total, 2);
  assert.equal(cells.pages, 2);

  const oldTargetEnvelope = {
    callTool: async () => success({
      ok: true,
      revision: 7,
      editableTargets: { paragraphs: [{ id: 'p_0' }], cells: [{ id: 'cell_0' }] },
    }),
  };
  await assert.rejects(
    mapTargetStream(oldTargetEnvelope, documentId, 'paragraph'),
    /target_map returned kind=undefined/,
    'The old full target_map envelope must be rejected.',
  );
  const oldReadEnvelope = {
    callTool: async () => success({ ok: true, revision: 7, blocks: [], tables: [] }),
  };
  await assert.rejects(
    readRevisionSummary(oldReadEnvelope, documentId),
    /read_json returned view=undefined/,
    'The old full read_json envelope must be rejected.',
  );

  return {
    summaryExplicit: true,
    structuralSnapshotPages: 3,
    paragraphTargetPages: paragraphs.pages,
    cellTargetPages: cells.pages,
    cursorOnlyContinuations: calls.filter((call) => Object.hasOwn(call.args, 'cursor')).length,
    oldFullEnvelopeRejected: true,
  };
}

async function runSelfTest(args = {}) {
  assert.equal(EDITOR_MCP_TOOLS.length, 15);
  deepEqual(EDITOR_MCP_TOOLS.map((tool) => tool.name), EXPECTED_SERVER_TOOLS, 'Local MCP tool definitions drifted from the expected 15-tool contract.');
  assert.equal(DOCX_COMMAND_CATALOG.length, 26);
  assert.equal(DOCX_COMMAND_OPS.length, 26);
  assert.equal(new Set(DOCX_COMMAND_OPS).size, 26);
  assert.equal(MATRIX_CASES.length, 26);
  deepEqual(MATRIX_CASES.map((item) => item.op), DOCX_COMMAND_OPS, 'Matrix order or coverage differs from canonical catalog.');
  for (const matrixCase of MATRIX_CASES) {
    const entry = commandCatalogEntry(matrixCase.op);
    assert.ok(['none', 'target_inspect', 'object_inventory'].includes(entry.precondition));
    assert.equal(matrixCase.document, entry.category === 'image' ? 'english' : 'korean');
  }
  assert.equal(MATRIX_CASES.filter((item) => item.document === 'english').length, 2);
  assert.equal(DEEP_INVALID_CASES.length, 11);
  deepEqual(ROLLBACK_CATEGORIES, [...new Set(DOCX_COMMAND_CATALOG.map((entry) => entry.category))], 'Rollback categories do not cover the catalog.');

  const generated = generatePngBytes({ width: 32, height: 32, values: [1] });
  assertPng(generated, 'self-test PNG');
  const selfTestWebp = Buffer.alloc(30);
  selfTestWebp.write('RIFF', 0, 'ascii');
  selfTestWebp.writeUInt32LE(selfTestWebp.length - 8, 4);
  selfTestWebp.write('WEBP', 8, 'ascii');
  selfTestWebp.write('VP8X', 12, 'ascii');
  selfTestWebp.writeUInt32LE(10, 16);
  selfTestWebp.writeUIntLE(79, 24, 3);
  selfTestWebp.writeUIntLE(39, 27, 3);
  assertRenderedPayload({
    pages: [{
      page: 1,
      format: 'webp',
      mimeType: 'image/webp',
      width: 80,
      height: 40,
      sha256: sha256(selfTestWebp),
      byteLength: selfTestWebp.length,
      bytesBase64: selfTestWebp.toString('base64'),
    }],
  }, [1], false);
  const sanitizer = createSanitizer('secret-token');
  sanitizer.addSecret('doc-secret');
  sanitizer.addSecret('artifact-secret');
  const sanitized = sanitizer.sanitize({
    bearer: 'secret-token',
    documentId: 'doc-secret',
    artifactId: 'artifact-secret',
    bytesBase64: 'QUJD',
    message: `documentId=doc-secret artifactId=artifact-secret bytesBase64=${'A'.repeat(256)} bearer=secret-token 123e4567-e89b-42d3-a456-426614174000`,
    sha256: 'a'.repeat(64),
  });
  const serialized = JSON.stringify(sanitized);
  assert.ok(!serialized.includes('secret-token'));
  assert.ok(!serialized.includes('doc-secret'));
  assert.ok(!serialized.includes('artifact-secret'));
  assert.ok(!serialized.includes('QUJD'));
  assert.ok(!serialized.includes('123e4567-e89b-42d3-a456-426614174000'));
  assert.ok(!serialized.includes('A'.repeat(128)));
  assert.ok(!/documentId|artifactId|bytesBase64|bearer|token/i.test(serialized));
  await assert.rejects(assertSafeOutputPath('C:/same.docx', ['C:/same.docx']), /must not overwrite/);
  deepEqual(parseSseOrJson('data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n'), {
    jsonrpc: '2.0',
    id: 1,
    result: { ok: true },
  });
  deepEqual(parseArgs(['--korean', 'k.docx', '--english', 'e.docx', '--out', 'r.json']), {
    selfTest: false,
    help: false,
    korean: 'k.docx',
    english: 'e.docx',
    out: 'r.json',
  });
  const boundedContract = await runBoundedContractSelfTest();
  const fixtureSelfTest = args.korean || args.english
    ? await runOfflineFixtureSelfTest(args)
    : { skipped: true, reason: 'Pass both --korean and --english to execute the offline real-paper fixture test.' };
  return {
    passed: true,
    serverCalled: false,
    commandCount: 26,
    matrixRows: MATRIX_CASES.length,
    deepInvalidRows: DEEP_INVALID_CASES.length,
    rollbackCategories: ROLLBACK_CATEGORIES.length,
    redactionChecked: true,
    boundedContract,
    fixtureSelfTest,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (args.selfTest) {
    const result = await runSelfTest(args);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const { report, outputPath } = await runLiveMatrix(args);
  const safeStdout = {
    overallPassed: report.aggregate.overallPassed,
    happy: report.aggregate.happy,
    deepInvalid: report.aggregate.deepInvalid,
    rollback: report.aggregate.rollback,
    report: outputPath,
  };
  const stdoutSanitizer = createSanitizer(process.env.ACADEMIC_EDITOR_MCP_BEARER_TOKEN || '');
  const stdoutJson = JSON.stringify(stdoutSanitizer.sanitize(safeStdout));
  assert.ok(!/(?:documentId|artifactId|bytesBase64|authorization|bearer|token)/i.test(stdoutJson), 'Sensitive identifier or binary field leaked into stdout.');
  process.stdout.write(`${stdoutJson}\n`);
  if (!report.aggregate.overallPassed) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
if (isMain) {
  main().catch((error) => {
    const sanitizer = createSanitizer(process.env.ACADEMIC_EDITOR_MCP_BEARER_TOKEN || '');
    process.stderr.write(`${JSON.stringify({ error: sanitizer.sanitize(error.message) })}\n`);
    process.exitCode = 1;
  });
}

export {
  DEEP_INVALID_CASES,
  EXPECTED_SERVER_TOOLS,
  MATRIX_CASES,
  ROLLBACK_CATEGORIES,
  createSanitizer,
  parseArgs,
  runSelfTest,
};
