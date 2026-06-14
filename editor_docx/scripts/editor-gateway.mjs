import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

import { createDocxBytes, DocxApiSession } from './docx-api-utils.mjs';
import { HwpxApiSession, initHwpxRuntime } from '../../editor_hwpx/scripts/hwpx-api-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const DEFAULT_SAMPLE_DOCX = path.join(repoRoot, 'editor_docx', 'test', 'data', 'template.docx');
const DEFAULT_GATEWAY_DOCX = path.join(repoRoot, '.build', 'gateway-documents', 'docx-home.docx');
const DOCX_WOPI_FILE_ID = 'docx-home';
const DOCX_WOPI_TOKEN = 'local-docx-token';
const STATIC_MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBasePath(value, fallback = '/') {
  const raw = String(value || fallback).trim() || fallback;
  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
}

function normalizeServiceRoot(value) {
  const basePath = normalizeBasePath(value || '/docx/');
  return basePath === '/' ? '' : basePath.replace(/\/$/, '');
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  const url = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  return new URL(url).toString().replace(/\/$/, '');
}

function normalizeOptionalOrigin(value) {
  const raw = String(value || '').trim();
  return raw ? normalizeOrigin(raw) : '';
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function xmlAttributeDecode(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getRequestPath(requestUrl) {
  try {
    return new URL(requestUrl || '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function isDocxRootPath(pathname, docxServiceRoot) {
  return pathname === docxServiceRoot || pathname === `${docxServiceRoot}/`;
}

function isDocxWopiPath(pathname, docxServiceRoot) {
  return pathname === `${docxServiceRoot}/wopi/files/${DOCX_WOPI_FILE_ID}` ||
    pathname === `${docxServiceRoot}/wopi/files/${DOCX_WOPI_FILE_ID}/contents`;
}

function isDocxRuntimePath(pathname, docxServiceRoot) {
  return pathname === docxServiceRoot ||
    pathname.startsWith(`${docxServiceRoot}/browser/`) ||
    pathname.startsWith(`${docxServiceRoot}/hosting/`) ||
    pathname.startsWith(`${docxServiceRoot}/cool/`) ||
    pathname.startsWith(`${docxServiceRoot}/lool/`) ||
    pathname.startsWith(`${docxServiceRoot}/loleaflet/`) ||
    pathname.startsWith('/browser/') ||
    pathname.startsWith('/hosting/') ||
    pathname.startsWith('/cool/') ||
    pathname.startsWith('/lool/') ||
    pathname.startsWith('/loleaflet/');
}

function isHwpxPath(pathname, hwpxBasePath) {
  const base = hwpxBasePath.replace(/\/$/, '');
  return pathname === base || pathname.startsWith(`${base}/`);
}

function resolveStaticPath(staticRoot, basePath, pathname) {
  const root = path.resolve(staticRoot || '');
  if (!root || !existsSync(root)) {
    return '';
  }

  const base = basePath.replace(/\/$/, '');
  let relativePath = pathname === base ? '/' : pathname.slice(base.length);
  if (!relativePath || relativePath === '/') {
    relativePath = '/index.html';
  }

  let decoded;
  try {
    decoded = decodeURIComponent(relativePath);
  } catch {
    return '';
  }

  const safeRelativePath = path.normalize(decoded).replace(/^[/\\]+/, '');
  const resolved = path.resolve(root, safeRelativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return '';
  }
  return resolved;
}

function readRequestBody(req, limitBytes = 80 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > limitBytes) {
        reject(new Error(`request body exceeded ${limitBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function ensureGatewayDocx(filePath) {
  if (existsSync(filePath)) {
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  await copyFile(DEFAULT_SAMPLE_DOCX, filePath);
}

async function fetchText(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 500) {
          reject(new Error(`GET ${url} returned ${response.statusCode ?? 0}`));
          return;
        }
        resolve(body);
      });
    });
    request.once('timeout', () => {
      request.destroy();
      reject(new Error(`GET ${url} timed out`));
    });
    request.once('error', reject);
  });
}

function resolveDocxActionPath(discoveryXml, docxServiceRoot) {
  const actionMatch = String(discoveryXml || '').match(/<action\b[^>]*\bext="docx"[^>]*\burlsrc="([^"]+)"/i) ||
    String(discoveryXml || '').match(/<action\b[^>]*\burlsrc="([^"]+)"[^>]*\bext="docx"/i);
  if (!actionMatch) {
    return `${docxServiceRoot}/browser/cool.html?`;
  }
  const actionUrl = new URL(xmlAttributeDecode(actionMatch[1]), `http://localhost${docxServiceRoot}/`);
  return `${actionUrl.pathname}${actionUrl.search}`;
}

async function buildDocxEditorUrl(config, publicOrigin) {
  const discovery = await fetchText(`${config.docxRuntimeOrigin}${config.docxServiceRoot}/hosting/discovery`);
  const actionPath = resolveDocxActionPath(discovery, config.docxServiceRoot);
  const url = new URL(actionPath, `${publicOrigin}/`);
  const wopiSrc = `${config.wopiBaseUrl}${config.docxServiceRoot}/wopi/files/${DOCX_WOPI_FILE_ID}`;
  url.searchParams.set('WOPISrc', wopiSrc);
  url.searchParams.set('access_token', DOCX_WOPI_TOKEN);
  url.searchParams.set('access_token_ttl', String(Date.now() + 12 * 60 * 60 * 1000));
  return url.toString();
}

function renderDocxPage(editorUrl) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Tlooto DOCX Editor for opening, editing, and saving DOCX documents.">
  <meta name="application-name" content="Tlooto DOCX Editor">
  <meta property="og:title" content="Tlooto DOCX Editor">
  <meta property="og:description" content="Open and edit DOCX documents in Tlooto.">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Tlooto DOCX Editor">
  <meta name="twitter:description" content="Open and edit DOCX documents in Tlooto.">
  <title>Tlooto DOCX Editor</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #f8fafc; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <iframe title="DOCX editor" src="${htmlEscape(editorUrl)}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
</body>
</html>`;
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function sendStaticFile(req, res, filePath) {
  const stat = statSync(filePath);
  const contentType = STATIC_MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function isEditorApiPath(pathname) {
  return /^\/v1\/(?:docx|hwpx)\//.test(pathname);
}

async function readJsonBody(req) {
  const body = await readRequestBody(req);
  if (!body.length) {
    return {};
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON request body: ${message}`);
  }
}

async function readApiSourceBytes(fmt, source = {}) {
  if (source.bytesBase64) {
    return Buffer.from(String(source.bytesBase64), 'base64');
  }
  const sourcePath = source.bytesRef || source.path || source.filePath || source.localPath;
  if (sourcePath && !String(sourcePath).startsWith('blob://')) {
    return readFile(path.resolve(String(sourcePath)));
  }
  if (fmt === 'docx') {
    return createDocxBytes();
  }
  throw new Error('HWPX API open requires source.bytesRef, source.path, source.filePath, or source.bytesBase64.');
}

async function createApiSession(fmt, bytes, options = {}) {
  if (fmt === 'hwpx') {
    await initHwpxRuntime();
    return new HwpxApiSession(bytes, { saveMode: options.saveStrategy || options.strategy || 'preserve-package' });
  }
  if (fmt === 'docx') {
    return new DocxApiSession(bytes);
  }
  throw new Error(`unsupported format: ${fmt}`);
}

function apiStore(state) {
  state.apiDocuments ??= new Map();
  return state.apiDocuments;
}

function findApiRecord(state, fmt, id) {
  const record = apiStore(state).get(id);
  if (!record || record.fmt !== fmt) {
    return null;
  }
  return record;
}

function pageCountFromSession(session) {
  try {
    return session.readJson().pageCount ?? 1;
  } catch {
    return 1;
  }
}

function bytesRefForSavedDocument(config, filename) {
  const safeName = path.basename(String(filename || `edited-${Date.now()}.bin`));
  const outDir = path.join(repoRoot, '.build', 'gateway-api-documents');
  mkdirSync(outDir, { recursive: true });
  return path.join(outDir, safeName);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeCommands(body = {}) {
  return body.commands || body.ops || body.commandBatch || [];
}

function renderHwpxSvgPages(session, pages = []) {
  if (typeof session.doc?.renderPageSvg !== 'function') {
    return [];
  }
  return pages.map((page) => {
    const pageNumber = Math.max(1, Number(page) || 1);
    const svg = session.doc.renderPageSvg(pageNumber - 1);
    return {
      page: pageNumber,
      format: 'svg',
      nonBlank: String(svg || '').length > 80,
      svg,
    };
  });
}

function normalizePageRange(body = {}, fallbackPageCount = 1) {
  const pages = body.range?.pages || body.pages;
  if (Array.isArray(pages) && pages.length) {
    return pages.map((page) => Number(page)).filter((page) => Number.isFinite(page) && page > 0);
  }
  return [1, Math.max(1, Math.ceil(fallbackPageCount / 2)), Math.max(1, fallbackPageCount)];
}

async function handleEditorApiOpen(req, res, config, state, fmt) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Method not allowed. Use POST.' }, { Allow: 'POST' });
    return true;
  }
  const body = await readJsonBody(req);
  const bytes = await readApiSourceBytes(fmt, body.source || {});
  const session = await createApiSession(fmt, bytes, body);
  const id = `doc_${randomUUID()}`;
  const json = session.readJson();
  apiStore(state).set(id, {
    id,
    fmt,
    filename: body.filename || `document.${fmt}`,
    sourceBytes: Buffer.from(bytes),
    baselineJson: json,
    session,
  });
  sendJson(res, 200, {
    ok: true,
    documentId: id,
    sessionId: id,
    fmt,
    revision: session.revision,
    pageCount: json.pageCount ?? pageCountFromSession(session),
    capabilities: ['json', 'targetMap', 'targetInspect', 'objectInventory', 'commands', 'save', 'quality', 'renderPage'],
  });
  return true;
}

async function handleEditorApiAction(req, res, config, state, fmt, id, actionPath) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Method not allowed. Use POST.' }, { Allow: 'POST' });
    return true;
  }
  const record = findApiRecord(state, fmt, id);
  if (!record) {
    sendJson(res, 404, { ok: false, message: 'Document session not found.' });
    return true;
  }
  const body = await readJsonBody(req);
  const { session } = record;

  if (actionPath === 'documents/read-json' || actionPath === 'export' && body.type === 'json') {
    sendJson(res, 200, session.readJson());
    return true;
  }
  if (actionPath === 'target/map' || actionPath === 'targets/map') {
    sendJson(res, 200, { editableTargets: session.targetMap(), locations: session.targetMap() });
    return true;
  }
  if (actionPath === 'target/inspect' || actionPath === 'targets/inspect') {
    const locations = body.locations || (body.location ? [body.location] : []);
    const targets = locations.map((location) => session.inspectTarget(location));
    sendJson(res, 200, { targets });
    return true;
  }
  if (actionPath === 'target/find' || actionPath === 'targets/resolve') {
    const query = body.query || body.selector?.text;
    if (!query && body.selector?.type === 'cursor') {
      sendJson(res, 200, { targetId: 'append-end', native: { append: true }, ambiguous: false });
      return true;
    }
    if (!query) {
      sendJson(res, 422, { ok: false, message: 'target/find requires query or selector.text.' });
      return true;
    }
    sendJson(res, 200, { target: session.resolveText(query, body.match || {}), ambiguous: false });
    return true;
  }
  if (actionPath === 'object/inventory' || actionPath === 'objects/inventory') {
    sendJson(res, 200, session.objectInventory());
    return true;
  }
  if (actionPath === 'commands/apply' || actionPath === 'commands/batch') {
    const commands = normalizeCommands(body);
    if (!Array.isArray(commands)) {
      sendJson(res, 400, { ok: false, message: 'commands/apply requires commands or ops array.' });
      return true;
    }
    const result = session.apply(commands);
    sendJson(res, 200, { ...result, warnings: [] });
    return true;
  }
  if (actionPath === 'documents/save-source' || actionPath === 'save') {
    const saved = session.save();
    const outputPath = body.outputPath ? path.resolve(String(body.outputPath)) : bytesRefForSavedDocument(config, body.filename || record.filename);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, saved.bytes);
    sendJson(res, 200, {
      ok: true,
      revision: saved.revision,
      bytesRef: outputPath,
      sha256: sha256(saved.bytes),
      validation: saved.validation,
    });
    return true;
  }
  if (actionPath === 'quality/check' || actionPath === 'health/check') {
    const quality = session.qualityCheck({ baselineJson: record.baselineJson });
    sendJson(res, 200, {
      ok: quality.ok,
      stable: quality.ok,
      report: quality,
      ...quality,
    });
    return true;
  }
  if (actionPath === 'pages/render-page') {
    const requestedPage = Number(body.page ?? body.pageNumber ?? 1);
    const pageNumber = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    if (fmt === 'hwpx') {
      const pages = renderHwpxSvgPages(session, [pageNumber]);
      sendJson(res, 200, { page: pages[0], pages, renderer: 'rhwp-svg' });
      return true;
    }
    const page = { page: pageNumber, format: 'structure-only', nonBlank: true };
    sendJson(res, 200, {
      page,
      pages: [page],
      warnings: [{ code: 'docx-render-not-wired', message: 'DOCX visual render is not exposed through this gateway.' }],
    });
    return true;
  }
  if (actionPath === 'pages/render-all' || actionPath === 'export' && body.type === 'pages-image') {
    const pageCount = pageCountFromSession(session);
    const pages = normalizePageRange(body, pageCount);
    if (fmt === 'hwpx') {
      sendJson(res, 200, { pages: renderHwpxSvgPages(session, pages), renderer: 'rhwp-svg' });
      return true;
    }
    sendJson(res, 200, {
      pages: pages.map((page) => ({ page, format: 'structure-only', nonBlank: true })),
      warnings: [{ code: 'docx-render-not-wired', message: 'DOCX visual render is not exposed through this gateway.' }],
    });
    return true;
  }
  if (actionPath === 'quality/render-compare') {
    const pageCount = pageCountFromSession(session);
    const pages = normalizePageRange(body, pageCount);
    const quality = session.qualityCheck({ baselineJson: record.baselineJson });
    sendJson(res, 200, {
      ok: quality.ok,
      pages: fmt === 'hwpx' ? renderHwpxSvgPages(session, pages) : [],
      quality,
      warnings: fmt === 'hwpx' ? [] : [{ code: 'docx-render-not-wired', message: 'DOCX render compare is structural only.' }],
    });
    return true;
  }
  if (actionPath === 'documents/export-pdf' || actionPath === 'export' && body.type === 'pdf') {
    sendJson(res, 501, { ok: false, message: 'PDF export is not exposed by the local API bridge yet.' });
    return true;
  }

  sendJson(res, 404, { ok: false, message: `Unknown editor API action: ${actionPath}` });
  return true;
}

async function handleEditorApi(req, res, config, state, pathname) {
  const openMatch = pathname.match(/^\/v1\/(docx|hwpx)\/(?:documents\/open|sessions)$/);
  if (openMatch) {
    return handleEditorApiOpen(req, res, config, state, openMatch[1]);
  }
  const collectionMatch = pathname.match(/^\/v1\/(docx|hwpx)\/(?:documents|sessions)$/);
  if (collectionMatch) {
    sendJson(res, 405, { ok: false, message: 'Method not allowed. Use POST to open a document.' }, { Allow: 'POST' });
    return true;
  }
  const documentMatch = pathname.match(/^\/v1\/(docx|hwpx)\/documents\/([^/]+)\/(.+)$/);
  if (documentMatch) {
    return handleEditorApiAction(req, res, config, state, documentMatch[1], documentMatch[2], documentMatch[3]);
  }
  const sessionMatch = pathname.match(/^\/v1\/(docx|hwpx)\/sessions\/([^/]+)\/(.+)$/);
  if (sessionMatch) {
    return handleEditorApiAction(req, res, config, state, sessionMatch[1], sessionMatch[2], sessionMatch[3]);
  }
  sendJson(res, 404, { ok: false, message: 'Unknown editor API route.' });
  return true;
}

function handleHwpxStaticRequest(req, res, config, pathname) {
  if (!config.hwpxStaticRoot) {
    return false;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return true;
  }

  let filePath = resolveStaticPath(config.hwpxStaticRoot, config.hwpxBasePath, pathname);
  if (!filePath) {
    sendText(res, 502, `HWPX static build was not found: ${config.hwpxStaticRoot}`);
    return true;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const hasExtension = Boolean(path.extname(pathname));
    const fallbackPath = resolveStaticPath(config.hwpxStaticRoot, config.hwpxBasePath, `${config.hwpxBasePath}index.html`);
    if (!hasExtension && fallbackPath && existsSync(fallbackPath) && statSync(fallbackPath).isFile()) {
      filePath = fallbackPath;
    } else {
      sendText(res, 404, 'Not found');
      return true;
    }
  }

  sendStaticFile(req, res, filePath);
  return true;
}

function isEditorHtmlPath(pathname) {
  return pathname.endsWith('/cool.html');
}

function sanitizeEditorHtml(html) {
  return String(html ?? '')
    .replace(
      /(<input\b[^>]*\bid=["']init-product-branding-url["'][^>]*\bvalue=)["'][^"']*["']/gi,
      '$1""',
    )
    .replace(/https?:\/\/(?:www\.)?collaboraonline\.com\/?/gi, '')
    .replace(/https?:\/\/sdk\.collaboraonline\.com\/?/gi, '')
    .replace(/https?:\/\/collaboraonline\.github\.io\/?/gi, '')
    .replace(/Collabora Online Development Edition/gi, 'Document Editor')
    .replace(/Collabora Online Welcome/gi, 'Document Editor Welcome')
    .replace(/Collabora Online/gi, 'Document Editor')
    .replace(/Collabora Office/gi, 'Document Engine')
    .replace(/CollaboraOnline/gi, 'DocumentEditor')
    .replace(/collaboraonline/gi, 'document-editor')
    .replace(/collaboraoffice/gi, 'document-engine')
    .replace(/collabora-office-white\.svg/gi, 'document-editor-white.svg');
}

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function validateToken(req) {
  const parsed = new URL(req.url || '/', 'http://localhost');
  return parsed.searchParams.get('access_token') === DOCX_WOPI_TOKEN;
}

async function handleDocxWopi(req, res, config, state) {
  if (!validateToken(req)) {
    sendJson(res, 401, { message: 'Missing or invalid access token' });
    return true;
  }

  await ensureGatewayDocx(config.sampleDocxPath);
  const pathname = getRequestPath(req.url);
  const contentsPath = `${config.docxServiceRoot}/wopi/files/${DOCX_WOPI_FILE_ID}/contents`;
  const filePath = config.sampleDocxPath;

  if (req.method === 'GET' && pathname === contentsPath) {
    const stat = statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': String(stat.size),
      'X-WOPI-ItemVersion': String(state.version),
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
    return true;
  }

  if (req.method === 'POST' && pathname === contentsPath) {
    const requestLock = getHeader(req, 'x-wopi-lock') || '';
    if (state.lock && requestLock !== state.lock) {
      res.writeHead(409, {
        'X-WOPI-Lock': state.lock,
        'X-WOPI-LockFailureReason': 'Lock mismatch',
      });
      res.end();
      return true;
    }

    const body = await readRequestBody(req);
    await writeFile(filePath, body);
    state.version += 1;
    res.writeHead(200, { 'X-WOPI-ItemVersion': String(state.version) });
    res.end();
    return true;
  }

  if (req.method === 'GET') {
    const stat = statSync(filePath);
    sendJson(res, 200, {
      BaseFileName: 'docx-home.docx',
      OwnerId: 'local-editor-gateway',
      UserId: 'local-user',
      UserFriendlyName: 'Local User',
      Size: stat.size,
      Version: String(state.version),
      UserCanWrite: true,
      SupportsUpdate: true,
      SupportsLocks: true,
      SupportsGetLock: true,
      SupportsExtendedLockLength: true,
      PostMessageOrigin: config.publicOrigin,
    }, { 'X-WOPI-ItemVersion': String(state.version) });
    return true;
  }

  if (req.method === 'POST') {
    const override = String(getHeader(req, 'x-wopi-override') || '').toUpperCase();
    const requestLock = getHeader(req, 'x-wopi-lock') || '';
    if (override === 'LOCK') {
      if (state.lock && requestLock !== state.lock) {
        res.writeHead(409, {
          'X-WOPI-Lock': state.lock,
          'X-WOPI-LockFailureReason': 'Lock mismatch',
        });
        res.end();
        return true;
      }
      state.lock = requestLock;
      res.writeHead(200, { 'X-WOPI-ItemVersion': String(state.version) });
      res.end();
      return true;
    }
    if (override === 'REFRESH_LOCK') {
      if (state.lock && requestLock !== state.lock) {
        res.writeHead(409, {
          'X-WOPI-Lock': state.lock,
          'X-WOPI-LockFailureReason': 'Lock mismatch',
        });
        res.end();
        return true;
      }
      state.lock = requestLock || state.lock;
      res.writeHead(200, { 'X-WOPI-ItemVersion': String(state.version) });
      res.end();
      return true;
    }
    if (override === 'UNLOCK') {
      if (state.lock && requestLock !== state.lock) {
        res.writeHead(409, {
          'X-WOPI-Lock': state.lock,
          'X-WOPI-LockFailureReason': 'Lock mismatch',
        });
        res.end();
        return true;
      }
      state.lock = '';
      res.writeHead(200, { 'X-WOPI-ItemVersion': String(state.version) });
      res.end();
      return true;
    }
    if (override === 'GET_LOCK') {
      res.writeHead(200, {
        'X-WOPI-Lock': state.lock,
        'X-WOPI-ItemVersion': String(state.version),
      });
      res.end();
      return true;
    }
    sendJson(res, 501, { message: `Unsupported WOPI override: ${override || 'none'}` });
    return true;
  }

  sendText(res, 405, 'Method not allowed');
  return true;
}

function copyProxyHeaders(headers, target, options = {}) {
  const copied = { ...headers };
  copied.host = options.host || target.host;
  if (options.origin) {
    copied.origin = options.origin;
  }
  if (options.forwardedHost) {
    copied['x-forwarded-host'] = options.forwardedHost;
  }
  if (options.forwardedProto) {
    copied['x-forwarded-proto'] = options.forwardedProto;
  }
  return copied;
}

function buildDocxProxyHeaderOptions(config) {
  const publicUrl = new URL(config.publicOrigin);
  return {
    host: publicUrl.host,
    origin: publicUrl.origin,
    forwardedHost: publicUrl.host,
    forwardedProto: publicUrl.protocol.replace(/:$/, ''),
  };
}

function proxyHttpRequest(req, res, targetOrigin, headerOptions = {}) {
  const target = new URL(req.url || '/', targetOrigin);
  const client = target.protocol === 'https:' ? https : http;
  const shouldTransformHtml = isEditorHtmlPath(getRequestPath(req.url));
  const requestHeaders = copyProxyHeaders(req.headers, target, headerOptions);
  if (shouldTransformHtml) {
    delete requestHeaders['accept-encoding'];
  }
  const proxyReq = client.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers: requestHeaders,
    },
    (proxyRes) => {
      if (shouldTransformHtml && proxyRes.statusCode === 200) {
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        proxyRes.on('end', () => {
          const headers = { ...proxyRes.headers };
          delete headers['content-length'];
          delete headers['content-encoding'];
          headers['content-type'] = headers['content-type'] ?? 'text/html; charset=utf-8';
          res.writeHead(proxyRes.statusCode ?? 200, headers);
          res.end(sanitizeEditorHtml(Buffer.concat(chunks).toString('utf8')));
        });
        return;
      }
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.once('error', (error) => {
    sendText(res, 502, `Editor gateway proxy failed: ${error.message}`);
  });
  req.pipe(proxyReq);
}

function proxyWebSocket(req, socket, head, targetOrigin, headerOptions = {}) {
  const target = new URL(req.url || '/', targetOrigin);
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
  const connect = target.protocol === 'https:' ? tls.connect : net.connect;
  const targetSocket = connect({ host: target.hostname, port, servername: target.hostname }, () => {
    const headers = copyProxyHeaders(req.headers, target, headerOptions);
    const headerLines = Object.entries(headers)
      .flatMap(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((item) => `${key}: ${item}`);
        }
        return value == null ? [] : [`${key}: ${value}`];
      })
      .join('\r\n');

    targetSocket.write(`${req.method} ${target.pathname}${target.search} HTTP/${req.httpVersion}\r\n`);
    targetSocket.write(`${headerLines}\r\n\r\n`);
    if (head?.length) {
      targetSocket.write(head);
    }
    socket.pipe(targetSocket).pipe(socket);
  });
  targetSocket.on('error', () => socket.destroy());
  socket.on('error', () => targetSocket.destroy());
}

function resolveTargetOrigin(req, config) {
  const pathname = getRequestPath(req.url);
  if (isDocxRuntimePath(pathname, config.docxServiceRoot)) {
    return config.docxRuntimeOrigin;
  }
  if (!config.hwpxStaticRoot && config.hwpxRuntimeOrigin && isHwpxPath(pathname, config.hwpxBasePath)) {
    return config.hwpxRuntimeOrigin;
  }
  return '';
}

function resolveProxyHeaderOptions(targetOrigin, config) {
  return targetOrigin === config.docxRuntimeOrigin ? buildDocxProxyHeaderOptions(config) : {};
}

function createGatewayServer(config) {
  const state = {
    lock: '',
    version: 1,
  };

  const server = http.createServer(async (req, res) => {
    try {
      const pathname = getRequestPath(req.url);
      if (pathname === '/') {
        res.writeHead(302, { Location: `${config.docxServiceRoot}/` });
        res.end();
        return;
      }

      if (isEditorApiPath(pathname) && await handleEditorApi(req, res, config, state, pathname)) {
        return;
      }

      if (isDocxWopiPath(pathname, config.docxServiceRoot)) {
        await handleDocxWopi(req, res, config, state);
        return;
      }

      if (isDocxRootPath(pathname, config.docxServiceRoot)) {
        const editorUrl = await buildDocxEditorUrl(config, config.publicOrigin);
        sendText(res, 200, renderDocxPage(editorUrl), 'text/html; charset=utf-8');
        return;
      }

      if (isHwpxPath(pathname, config.hwpxBasePath) && handleHwpxStaticRequest(req, res, config, pathname)) {
        return;
      }

      const targetOrigin = resolveTargetOrigin(req, config);
      if (targetOrigin) {
        proxyHttpRequest(req, res, targetOrigin, resolveProxyHeaderOptions(targetOrigin, config));
        return;
      }

      sendText(res, 404, 'Not found');
    } catch (error) {
      sendText(res, 500, error instanceof Error ? error.message : String(error));
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const targetOrigin = resolveTargetOrigin(req, config);
    if (!targetOrigin) {
      socket.destroy();
      return;
    }
    proxyWebSocket(req, socket, head, targetOrigin, resolveProxyHeaderOptions(targetOrigin, config));
  });

  return server;
}

function buildConfigFromEnv() {
  const host = readEnv('EDITOR_GATEWAY_HOST', '127.0.0.1');
  const port = parsePositiveInteger(readEnv('EDITOR_GATEWAY_PORT', '11004'), 11004);
  const docxServiceRoot = normalizeServiceRoot(readEnv('EDITOR_SERVICE_ROOT', '/docx'));
  const hwpxBasePath = normalizeBasePath(readEnv('RHWP_STUDIO_BASE_PATH', '/hwpx/'));
  const publicOrigin = normalizeOrigin(readEnv('EDITOR_GATEWAY_PUBLIC_ORIGIN', `http://${host}:${port}`));
  const runtimeMode = readEnv('EDITOR_RUNTIME_MODE', process.platform === 'linux' ? 'native' : 'auto').toLowerCase();
  const defaultWopiHost =
    runtimeMode === 'docker' || (runtimeMode === 'auto' && process.platform !== 'linux')
      ? 'host.docker.internal'
      : host;

  return {
    host,
    port,
    publicOrigin,
    docxServiceRoot,
    hwpxBasePath,
    docxRuntimeOrigin: normalizeOrigin(
      readEnv('EDITOR_GATEWAY_DOCX_ORIGIN', `http://127.0.0.1:${readEnv('EDITOR_HOST_PORT', '9980')}`),
    ),
    hwpxRuntimeOrigin: normalizeOptionalOrigin(readEnv('EDITOR_GATEWAY_HWPX_ORIGIN', '')),
    hwpxStaticRoot: path.resolve(
      readEnv('EDITOR_GATEWAY_HWPX_STATIC_ROOT', path.join(repoRoot, 'editor_hwpx', 'rhwp-studio', 'dist')),
    ),
    wopiBaseUrl: normalizeOrigin(readEnv('EDITOR_GATEWAY_WOPI_BASE_URL', `http://${defaultWopiHost}:${port}`)),
    sampleDocxPath: path.resolve(readEnv('EDITOR_GATEWAY_SAMPLE_DOCX', DEFAULT_GATEWAY_DOCX)),
  };
}

async function main() {
  const config = buildConfigFromEnv();
  await ensureGatewayDocx(config.sampleDocxPath);
  const server = createGatewayServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`[editor:gateway] ready: ${config.publicOrigin}`);
    console.log(`[editor:gateway] DOCX: ${config.publicOrigin}${config.docxServiceRoot}/`);
    console.log(`[editor:gateway] HWPX: ${config.publicOrigin}${config.hwpxBasePath}`);
  });
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export {
  buildConfigFromEnv,
  createGatewayServer,
  isDocxRootPath,
  isDocxRuntimePath,
  isHwpxPath,
  normalizeBasePath,
  normalizeServiceRoot,
  renderDocxPage,
  resolveDocxActionPath,
  sanitizeEditorHtml,
  resolveStaticPath,
};
