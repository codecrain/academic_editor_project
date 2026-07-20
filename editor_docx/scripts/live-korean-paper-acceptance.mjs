#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DocxApiSession, getZipText } from './docx-api-utils.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const MCP_REQUEST_TIMEOUT_MS = 300_000;
const EXPECTED_SOURCE_SHA256 = 'c5cdea8ca329195ead16bd9e8e122358c69d90df764f2724db1fa9135d860b03';
const SHA256_RE = /^[a-f0-9]{64}$/;
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');
const ZIP_SIGNATURE = Buffer.from('504b0304', 'hex');
const REPRESENTATIVE_PAGES = Object.freeze([1, 5, 6, 10, 16, 19]);

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

const REQUIRED_COMMANDS = Object.freeze([
  'table.writeCells',
  'text.replaceParagraph',
  'setDocumentMetadata',
  'setHeaderFooter',
  'insertFootnote',
  'defineStyle',
  'appendParagraph',
  'applyStyle',
]);

const EXPECTED = Object.freeze({
  title: 'Finding Studies in the Scholarly Haystack - Korean Reading Version',
  subject: 'Paper 1 Korean reading version - DOCX agent validation candidate',
  creator: 'Codecrain Research Workspace',
  keywords: 'literature screening; study identification; screening prioritization; DOCX agent validation',
  description: 'Validation candidate generated through academic_editor_project MCP; scholarly claims and numeric results preserved.',
  header: 'Finding Studies in the Scholarly Haystack — Korean Reading Version',
  footer: 'DOCX agent validation copy · 2026-07-15',
  footnotePrefix: '현재 한국어 읽기본은 활성 결과 기준으로 정리했다.',
  footnote: '검증 사본 안내: 본 각주는 DOCX 에이전트의 각주 편집 기능을 검증하기 위해 추가되었으며 논문의 주장과 수치를 변경하지 않는다.',
  note: '검증 사본: 표·메타데이터·머리글/바닥글·각주·렌더링·품질 검사를 academic_editor_project MCP로 수행했다.',
  styleId: 'AgentValidationNote',
  styleName: 'Agent Validation Note',
});

const SENSITIVE_KEY_RE = /^(?:documentId|artifactId|bytesBase64|authorization|bearer|bearerToken|token)$/i;
const SENSITIVE_TERM_RE = /(?:documentId|artifactId|bytesBase64|authorization|bearer(?:Token)?|token)/gi;
const SENSITIVE_REPORT_RE = /(?:documentId|artifactId|bytesBase64|authorization|bearer(?:Token)?|token)/i;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const LONG_BASE64_RE = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{128,}={0,2}(?![A-Za-z0-9+/=])/g;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
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
  const cleanString = (input) => {
    let output = String(input);
    for (const secret of secrets) {
      if (secret && output.includes(secret)) output = output.split(secret).join('[REDACTED]');
    }
    return output
      .replace(SENSITIVE_TERM_RE, '[REDACTED_FIELD]')
      .replace(UUID_RE, '[REDACTED_ID]')
      .replace(LONG_BASE64_RE, '[REDACTED_BINARY]');
  };
  const walk = (input) => {
    if (input === null || input === undefined || typeof input === 'number' || typeof input === 'boolean') return input;
    if (typeof input === 'string') return cleanString(input);
    if (Buffer.isBuffer(input)) return `[binary omitted: ${input.length} bytes]`;
    if (Array.isArray(input)) return input.map(walk);
    if (typeof input === 'object') {
      return Object.fromEntries(Object.entries(input)
        .filter(([key]) => !SENSITIVE_KEY_RE.test(key))
        .map(([key, value]) => [key, walk(value)]));
    }
    return cleanString(input);
  };
  return {
    addSecret(value) {
      if (value !== undefined && value !== null && String(value)) secrets.add(String(value));
    },
    sanitize: walk,
  };
}

function parseSseOrJson(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  if (source.startsWith('{') || source.startsWith('[')) return JSON.parse(source);
  const payloads = source.split(/\r?\n\r?\n/)
    .flatMap((event) => event.split(/\r?\n/))
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== '[DONE]');
  assert.ok(payloads.length, 'MCP response was neither JSON nor a data-bearing SSE response.');
  return JSON.parse(payloads.at(-1));
}

function toolErrorText(call) {
  if (typeof call?.data?.message === 'string') return call.data.message;
  if (typeof call?.data?.error === 'string') return call.data.error;
  const text = call?.result?.content?.find((item) => item?.type === 'text')?.text;
  return typeof text === 'string' ? text : 'Unknown MCP tool error.';
}

function failureClass(message) {
  const source = String(message || '').toLowerCase();
  if (source.includes('not found')) return 'not_found';
  if (source.includes('stale')) return 'stale_revision';
  if (source.includes('inspection_required')) return 'inspection_required';
  if (source.includes('quality_check_required')) return 'quality_gate';
  if (source.includes('timeout')) return 'timeout';
  if (source.includes('http')) return 'transport';
  return 'tool_error';
}

class McpClient {
  constructor({ url, secret, sanitizer }) {
    this.url = url;
    this.secret = secret;
    this.sanitizer = sanitizer;
    this.nextId = 1;
    this.toolCalls = [];
  }

  async request(method, params = {}) {
    let response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
        signal: AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`MCP ${method} transport failed: ${failureClass(error?.message)}`);
    }
    const responseText = await response.text();
    let payload;
    try {
      payload = parseSseOrJson(responseText);
    } catch (error) {
      throw new Error(`MCP returned non-JSON HTTP ${response.status}: ${error.message}`);
    }
    if (!response.ok) throw new Error(`MCP transport failed with HTTP ${response.status}.`);
    if (payload?.error) throw new Error(`MCP JSON-RPC error ${payload.error.code}: ${payload.error.message}`);
    return payload?.result;
  }

  initialize() {
    return this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'academic-editor-korean-paper-acceptance', version: '1.0.0' },
    });
  }

  listTools() {
    return this.request('tools/list', {});
  }

  async callTool(name, args = {}) {
    const row = { name, status: 'started' };
    this.toolCalls.push(row);
    try {
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
      const call = { ok: result?.isError !== true, data: data ?? {}, result };
      row.status = call.ok ? 'passed' : 'rejected';
      if (!call.ok) row.failureClass = failureClass(toolErrorText(call));
      return call;
    } catch (error) {
      row.status = 'failed';
      row.failureClass = failureClass(error?.message);
      throw error;
    }
  }
}

function parseArgs(argv) {
  const args = { help: false, selfTest: false };
  const needsValue = new Set(['--source', '--out']);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--self-test') args.selfTest = true;
    else if (needsValue.has(value)) {
      const next = argv[index + 1];
      assert.ok(next && !next.startsWith('--'), `${value} requires a value.`);
      index += 1;
      if (value === '--source') args.source = next;
      if (value === '--out') args.out = next;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node live-korean-paper-acceptance.mjs --source <paper_korean_reading_version.docx> --out <new-output-directory>',
    '',
    'The output directory must not already exist. The script writes one DOCX, one PDF,',
    'all final-page WebP images, six baseline comparison WebPs, and report.json.',
    '',
    'Environment:',
    '  ACADEMIC_EDITOR_API_ORIGIN',
    '  ACADEMIC_EDITOR_MCP_BEARER_TOKEN',
    '',
    'Offline validation (does not call a server):',
    '  node live-korean-paper-acceptance.mjs --self-test',
  ].join('\n');
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
    return await stat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function prepareOutputDirectory(candidate, sourcePath) {
  const output = path.resolve(candidate);
  assert.equal(await optionalStat(output), null, 'The output directory must not already exist.');
  const canonicalOutput = (await canonicalPath(output)).toLowerCase();
  const canonicalSource = (await realpath(path.resolve(sourcePath))).toLowerCase();
  assert.notEqual(canonicalOutput, canonicalSource, 'The output directory must not alias the source DOCX.');
  assert.notEqual(path.dirname(canonicalOutput), canonicalSource, 'The output directory must not be nested under the source file.');
  return output;
}

function locationKey(location) {
  if (location?.tableId && Number.isInteger(Number(location?.cell?.number))) {
    return `cell:${location.tableId}:${Number(location.cell.number)}`;
  }
  const paragraph = location?.paragraph;
  if (paragraph && Number.isInteger(Number(paragraph.number))) {
    return `paragraph:${Number(paragraph.section ?? 0)}:${Number(paragraph.number)}`;
  }
  throw new Error(`Unstable target location: ${JSON.stringify(location)}`);
}

function normalizeFindLocation(target) {
  if (target?.location) return target.location;
  if (Number.isInteger(Number(target?.native?.paragraph))) {
    return { paragraph: { section: Number(target.native.section ?? 0), number: Number(target.native.paragraph) } };
  }
  throw new Error('target_find did not return a stable paragraph location.');
}

function assertToolOk(call, label) {
  assert.equal(call?.ok, true, `${label} failed: ${toolErrorText(call)}`);
  assert.notEqual(call?.data?.ok, false, `${label} returned ok=false: ${toolErrorText(call)}`);
  return call.data;
}

async function readBounded(client, documentId, view, options = {}) {
  const items = [];
  let cursor = null;
  let revision = null;
  let total = null;
  let pages = 0;
  do {
    const args = cursor
      ? { documentId, cursor }
      : { documentId, view, limit: options.limit ?? 100, textPreviewChars: options.textPreviewChars ?? 512,
        ...(view === 'tables' ? { cellPreviewLimit: options.cellPreviewLimit ?? 3 } : {}) };
    const data = assertToolOk(await client.callTool('editor_docx_read_json', args), `read_json ${view}`);
    assert.equal(data.view, view, `read_json returned view=${data.view}, expected ${view}.`);
    revision ??= Number(data.revision);
    total ??= Number(data.total);
    assert.equal(Number(data.revision), revision, 'read_json pagination revision changed.');
    assert.ok(Array.isArray(data.items), 'read_json items must be an array.');
    items.push(...data.items);
    cursor = data.nextCursor || null;
    pages += 1;
    assert.ok(pages < 10_000, 'read_json pagination did not terminate.');
  } while (cursor);
  assert.equal(items.length, total, `read_json ${view} returned ${items.length}/${total} items.`);
  return { revision, total, items, pages };
}

async function mapTargets(client, documentId, { kind, tableId = null }) {
  const targets = [];
  let cursor = null;
  let revision = null;
  let total = null;
  let pages = 0;
  do {
    const args = cursor
      ? { documentId, cursor }
      : { documentId, kind, limit: 120, ...(tableId ? { tableId } : {}) };
    const data = assertToolOk(await client.callTool('editor_docx_target_map', args), `target_map ${kind}`);
    assert.equal(data.kind, kind, 'target_map returned the wrong kind.');
    revision ??= Number(data.revision);
    total ??= Number(data.total);
    assert.equal(Number(data.revision), revision, 'target_map pagination revision changed.');
    assert.ok(Array.isArray(data.targets), 'target_map targets must be an array.');
    targets.push(...data.targets);
    cursor = data.nextCursor || null;
    pages += 1;
    assert.ok(pages < 10_000, 'target_map pagination did not terminate.');
  } while (cursor);
  assert.equal(targets.length, total, `target_map returned ${targets.length}/${total} targets.`);
  return { revision, total, targets, pages };
}

async function inspectLocations(client, documentId, locations, chunkSize = 20) {
  const unique = [];
  const seen = new Set();
  for (const location of locations) {
    const key = locationKey(location);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(location);
    }
  }
  const targets = [];
  let revision = null;
  for (let offset = 0; offset < unique.length; offset += chunkSize) {
    const chunk = unique.slice(offset, offset + chunkSize);
    const data = assertToolOk(await client.callTool('editor_docx_target_inspect', { documentId, locations: chunk }), 'target_inspect');
    revision ??= Number(data.revision);
    assert.equal(Number(data.revision), revision, 'target_inspect revision changed across chunks.');
    assert.equal(data.targets?.length, chunk.length, 'target_inspect returned the wrong target count.');
    targets.push(...data.targets);
  }
  const byLocation = new Map(targets.map((target) => [locationKey(target.location), target]));
  assert.equal(byLocation.size, unique.length, 'target_inspect returned duplicate or unstable targets.');
  return { revision, targets, byLocation };
}

async function findParagraph(client, documentId, query, occurrence = 1) {
  const call = await client.callTool('editor_docx_target_find', {
    documentId,
    query,
    match: { caseSensitive: true, occurrence, includeCells: false },
  });
  const data = assertToolOk(call, `target_find ${JSON.stringify(query)}`);
  return normalizeFindLocation(data.target);
}

async function assertNoFurtherMatch(client, documentId, query, occurrence) {
  const call = await client.callTool('editor_docx_target_find', {
    documentId,
    query,
    match: { caseSensitive: true, occurrence, includeCells: false },
  });
  assert.equal(call.ok, false, `${JSON.stringify(query)} unexpectedly had occurrence ${occurrence}.`);
  assert.match(toolErrorText(call), /not found/i, 'Missing target_find occurrence failed for an unexpected reason.');
}

function discoverFlowTableIds(tableItems) {
  const matches = [];
  for (const table of tableItems) {
    const header = (table.cells ?? [])
      .filter((cell) => Number(cell.row ?? cell.location?.cell?.row) === 0)
      .sort((left, right) => Number(left.column ?? left.location?.cell?.column) - Number(right.column ?? right.location?.cell?.column));
    if (header.length >= 3 && header.slice(0, 3).map((cell) => cell.textPreview).join('\u0000') === '??\u0000?\u0000??') {
      assert.equal(Number(table.dims?.colCount), 3, `${table.id} is not a three-column table.`);
      matches.push(table.id);
    }
  }
  assert.equal(matches.length, 4, `Expected four broken flow tables, found ${matches.length}.`);
  return matches;
}

function targetCoordinates(target) {
  const cell = target.location?.cell ?? {};
  return {
    number: Number(cell.number),
    row: Number(cell.row ?? target.cell?.row ?? target.native?.row),
    column: Number(cell.column ?? target.cell?.col ?? target.native?.column),
  };
}

function buildFlowWrites(flowTableIds, inspectedTargets) {
  const writes = [];
  let arrowCount = 0;
  for (const tableId of flowTableIds) {
    const targets = inspectedTargets.filter((target) => target.location?.tableId === tableId);
    const rows = new Map();
    for (const target of targets) {
      const coordinate = targetCoordinates(target);
      assert.ok(Number.isInteger(coordinate.number) && Number.isInteger(coordinate.row) && Number.isInteger(coordinate.column),
        `${tableId} returned incomplete cell coordinates.`);
      if (!rows.has(coordinate.row)) rows.set(coordinate.row, new Map());
      rows.get(coordinate.row).set(coordinate.column, target);
    }
    const header = rows.get(0);
    assert.ok(header, `${tableId} has no header row.`);
    deepEqual([0, 1, 2].map((column) => header.get(column)?.currentText), ['??', '?', '??'], `${tableId} header drifted.`);
    const tableWrites = [
      { cell: { number: targetCoordinates(header.get(0)).number }, text: '출발' },
      { cell: { number: targetCoordinates(header.get(1)).number }, text: '흐름' },
      { cell: { number: targetCoordinates(header.get(2)).number }, text: '도착' },
    ];
    for (const [row, columns] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      if (row === 0) continue;
      const middle = columns.get(1);
      if (middle?.currentText === '?') {
        tableWrites.push({ cell: { number: targetCoordinates(middle).number }, text: '→' });
        arrowCount += 1;
      }
    }
    writes.push({ tableId, cells: tableWrites });
  }
  assert.equal(arrowCount, 19, `Expected 19 broken body arrows, found ${arrowCount}.`);
  return { writes, arrowCount };
}

function expectedApplyResults(commands) {
  const singleActions = {
    'text.replaceParagraph': 'text.replaceParagraph',
    setDocumentMetadata: 'setDocumentMetadata',
    setHeaderFooter: 'setHeaderFooter',
    insertFootnote: 'insertFootnote',
    defineStyle: 'defineStyle',
    appendParagraph: 'paragraph.append',
    applyStyle: 'applyStyle',
  };
  return commands.flatMap((command, commandIndex) => {
    const parentId = command.commandId || command.opId || command.id || `command-${commandIndex + 1}`;
    if (command.op === 'table.writeCells') {
      assert.ok(Array.isArray(command.cells) && command.cells.length > 0, `${parentId} has no cells.`);
      return command.cells.map((cell, cellIndex) => ({
        opId: cell.commandId || cell.opId || cell.id || `${parentId}-${cellIndex + 1}`,
        action: 'table.writeCell',
      }));
    }
    const action = singleActions[command.op];
    assert.ok(action, `No acceptance result contract exists for ${command.op}.`);
    return [{ opId: parentId, action }];
  });
}

function assertApplyCoverage(results, commands, label) {
  assert.ok(Array.isArray(results), `${label} did not return a results array.`);
  const expected = expectedApplyResults(commands);
  for (const result of results) assert.equal(result?.ok, true, `${label} contains a failed action result.`);
  const compact = (rows) => rows.map((row) => ({ opId: String(row.opId || ''), action: String(row.action || '') }))
    .sort((left, right) => `${left.opId}\u0000${left.action}`.localeCompare(`${right.opId}\u0000${right.action}`));
  deepEqual(compact(results), compact(expected), `${label} did not execute the exact expanded command/action set.`);
  return { commandCount: commands.length, actionCount: expected.length };
}

function expectedFlowText(target) {
  const { row, column } = targetCoordinates(target);
  if (row === 0) return ['출발', '흐름', '도착'][column];
  if (row > 0 && column === 1 && target.currentText === '?') return '→';
  return target.currentText;
}

function assertInspectedText(inspection, expectedByKey, label) {
  for (const [key, expectedText] of expectedByKey) {
    const target = inspection.byLocation.get(key);
    assert.ok(target, `${label}: missing inspected target ${key}.`);
    assert.equal(target.currentText, expectedText, `${label}: ${key} text mismatch.`);
  }
}

function pageGroups(payload, includeBaseline) {
  const normalize = (value) => {
    if (Array.isArray(value?.pages)) return value.pages;
    return value?.page ? [value.page] : [];
  };
  return includeBaseline
    ? { baseline: normalize(payload?.baseline), current: normalize(payload?.current) }
    : { current: normalize(payload) };
}

function webpDimensions(bytes) {
  assert.ok(bytes.length >= 20, 'WebP is too short.');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', 'WebP RIFF signature is missing.');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'WebP RIFF size is inconsistent.');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', 'WebP container signature is missing.');
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.subarray(offset, offset + 4).toString('ascii');
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + size <= bytes.length, `WebP ${type} chunk exceeds its container.`);
    if (type === 'VP8X' && size >= 10) return { width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1 };
    if (type === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
      const b1 = bytes[start + 1];
      const b2 = bytes[start + 2];
      const b3 = bytes[start + 3];
      const b4 = bytes[start + 4];
      return { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10) };
    }
    if (type === 'VP8 ' && size >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a) {
      return { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
    }
    offset = start + size + (size % 2);
  }
  throw new Error('WebP dimensions could not be decoded.');
}

function decodeRendered(payload, pages, includeBaseline) {
  const groups = pageGroups(payload, includeBaseline);
  const result = {};
  for (const name of includeBaseline ? ['baseline', 'current'] : ['current']) {
    const rows = groups[name];
    deepEqual(rows.map((row) => Number(row.page)), pages, `${name} render returned unexpected pages.`);
    result[name] = rows.map((row) => {
      const bytes = Buffer.from(String(row.bytesBase64 || ''), 'base64');
      const digest = String(row.sha256 || '').toLowerCase();
      assert.match(digest, SHA256_RE, `${name} page hash is invalid.`);
      assert.equal(bytes.length, Number(row.byteLength), `${name} page length mismatch.`);
      assert.equal(sha256(bytes), digest, `${name} page hash mismatch.`);
      assert.equal(row.format, 'webp');
      assert.equal(row.mimeType, 'image/webp');
      deepEqual(webpDimensions(bytes), { width: Number(row.width), height: Number(row.height) }, `${name} page dimensions mismatch.`);
      return { page: Number(row.page), sha256: digest, byteLength: bytes.length, width: Number(row.width), height: Number(row.height), bytes };
    });
  }
  const currentEnvelope = includeBaseline ? payload.current : payload;
  result.pageCount = Number(currentEnvelope?.pageCount);
  result.renderer = currentEnvelope?.renderer || payload?.renderer || null;
  assert.ok(Number.isInteger(result.pageCount) && result.pageCount >= Math.max(...pages), 'Renderer returned an invalid pageCount.');
  return result;
}

function assertCleanQuality(data) {
  assert.equal(data?.ok, true, 'quality_check did not return ok=true.');
  assert.notEqual(data?.stable, false, 'quality_check returned stable=false.');
  assert.ok(Array.isArray(data?.issues), 'quality_check issues must be an array.');
  const blocking = data.issues.filter((issue) => issue?.severity !== 'info');
  assert.equal(blocking.length, 0, `quality_check returned ${blocking.length} blocking finding(s).`);
  return {
    issueCount: data.issues.length,
    preexistingInfoCount: data.issues.filter((issue) => issue?.severity === 'info' && issue?.preexisting === true).length,
    blockingCount: 0,
  };
}

async function registerArtifact(context, session, data) {
  const id = String(data?.artifactId || '');
  const digest = String(data?.sha256 || '').toLowerCase();
  context.sanitizer.addSecret(id);
  assert.ok(id, 'Artifact response omitted its opaque identifier.');
  assert.match(digest, SHA256_RE, 'Artifact response omitted a valid SHA-256.');
  const artifact = { id, sha256: digest, deleted: false };
  session.artifacts.push(artifact);
  return artifact;
}

async function readArtifact(context, artifact, mimeType, signature) {
  const data = assertToolOk(await context.client.callTool('editor_docx_artifact_read', {
    artifactId: artifact.id,
    expectedSha256: artifact.sha256,
  }), 'artifact_read');
  assert.equal(data.mimeType, mimeType, 'Artifact MIME type mismatch.');
  const bytes = Buffer.from(String(data.bytesBase64 || ''), 'base64');
  assert.equal(bytes.length, Number(data.byteLength), 'Artifact byteLength mismatch.');
  assert.equal(sha256(bytes), artifact.sha256, 'Artifact hash mismatch.');
  assert.equal(bytes.subarray(0, signature.length).compare(signature), 0, 'Artifact signature mismatch.');
  return bytes;
}

async function deleteArtifact(context, artifact) {
  if (artifact.deleted) return;
  const data = assertToolOk(await context.client.callTool('editor_docx_artifact_delete', {
    artifactId: artifact.id,
    expectedSha256: artifact.sha256,
  }), 'artifact_delete');
  assert.equal(data.deleted, true, 'artifact_delete did not confirm deletion.');
  artifact.deleted = true;
}

async function cleanupSession(context, session) {
  if (session.cleanupPromise) return session.cleanupPromise;
  session.cleanupPromise = (async () => {
    const errors = [];
    for (const artifact of session.artifacts) {
      try {
        await deleteArtifact(context, artifact);
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      const data = assertToolOk(await context.client.callTool('editor_docx_discard', { documentId: session.documentId }), 'discard');
      assert.equal(data.sessionClosed, true);
      assert.equal(data.artifactCreated, false);
      session.discarded = true;
      session.alreadyClosed = data.deleted === false;
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, `Remote cleanup failed with ${errors.length} error(s).`);
    context.activeSessions.delete(session);
    return { discarded: true, alreadyClosed: session.alreadyClosed, deletedArtifacts: session.artifacts.filter((item) => item.deleted).length };
  })();
  try {
    return await session.cleanupPromise;
  } finally {
    session.cleanupPromise = null;
  }
}

async function cleanupAll(context) {
  const settled = await Promise.allSettled([...context.activeSessions].map((session) => cleanupSession(context, session)));
  const failures = settled.filter((row) => row.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map((row) => row.reason), 'One or more remote sessions could not be cleaned.');
}

function installSignalCleanup(context) {
  const state = { signal: null, promise: null };
  const handler = (signal) => {
    if (state.signal) return;
    state.signal = signal;
    context.stopping = true;
    state.promise = cleanupAll(context);
  };
  const sigint = () => handler('SIGINT');
  const sigterm = () => handler('SIGTERM');
  process.on('SIGINT', sigint);
  process.on('SIGTERM', sigterm);
  return {
    state,
    dispose() {
      process.off('SIGINT', sigint);
      process.off('SIGTERM', sigterm);
    },
  };
}

function visibleXmlText(xml) {
  return [...String(xml || '').matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
    .join('');
}

function xmlText(xml, qualifiedName) {
  const name = qualifiedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(xml || '').match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`));
  return match ? match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
}

function numberCounts(texts) {
  const counts = new Map();
  for (const match of texts.join('\n').matchAll(/\d+(?:[.,]\d+)*/g)) counts.set(match[0], (counts.get(match[0]) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })));
}

function paragraphXmlBlocks(xml) {
  return [...String(xml || '').matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((match) => match[0]);
}

function verifySinglePositiveFootnotePair(documentXml, footnotesXml, relationshipsXml) {
  const positiveBodies = [...String(footnotesXml || '').matchAll(/<w:footnote\b[^>]*w:id="(-?\d+)"[^>]*>([\s\S]*?)<\/w:footnote>/g)]
    .map((match) => ({ id: Number(match[1]), xml: match[0] }))
    .filter((item) => item.id > 0);
  assert.equal(positiveBodies.length, 1, 'Candidate must contain exactly one positive footnote body.');
  assert.equal(visibleXmlText(positiveBodies[0].xml), EXPECTED.footnote, 'Positive footnote body text mismatch.');

  const positiveReferences = [...String(documentXml || '').matchAll(/<w:footnoteReference\b[^>]*w:id="(-?\d+)"[^>]*\/>/g)]
    .map((match) => Number(match[1]))
    .filter((id) => id > 0);
  assert.equal(positiveReferences.length, 1, 'Candidate must contain exactly one positive footnote reference.');
  assert.equal(positiveReferences[0], positiveBodies[0].id, 'Footnote body/reference IDs do not match.');

  const intendedParagraphs = paragraphXmlBlocks(documentXml)
    .filter((paragraphXml) => visibleXmlText(paragraphXml).startsWith(EXPECTED.footnotePrefix));
  assert.equal(intendedParagraphs.length, 1, 'The intended footnote anchor paragraph must be unique.');
  const intendedReferences = [...intendedParagraphs[0].matchAll(/<w:footnoteReference\b[^>]*w:id="(-?\d+)"[^>]*\/>/g)]
    .map((match) => Number(match[1]))
    .filter((id) => id > 0);
  deepEqual(intendedReferences, [positiveBodies[0].id], 'The sole footnote reference is not attached to the intended exact paragraph.');
  assert.equal((String(relationshipsXml || '').match(/relationships\/footnotes/g) || []).length, 1,
    'Candidate must contain exactly one footnotes relationship.');
  return { positiveBodyCount: 1, positiveReferenceCount: 1, anchorParagraphCount: 1, matchingId: true };
}

function verifyCandidateBytes(sourceBytes, candidateBytes) {
  assert.notEqual(sha256(candidateBytes), sha256(sourceBytes), 'Candidate is byte-identical to its source.');
  const source = new DocxApiSession(sourceBytes);
  const candidate = new DocxApiSession(candidateBytes);
  const before = source.readJson();
  const after = candidate.readJson();
  assert.equal(before.tables.length, 21);
  assert.equal(after.tables.length, before.tables.length, 'Table count changed.');
  assert.equal(after.blocks.length, before.blocks.length + 1, 'Candidate must append exactly one paragraph.');
  assert.equal(after.blocks.at(-1).text, EXPECTED.note, 'Validation note text mismatch.');
  assert.equal(after.blocks.at(-1).styleFingerprint?.basis?.paragraph?.styleId, EXPECTED.styleId, 'Validation note style mismatch.');

  let flowTables = 0;
  let arrows = 0;
  for (let tableIndex = 0; tableIndex < before.tables.length; tableIndex += 1) {
    const sourceTable = before.tables[tableIndex];
    const candidateTable = after.tables[tableIndex];
    assert.equal(candidateTable.cells.length, sourceTable.cells.length, `Table ${tableIndex} dimensions changed.`);
    const isFlow = sourceTable.cells.filter((cell) => cell.row === 0).sort((a, b) => a.col - b.col)
      .slice(0, 3).map((cell) => cell.text).join('\u0000') === '??\u0000?\u0000??';
    if (isFlow) flowTables += 1;
    for (let cellIndex = 0; cellIndex < sourceTable.cells.length; cellIndex += 1) {
      const sourceCell = sourceTable.cells[cellIndex];
      const candidateCell = candidateTable.cells[cellIndex];
      let expected = sourceCell.text;
      if (isFlow && sourceCell.row === 0) expected = ['출발', '흐름', '도착'][sourceCell.col];
      else if (isFlow && sourceCell.row > 0 && sourceCell.col === 1 && sourceCell.text === '?') {
        expected = '→';
        if (candidateCell.text === '→') arrows += 1;
      }
      assert.equal(candidateCell.text, expected, `Unexpected table mutation at ${tableIndex}/${cellIndex}.`);
    }
  }
  assert.equal(flowTables, 4);
  assert.equal(arrows, 19);

  const mismatchCounts = new Map();
  for (let index = 0; index < before.blocks.length; index += 1) {
    const sourceText = before.blocks[index].text;
    const candidateText = after.blocks[index].text;
    if (sourceText !== candidateText) {
      const key = `${sourceText}\u0000${candidateText}`;
      mismatchCounts.set(key, (mismatchCounts.get(key) || 0) + 1);
    }
  }
  const leak = before.blocks.find((block) => block.text.startsWith('?? Markdown:'))?.text;
  assert.ok(leak, 'Source Markdown leak paragraph was not found.');
  const expectedMismatches = new Map([
    ['??\u0000출발', 4], ['?\u0000흐름', 4], ['??\u0000도착', 4], ['?\u0000→', 19], ['???\u0000', 4], [`${leak}\u0000`, 1],
  ]);
  deepEqual(Object.fromEntries(mismatchCounts), Object.fromEntries(expectedMismatches), 'Body changed outside the exact approved replacements.');

  const sourceRelevant = before.blocks.filter((block) => block.text !== '???' && !block.text.startsWith('?? Markdown:')).map((block) => block.text);
  const candidateRelevant = after.blocks.slice(0, -1).map((block) => block.text);
  deepEqual(numberCounts(candidateRelevant), numberCounts(sourceRelevant), 'Scholarly numeric values changed.');
  deepEqual(after.objectGraph.images.map((item) => item.name), before.objectGraph.images.map((item) => item.name), 'Media inventory changed.');

  const core = getZipText(candidateBytes, 'docProps/core.xml');
  deepEqual({
    title: xmlText(core, 'dc:title'), subject: xmlText(core, 'dc:subject'), creator: xmlText(core, 'dc:creator'),
    keywords: xmlText(core, 'cp:keywords'), description: xmlText(core, 'dc:description'),
  }, {
    title: EXPECTED.title, subject: EXPECTED.subject, creator: EXPECTED.creator,
    keywords: EXPECTED.keywords, description: EXPECTED.description,
  }, 'Core metadata mismatch.');

  const header = getZipText(candidateBytes, 'word/header1.xml');
  const footer = getZipText(candidateBytes, 'word/footer1.xml');
  assert.equal(visibleXmlText(header), EXPECTED.header);
  assert.equal(visibleXmlText(footer), EXPECTED.footer);
  assert.match(header, /<w:jc w:val="center"\/>/);
  assert.match(footer, /<w:jc w:val="center"\/>/);

  const footnotes = getZipText(candidateBytes, 'word/footnotes.xml');
  const relationships = getZipText(candidateBytes, 'word/_rels/document.xml.rels');
  const footnotePair = verifySinglePositiveFootnotePair(candidate.documentXml, footnotes, relationships);

  const styles = getZipText(candidateBytes, 'word/styles.xml');
  const styleMatch = styles.match(new RegExp(`<w:style\\b[^>]*w:styleId="${EXPECTED.styleId}"[\\s\\S]*?<\\/w:style>`));
  assert.ok(styleMatch, 'Validation style definition is missing.');
  const style = styleMatch[0];
  assert.match(style.match(/^<w:style\b[^>]*>/)?.[0] || '', /\bw:type="paragraph"/, 'Validation style must have paragraph type.');
  assert.match(style, /<w:name w:val="Agent Validation Note"\/>/);
  assert.match(style, /<w:basedOn w:val="Normal"\/>/);
  assert.match(style, /<w:jc w:val="center"\/>/);
  assert.match(style, /<w:spacing\b[^>]*w:before="120"[^>]*w:after="0"/);
  assert.match(style, /<w:i\/>/);
  assert.match(style, /<w:sz w:val="18"\/>/);
  assert.match(style, /<w:color w:val="666666"\/>/);
  const noteParagraphs = paragraphXmlBlocks(candidate.documentXml)
    .filter((paragraphXml) => visibleXmlText(paragraphXml) === EXPECTED.note);
  assert.equal(noteParagraphs.length, 1, 'Validation note OOXML paragraph must be unique.');
  assert.match(noteParagraphs[0], new RegExp(`<w:pStyle\\b[^>]*w:val="${EXPECTED.styleId}"[^>]*/>`),
    'Saved validation note does not reference AgentValidationNote in OOXML.');

  return {
    tableCount: after.tables.length,
    flowTableCount: flowTables,
    arrowCount: arrows,
    appendedParagraphCount: 1,
    bodyChangesRestricted: true,
    scholarlyNumericValuesPreserved: true,
    mediaInventoryPreserved: true,
    footnotePair,
    validationStyleTypeAndReferenceExact: true,
    packageFieldsExact: true,
  };
}

async function materializeBundle(outputDirectory, packageData, report, sanitizer) {
  const parent = path.dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = path.join(parent, `.${path.basename(outputDirectory)}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(path.join(staging, 'pages'), { recursive: true });
  await mkdir(path.join(staging, 'baseline-pages'), { recursive: true });
  try {
    await writeFile(path.join(staging, 'paper_korean_mcp_candidate.docx'), packageData.docx, { flag: 'wx' });
    await writeFile(path.join(staging, 'paper_korean_mcp_candidate.pdf'), packageData.pdf, { flag: 'wx' });
    for (const page of packageData.pages) {
      await writeFile(path.join(staging, 'pages', `page-${String(page.page).padStart(3, '0')}.webp`), page.bytes, { flag: 'wx' });
    }
    for (const page of packageData.baselinePages) {
      await writeFile(path.join(staging, 'baseline-pages', `page-${String(page.page).padStart(3, '0')}.webp`), page.bytes, { flag: 'wx' });
    }
    const safeReport = sanitizer.sanitize(report);
    const reportText = `${JSON.stringify(safeReport, null, 2)}\n`;
    assert.ok(!SENSITIVE_REPORT_RE.test(reportText), 'Sensitive field name leaked into report JSON.');
    await writeFile(path.join(staging, 'report.json'), reportText, { encoding: 'utf8', flag: 'wx' });
    await rename(staging, outputDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function verifyContract(context) {
  const initialized = await context.client.initialize();
  assert.equal(initialized?.serverInfo?.name, 'academic-editor-mcp');
  const listed = await context.client.listTools();
  const tools = listed?.tools ?? [];
  deepEqual(tools.map((tool) => tool.name), EXPECTED_SERVER_TOOLS, 'tools/list is not the exact 15-tool contract.');
  const readTool = tools.find((tool) => tool.name === 'editor_docx_read_json');
  const mapTool = tools.find((tool) => tool.name === 'editor_docx_target_map');
  deepEqual(readTool?.inputSchema?.properties?.view?.enum, ['summary', 'blocks', 'tables'], 'Bounded read_json views are unavailable.');
  deepEqual(mapTool?.inputSchema?.properties?.kind?.enum, ['paragraph', 'cell'], 'Bounded target_map kinds are unavailable.');
  const applyEnum = tools.find((tool) => tool.name === 'editor_docx_apply')?.inputSchema?.properties?.commands?.items?.properties?.op?.enum ?? [];
  for (const op of REQUIRED_COMMANDS) assert.ok(applyEnum.includes(op), `editor_docx_apply does not expose ${op}.`);
  const catalog = [];
  for (const op of REQUIRED_COMMANDS) {
    const data = assertToolOk(await context.client.callTool('editor_docx_command_catalog', { op }), `command_catalog ${op}`);
    assert.equal(data.commandCount, 1, `${op} catalog lookup returned ${data.commandCount} entries.`);
    assert.equal(data.commands?.[0]?.op, op, `${op} catalog lookup returned a different command.`);
    catalog.push({ op, category: data.commands[0].category, precondition: data.commands[0].precondition });
  }
  return { serverName: initialized.serverInfo.name, serverVersion: initialized.serverInfo.version, toolCount: tools.length, applyCommandCount: applyEnum.length, catalog };
}

async function openSession(context, sourceBytes, filename) {
  const opened = await context.client.callTool('editor_docx_open', { filename, bytesBase64: sourceBytes.toString('base64') });
  const documentId = String(opened?.data?.documentId || '');
  context.sanitizer.addSecret(documentId);
  const session = documentId ? { documentId, artifacts: [], discarded: false, alreadyClosed: false, cleanupPromise: null } : null;
  if (session) context.activeSessions.add(session);
  try {
    const data = assertToolOk(opened, 'open');
    assert.ok(documentId, 'open did not return a session identifier.');
    assert.equal(Number(data.revision), 1, 'New session did not start at revision 1.');
    return session;
  } catch (error) {
    if (session) await cleanupSession(context, session);
    throw error;
  }
}

async function performAcceptance(context, session, sourceBytes) {
  const documentId = session.documentId;
  const beforeSummary = await readBounded(context.client, documentId, 'summary');
  assert.equal(beforeSummary.revision, 1);
  const summaryItem = beforeSummary.items[0];
  assert.equal(summaryItem.sourceFormat, 'docx');
  assert.equal(summaryItem.tableCount, 21);
  assert.equal(summaryItem.objectCounts?.images, 0);

  const tables = await readBounded(context.client, documentId, 'tables', { cellPreviewLimit: 3 });
  assert.equal(tables.revision, 1);
  const flowTableIds = discoverFlowTableIds(tables.items);
  const flowTargets = [];
  const targetMapPages = {};
  for (const tableId of flowTableIds) {
    const mapped = await mapTargets(context.client, documentId, { kind: 'cell', tableId });
    assert.equal(mapped.revision, 1);
    targetMapPages[tableId] = mapped.pages;
    flowTargets.push(...mapped.targets);
  }
  const flowInspection = await inspectLocations(context.client, documentId, flowTargets.map((target) => target.location));
  assert.equal(flowInspection.revision, 1);
  const flowPlan = buildFlowWrites(flowTableIds, flowInspection.targets);

  const markerLocations = [];
  for (let occurrence = 1; occurrence <= 4; occurrence += 1) markerLocations.push(await findParagraph(context.client, documentId, '???', occurrence));
  await assertNoFurtherMatch(context.client, documentId, '???', 5);
  const leakLocation = await findParagraph(context.client, documentId, '?? Markdown:', 1);
  await assertNoFurtherMatch(context.client, documentId, '?? Markdown:', 2);
  const footnoteLocation = await findParagraph(context.client, documentId, EXPECTED.footnotePrefix, 1);
  await assertNoFurtherMatch(context.client, documentId, EXPECTED.footnotePrefix, 2);
  const paragraphLocations = [...markerLocations, leakLocation, footnoteLocation];
  const paragraphInspection = await inspectLocations(context.client, documentId, paragraphLocations);
  assert.equal(paragraphInspection.revision, 1);
  for (const location of markerLocations) assert.equal(paragraphInspection.byLocation.get(locationKey(location))?.currentText, '???');
  const leakText = paragraphInspection.byLocation.get(locationKey(leakLocation))?.currentText;
  assert.ok(leakText?.startsWith('?? Markdown:') && leakText.endsWith('.md'), 'Source-leak paragraph did not match its exact contract.');
  assert.ok(paragraphInspection.byLocation.get(locationKey(footnoteLocation))?.currentText.startsWith(EXPECTED.footnotePrefix));

  const inventoryBefore = assertToolOk(await context.client.callTool('editor_docx_object_inventory', { documentId }), 'object_inventory');
  assert.equal(Number(inventoryBefore.revision), 1);
  assert.equal(inventoryBefore.images?.length ?? 0, 0);

  const commands = [
    ...flowPlan.writes.map((table, index) => ({ commandId: `flow-${index + 1}`, op: 'table.writeCells', tableId: table.tableId, cells: table.cells })),
    ...markerLocations.map((location, index) => ({ commandId: `marker-${index + 1}`, op: 'text.replaceParagraph', location, text: '' })),
    { commandId: 'source-leak', op: 'text.replaceParagraph', location: leakLocation, text: '' },
    { commandId: 'metadata', op: 'setDocumentMetadata', title: EXPECTED.title, subject: EXPECTED.subject, creator: EXPECTED.creator,
      keywords: EXPECTED.keywords, description: EXPECTED.description },
    { commandId: 'header-footer', op: 'setHeaderFooter', header: EXPECTED.header, footer: EXPECTED.footer, align: 'center' },
    { commandId: 'footnote', op: 'insertFootnote', target: footnoteLocation, text: EXPECTED.footnote },
    { commandId: 'style-definition', op: 'defineStyle', style: { styleId: EXPECTED.styleId, name: EXPECTED.styleName, type: 'paragraph', basedOn: 'Normal',
      paragraphStyle: { align: 'center', spacingBefore: 120, spacingAfter: '0' }, runStyle: { italic: true, fontSize: 9, textColor: '666666' } } },
    { commandId: 'validation-note', op: 'appendParagraph', text: EXPECTED.note },
  ];
  const applied = assertToolOk(await context.client.callTool('editor_docx_apply', { documentId, baseRevision: 1, commands }), 'content apply');
  assert.equal(Number(applied.revision), 2);
  const contentCoverage = assertApplyCoverage(applied.results, commands, 'Content apply');
  assert.equal(contentCoverage.commandCount, 14);
  assert.equal(contentCoverage.actionCount, 41);

  const noteLocation = await findParagraph(context.client, documentId, EXPECTED.note, 1);
  await assertNoFurtherMatch(context.client, documentId, EXPECTED.note, 2);
  const postContentLocations = [...flowTargets.map((target) => target.location), ...paragraphLocations, noteLocation];
  const postContent = await inspectLocations(context.client, documentId, postContentLocations);
  assert.equal(postContent.revision, 2);
  const expectedAfterContent = new Map();
  for (const target of flowInspection.targets) expectedAfterContent.set(locationKey(target.location), expectedFlowText(target));
  for (const location of markerLocations) expectedAfterContent.set(locationKey(location), '');
  expectedAfterContent.set(locationKey(leakLocation), '');
  expectedAfterContent.set(locationKey(footnoteLocation), paragraphInspection.byLocation.get(locationKey(footnoteLocation)).currentText);
  expectedAfterContent.set(locationKey(noteLocation), EXPECTED.note);
  assertInspectedText(postContent, expectedAfterContent, 'revision 2');

  const styleCommands = [{ commandId: 'apply-validation-note-style', op: 'applyStyle', target: noteLocation, styleId: EXPECTED.styleId }];
  const styled = assertToolOk(await context.client.callTool('editor_docx_apply', {
    documentId,
    baseRevision: 2,
    commands: styleCommands,
  }), 'style apply');
  assert.equal(Number(styled.revision), 3);
  const styleCoverage = assertApplyCoverage(styled.results, styleCommands, 'Style apply');
  assert.equal(styleCoverage.commandCount, 1);
  assert.equal(styleCoverage.actionCount, 1);

  const noteLocationFinal = await findParagraph(context.client, documentId, EXPECTED.note, 1);
  assert.equal(locationKey(noteLocationFinal), locationKey(noteLocation), 'Appended note target moved after styling.');
  const finalInspection = await inspectLocations(context.client, documentId, postContentLocations);
  assert.equal(finalInspection.revision, 3);
  assertInspectedText(finalInspection, expectedAfterContent, 'revision 3');
  // target_inspect can expose a cached style projection immediately after applyStyle. At this
  // pre-save boundary we prove the apply action/revision plus exact note location and text above.
  // The authoritative named-style definition and w:pStyle reference are checked after save/reopen
  // in verifyCandidateBytes; that later OOXML assertion is intentionally not weakened.

  const afterSummary = await readBounded(context.client, documentId, 'summary');
  assert.equal(afterSummary.revision, 3);
  assert.equal(afterSummary.items[0].tableCount, summaryItem.tableCount);
  assert.equal(afterSummary.items[0].blockCount, summaryItem.blockCount + 1);
  const inventoryAfter = assertToolOk(await context.client.callTool('editor_docx_object_inventory', { documentId }), 'final object_inventory');
  assert.equal(Number(inventoryAfter.revision), 3);
  assert.equal(inventoryAfter.images?.length ?? 0, 0);

  const qualityData = assertToolOk(await context.client.callTool('editor_docx_quality_check', { documentId, baseRevision: 3 }), 'quality_check');
  const quality = assertCleanQuality(qualityData);

  const representativeData = assertToolOk(await context.client.callTool('editor_docx_render_pages', {
    documentId, baseRevision: 3, pages: [...REPRESENTATIVE_PAGES], includeBaseline: true,
  }), 'representative render');
  const representative = decodeRendered(representativeData, [...REPRESENTATIVE_PAGES], true);

  const allPages = new Map();
  for (let first = 1; first <= representative.pageCount; first += 12) {
    const pages = Array.from({ length: Math.min(12, representative.pageCount - first + 1) }, (_value, index) => first + index);
    const renderData = assertToolOk(await context.client.callTool('editor_docx_render_pages', {
      documentId, baseRevision: 3, pages, includeBaseline: false,
    }), `final render ${first}`);
    const decoded = decodeRendered(renderData, pages, false);
    assert.equal(decoded.pageCount, representative.pageCount, 'Renderer pageCount changed between batches.');
    for (const page of decoded.current) allPages.set(page.page, page);
  }
  assert.equal(allPages.size, representative.pageCount, 'Not every final page was rendered.');
  for (const page of representative.current) assert.equal(allPages.get(page.page)?.sha256, page.sha256, `Representative page ${page.page} was not reproducible.`);

  const pdfExport = assertToolOk(await context.client.callTool('editor_docx_export_pdf', {
    documentId, baseRevision: 3, filename: 'paper_korean_mcp_candidate.pdf',
  }), 'export_pdf');
  assert.equal(Number(pdfExport.revision), 3, 'export_pdf returned the wrong revision.');
  assert.equal(Number(pdfExport.pageCount), representative.pageCount, 'export_pdf pageCount differs from the verified render.');
  const pdfArtifact = await registerArtifact(context, session, pdfExport);
  const pdfBytes = await readArtifact(context, pdfArtifact, 'application/pdf', PDF_SIGNATURE);
  assert.equal(Number(pdfExport.byteLength), pdfBytes.length, 'export_pdf byteLength differs from the downloaded PDF.');
  await deleteArtifact(context, pdfArtifact);

  const saved = assertToolOk(await context.client.callTool('editor_docx_save_source', {
    documentId, baseRevision: 3, filename: 'paper_korean_mcp_candidate.docx',
  }), 'save_source');
  assert.equal(Number(saved.revision), 3, 'save_source returned the wrong revision.');
  assert.equal(saved.sessionClosed, true, 'save_source did not close the remote edit session.');
  const docxArtifact = await registerArtifact(context, session, saved);
  const docxBytes = await readArtifact(context, docxArtifact, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ZIP_SIGNATURE);
  await deleteArtifact(context, docxArtifact);
  const structural = verifyCandidateBytes(sourceBytes, docxBytes);

  return {
    revisions: { opened: 1, contentApplied: 2, final: 3 },
    discovery: { flowTableIds, arrowCount: flowPlan.arrowCount, markerParagraphs: markerLocations.length, targetMapPages,
      applyCoverage: { content: contentCoverage, style: styleCoverage } },
    quality,
    structural,
    exportConsistency: {
      pdfRevision: Number(pdfExport.revision),
      savedRevision: Number(saved.revision),
      pdfPageCount: Number(pdfExport.pageCount),
      pdfByteLength: pdfBytes.length,
      downloadedPdfLengthMatched: true,
    },
    renderer: representative.renderer,
    pageCount: representative.pageCount,
    pages: [...allPages.values()].sort((a, b) => a.page - b.page),
    baselinePages: representative.baseline,
    pdf: pdfBytes,
    docx: docxBytes,
  };
}

function callSummary(toolCalls) {
  const byName = Object.fromEntries(EXPECTED_SERVER_TOOLS.map((name) => [name, { calls: 0, passed: 0, rejected: 0, failed: 0 }]));
  for (const call of toolCalls) {
    const row = byName[call.name] ??= { calls: 0, passed: 0, rejected: 0, failed: 0 };
    row.calls += 1;
    row[call.status] = (row[call.status] || 0) + 1;
  }
  for (const name of EXPECTED_SERVER_TOOLS) assert.ok(byName[name].calls > 0, `${name} was never exercised.`);
  return byName;
}

async function runLive(args) {
  assert.ok(args.source, '--source is required.');
  assert.ok(args.out, '--out is required.');
  const editorOrigin = String(process.env.ACADEMIC_EDITOR_API_ORIGIN || '').trim().replace(/\/+$/, '');
  const mcpUrl = `${editorOrigin}/mcp`;
  const secret = String(process.env.ACADEMIC_EDITOR_MCP_BEARER_TOKEN || '').trim();
  assert.match(editorOrigin, /^https?:\/\//i, 'ACADEMIC_EDITOR_API_ORIGIN must be an HTTP(S) URL.');
  assert.ok(secret, 'ACADEMIC_EDITOR_MCP_BEARER_TOKEN is required.');
  const sourcePath = path.resolve(args.source);
  const outputDirectory = await prepareOutputDirectory(args.out, sourcePath);
  const sourceBytes = await readFile(sourcePath);
  const sourceHash = sha256(sourceBytes);
  assert.equal(sourceHash, EXPECTED_SOURCE_SHA256, 'The supplied DOCX is not the frozen Korean Paper 1 source.');

  const sanitizer = createSanitizer(secret);
  const context = { sanitizer, client: null, activeSessions: new Set(), stopping: false };
  context.client = new McpClient({ url: mcpUrl, secret, sanitizer });
  const signalGuard = installSignalCleanup(context);
  let contract;
  let packageData;
  let cleanupEvidence;
  let workError;
  let session;
  try {
    contract = await verifyContract(context);
    session = await openSession(context, sourceBytes, `acceptance-${path.basename(sourcePath)}`);
    packageData = await performAcceptance(context, session, sourceBytes);
  } catch (error) {
    workError = error;
  }
  try {
    if (signalGuard.state.promise) await signalGuard.state.promise;
    else if (session) cleanupEvidence = await cleanupSession(context, session);
    await cleanupAll(context);
  } catch (error) {
    workError = workError ? new AggregateError([workError, error], `${workError.message}; remote cleanup also failed.`) : error;
  } finally {
    signalGuard.dispose();
  }
  if (signalGuard.state.signal) workError ??= new Error(`Acceptance interrupted by ${signalGuard.state.signal}.`);
  if (workError) throw workError;

  const sourceAfter = await readFile(sourcePath);
  assert.equal(sha256(sourceAfter), sourceHash, 'The source DOCX changed during acceptance.');
  assert.equal(Buffer.compare(sourceAfter, sourceBytes), 0, 'The source DOCX bytes changed during acceptance.');
  const calls = callSummary(context.client.toolCalls);
  const pageEvidence = packageData.pages.map((page) => ({
    page: page.page, sha256: page.sha256, byteLength: page.byteLength, width: page.width, height: page.height,
    file: `pages/page-${String(page.page).padStart(3, '0')}.webp`,
  }));
  const baselineEvidence = packageData.baselinePages.map((page) => ({
    page: page.page, sha256: page.sha256, byteLength: page.byteLength, width: page.width, height: page.height,
    file: `baseline-pages/page-${String(page.page).padStart(3, '0')}.webp`,
  }));
  const report = {
    schemaVersion: '1.0.0',
    status: 'passed',
    generatedAt: new Date().toISOString(),
    script: path.basename(SCRIPT_PATH),
    source: { filename: path.basename(sourcePath), sha256: sourceHash, byteLength: sourceBytes.length, unchanged: true },
    contract: { ...contract, allFifteenToolsExercised: true, calls },
    revisions: packageData.revisions,
    discovery: packageData.discovery,
    verification: { ...packageData.structural, exportConsistency: packageData.exportConsistency },
    quality: packageData.quality,
    rendering: { renderer: packageData.renderer, pageCount: packageData.pageCount, everyFinalPageRendered: true, pages: pageEvidence,
      baselineComparisonPages: baselineEvidence },
    artifacts: {
      docx: { file: 'paper_korean_mcp_candidate.docx', sha256: sha256(packageData.docx), byteLength: packageData.docx.length, remoteCopyDeleted: true },
      pdf: { file: 'paper_korean_mcp_candidate.pdf', sha256: sha256(packageData.pdf), byteLength: packageData.pdf.length, remoteCopyDeleted: true },
    },
    cleanup: cleanupEvidence ?? { discarded: true, alreadyClosed: true, deletedArtifacts: 2 },
  };
  await materializeBundle(outputDirectory, packageData, report, sanitizer);
  return { status: 'passed', outputDirectory, sourceSha256: sourceHash, candidateSha256: sha256(packageData.docx), pageCount: packageData.pageCount };
}

async function runSelfTest() {
  deepEqual(parseArgs(['--source', 'paper.docx', '--out', 'result']), { help: false, selfTest: false, source: 'paper.docx', out: 'result' });
  deepEqual(parseArgs(['--self-test']), { help: false, selfTest: true });
  assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
  assert.equal(locationKey({ paragraph: { section: 0, number: 7 } }), 'paragraph:0:7');
  assert.equal(locationKey({ tableId: 'tbl_3', cell: { number: 4 } }), 'cell:tbl_3:4');

  const tableItems = [];
  const targets = [];
  const bodyCounts = [5, 5, 5, 4];
  for (let tableIndex = 0; tableIndex < 4; tableIndex += 1) {
    const tableId = `tbl_${tableIndex}`;
    tableItems.push({ id: tableId, dims: { colCount: 3 }, cells: [
      { row: 0, column: 0, textPreview: '??' }, { row: 0, column: 1, textPreview: '?' }, { row: 0, column: 2, textPreview: '??' },
    ] });
    const rows = bodyCounts[tableIndex] + 1;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const number = row * 3 + column;
        const text = row === 0 ? ['??', '?', '??'][column] : column === 1 ? '?' : `${tableId}-${row}-${column}`;
        targets.push({ location: { tableId, cell: { number, row, column } }, currentText: text });
      }
    }
  }
  const ids = discoverFlowTableIds(tableItems);
  const plan = buildFlowWrites(ids, targets);
  assert.equal(plan.writes.length, 4);
  assert.equal(plan.arrowCount, 19);
  assert.equal(plan.writes.reduce((sum, row) => sum + row.cells.length, 0), 31);

  const expandedCommands = [
    { commandId: 'cells', op: 'table.writeCells', tableId: 'tbl_0', cells: [
      { cell: { number: 0 }, text: 'A' }, { cell: { number: 1 }, text: 'B' }, { cell: { number: 2 }, text: 'C' },
    ] },
    { commandId: 'append', op: 'appendParagraph', text: 'Done' },
  ];
  const expandedResults = [
    { opId: 'append', ok: true, action: 'paragraph.append' },
    { opId: 'cells-3', ok: true, action: 'table.writeCell' },
    { opId: 'cells-1', ok: true, action: 'table.writeCell' },
    { opId: 'cells-2', ok: true, action: 'table.writeCell' },
  ];
  deepEqual(assertApplyCoverage(expandedResults, expandedCommands, 'Self-test expanded apply'), { commandCount: 2, actionCount: 4 });
  assert.throws(() => assertApplyCoverage(expandedResults.slice(0, -1), expandedCommands, 'Self-test incomplete apply'),
    /exact expanded command\/action set/);

  const footnoteDocumentXml = `<w:document><w:body><w:p><w:r><w:t>${EXPECTED.footnotePrefix} 추가 문장</w:t></w:r>`
    + '<w:r><w:footnoteReference w:id="7"/></w:r></w:p></w:body></w:document>';
  const footnotesXml = '<w:footnotes><w:footnote w:id="-1"><w:p/></w:footnote>'
    + `<w:footnote w:id="7"><w:p><w:r><w:t>${EXPECTED.footnote}</w:t></w:r></w:p></w:footnote></w:footnotes>`;
  const relationshipsXml = '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes"/></Relationships>';
  deepEqual(verifySinglePositiveFootnotePair(footnoteDocumentXml, footnotesXml, relationshipsXml),
    { positiveBodyCount: 1, positiveReferenceCount: 1, anchorParagraphCount: 1, matchingId: true });
  const duplicateReferenceXml = footnoteDocumentXml.replace('</w:p>', '<w:r><w:footnoteReference w:id="7"/></w:r></w:p>');
  assert.throws(() => verifySinglePositiveFootnotePair(duplicateReferenceXml, footnotesXml, relationshipsXml),
    /exactly one positive footnote reference/);

  const sanitizer = createSanitizer('secret-value', '123e4567-e89b-42d3-a456-426614174000');
  const sanitized = sanitizer.sanitize({
    documentId: '123e4567-e89b-42d3-a456-426614174000',
    message: `bearer=secret-value bytesBase64=${'A'.repeat(256)}`,
    safe: 'kept',
  });
  const serialized = JSON.stringify(sanitized);
  assert.ok(!serialized.includes('secret-value'));
  assert.ok(!serialized.includes('123e4567-e89b-42d3-a456-426614174000'));
  assert.ok(!SENSITIVE_REPORT_RE.test(serialized));
  assert.equal(sanitized.safe, 'kept');
  return { passed: true, serverCalled: false, commandCount: REQUIRED_COMMANDS.length, toolCount: EXPECTED_SERVER_TOOLS.length,
    flowTables: ids.length, arrows: plan.arrowCount, expandedApplyActions: expandedResults.length, incompleteExpansionRejected: true,
    exactFootnotePairChecked: true, duplicateFootnoteReferenceRejected: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (args.selfTest) {
    process.stdout.write(`${JSON.stringify(await runSelfTest())}\n`);
    return;
  }
  const result = await runLive(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
if (isMain) {
  main().catch((error) => {
    const sanitizer = createSanitizer(process.env.ACADEMIC_EDITOR_MCP_BEARER_TOKEN || '');
    process.stderr.write(`${JSON.stringify({ error: sanitizer.sanitize(error.message), class: failureClass(error.message) })}\n`);
    process.exitCode = 1;
  });
}

export {
  EXPECTED_SERVER_TOOLS,
  REQUIRED_COMMANDS,
  buildFlowWrites,
  createSanitizer,
  discoverFlowTableIds,
  assertApplyCoverage,
  expectedApplyResults,
  verifySinglePositiveFootnotePair,
  parseArgs,
  runSelfTest,
};
