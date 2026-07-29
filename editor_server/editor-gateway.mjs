import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { copyFile, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

import { handleEditorMcpJsonRpc } from './editor-mcp.mjs';
import { docxAdapter } from './format-adapters/docx-adapter.mjs';
import { hwpxAdapter } from './format-adapters/hwpx-adapter.mjs';
import { ImageSessionStore } from '../editor_image/image-session-store.mjs';

const formatAdapters = new Map([
  [docxAdapter.format, docxAdapter],
  [hwpxAdapter.format, hwpxAdapter],
]);
const EditorDocumentStore = docxAdapter.documentStoreClass;
const DEFAULT_EDITOR_TOKEN_TTL_MS = docxAdapter.defaultDocumentTokenTtlMs;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_SAMPLE_DOCX = path.join(repoRoot, 'editor_docx', 'test', 'data', 'template.docx');
const DEFAULT_GATEWAY_DOCX = path.join(repoRoot, '.build', 'gateway-documents', 'docx-home.docx');
const DOCX_WOPI_FILE_ID = 'docx-home';
const DOCX_WOPI_TOKEN = 'local-docx-token';
const MCP_BOUNDED_RESPONSE_MODE = 'bounded-mcp-v1';
const MCP_PAGE_STRUCTURED_BUDGET_BYTES = 9 * 1024;
const MCP_PROJECTED_ITEM_BUDGET_BYTES = 6 * 1024;
const MCP_READ_DEFAULT_LIMIT = 40;
const MCP_READ_MAX_LIMIT = 100;
const MCP_TARGET_DEFAULT_LIMIT = 60;
const MCP_TARGET_MAX_LIMIT = 120;
const MCP_TEXT_PREVIEW_DEFAULT_CHARS = 200;
const MCP_TEXT_PREVIEW_MAX_CHARS = 512;
const MCP_CELL_PREVIEW_DEFAULT_LIMIT = 3;
const MCP_CELL_PREVIEW_MAX_LIMIT = 12;
const STATIC_MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.mjs', 'text/javascript; charset=utf-8'],
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
  return Boolean(getDocxWopiDocumentId(pathname, docxServiceRoot));
}

function getDocxWopiDocumentId(pathname, docxServiceRoot) {
  const match = pathname.match(new RegExp(`^${docxServiceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/wopi/files/([^/]+)(?:/contents)?$`));
  return match ? match[1] : '';
}

function getDocxEditDocumentId(pathname, docxServiceRoot) {
  const prefix = `${docxServiceRoot}/edit/`;
  if (!pathname.startsWith(prefix)) {
    return '';
  }
  const documentId = pathname.slice(prefix.length);
  return /^(?:[0-9a-f-]{36}|doc_[0-9a-f-]{36})$/i.test(documentId) ? documentId : '';
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

function isRootDocxRuntimePath(pathname) {
  return pathname.startsWith('/browser/') ||
    pathname.startsWith('/hosting/') ||
    pathname.startsWith('/cool/') ||
    pathname.startsWith('/lool/') ||
    pathname.startsWith('/loleaflet/');
}

function shouldPrefixDocxServiceRoot(pathname, docxServiceRoot) {
  return Boolean(docxServiceRoot) &&
    isRootDocxRuntimePath(pathname) &&
    !pathname.startsWith(`${docxServiceRoot}/`);
}

function isHwpxPath(pathname, hwpxBasePath) {
  const base = hwpxBasePath.replace(/\/$/, '');
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isImagePath(pathname, imageBasePath) {
  const base = imageBasePath.replace(/\/$/, '');
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

async function readFormBody(req, limitBytes = 64 * 1024) {
  const contentType = String(getHeader(req, 'content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/x-www-form-urlencoded') {
    throw new Error('Content-Type must be application/x-www-form-urlencoded');
  }
  const body = await readRequestBody(req, limitBytes);
  return new URLSearchParams(body.toString('utf8'));
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

async function buildDocxEditorActionUrl(config, publicOrigin) {
  const discovery = await fetchText(`${config.docxRuntimeOrigin}${config.docxServiceRoot}/hosting/discovery`);
  const actionPath = resolveDocxActionPath(discovery, config.docxServiceRoot);
  return new URL(actionPath, `${publicOrigin}/`).toString();
}

function renderDocxPage(editorUrl, formParameters = null) {
  const frameBridge = `
  <script>
    (() => {
      const editorFrame = document.querySelector('iframe[title="DOCX editor"]');
      let parentOrigin = null;
      try {
        parentOrigin = document.referrer ? new URL(document.referrer).origin : null;
      } catch (_error) {
        parentOrigin = null;
      }
      window.addEventListener('message', (event) => {
        if (event.source === window.parent && window.parent !== window) {
          if (!parentOrigin || event.origin !== parentOrigin || !editorFrame?.contentWindow) return;
          editorFrame.contentWindow.postMessage(event.data, window.location.origin);
          return;
        }
        if (event.source === editorFrame?.contentWindow && event.origin === window.location.origin) {
          if (!parentOrigin || window.parent === window) return;
          window.parent.postMessage(event.data, parentOrigin);
        }
      });
    })();
  </script>`;
  if (formParameters) {
    const inputs = Object.entries(formParameters)
      .map(([name, value]) => `    <input type="hidden" name="${htmlEscape(name)}" value="${htmlEscape(value)}">`)
      .join('\n');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Academic DOCX Editor</title>
  <style>html, body, iframe { margin: 0; width: 100%; height: 100%; border: 0; overflow: hidden; }</style>
</head>
<body>
  <iframe name="docx-editor" title="DOCX editor" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
  <form id="docx-editor-form" method="post" action="${htmlEscape(editorUrl)}" target="docx-editor">
${inputs}
  </form>
  <script>document.getElementById('docx-editor-form').submit();</script>${frameBridge}
</body>
</html>`;
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <meta name="description" content="Academic DOCX Editor for opening, editing, and saving DOCX documents.">
  <meta name="application-name" content="Academic DOCX Editor">
  <meta property="og:title" content="Academic DOCX Editor">
  <meta property="og:description" content="Open and edit DOCX documents in the Academic Editor.">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Academic DOCX Editor">
  <meta name="twitter:description" content="Open and edit DOCX documents in the Academic Editor.">
  <title>Academic DOCX Editor</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #f8fafc; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <iframe title="DOCX editor" src="${htmlEscape(editorUrl)}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>${frameBridge}
</body>
</html>`;
}

function parseAllowedWopiOrigins(value) {
  return new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizeOrigin(item)));
}

function parseFrameAncestorOrigins(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => normalizeOrigin(item)))];
}

function extendFrameAncestors(policy, origins = []) {
  const value = String(policy || '');
  if (!value || !origins.length) {
    return value;
  }
  const additions = origins.join(' ');
  if (/frame-ancestors\s+[^;]*/i.test(value)) {
    return value.replace(
      /frame-ancestors\s+([^;]*)/i,
      (_match, sources) => `frame-ancestors ${String(sources || '').trim()} ${additions}`.trim(),
    );
  }
  return `${value.replace(/;?\s*$/, ';')} frame-ancestors ${additions};`;
}

function validateExternalWopiRequest(documentId, params, config) {
  const wopiSrc = String(params.get('wopi_src') || params.get('WOPISrc') || '').trim();
  const accessToken = String(params.get('access_token') || '').trim();
  const accessTokenTtl = String(params.get('access_token_ttl') || '').trim();
  if (!wopiSrc || !accessToken || !accessTokenTtl) {
    throw new Error('wopi_src, access_token and access_token_ttl are required');
  }
  if (accessToken.length > 8192 || wopiSrc.length > 4096) {
    throw new Error('WOPI form value is too long');
  }
  const parsed = new URL(wopiSrc);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('WOPI source must use HTTP or HTTPS');
  }
  if (!config.allowedWopiOrigins.has(parsed.origin)) {
    throw new Error('WOPI source origin is not allowed');
  }
  if (!parsed.pathname.endsWith(`/files/${documentId}`)) {
    throw new Error('WOPI source document does not match the editor path');
  }
  const ttl = Number.parseInt(accessTokenTtl, 10);
  if (!Number.isSafeInteger(ttl) || ttl <= Date.now()) {
    throw new Error('WOPI access token has expired');
  }
  return {
    WOPISrc: wopiSrc,
    access_token: accessToken,
    access_token_ttl: String(ttl),
  };
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function docxWrapperHeaders(config) {
  const ancestors = ["'self'", ...(config.frameAncestorOrigins ?? [])];
  return {
    'Content-Security-Policy': `frame-ancestors ${[...new Set(ancestors)].join(' ')};`,
  };
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function isLoopbackHost(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function readBearerToken(req) {
  const authorization = String(getHeader(req, 'authorization') || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function tokensEqual(actual, expected) {
  const actualBytes = Buffer.from(String(actual || ''), 'utf8');
  const expectedBytes = Buffer.from(String(expected || ''), 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function authorizeInternalRoute(req, res, config) {
  const expected = String(config.internalBearerToken || '');
  if (!expected && isLoopbackHost(config.host)) {
    return true;
  }
  if (!expected) {
    sendJson(res, 503, {
      ok: false,
      message: 'ACADEMIC_EDITOR_MCP_BEARER_TOKEN must be configured when the gateway binds beyond loopback.',
    });
    return false;
  }
  if (!tokensEqual(readBearerToken(req), expected)) {
    sendJson(res, 401, { ok: false, message: 'Valid Bearer authorization is required.' }, {
      'WWW-Authenticate': 'Bearer',
    });
    return false;
  }
  return true;
}

function editorDocumentApiMatch(pathname) {
  if (pathname === '/api/documents') {
    return { action: 'collection', documentId: '' };
  }
  if (pathname === '/api/documents/upload') {
    return { action: 'upload', documentId: '' };
  }
  const match = pathname.match(/^\/api\/documents\/([^/]+)(?:\/(session|download))?$/);
  return match ? { action: match[2] || 'item', documentId: match[1] } : null;
}

function imageSessionApiMatch(pathname) {
  if (pathname === '/api/image-sessions') return { action: 'collection', sessionId: '' };
  const match = pathname.match(/^\/api\/image-sessions\/(img_[0-9a-f-]+)\/([A-Za-z0-9_-]{20,})\/(source|export|download)$/);
  return match ? { action: match[3], sessionId: match[1], token: match[2] } : null;
}

function imageSessionUrls(config, record) {
  const sourcePath = `/api/image-sessions/${record.id}/${record.token}/source`;
  const exportPath = `/api/image-sessions/${record.id}/${record.token}/export`;
  const downloadPath = `/api/image-sessions/${record.id}/${record.token}/download`;
  return {
    sourceUrl: `${config.publicOrigin}${sourcePath}`,
    exportUrl: `${config.publicOrigin}${exportPath}`,
    downloadUrl: `${config.publicOrigin}${downloadPath}`,
    editorUrl: `${config.publicOrigin}${config.imageBasePath}?image=${sourcePath}&save=${exportPath}`,
  };
}

function sendImageSessionBytes(res, bytes, mimeType, filename = '') {
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': String(bytes.length),
    'Cache-Control': 'no-store',
    'Content-Disposition': filename ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` : 'inline',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(bytes);
}

async function handleImageSessionApi(req, res, config, route) {
  const store = config.imageSessionStore;
  try {
    if (route.action === 'collection' && req.method === 'POST') {
      const body = await readJsonBody(req, Math.ceil(config.imageSessionMaxBytes * 1.4) + 4096);
      const bytes = Buffer.from(String(body.bytesBase64 || ''), 'base64');
      const record = store.create({ bytes, filename: body.filename });
      sendJson(res, 201, {
        ok: true,
        sessionId: record.id,
        filename: record.filename,
        mimeType: record.sourceMimeType,
        byteLength: record.sourceBytes.length,
        expiresAt: record.lastAccessedAt + config.imageSessionTtlMs,
        ...imageSessionUrls(config, record),
      });
      return true;
    }
    const record = store.get(route.sessionId, route.token);
    if (!record) {
      sendJson(res, 404, { ok: false, message: 'Image session was not found or the capability token is invalid.' });
      return true;
    }
    if (route.action === 'source' && req.method === 'GET') {
      sendImageSessionBytes(res, record.sourceBytes, record.sourceMimeType);
      return true;
    }
    if (route.action === 'export' && req.method === 'POST') {
      const body = await readJsonBody(req, Math.ceil(config.imageSessionMaxBytes * 1.4) + 4096);
      const saved = store.save(record.id, record.token, Buffer.from(String(body.bytesBase64 || ''), 'base64'));
      sendJson(res, 200, {
        ok: true,
        sessionId: saved.id,
        mimeType: saved.resultMimeType,
        byteLength: saved.resultBytes.length,
        downloadUrl: imageSessionUrls(config, saved).downloadUrl,
      });
      return true;
    }
    if (route.action === 'download' && req.method === 'GET') {
      if (!record.resultBytes) {
        sendJson(res, 409, { ok: false, message: 'The image session has no saved result yet.' });
        return true;
      }
      sendImageSessionBytes(res, record.resultBytes, record.resultMimeType, record.filename.replace(/\.[^.]+$/, '.png'));
      return true;
    }
    sendJson(res, 405, { ok: false, message: 'Method not allowed.' });
    return true;
  } catch (error) {
    const status = /exceeds|exceeded/i.test(String(error?.message || '')) ? 413 : 400;
    sendJson(res, status, { ok: false, message: error instanceof Error ? error.message : String(error) });
    return true;
  }
}

function editorDocumentErrorStatus(error) {
  if (error?.code === 'DOCUMENT_NOT_FOUND') {
    return 404;
  }
  if (/quota|exceeds/i.test(String(error?.message || ''))) {
    return 413;
  }
  return 400;
}

async function handleStoredDocumentApi(req, res, config, route) {
  if (!authorizeInternalRoute(req, res, config)) {
    return true;
  }
  const store = config.documentStore;
  try {
    if (route.action === 'collection' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const metadata = await store.createBlank({ title: body.title, initialText: body.initialText });
      sendJson(res, 201, metadata);
      return true;
    }
    if (route.action === 'upload' && req.method === 'POST') {
      const bytes = await readRequestBody(req, store.maxFileSize + 1);
      const filename = decodeURIComponent(String(getHeader(req, 'x-file-name') || 'document.docx'));
      const title = decodeURIComponent(String(getHeader(req, 'x-document-title') || path.basename(filename, path.extname(filename))));
      const metadata = await store.createFromBytes({ title, filename, bytes });
      sendJson(res, 201, metadata);
      return true;
    }
    if (route.action === 'item' && req.method === 'GET') {
      sendJson(res, 200, await store.get(route.documentId));
      return true;
    }
    if (route.action === 'item' && req.method === 'DELETE') {
      await store.delete(route.documentId);
      stateLockDelete(config, route.documentId);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    if (route.action === 'session' && req.method === 'POST') {
      await store.get(route.documentId);
      const issued = store.issueToken(route.documentId, { canWrite: true });
      sendJson(res, 200, {
        documentId: route.documentId,
        actionUrl: `${config.publicOrigin}${config.docxServiceRoot}/edit/${route.documentId}`,
        formParameters: {
          wopi_src: `${config.wopiBaseUrl}${config.docxServiceRoot}/wopi/files/${route.documentId}`,
          access_token: issued.token,
          access_token_ttl: String(issued.expiresAt),
        },
        expiresAt: issued.expiresAt,
      });
      return true;
    }
    if (route.action === 'download' && req.method === 'GET') {
      const metadata = await store.get(route.documentId);
      const bytes = await store.read(route.documentId);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename)}`,
        'Cache-Control': 'no-store',
      });
      res.end(bytes);
      return true;
    }
    sendJson(res, 405, { ok: false, message: 'Method not allowed.' });
    return true;
  } catch (error) {
    sendJson(res, editorDocumentErrorStatus(error), { ok: false, message: error instanceof Error ? error.message : String(error) });
    return true;
  }
}

function stateLockDelete(config, documentId) {
  config.documentLocks?.delete(documentId);
}

function sendStaticFile(req, res, filePath, headers = {}) {
  const stat = statSync(filePath);
  const contentType = STATIC_MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Cache-Control': 'no-store',
    ...headers,
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

async function readJsonBody(req, limitBytes) {
  const body = await readRequestBody(req, limitBytes);
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
  const sourcePath = source.bytesRef || source.path || source.filePath || source.localPath;
  const sourceCount = Number(Boolean(source.bytesBase64)) + Number(Boolean(sourcePath && !String(sourcePath).startsWith('blob://')));
  if (sourceCount !== 1) {
    throw new Error(`${fmt.toUpperCase()} API open requires exactly one of source.bytesBase64 or a trusted source path.`);
  }
  if (source.bytesBase64) {
    return Buffer.from(String(source.bytesBase64), 'base64');
  }
  if (sourcePath && !String(sourcePath).startsWith('blob://')) {
    return readFile(path.resolve(String(sourcePath)));
  }
  throw new Error(`${fmt.toUpperCase()} API open source is invalid.`);
}

async function createApiSession(fmt, bytes, options = {}) {
  const adapter = formatAdapters.get(fmt);
  if (!adapter) throw new Error(`unsupported format: ${fmt}`);
  return adapter.createSession(bytes, options);
}

function apiStore(state) {
  state.apiDocuments ??= new Map();
  return state.apiDocuments;
}

function discardApiSessionState(state, documentId, options = {}) {
  const deleted = apiStore(state).delete(documentId);
  if (options.clearLock !== false) {
    state.mcpDocumentLocks?.delete(documentId);
  }
  return deleted;
}

function findApiRecord(state, fmt, id) {
  const record = apiStore(state).get(id);
  if (!record || record.fmt !== fmt) {
    return null;
  }
  return record;
}

class EditorContractError extends Error {
  constructor(code, message, statusCode = 409, details = undefined) {
    super(`${code}: ${message}`);
    this.name = 'EditorContractError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function recordPreconditions(record) {
  record.preconditions ??= {
    inspectionRevision: null,
    inspectedTargetKeys: new Set(),
    inventoryRevision: null,
    qualityRevision: null,
  };
  return record.preconditions;
}

function clearRecordPreconditions(record) {
  const preconditions = recordPreconditions(record);
  preconditions.inspectionRevision = null;
  preconditions.inspectedTargetKeys = new Set();
  preconditions.inventoryRevision = null;
  preconditions.qualityRevision = null;
}

function requireBaseRevision(record, body) {
  const baseRevision = Number(body?.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 1) {
    throw new EditorContractError(
      'invalid_base_revision',
      'baseRevision must be a positive integer.',
      400,
    );
  }
  const currentRevision = Number(record.session.revision);
  if (baseRevision !== currentRevision) {
    throw new EditorContractError(
      'stale_revision',
      `expected revision ${baseRevision}, current revision ${currentRevision}. Re-read and re-inspect before continuing.`,
    );
  }
  return baseRevision;
}

function assertMutationPreconditions(record, action, body, commands = []) {
  const baseRevision = requireBaseRevision(record, body);
  const adapter = formatAdapters.get(record.fmt);
  const preconditions = recordPreconditions(record);
  let commandEntries = [];

  if (action === 'apply') {
    try {
      commandEntries = adapter.validateCommands(commands);
    } catch (error) {
      throw new EditorContractError(
        'invalid_commands',
        error instanceof Error ? error.message : String(error),
        422,
      );
    }
    if (adapter.commandsNeedPrecondition(commandEntries, 'target_inspect')) {
      const requiredTargets = adapter.requiredInspectionTargets(commands, commandEntries);
      const inspectedKeys = preconditions.inspectionRevision === baseRevision
        ? preconditions.inspectedTargetKeys
        : new Set();
      const missingTargets = requiredTargets.filter((target) => !inspectedKeys.has(target.key));
      if (preconditions.inspectionRevision !== baseRevision || missingTargets.length) {
        const missingDetail = missingTargets.length
          ? ` Missing: ${missingTargets.map((target) => `${target.op}.${target.role}=${target.key}`).join(', ')}.`
          : '';
        throw new EditorContractError(
          'inspection_required',
          `inspect every exact target and style source at the current revision before applying commands.${missingDetail}`,
          409,
          { missingTargets },
        );
      }
    }
    if (adapter.commandsNeedPrecondition(commandEntries, 'object_inventory')
      && preconditions.inventoryRevision !== baseRevision) {
      throw new EditorContractError(
        'object_inventory_required',
        'inspect current document objects before applying image commands.',
      );
    }
  }

  if ((action === 'save-source' || action === 'export-pdf')
    && preconditions.qualityRevision !== baseRevision) {
    throw new EditorContractError(
      'quality_check_required',
      'run a clean quality check at the current revision before finalizing the document.',
    );
  }

  return { baseRevision, commandEntries };
}

function pruneExpiredApiSessions(state, ttlMs) {
  const cutoff = Date.now() - Math.max(60_000, Number(ttlMs || 60 * 60 * 1000));
  for (const [id, record] of apiStore(state)) {
    if (Number(record.lastAccessedAt || record.createdAt || 0) < cutoff) {
      discardApiSessionState(state, id);
    }
  }
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

function mcpArtifactDirectory() {
  const outDir = path.join(repoRoot, '.build', 'gateway-api-documents');
  mkdirSync(outDir, { recursive: true });
  return outDir;
}

const MCP_ARTIFACT_EXTENSIONS = new Set(['docx', 'hwpx', 'pdf']);

function mcpArtifactPath(artifactId, extension = 'docx') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(artifactId || ''))) {
    throw new Error('Invalid MCP artifact ID.');
  }
  const normalizedExtension = String(extension || '').toLowerCase();
  if (!MCP_ARTIFACT_EXTENSIONS.has(normalizedExtension)) {
    throw new Error('Invalid MCP artifact extension.');
  }
  return path.join(mcpArtifactDirectory(), `${artifactId}.${normalizedExtension}`);
}

async function resolveMcpArtifact(artifactId) {
  for (const extension of MCP_ARTIFACT_EXTENSIONS) {
    const filePath = mcpArtifactPath(artifactId, extension);
    try {
      const info = await stat(filePath);
      if (info.isFile()) {
        return {
          extension,
          filePath,
          mimeType: extension === 'pdf'
            ? 'application/pdf'
            : extension === 'hwpx'
              ? 'application/vnd.hancom.hwpx'
              : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  throw new Error('MCP artifact not found.');
}

async function pruneExpiredMcpArtifacts(config) {
  const ttlMs = Math.max(60_000, Number(config.mcpArtifactTtlMs || 24 * 60 * 60 * 1000));
  const cutoff = Date.now() - ttlMs;
  const names = await readdir(mcpArtifactDirectory());
  await Promise.all(names
    .filter((name) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:docx|hwpx|pdf)$/i.test(name))
    .map(async (name) => {
      const filePath = path.join(mcpArtifactDirectory(), name);
      try {
        const info = await stat(filePath);
        if (info.mtimeMs < cutoff) {
          await unlink(filePath);
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  const resolved = value === undefined || value === null ? fallback : value;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return resolved;
}

function mcpPaginationKey(state) {
  state.mcpPaginationKey ??= randomBytes(32);
  return state.mcpPaginationKey;
}

function encodeMcpCursor(state, payload) {
  const encodedPayload = Buffer.from(JSON.stringify({ v: 1, ...payload }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', mcpPaginationKey(state)).update(encodedPayload).digest('base64url');
  return `v1.${encodedPayload}.${signature}`;
}

function decodeMcpCursor(state, cursor) {
  const value = String(cursor || '');
  if (!value || value.length > 2048) {
    throw new Error('invalid_cursor: pagination cursor length is invalid. Start a new read without cursor.');
  }
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    throw new Error('invalid_cursor: pagination cursor is malformed. Start a new read without cursor.');
  }
  const expected = createHmac('sha256', mcpPaginationKey(state)).update(parts[1]).digest();
  let supplied;
  try {
    supplied = Buffer.from(parts[2], 'base64url');
  } catch {
    supplied = Buffer.alloc(0);
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('invalid_cursor: pagination cursor signature is invalid. Start a new read without cursor.');
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid_cursor: pagination cursor payload is invalid. Start a new read without cursor.');
  }
  if (!decoded || decoded.v !== 1 || typeof decoded.documentId !== 'string' ||
      !Number.isInteger(decoded.revision) || !Number.isInteger(decoded.offset) ||
      decoded.offset < 0 || !decoded.query || typeof decoded.query !== 'object') {
    throw new Error('invalid_cursor: pagination cursor payload is incomplete. Start a new read without cursor.');
  }
  return decoded;
}

function assertCursorStream(cursor, { documentId, revision, stream }) {
  if (cursor.stream !== stream || cursor.documentId !== documentId) {
    throw new Error('invalid_cursor: pagination cursor belongs to a different document or stream.');
  }
  if (cursor.revision !== revision) {
    throw new Error(`stale_cursor: cursor revision ${cursor.revision} does not match current revision ${revision}. Start a new read without cursor.`);
  }
}

function assertCursorQueryArguments(args, query, keys) {
  for (const key of keys) {
    if (!Object.hasOwn(args, key) || args[key] === undefined || args[key] === null) {
      continue;
    }
    if (JSON.stringify(args[key]) !== JSON.stringify(query[key])) {
      throw new Error(`cursor_query_mismatch: ${key} cannot change while following nextCursor.`);
    }
  }
}

function previewText(value, maxChars) {
  const text = String(value ?? '');
  return {
    textPreview: text.slice(0, maxChars),
    textLength: text.length,
    textTruncated: text.length > maxChars,
  };
}

function projectBlock(block, textPreviewChars) {
  return {
    id: block.id,
    kind: 'paragraph',
    location: { paragraph: { section: Number(block.native?.section ?? 0), number: Number(block.native?.paragraph ?? 0) } },
    ...previewText(block.text, textPreviewChars),
    styleFingerprint: block.styleFingerprint,
  };
}

function projectTableCell(cell, textPreviewChars) {
  return {
    id: cell.id,
    kind: 'cell',
    location: cell.location,
    row: cell.row,
    column: cell.col,
    ...previewText(cell.text, textPreviewChars),
    styleFingerprint: cell.styleFingerprint,
    capacity: cell.layout?.capacity,
  };
}

function projectTable(table, textPreviewChars, cellPreviewLimit) {
  const tableBase = {
    id: table.id,
    kind: 'table',
    location: { tableId: table.id },
    tableIndex: table.tableIndex,
    dims: table.dims,
  };
  const cells = [];
  for (const cell of (table.cells ?? []).slice(0, cellPreviewLimit)) {
    const projected = projectTableCell(cell, textPreviewChars);
    const candidate = { ...tableBase, cells: [...cells, projected] };
    if (cells.length > 0 && Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MCP_PROJECTED_ITEM_BUDGET_BYTES) {
      break;
    }
    cells.push(projected);
  }
  return {
    ...tableBase,
    cells,
    cellPreviewTotal: table.cells?.length ?? 0,
    cellPreviewReturned: cells.length,
    cellPreviewTruncated: cells.length < (table.cells?.length ?? 0),
  };
}

function projectDocumentSummary(json) {
  const tables = json.tables ?? [];
  const objectGraph = json.objectGraph ?? {};
  const rawWarnings = Array.isArray(json.warnings)
    ? json.warnings
    : json.warnings
      ? [json.warnings]
      : [];
  const warnings = rawWarnings.slice(0, 5).map((warning) => ({
    code: warning?.code,
    severity: warning?.severity,
    message: String(warning?.message ?? '').slice(0, 160),
  }));
  return {
    sourceFormat: json.sourceFormat,
    pageCount: json.pageCount,
    ...(json.pageCountEstimate !== undefined ? { pageCountEstimate: json.pageCountEstimate } : {}),
    ...(json.pageCountSource ? { pageCountSource: json.pageCountSource } : {}),
    ...(json.pageCountIsEstimate !== undefined ? { pageCountIsEstimate: Boolean(json.pageCountIsEstimate) } : {}),
    sectionCount: json.sections?.length ?? 0,
    paragraphCount: (json.sections ?? []).reduce((sum, section) => sum + (section.paragraphs?.length ?? 0), 0),
    blockCount: json.blocks?.length ?? 0,
    tableCount: tables.length,
    referenceCount: json.references?.length ?? 0,
    cellCount: tables.reduce((sum, table) => sum + (table.cells?.length ?? 0), 0),
    styleCount: json.styleGraph?.count ?? json.styleGraph?.styles?.length ?? 0,
    objectCounts: {
      images: objectGraph.images?.length ?? 0,
      pictures: objectGraph.pictures?.length ?? 0,
      charts: objectGraph.charts?.length ?? 0,
      relationships: objectGraph.relationships?.length ?? 0,
      xmlFiles: objectGraph.xmlFiles?.length ?? 0,
      binaryFiles: objectGraph.binaryFiles?.length ?? 0,
    },
    warningCount: rawWarnings.length,
    warnings,
    warningsTruncated: warnings.length < rawWarnings.length,
  };
}

function projectEditableTarget(target, kind) {
  return {
    id: target.id,
    kind,
    location: target.location,
    textLength: target.textLength,
  };
}

function paginateMcpItems({ items, offset, limit, envelope, nextCursor }) {
  if (offset > items.length) {
    throw new Error(`invalid_cursor: pagination offset ${offset} exceeds stream total ${items.length}.`);
  }
  const selected = [];
  let nextOffset = offset;
  while (nextOffset < items.length && selected.length < limit) {
    const candidateItems = [...selected, items[nextOffset]];
    const candidateHasMore = nextOffset + 1 < items.length;
    const sizingCursor = candidateHasMore ? 'x'.repeat(512) : null;
    const candidate = envelope(candidateItems, sizingCursor, false);
    if (selected.length > 0 && Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MCP_PAGE_STRUCTURED_BUDGET_BYTES) {
      break;
    }
    selected.push(items[nextOffset]);
    nextOffset += 1;
  }

  let cursor = nextOffset < items.length ? nextCursor(nextOffset) : null;
  let result = envelope(selected, cursor, false);
  while (selected.length > 1 && Buffer.byteLength(JSON.stringify(result), 'utf8') > MCP_PAGE_STRUCTURED_BUDGET_BYTES) {
    selected.pop();
    nextOffset -= 1;
    cursor = nextCursor(nextOffset);
    result = envelope(selected, cursor, false);
  }
  const oversizedItem = selected.length === 1 && Buffer.byteLength(JSON.stringify(result), 'utf8') > MCP_PAGE_STRUCTURED_BUDGET_BYTES;
  return oversizedItem ? envelope(selected, cursor, true) : result;
}

function normalizeReadQuery(args = {}) {
  const view = String(args.view ?? 'summary');
  if (!['summary', 'blocks', 'tables', 'references'].includes(view)) {
    throw new Error('view must be summary, blocks, tables, or references.');
  }
  return {
    view,
    limit: boundedInteger(args.limit, MCP_READ_DEFAULT_LIMIT, 1, MCP_READ_MAX_LIMIT, 'limit'),
    textPreviewChars: boundedInteger(args.textPreviewChars, MCP_TEXT_PREVIEW_DEFAULT_CHARS, 32, MCP_TEXT_PREVIEW_MAX_CHARS, 'textPreviewChars'),
    cellPreviewLimit: boundedInteger(args.cellPreviewLimit, MCP_CELL_PREVIEW_DEFAULT_LIMIT, 0, MCP_CELL_PREVIEW_MAX_LIMIT, 'cellPreviewLimit'),
  };
}

function boundedDocxReadPage(state, documentId, session, args = {}) {
  const json = session.readJson();
  const revision = Number(json.revision);
  let query;
  let offset = 0;
  if (args.cursor) {
    const cursor = decodeMcpCursor(state, args.cursor);
    assertCursorStream(cursor, { documentId, revision, stream: 'read-json' });
    query = cursor.query;
    assertCursorQueryArguments(args, query, ['view', 'limit', 'textPreviewChars', 'cellPreviewLimit']);
    query = normalizeReadQuery(query);
    offset = cursor.offset;
  } else {
    query = normalizeReadQuery(args);
  }

  const rawItems = query.view === 'summary'
    ? [projectDocumentSummary(json)]
    : query.view === 'blocks'
      ? (json.blocks ?? []).map((block) => projectBlock(block, query.textPreviewChars))
      : query.view === 'tables'
        ? (json.tables ?? []).map((table) => projectTable(table, query.textPreviewChars, query.cellPreviewLimit))
        : (json.references ?? []).map((reference) => ({
          occurrenceId: reference.occurrenceId,
          tag: reference.tag,
          displayText: reference.displayText,
          tooltip: reference.tooltip,
          paragraphId: reference.paragraphId,
          native: reference.native,
          order: reference.order,
        }));
  const effectiveLimit = query.view === 'summary' ? 1 : query.limit;
  const makeCursor = (nextOffset) => encodeMcpCursor(state, {
    documentId,
    revision,
    stream: 'read-json',
    query,
    offset: nextOffset,
  });
  const makeEnvelope = (items, nextCursor, oversizedItem) => ({
    ok: true,
    revision,
    view: query.view,
    total: rawItems.length,
    returned: items.length,
    nextCursor,
    textPreviewChars: query.textPreviewChars,
    ...(query.view === 'tables' ? { cellPreviewLimit: query.cellPreviewLimit } : {}),
    ...(oversizedItem ? { oversizedItem: true } : {}),
    items,
  });
  return paginateMcpItems({
    items: rawItems,
    offset,
    limit: effectiveLimit,
    envelope: makeEnvelope,
    nextCursor: makeCursor,
  });
}

function normalizeTargetMapQuery(args = {}) {
  const kind = String(args.kind ?? 'paragraph');
  if (!['paragraph', 'cell'].includes(kind)) {
    throw new Error('kind must be paragraph or cell.');
  }
  const tableId = args.tableId === undefined || args.tableId === null ? null : String(args.tableId).trim();
  if (tableId && kind !== 'cell') {
    throw new Error('tableId is valid only when kind=cell.');
  }
  if (args.tableId !== undefined && args.tableId !== null && !tableId) {
    throw new Error('tableId must not be empty.');
  }
  if (tableId && tableId.length > 128) {
    throw new Error('tableId must contain at most 128 characters.');
  }
  return {
    kind,
    limit: boundedInteger(args.limit, MCP_TARGET_DEFAULT_LIMIT, 1, MCP_TARGET_MAX_LIMIT, 'limit'),
    tableId,
  };
}

function boundedDocxTargetMapPage(state, documentId, session, args = {}) {
  const revision = Number(session.revision);
  let query;
  let offset = 0;
  if (args.cursor) {
    const cursor = decodeMcpCursor(state, args.cursor);
    assertCursorStream(cursor, { documentId, revision, stream: 'target-map' });
    query = cursor.query;
    assertCursorQueryArguments(args, query, ['kind', 'limit', 'tableId']);
    query = normalizeTargetMapQuery(query);
    offset = cursor.offset;
  } else {
    query = normalizeTargetMapQuery(args);
  }

  const targetMap = session.targetMap();
  const sourceTargets = query.kind === 'paragraph' ? targetMap.paragraphs ?? [] : targetMap.cells ?? [];
  const filteredTargets = query.tableId
    ? sourceTargets.filter((target) => target.location?.tableId === query.tableId)
    : sourceTargets;
  const targets = filteredTargets.map((target) => projectEditableTarget(target, query.kind));
  const makeCursor = (nextOffset) => encodeMcpCursor(state, {
    documentId,
    revision,
    stream: 'target-map',
    query,
    offset: nextOffset,
  });
  const makeEnvelope = (pageTargets, nextCursor, oversizedItem) => ({
    ok: true,
    revision,
    kind: query.kind,
    tableId: query.tableId,
    total: targets.length,
    returned: pageTargets.length,
    nextCursor,
    ...(oversizedItem ? { oversizedItem: true } : {}),
    targets: pageTargets,
  });
  return paginateMcpItems({
    items: targets,
    offset,
    limit: query.limit,
    envelope: makeEnvelope,
    nextCursor: makeCursor,
  });
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

function renderPageSelection(body = {}, defaultSelection = 'all') {
  const pages = body.range?.pages ?? body.pages;
  if (Array.isArray(pages) && pages.length) {
    return pages;
  }
  if (pages === 'all' || body.selection === 'all' || defaultSelection === 'all') {
    return 'all';
  }
  return [1];
}

async function renderDocxBytes(config, bytes, pages) {
  const renderer = config.docxRenderer || docxAdapter.renderPages;
  return renderer(bytes, {
    pages,
    quality: config.docxRenderQuality ?? 20,
    maxSize: config.docxRenderMaxSize ?? 1700,
    pythonBin: config.unoPythonBin,
    sofficeBin: config.sofficeBin,
    helperPath: config.docxRenderHelperPath,
    connectTimeoutSeconds: config.docxRenderConnectTimeoutSeconds,
    operationTimeoutSeconds: config.docxRenderOperationTimeoutSeconds,
    shutdownTimeoutSeconds: config.docxRenderShutdownTimeoutSeconds,
    maxResultBytes: config.docxRenderMaxResultBytes,
  });
}

function publicRenderedPages(rendered, revision) {
  return {
    ok: true,
    revision,
    renderer: rendered.renderer,
    pageCount: rendered.pageCount,
    selectedPages: rendered.selectedPages,
    settings: rendered.settings,
    pages: rendered.pages.map((page) => ({
      page: page.page,
      format: page.format,
      mimeType: page.mimeType,
      width: page.width,
      height: page.height,
      quality: page.quality,
      sha256: page.sha256,
      byteLength: page.byteLength,
      bytesBase64: page.bytes.toString('base64'),
    })),
  };
}

async function handleEditorApiOpen(req, res, config, state, fmt) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Method not allowed. Use POST.' }, { Allow: 'POST' });
    return true;
  }
  const body = await readJsonBody(req);
  let bytes;
  try {
    bytes = await readApiSourceBytes(fmt, body.source || {});
  } catch (error) {
    sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
    return true;
  }
  const session = await createApiSession(fmt, bytes, body);
  const id = `doc_${randomUUID()}`;
  const json = session.readJson();
  pruneExpiredApiSessions(state, config.apiSessionTtlMs);
  const now = Date.now();
  const record = {
    id,
    fmt,
    filename: body.filename || `document.${fmt}`,
    sourceBytes: Buffer.from(bytes),
    baselineJson: json,
    intentionalSectionLayoutChanges: new Set(),
    session,
    createdAt: now,
    lastAccessedAt: now,
  };
  apiStore(state).set(id, record);
  const issued = fmt === 'docx' && config.documentStore
    ? config.documentStore.issueToken(id, { canWrite: false })
    : null;
  sendJson(res, 200, {
    ok: true,
    documentId: id,
    sessionId: id,
    fmt,
    revision: session.revision,
    pageCount: json.pageCount ?? pageCountFromSession(session),
    ...(json.pageCountEstimate !== undefined ? { pageCountEstimate: json.pageCountEstimate } : {}),
    ...(json.pageCountSource ? { pageCountSource: json.pageCountSource } : {}),
    ...(json.pageCountIsEstimate !== undefined ? { pageCountIsEstimate: Boolean(json.pageCountIsEstimate) } : {}),
    capabilities: [
      'json',
      'targetMap',
      'targetInspect',
      'objectInventory',
      'commandCatalog',
      'commands',
      'save',
      'quality',
      'renderPage',
      'renderAll',
      'renderCompare',
      'exportPdf',
    ],
    ...(issued ? {
      liveEditorSession: {
        documentId: id,
        actionUrl: `${config.publicOrigin}${config.docxServiceRoot}/edit/${id}`,
        formParameters: {
          wopi_src: `${config.wopiBaseUrl}${config.docxServiceRoot}/wopi/files/${id}`,
          access_token: issued.token,
          access_token_ttl: String(issued.expiresAt),
        },
        expiresAt: issued.expiresAt,
        readOnly: true,
      },
    } : {}),
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
  record.lastAccessedAt = Date.now();
  const body = await readJsonBody(req);
  const { session } = record;

  if (actionPath === 'documents/discard' || actionPath === 'discard') {
    assertMutationPreconditions(record, 'discard', body);
    const deleted = discardApiSessionState(state, id);
    sendJson(res, 200, {
      ok: true,
      documentId: id,
      deleted,
      sessionClosed: true,
      artifactCreated: false,
    });
    return true;
  }
  if (actionPath === 'documents/read-json' || actionPath === 'export' && body.type === 'json') {
    if (body.responseMode === MCP_BOUNDED_RESPONSE_MODE) {
      sendJson(res, 200, boundedDocxReadPage(state, id, session, body));
      return true;
    }
    sendJson(res, 200, session.readJson());
    return true;
  }
  if (actionPath === 'target/map' || actionPath === 'targets/map') {
    if (body.responseMode === MCP_BOUNDED_RESPONSE_MODE) {
      sendJson(res, 200, boundedDocxTargetMapPage(state, id, session, body));
      return true;
    }
    sendJson(res, 200, { editableTargets: session.targetMap(), locations: session.targetMap() });
    return true;
  }
  if (actionPath === 'target/inspect' || actionPath === 'targets/inspect') {
    const locations = body.locations || (body.location ? [body.location] : []);
    const targets = locations.map((location) => session.inspectTarget(location));
    const adapter = formatAdapters.get(fmt);
    const inspectedTargetKeys = targets.map((target) => adapter.stableTargetKey(target.location));
    if (inspectedTargetKeys.some((key) => !key)) {
      throw new EditorContractError(
        'unstable_inspection_target',
        'target inspection returned a location without a stable paragraph or table-cell key.',
        422,
      );
    }
    const preconditions = recordPreconditions(record);
    if (preconditions.inspectionRevision !== session.revision) {
      preconditions.inspectedTargetKeys = new Set();
    }
    preconditions.inspectionRevision = session.revision;
    inspectedTargetKeys.forEach((key) => preconditions.inspectedTargetKeys.add(key));
    sendJson(res, 200, {
      revision: session.revision,
      targets,
      inspectedTargetKeys: [...preconditions.inspectedTargetKeys],
    });
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
    const inventory = session.objectInventory();
    recordPreconditions(record).inventoryRevision = session.revision;
    sendJson(res, 200, { revision: session.revision, ...inventory });
    return true;
  }
  if (actionPath === 'commands/catalog') {
    const catalog = formatAdapters.get(fmt).commandCatalog({ category: body.category, op: body.op });
    sendJson(res, 200, catalog);
    return true;
  }
  if (actionPath === 'commands/apply' || actionPath === 'commands/batch') {
    const commands = normalizeCommands(body);
    if (!Array.isArray(commands)) {
      sendJson(res, 400, { ok: false, message: 'commands/apply requires commands or ops array.' });
      return true;
    }
    assertMutationPreconditions(record, 'apply', body, commands);
    const result = await session.apply(commands);
    for (const command of commands) {
      if (String(command?.op ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase() === 'setpagesetup') {
        record.intentionalSectionLayoutChanges.add(command.section === 'all' ? 'all' : Number(command.section ?? 0));
      }
    }
    clearRecordPreconditions(record);
    sendJson(res, 200, { ...result, warnings: [] });
    return true;
  }
  if (actionPath === 'documents/save-source' || actionPath === 'save'
    || actionPath === 'documents/save-checkpoint') {
    const checkpoint = actionPath === 'documents/save-checkpoint';
    assertMutationPreconditions(record, checkpoint ? 'save-checkpoint' : 'save-source', body);
    const saved = await session.save();
    const outputPath = body.outputPath ? path.resolve(String(body.outputPath)) : bytesRefForSavedDocument(config, body.filename || record.filename);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, saved.bytes);
    sendJson(res, 200, {
      ok: true,
      revision: saved.revision,
      bytesRef: outputPath,
      sha256: sha256(saved.bytes),
      ...(fmt === 'docx' ? { visibleTextHash: sha256(Buffer.from(docxAdapter.visibleText(saved.bytes), 'utf8')) } : {}),
      validation: saved.validation,
      checkpoint,
      verified: !checkpoint,
    });
    return true;
  }
  if (actionPath === 'quality/check' || actionPath === 'health/check') {
    const { baseRevision } = assertMutationPreconditions(record, 'quality-check', body);
    const quality = await session.qualityCheck({
      baselineJson: record.baselineJson,
      allowedSectionLayoutChanges: [...record.intentionalSectionLayoutChanges],
    });
    recordPreconditions(record).qualityRevision = qualityAllowsFinalization(quality, fmt)
      ? baseRevision
      : null;
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
    const rendered = await renderDocxBytes(config, (await session.save()).bytes, [pageNumber]);
    const response = publicRenderedPages(rendered, session.revision);
    sendJson(res, 200, { ...response, page: response.pages[0] });
    return true;
  }
  if (actionPath === 'pages/render-all' || actionPath === 'export' && body.type === 'pages-image') {
    const pageCount = pageCountFromSession(session);
    const pages = renderPageSelection(body, 'all');
    if (fmt === 'hwpx') {
      const hwpxPages = pages === 'all'
        ? Array.from({ length: pageCount }, (_value, index) => index + 1)
        : pages;
      sendJson(res, 200, { pages: renderHwpxSvgPages(session, hwpxPages), renderer: 'rhwp-svg' });
      return true;
    }
    const rendered = await renderDocxBytes(config, (await session.save()).bytes, pages);
    sendJson(res, 200, publicRenderedPages(rendered, session.revision));
    return true;
  }
  if (actionPath === 'quality/render-compare') {
    const quality = await session.qualityCheck({
      baselineJson: record.baselineJson,
      allowedSectionLayoutChanges: [...record.intentionalSectionLayoutChanges],
    });
    if (fmt === 'docx') {
      const pages = renderPageSelection(body, 'first');
      const baselineRendered = await renderDocxBytes(config, record.sourceBytes, pages);
      const currentRendered = await renderDocxBytes(config, (await session.save()).bytes, pages);
      sendJson(res, 200, {
        ok: quality.ok,
        revision: session.revision,
        quality,
        baseline: publicRenderedPages(baselineRendered, 1),
        current: publicRenderedPages(currentRendered, session.revision),
        visualComparisonRequired: true,
      });
      return true;
    }
    const pageCount = pageCountFromSession(session);
    const pages = normalizePageRange(body, pageCount);
    const baselineSession = hwpxAdapter.createRawSession(record.sourceBytes);
    sendJson(res, 200, {
      ok: quality.ok,
      revision: session.revision,
      baseline: {
        revision: 1,
        pageCount: pageCountFromSession(baselineSession),
        pages: renderHwpxSvgPages(baselineSession, pages),
      },
      current: {
        revision: session.revision,
        pageCount,
        pages: renderHwpxSvgPages(session, pages),
      },
      quality,
      visualComparisonRequired: true,
    });
    return true;
  }
  if (actionPath === 'documents/export-pdf' || actionPath === 'export' && body.type === 'pdf') {
    assertMutationPreconditions(record, 'export-pdf', body);
    const sourceBytes = (await session.save()).bytes;
    const rendered = fmt === 'hwpx'
      ? await (config.hwpxPdfRenderer || hwpxAdapter.renderPages)(sourceBytes, {
        pages: 'all',
        dockerImage: config.hwpxPdfDockerImage,
        timeoutMs: config.hwpxPdfTimeoutMs,
        tempRoot: config.hwpxPdfTempRoot,
      })
      : await renderDocxBytes(config, sourceBytes, 'none');
    const pdf = fmt === 'hwpx' ? rendered : rendered.pdf;
    const filename = path.basename(String(body.filename || record.filename || `edited.${fmt}`)).replace(/\.(?:docx|hwpx|pdf)$/i, '') || 'edited';
    const outputPath = body.outputPath ? path.resolve(String(body.outputPath)) : '';
    if (outputPath) {
      mkdirSync(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, pdf.bytes);
    }
    sendJson(res, 200, {
      ok: true,
      revision: session.revision,
      renderer: rendered.renderer,
      pageCount: rendered.pageCount,
      mimeType: 'application/pdf',
      filename: `${filename}.pdf`,
      sha256: pdf.sha256,
      byteLength: pdf.byteLength,
      ...(outputPath ? { bytesRef: outputPath } : { bytesBase64: pdf.bytes.toString('base64') }),
    });
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

const IMAGE_EDITOR_CSP = [
  "default-src 'self' blob: data:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "img-src 'self' blob: data:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join('; ');

function debrandImageEditorHtml(html) {
  return html
    .replace(/<title>miniPaint - image editor<\/title>/, '<title>Tlooto Image Studio</title>')
    .replace(/miniPaint is free online image editor[^<]*/g, 'Tlooto Image Studio is a local, non-generative image editor.')
    .replace(/https:\/\/viliusle\.github\.io\/miniPaint\//g, '')
    .replace(/<a class="logo" href="#">miniPaint<\/a>/, '<a class="logo" href="#">Image Studio</a>')
    .replace('<script src="dist/bundle.js"></script>', '<script src="dist/bundle.js"></script><script defer src="tlooto-image-studio.js"></script>');
}

function handleImageStaticRequest(req, res, config, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return true;
  }

  const integrationPath = `${config.imageBasePath}tlooto-image-studio.js`;
  if (pathname === integrationPath) {
    sendStaticFile(req, res, path.join(config.imageIntegrationRoot, 'tlooto-image-studio.js'), {
      'Content-Security-Policy': IMAGE_EDITOR_CSP,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    return true;
  }
  let filePath = resolveStaticPath(config.imageStaticRoot, config.imageBasePath, pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const hasExtension = Boolean(path.extname(pathname));
    const fallbackPath = path.join(config.imageStaticRoot, 'index.html');
    if (!hasExtension && existsSync(fallbackPath) && statSync(fallbackPath).isFile()) {
      filePath = fallbackPath;
    } else {
      sendText(res, 404, 'Not found');
      return true;
    }
  }

  const headers = {
    'Content-Security-Policy': IMAGE_EDITOR_CSP,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
  if (path.extname(filePath).toLowerCase() !== '.html') {
    sendStaticFile(req, res, filePath, headers);
    return true;
  }

  const html = debrandImageEditorHtml(readFileSync(filePath, 'utf8'));
  sendText(res, 200, html, 'text/html; charset=utf-8', headers);
  return true;
}

function isEditorHtmlPath(pathname) {
  return pathname.endsWith('/cool.html');
}

const OPTIONAL_DOCX_RUNTIME_ASSET_FALLBACKS = new Map([
  [
    'branding.css',
    {
      contentType: 'text/css; charset=utf-8',
      body: '/* Optional document editor branding stylesheet is not configured. */\n',
    },
  ],
  [
    'branding-desktop.css',
    {
      contentType: 'text/css; charset=utf-8',
      body: '/* Optional document editor desktop branding stylesheet is not configured. */\n',
    },
  ],
  [
    'branding.js',
    {
      contentType: 'text/javascript; charset=utf-8',
      body: '/* Optional document editor branding script is not configured. */\n',
    },
  ],
  [
    'images/lc_sr20006.svg',
    {
      contentType: 'image/svg+xml; charset=utf-8',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1" aria-hidden="true"></svg>\n',
    },
  ],
  [
    'images/lc_validatesidebara11y.svg',
    {
      contentType: 'image/svg+xml; charset=utf-8',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1" aria-hidden="true"></svg>\n',
    },
  ],
  [
    'images/lc_validatedialogsa11y.svg',
    {
      contentType: 'image/svg+xml; charset=utf-8',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1" aria-hidden="true"></svg>\n',
    },
  ],
]);

function resolveOptionalDocxRuntimeAssetFallback(pathname, docxServiceRoot) {
  const rootedPrefix = docxServiceRoot ? `${docxServiceRoot}/` : '/';
  const runtimePath = pathname.startsWith(rootedPrefix)
    ? pathname.slice(docxServiceRoot.length)
    : pathname;
  const match = runtimePath.match(
    /^\/browser\/[^/]+\/(branding(?:-desktop)?\.css|branding\.js|images\/lc_(?:sr20006|validatesidebara11y|validatedialogsa11y)\.svg)$/,
  );
  return match ? OPTIONAL_DOCX_RUNTIME_ASSET_FALLBACKS.get(match[1]) ?? null : null;
}

function sendOptionalDocxRuntimeAssetFallback(req, res, fallback) {
  const body = Buffer.from(fallback.body, 'utf8');
  res.writeHead(200, {
    'Content-Type': fallback.contentType,
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Editor-Optional-Asset-Fallback': 'upstream-404',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
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

function getWopiUserModifiedState(req) {
  const value =
    getHeader(req, 'x-cool-wopi-ismodifiedbyuser') ??
    getHeader(req, 'x-lool-wopi-ismodifiedbyuser');
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return null;
}

function currentDocumentLock(config, documentId) {
  const current = config.documentLocks?.get(documentId);
  if (current && current.expiresAt <= Date.now()) {
    config.documentLocks.delete(documentId);
    return '';
  }
  return current?.value || '';
}

function sendWopiLockMismatch(res, currentLock) {
  res.writeHead(409, {
    'X-WOPI-Lock': currentLock,
    'X-WOPI-LockFailureReason': 'Lock mismatch',
    'Cache-Control': 'no-store',
  });
  res.end();
}

async function handleStoredDocxWopi(req, res, config, documentId) {
  const parsed = new URL(req.url || '/', 'http://localhost');
  const token = parsed.searchParams.get('access_token') || '';
  const isContents = parsed.pathname.endsWith('/contents');
  let payload;
  try {
    payload = config.documentStore.verifyToken(token, documentId, {
      requireWrite: req.method === 'POST',
    });
  } catch (error) {
    sendJson(res, 401, { message: error instanceof Error ? error.message : String(error) });
    return true;
  }

  let metadata;
  try {
    metadata = await config.documentStore.get(documentId);
  } catch (error) {
    sendJson(res, error?.code === 'DOCUMENT_NOT_FOUND' ? 404 : 400, {
      message: error instanceof Error ? error.message : String(error),
    });
    return true;
  }

  if (isContents && req.method === 'GET') {
    const bytes = await config.documentStore.read(documentId);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': String(bytes.length),
      'X-WOPI-ItemVersion': metadata.version,
      'Cache-Control': 'no-store',
    });
    res.end(bytes);
    return true;
  }

  if (isContents && req.method === 'POST') {
    const currentLock = currentDocumentLock(config, documentId);
    const requestLock = String(getHeader(req, 'x-wopi-lock') || '');
    if (currentLock && currentLock !== requestLock) {
      sendWopiLockMismatch(res, currentLock);
      return true;
    }
    try {
      const body = await readRequestBody(req, config.documentStore.maxFileSize + 1);
      if (getWopiUserModifiedState(req) === false) {
        res.writeHead(200, {
          'X-WOPI-ItemVersion': metadata.version,
          'Cache-Control': 'no-store',
        });
        res.end();
        return true;
      }
      const updated = await config.documentStore.write(documentId, body);
      res.writeHead(200, { 'X-WOPI-ItemVersion': updated.version, 'Cache-Control': 'no-store' });
      res.end();
    } catch (error) {
      sendJson(res, editorDocumentErrorStatus(error), { message: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (!isContents && req.method === 'GET') {
    sendJson(res, 200, {
      BaseFileName: metadata.filename,
      OwnerId: 'academic-editor',
      UserId: payload.jti,
      UserFriendlyName: 'Editor User',
      Size: metadata.size,
      Version: metadata.version,
      UserCanWrite: payload.canWrite === true,
      SupportsUpdate: true,
      SupportsLocks: true,
      SupportsGetLock: true,
      SupportsExtendedLockLength: true,
      PostMessageOrigin: config.publicOrigin,
    }, { 'X-WOPI-ItemVersion': metadata.version });
    return true;
  }

  if (!isContents && req.method === 'POST') {
    const override = String(getHeader(req, 'x-wopi-override') || '').toUpperCase();
    const requestLock = String(getHeader(req, 'x-wopi-lock') || '');
    const currentLock = currentDocumentLock(config, documentId);
    if (override === 'GET_LOCK') {
      res.writeHead(200, { 'X-WOPI-Lock': currentLock, 'X-WOPI-ItemVersion': metadata.version });
      res.end();
      return true;
    }
    if (!requestLock) {
      sendJson(res, 400, { message: 'X-WOPI-Lock is required' });
      return true;
    }
    if (currentLock && currentLock !== requestLock) {
      sendWopiLockMismatch(res, currentLock);
      return true;
    }
    if (override === 'LOCK' || override === 'REFRESH_LOCK') {
      config.documentLocks.set(documentId, { value: requestLock, expiresAt: Date.now() + 30 * 60 * 1000 });
    } else if (override === 'UNLOCK') {
      config.documentLocks.delete(documentId);
    } else {
      sendJson(res, 501, { message: `Unsupported WOPI override: ${override || 'none'}` });
      return true;
    }
    res.writeHead(200, { 'X-WOPI-ItemVersion': metadata.version, 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }

  sendText(res, 405, 'Method not allowed');
  return true;
}

async function handleLiveDocxWopi(req, res, config, state, documentId) {
  const parsed = new URL(req.url || '/', 'http://localhost');
  const token = parsed.searchParams.get('access_token') || '';
  const isContents = parsed.pathname.endsWith('/contents');
  let payload;
  try {
    payload = config.documentStore.verifyToken(token, documentId);
  } catch (error) {
    sendJson(res, 401, { message: error instanceof Error ? error.message : String(error) });
    return true;
  }

  const record = findApiRecord(state, 'docx', documentId);
  if (!record) {
    sendJson(res, 404, { message: 'Live DOCX session not found.' });
    return true;
  }
  record.lastAccessedAt = Date.now();
  const saved = record.session.save();
  const bytes = saved.bytes;
  const version = String(saved.revision);

  if (isContents && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': String(bytes.length),
      'X-WOPI-ItemVersion': version,
      'Cache-Control': 'no-store',
    });
    res.end(bytes);
    return true;
  }

  if (!isContents && req.method === 'GET') {
    sendJson(res, 200, {
      BaseFileName: record.filename,
      OwnerId: 'academic-editor-agent',
      UserId: payload.jti,
      UserFriendlyName: 'DOCX Agent live preview',
      Size: bytes.length,
      Version: version,
      ReadOnly: true,
      UserCanWrite: false,
      SupportsUpdate: false,
      SupportsLocks: false,
      SupportsGetLock: false,
      PostMessageOrigin: config.publicOrigin,
    }, { 'X-WOPI-ItemVersion': version });
    return true;
  }

  sendText(res, 405, 'Live DOCX previews are read-only');
  return true;
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
    if (getWopiUserModifiedState(req) === false) {
      res.writeHead(200, { 'X-WOPI-ItemVersion': String(state.version) });
      res.end();
      return true;
    }
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

function getFirstHeaderValue(req, name) {
  const value = req.headers[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function buildDocxProxyHeaderOptions(req, config) {
  const fallbackPublicUrl = new URL(config.publicOrigin);
  const forwardedHost = getFirstHeaderValue(req, 'x-forwarded-host') || getFirstHeaderValue(req, 'host');
  const forwardedProto =
    getFirstHeaderValue(req, 'x-forwarded-proto') ||
    fallbackPublicUrl.protocol.replace(/:$/, '');
  const publicHost = String(forwardedHost || fallbackPublicUrl.host).split(',')[0].trim();
  const publicProto = String(forwardedProto || 'http').split(',')[0].trim().replace(/:$/, '') || 'http';
  const publicOrigin = `${publicProto}://${publicHost}`;

  return {
    host: publicHost,
    origin: publicOrigin,
    forwardedHost: publicHost,
    forwardedProto: publicProto,
    docxServiceRoot: config.docxServiceRoot,
    frameAncestorOrigins: config.frameAncestorOrigins,
  };
}

function buildProxyTargetUrl(requestUrl, targetOrigin, headerOptions = {}) {
  const target = new URL(requestUrl || '/', targetOrigin);
  if (shouldPrefixDocxServiceRoot(target.pathname, headerOptions.docxServiceRoot || '')) {
    target.pathname = `${headerOptions.docxServiceRoot}${target.pathname}`;
  }
  return target;
}

function proxyHttpRequest(req, res, targetOrigin, headerOptions = {}) {
  const target = buildProxyTargetUrl(req.url, targetOrigin, headerOptions);
  const client = target.protocol === 'https:' ? https : http;
  const requestPath = getRequestPath(req.url);
  const shouldTransformHtml = isEditorHtmlPath(requestPath);
  const optionalAssetFallback =
    (req.method === 'GET' || req.method === 'HEAD')
      ? resolveOptionalDocxRuntimeAssetFallback(requestPath, headerOptions.docxServiceRoot || '')
      : null;
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
      if (proxyRes.statusCode === 404 && optionalAssetFallback) {
        proxyRes.resume();
        sendOptionalDocxRuntimeAssetFallback(req, res, optionalAssetFallback);
        return;
      }
      if (shouldTransformHtml && proxyRes.statusCode === 200) {
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        proxyRes.on('end', () => {
          const headers = { ...proxyRes.headers };
          delete headers['content-length'];
          delete headers['content-encoding'];
          if (headers['content-security-policy']) {
            headers['content-security-policy'] = extendFrameAncestors(
              headers['content-security-policy'],
              headerOptions.frameAncestorOrigins,
            );
          }
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
  const target = buildProxyTargetUrl(req.url, targetOrigin, headerOptions);
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
  const connect = target.protocol === 'https:' ? tls.connect : net.connect;
  const targetSocket = connect({ host: target.hostname, port, servername: target.hostname }, () => {
    const headers = copyProxyHeaders(req.headers, target, headerOptions);
    delete headers['sec-websocket-extensions'];
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

function resolveProxyHeaderOptions(req, targetOrigin, config) {
  return targetOrigin === config.docxRuntimeOrigin ? buildDocxProxyHeaderOptions(req, config) : {};
}

function localEditorApiOrigin(req) {
  return `http://127.0.0.1:${req.socket.localPort}`;
}

async function postLocalEditorApi(req, config, pathname, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.internalBearerToken) {
    headers.Authorization = `Bearer ${config.internalBearerToken}`;
  }
  const response = await fetch(`${localEditorApiOrigin(req)}${pathname}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { ok: false, message: text || `Editor API returned HTTP ${response.status}.` };
  }
  if (!response.ok) {
    throw new Error(payload?.message || `Editor API returned HTTP ${response.status}.`);
  }
  return payload;
}

async function withMcpDocumentLock(state, documentId, operation) {
  state.mcpDocumentLocks ??= new Map();
  const previous = state.mcpDocumentLocks.get(documentId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  state.mcpDocumentLocks.set(documentId, current);
  try {
    return await current;
  } finally {
    if (state.mcpDocumentLocks.get(documentId) === current) {
      state.mcpDocumentLocks.delete(documentId);
    }
  }
}

function assertCurrentRevision(structure, baseRevision) {
  const currentRevision = Number(structure?.revision);
  if (!Number.isInteger(baseRevision) || baseRevision < 1) {
    throw new Error('baseRevision must be a positive integer.');
  }
  if (currentRevision !== baseRevision) {
    throw new Error(`stale_revision: expected ${baseRevision}, current ${currentRevision}. Re-read and re-inspect before writing.`);
  }
}

function qualityAllowsFinalization(quality, fmt) {
  if (quality?.ok !== true || quality?.stable === false || !Array.isArray(quality?.issues)) {
    return false;
  }
  if (fmt === 'hwpx') {
    return quality.issues.every((issue) => issue?.severity !== 'error');
  }
  return quality.issues.every((issue) => issue?.severity === 'info');
}

async function executeEditorMcpTool(req, config, state, name, args = {}) {
  if (name.startsWith('editor_image_')) {
    const store = config.imageSessionStore;
    if (name === 'editor_image_open') {
      const record = store.create({ bytes: Buffer.from(args.bytesBase64, 'base64'), filename: args.filename });
      return {
        ok: true,
        sessionId: record.id,
        token: record.token,
        filename: record.filename,
        mimeType: record.sourceMimeType,
        byteLength: record.sourceBytes.length,
        expiresAt: record.lastAccessedAt + config.imageSessionTtlMs,
        ...imageSessionUrls(config, record),
      };
    }
    const record = store.get(args.sessionId, args.token);
    if (!record) throw new Error('Image session was not found or the capability token is invalid.');
    if (name === 'editor_image_session_read') {
      return {
        ok: true,
        sessionId: record.id,
        token: record.token,
        filename: record.filename,
        source: { mimeType: record.sourceMimeType, byteLength: record.sourceBytes.length },
        result: record.resultBytes ? { mimeType: record.resultMimeType, byteLength: record.resultBytes.length } : null,
        expiresAt: record.lastAccessedAt + config.imageSessionTtlMs,
        ...imageSessionUrls(config, record),
      };
    }
    if (name === 'editor_image_session_result_read') {
      if (!record.resultBytes) throw new Error('The image session has no saved result yet.');
      return {
        ok: true,
        sessionId: record.id,
        filename: record.filename.replace(/\.[^.]+$/, '.png'),
        mimeType: record.resultMimeType,
        byteLength: record.resultBytes.length,
        sha256: sha256(record.resultBytes),
        bytesBase64: record.resultBytes.toString('base64'),
      };
    }
    if (name === 'editor_image_session_save') {
      const saved = store.save(record.id, record.token, Buffer.from(args.bytesBase64, 'base64'));
      return { ok: true, sessionId: saved.id, mimeType: saved.resultMimeType, byteLength: saved.resultBytes.length, downloadUrl: imageSessionUrls(config, saved).downloadUrl };
    }
    if (name === 'editor_image_session_delete') {
      return { ok: true, sessionId: record.id, deleted: store.delete(record.id, record.token) };
    }
    throw new Error(`Unsupported Image Studio MCP tool: ${name}`);
  }
  const fmt = name.match(/^editor_(docx|hwpx)_/)?.[1];
  if (!fmt) throw new Error(`Unknown editor MCP tool prefix: ${name}`);
  const toolPrefix = `editor_${fmt}`;
  const adapter = formatAdapters.get(fmt);
  if (!adapter) throw new Error(`unsupported format: ${fmt}`);
  const catalogForFormat = adapter.commandCatalog;

  if (name === `${toolPrefix}_command_catalog`) {
    const catalog = catalogForFormat({ category: args.category, op: args.op });
    if ((args.category || args.op) && catalog.commandCount === 0) {
      throw new Error(`No ${fmt.toUpperCase()} commands matched category=${String(args.category || '')} op=${String(args.op || '')}.`);
    }
    return catalog;
  }
  if (name === `${toolPrefix}_open`) {
    if (args.bytesRef && !config.mcpAllowBytesRef && !isLoopbackHost(config.host)) {
      throw new Error('bytesRef is disabled for externally bound MCP servers. Use trusted application-side bytesBase64 input.');
    }
    return postLocalEditorApi(req, config, `/v1/${fmt}/documents/open`, {
      filename: args.filename,
      source: {
        ...(args.bytesBase64 ? { bytesBase64: args.bytesBase64 } : {}),
        ...(args.bytesRef ? { bytesRef: args.bytesRef } : {}),
      },
    });
  }

  if (name === `${toolPrefix}_artifact_read` || name === `${toolPrefix}_artifact_delete`) {
    const artifactId = String(args.artifactId || '').trim();
    const expectedSha256 = String(args.expectedSha256 || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error('expectedSha256 must be a lowercase SHA-256 digest.');
    }
    const artifact = await resolveMcpArtifact(artifactId);
    if (artifact.extension !== fmt && artifact.extension !== 'pdf') {
      throw new Error(`artifact_format_mismatch: expected ${fmt}, found ${artifact.extension}.`);
    }
    const bytes = await readFile(artifact.filePath);
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== expectedSha256) {
      throw new Error(`artifact_hash_mismatch: finalized ${fmt.toUpperCase()} artifact did not match the expected hash.`);
    }
    if (name === `${toolPrefix}_artifact_delete`) {
      await unlink(artifact.filePath);
      return { artifactId, sha256: actualSha256, mimeType: artifact.mimeType, deleted: true };
    }
    return {
      artifactId,
      sha256: actualSha256,
      mimeType: artifact.mimeType,
      byteLength: bytes.length,
      ...(artifact.extension === 'docx' ? { visibleTextHash: sha256(Buffer.from(docxAdapter.visibleText(bytes), 'utf8')) } : {}),
      bytesBase64: bytes.toString('base64'),
    };
  }

  const documentId = String(args.documentId || '').trim();
  if (!documentId) {
    throw new Error('documentId is required.');
  }

  return withMcpDocumentLock(state, documentId, async () => {
    if (name === `${toolPrefix}_discard`) {
      const record = findApiRecord(state, fmt, documentId);
      if (!record) {
        return {
          ok: true,
          status: 'completed',
          documentId,
          deleted: false,
          sessionClosed: true,
          artifactCreated: false,
        };
      }
      const prefix = `/v1/${fmt}/documents/${encodeURIComponent(documentId)}`;
      const discarded = await postLocalEditorApi(req, config, `${prefix}/documents/discard`, {
        baseRevision: args.baseRevision,
      });
      return {
        ...discarded,
        status: 'completed',
      };
    }

    const prefix = `/v1/${fmt}/documents/${encodeURIComponent(documentId)}`;
    if (name === `${toolPrefix}_read_json`) {
      return postLocalEditorApi(req, config, `${prefix}/documents/read-json`, {
        responseMode: MCP_BOUNDED_RESPONSE_MODE,
        ...(args.view !== undefined ? { view: args.view } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.cursor ? { cursor: args.cursor } : {}),
        ...(args.textPreviewChars !== undefined ? { textPreviewChars: args.textPreviewChars } : {}),
        ...(args.cellPreviewLimit !== undefined ? { cellPreviewLimit: args.cellPreviewLimit } : {}),
      });
    }
    if (name === `${toolPrefix}_target_map`) {
      return postLocalEditorApi(req, config, `${prefix}/target/map`, {
        responseMode: MCP_BOUNDED_RESPONSE_MODE,
        ...(args.kind !== undefined ? { kind: args.kind } : {}),
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
        ...(args.cursor ? { cursor: args.cursor } : {}),
        ...(args.tableId !== undefined ? { tableId: args.tableId } : {}),
      });
    }
    if (name === `${toolPrefix}_target_find`) {
      return postLocalEditorApi(req, config, `${prefix}/target/find`, { query: args.query, match: args.match || {} });
    }
    if (name === `${toolPrefix}_object_inventory`) {
      return postLocalEditorApi(req, config, `${prefix}/object/inventory`, {});
    }
    if (name === `${toolPrefix}_target_inspect`) {
      return postLocalEditorApi(req, config, `${prefix}/target/inspect`, { locations: args.locations });
    }

    const structure = await postLocalEditorApi(req, config, `${prefix}/documents/read-json`, {
      responseMode: MCP_BOUNDED_RESPONSE_MODE,
      view: 'summary',
    });
    const baseRevision = Number(args.baseRevision);
    assertCurrentRevision(structure, baseRevision);

    if (name === `${toolPrefix}_apply`) {
      return postLocalEditorApi(req, config, `${prefix}/commands/apply`, {
        baseRevision,
        commands: args.commands,
      });
    }
    if (name === `${toolPrefix}_render_pages`) {
      const pages = Array.isArray(args.pages) && args.pages.length ? args.pages.map(Number) : [1];
      if (pages.length > 12 || pages.some((page) => !Number.isInteger(page) || page < 1) || new Set(pages).size !== pages.length) {
        throw new Error('pages must contain 1-12 unique positive integers.');
      }
      if (args.includeBaseline === true) {
        return postLocalEditorApi(req, config, `${prefix}/quality/render-compare`, { pages });
      }
      return postLocalEditorApi(req, config, `${prefix}/pages/render-all`, { pages });
    }
    if (name === `${toolPrefix}_quality_check`) {
      return postLocalEditorApi(req, config, `${prefix}/quality/check`, { baseRevision });
    }
    if (name === `${toolPrefix}_export_pdf`) {
      await pruneExpiredMcpArtifacts(config);
      const artifactId = randomUUID();
      const outputPath = mcpArtifactPath(artifactId, 'pdf');
      try {
        const exported = await postLocalEditorApi(req, config, `${prefix}/documents/export-pdf`, {
          baseRevision,
          filename: args.filename,
          outputPath,
        });
        const { bytesRef: _serverLocalPath, bytesBase64: _inlineBytes, ...publicResult } = exported;
        return { ...publicResult, artifactId };
      } catch (error) {
        await unlink(outputPath).catch((unlinkError) => {
          if (unlinkError?.code !== 'ENOENT') {
            throw unlinkError;
          }
        });
        throw error;
      }
    }
    if (name === `${toolPrefix}_save_source`) {
      await pruneExpiredMcpArtifacts(config);
      const artifactId = randomUUID();
      const saved = await postLocalEditorApi(req, config, `${prefix}/documents/save-source`, {
        baseRevision,
        filename: args.filename,
        outputPath: mcpArtifactPath(artifactId, fmt),
      });
      const { bytesRef: _serverLocalPath, ...publicResult } = saved;
      discardApiSessionState(state, documentId, { clearLock: false });
      return { ...publicResult, artifactId, sessionClosed: true };
    }
    if (name === `${toolPrefix}_save_checkpoint`) {
      await pruneExpiredMcpArtifacts(config);
      const artifactId = randomUUID();
      const saved = await postLocalEditorApi(req, config, `${prefix}/documents/save-checkpoint`, {
        baseRevision,
        filename: args.filename,
        outputPath: mcpArtifactPath(artifactId, fmt),
      });
      const { bytesRef: _serverLocalPath, ...publicResult } = saved;
      discardApiSessionState(state, documentId, { clearLock: false });
      return {
        ...publicResult,
        artifactId,
        sessionClosed: true,
        checkpoint: true,
        verified: false,
      };
    }
    throw new Error(`Unsupported editor MCP tool: ${name}`);
  });
}

async function handleEditorMcp(req, res, config, state) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'MCP Streamable HTTP endpoint requires POST.' }, { Allow: 'POST' });
    return;
  }
  const payload = await readJsonBody(req);
  const response = await handleEditorMcpJsonRpc(payload, {
    serverInfo: { name: 'academic-editor-mcp', version: '1.0.0' },
    executeTool: (name, args) => executeEditorMcpTool(req, config, state, name, args),
  });
  if (response === null) {
    res.writeHead(202, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  sendJson(res, 200, response);
}

function createGatewayServer(config) {
  config = {
    mcpPath: '/mcp',
    internalBearerToken: '',
    mcpAllowBytesRef: false,
    imageBasePath: '/image/',
    imageStaticRoot: path.join(repoRoot, 'editor_image', 'vendor', 'minipaint'),
    imageIntegrationRoot: path.join(repoRoot, 'editor_image'),
    imageSessionMaxBytes: 25 * 1024 * 1024,
    imageSessionTtlMs: 2 * 60 * 60 * 1000,
    ...config,
  };
  config.documentLocks ??= new Map();
  config.imageSessionStore ??= new ImageSessionStore({
    maxImageBytes: config.imageSessionMaxBytes,
    ttlMs: config.imageSessionTtlMs,
  });
  const state = {
    lock: '',
    version: 1,
  };

  const server = http.createServer(async (req, res) => {
    try {
      const pathname = getRequestPath(req.url);
      if (pathname === '/') {
        res.writeHead(302, { Location: config.enableSampleDocx ? `${config.docxServiceRoot}/` : config.hwpxBasePath });
        res.end();
        return;
      }

      if (pathname === config.mcpPath) {
        if (!authorizeInternalRoute(req, res, config)) {
          return;
        }
        await handleEditorMcp(req, res, config, state);
        return;
      }

      const storedDocumentRoute = editorDocumentApiMatch(pathname);
      if (storedDocumentRoute && config.documentStore) {
        await handleStoredDocumentApi(req, res, config, storedDocumentRoute);
        return;
      }

      const imageSessionRoute = imageSessionApiMatch(pathname);
      if (imageSessionRoute) {
        await handleImageSessionApi(req, res, config, imageSessionRoute);
        return;
      }

      const documentId = getDocxEditDocumentId(pathname, config.docxServiceRoot);
      if (documentId) {
        if (req.method !== 'POST') {
          sendText(res, 405, 'Open the editor with a signed POST request');
          return;
        }
        let formParameters;
        try {
          const params = await readFormBody(req);
          formParameters = validateExternalWopiRequest(documentId, params, config);
          if (!config.documentStore) {
            throw new Error('Editor document store is unavailable');
          }
          config.documentStore.verifyToken(formParameters.access_token, documentId);
          if (config.documentStore.isDocumentId(documentId)) {
            await config.documentStore.get(documentId);
          } else if (!findApiRecord(state, 'docx', documentId)) {
            throw new Error('Live DOCX session not found');
          }
        } catch (error) {
          sendText(res, 400, error instanceof Error ? error.message : String(error));
          return;
        }
        const editorUrl = new URL(await buildDocxEditorActionUrl(config, config.publicOrigin));
        editorUrl.searchParams.set('WOPISrc', formParameters.WOPISrc);
        sendText(res, 200, renderDocxPage(editorUrl.toString(), {
          access_token: formParameters.access_token,
          access_token_ttl: formParameters.access_token_ttl,
        }), 'text/html; charset=utf-8', docxWrapperHeaders(config));
        return;
      }

      if (isEditorApiPath(pathname)) {
        if (!authorizeInternalRoute(req, res, config)) {
          return;
        }
        if (await handleEditorApi(req, res, config, state, pathname)) {
          return;
        }
      }

      if (isDocxWopiPath(pathname, config.docxServiceRoot)) {
        const wopiDocumentId = getDocxWopiDocumentId(pathname, config.docxServiceRoot);
        if (config.documentStore?.isDocumentId(wopiDocumentId)) {
          await handleStoredDocxWopi(req, res, config, wopiDocumentId);
          return;
        }
        if (findApiRecord(state, 'docx', wopiDocumentId)) {
          await handleLiveDocxWopi(req, res, config, state, wopiDocumentId);
          return;
        }
        if (!config.enableSampleDocx || wopiDocumentId !== DOCX_WOPI_FILE_ID) {
          sendText(res, 404, 'Document not found');
          return;
        }
        await handleDocxWopi(req, res, config, state);
        return;
      }

      if (isDocxRootPath(pathname, config.docxServiceRoot)) {
        if (!config.enableSampleDocx) {
          sendText(res, 404, 'A document-specific editor session is required');
          return;
        }
        const editorUrl = new URL(await buildDocxEditorActionUrl(config, config.publicOrigin));
        const wopiSrc = `${config.wopiBaseUrl}${config.docxServiceRoot}/wopi/files/${DOCX_WOPI_FILE_ID}`;
        editorUrl.searchParams.set('WOPISrc', wopiSrc);
        sendText(res, 200, renderDocxPage(editorUrl.toString(), {
          access_token: DOCX_WOPI_TOKEN,
          access_token_ttl: String(Date.now() + 12 * 60 * 60 * 1000),
        }), 'text/html; charset=utf-8', docxWrapperHeaders(config));
        return;
      }

      if (isHwpxPath(pathname, config.hwpxBasePath) && handleHwpxStaticRequest(req, res, config, pathname)) {
        return;
      }

      if (isImagePath(pathname, config.imageBasePath) && handleImageStaticRequest(req, res, config, pathname)) {
        return;
      }

      const targetOrigin = resolveTargetOrigin(req, config);
      if (targetOrigin) {
        proxyHttpRequest(req, res, targetOrigin, resolveProxyHeaderOptions(req, targetOrigin, config));
        return;
      }

      sendText(res, 404, 'Not found');
    } catch (error) {
      if (error instanceof EditorContractError) {
        sendJson(res, error.statusCode, {
          ok: false,
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        });
        return;
      }
      sendText(res, 500, error instanceof Error ? error.message : String(error));
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const targetOrigin = resolveTargetOrigin(req, config);
    if (!targetOrigin) {
      socket.destroy();
      return;
    }
    proxyWebSocket(req, socket, head, targetOrigin, resolveProxyHeaderOptions(req, targetOrigin, config));
  });

  return server;
}

function buildConfigFromEnv() {
  const host = readEnv('EDITOR_GATEWAY_HOST', '127.0.0.1');
  const port = parsePositiveInteger(readEnv('EDITOR_GATEWAY_PORT', '11004'), 11004);
  const docxServiceRoot = normalizeServiceRoot(readEnv('EDITOR_SERVICE_ROOT', '/docx'));
  const hwpxBasePath = normalizeBasePath(readEnv('RHWP_STUDIO_BASE_PATH', '/hwpx/'));
  const imageBasePath = normalizeBasePath(readEnv('EDITOR_IMAGE_BASE_PATH', '/image/'));
  const publicOrigin = normalizeOrigin(readEnv(
    'ACADEMIC_EDITOR_API_ORIGIN',
    readEnv('EDITOR_GATEWAY_PUBLIC_ORIGIN', `http://${host}:${port}`),
  ));
  const runtimeMode = readEnv('EDITOR_RUNTIME_MODE', process.platform === 'linux' ? 'native' : 'auto').toLowerCase();
  const defaultWopiHost =
    runtimeMode === 'docker' || (runtimeMode === 'auto' && process.platform !== 'linux')
      ? 'host.docker.internal'
      : host;

  const wopiBaseUrl = normalizeOrigin(readEnv('EDITOR_GATEWAY_WOPI_BASE_URL', `http://${defaultWopiHost}:${port}`));

  const allowedWopiOrigins = parseAllowedWopiOrigins(readEnv(
    'EDITOR_GATEWAY_ALLOWED_WOPI_ORIGINS',
    wopiBaseUrl,
  ));
  const frameAncestorOrigins = parseFrameAncestorOrigins(readEnv(
    'EDITOR_GATEWAY_FRAME_ANCESTORS',
  ));
  // MCP and /api/documents are one server-to-server trust boundary and share one token.
  // WOPI document sessions use documentTokenSecret below and must remain independent.
  const internalBearerToken = readEnv(
    'ACADEMIC_EDITOR_MCP_BEARER_TOKEN',
    readEnv('EDITOR_MCP_BEARER_TOKEN', readEnv('EDITOR_API_BEARER_TOKEN')),
  );

  return {
    host,
    port,
    publicOrigin,
    docxServiceRoot,
    hwpxBasePath,
    imageBasePath,
    docxRuntimeOrigin: normalizeOrigin(
      readEnv('EDITOR_GATEWAY_DOCX_ORIGIN', `http://127.0.0.1:${readEnv('EDITOR_HOST_PORT', '9980')}`),
    ),
    hwpxRuntimeOrigin: normalizeOptionalOrigin(readEnv('EDITOR_GATEWAY_HWPX_ORIGIN', '')),
    hwpxStaticRoot: path.resolve(
      readEnv('EDITOR_GATEWAY_HWPX_STATIC_ROOT', path.join(repoRoot, 'editor_hwpx', 'rhwp-studio', 'dist')),
    ),
    imageStaticRoot: path.resolve(
      readEnv('EDITOR_GATEWAY_IMAGE_STATIC_ROOT', path.join(repoRoot, 'editor_image', 'vendor', 'minipaint')),
    ),
    imageIntegrationRoot: path.resolve(readEnv('EDITOR_GATEWAY_IMAGE_INTEGRATION_ROOT', path.join(repoRoot, 'editor_image'))),
    imageSessionMaxBytes: parsePositiveInteger(readEnv('EDITOR_IMAGE_SESSION_MAX_BYTES', String(25 * 1024 * 1024)), 25 * 1024 * 1024),
    imageSessionTtlMs: parsePositiveInteger(readEnv('EDITOR_IMAGE_SESSION_TTL_MS', String(2 * 60 * 60 * 1000)), 2 * 60 * 60 * 1000),
    wopiBaseUrl,
    sampleDocxPath: path.resolve(readEnv('EDITOR_GATEWAY_SAMPLE_DOCX', DEFAULT_GATEWAY_DOCX)),
    enableSampleDocx: readEnv('EDITOR_GATEWAY_ENABLE_SAMPLE_DOCX', 'false').toLowerCase() === 'true',
    allowedWopiOrigins,
    frameAncestorOrigins,
    mcpPath: normalizeServiceRoot(readEnv('EDITOR_MCP_PATH', '/mcp')) || '/mcp',
    internalBearerToken,
    mcpAllowBytesRef: readEnv('EDITOR_MCP_ALLOW_BYTES_REF', 'false').toLowerCase() === 'true',
    mcpArtifactTtlMs: parsePositiveInteger(readEnv('EDITOR_MCP_ARTIFACT_TTL_MS', '86400000'), 86_400_000),
    apiSessionTtlMs: parsePositiveInteger(readEnv('EDITOR_API_SESSION_TTL_MS', '3600000'), 3_600_000),
    unoPythonBin: readEnv('EDITOR_UNO_PYTHON_BIN', process.platform === 'linux' ? '/opt/collaboraoffice/program/python' : 'python'),
    sofficeBin: readEnv('EDITOR_SOFFICE_BIN', process.platform === 'linux' ? '/opt/collaboraoffice/program/soffice' : 'soffice'),
    docxRenderHelperPath: path.resolve(readEnv('EDITOR_DOCX_RENDER_HELPER', path.join(repoRoot, 'editor_docx', 'scripts', 'render-docx-uno.py'))),
    docxRenderQuality: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_QUALITY', '20'), 20),
    docxRenderMaxSize: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_MAX_SIZE', '1700'), 1700),
    docxRenderConnectTimeoutSeconds: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_CONNECT_TIMEOUT_SECONDS', '20'), 20),
    docxRenderOperationTimeoutSeconds: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_OPERATION_TIMEOUT_SECONDS', '180'), 180),
    docxRenderShutdownTimeoutSeconds: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_SHUTDOWN_TIMEOUT_SECONDS', '10'), 10),
    docxRenderMaxResultBytes: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_MAX_RESULT_BYTES', String(64 * 1024 * 1024)), 64 * 1024 * 1024),
    hwpxPdfDockerImage: readEnv('EDITOR_HWPX_PDF_DOCKER_IMAGE', 'academic-rhwp-pdf:latest'),
    hwpxPdfTimeoutMs: parsePositiveInteger(readEnv('EDITOR_HWPX_PDF_TIMEOUT_MS', '210000'), 210_000),
    hwpxPdfTempRoot: path.resolve(readEnv('EDITOR_HWPX_PDF_TEMP_ROOT', os.tmpdir())),
    documentRoot: path.resolve(readEnv(
      'EDITOR_DOCUMENT_ROOT',
      process.platform === 'linux'
        ? path.join(os.homedir(), '.local', 'share', 'academic-editor', 'documents')
        : path.join(repoRoot, '.build', 'editor-documents'),
    )),
    documentTokenSecret: readEnv(
      'EDITOR_GATEWAY_TOKEN_SECRET',
      isLoopbackHost(host) ? 'local-development-editor-token-secret-change-me' : '',
    ),
    documentTokenTtlMs: parsePositiveInteger(
      readEnv('EDITOR_GATEWAY_TOKEN_TTL_MS', String(DEFAULT_EDITOR_TOKEN_TTL_MS)),
      DEFAULT_EDITOR_TOKEN_TTL_MS,
    ),
    documentMaxFileSize: parsePositiveInteger(readEnv('EDITOR_DOCUMENT_MAX_FILE_SIZE', String(50 * 1024 * 1024)), 50 * 1024 * 1024),
    documentMaxCount: parsePositiveInteger(readEnv('EDITOR_DOCUMENT_MAX_COUNT', '1000'), 1000),
  };
}

async function main() {
  const config = buildConfigFromEnv();
  // Production must fail during startup, not after a user's first edit request.
  // Local loopback development intentionally remains token-optional.
  if (!config.internalBearerToken && !isLoopbackHost(config.host)) {
    throw new Error(
      'ACADEMIC_EDITOR_MCP_BEARER_TOKEN must be configured when the gateway binds beyond loopback.',
    );
  }
  config.documentStore = new EditorDocumentStore({
    root: config.documentRoot,
    tokenSecret: config.documentTokenSecret,
    tokenTtlMs: config.documentTokenTtlMs,
    maxFileSize: config.documentMaxFileSize,
    maxDocuments: config.documentMaxCount,
  });
  await config.documentStore.init();
  if (config.enableSampleDocx) {
    await ensureGatewayDocx(config.sampleDocxPath);
  }
  const server = createGatewayServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`[editor:gateway] ready: ${config.publicOrigin}`);
    console.log(`[editor:gateway] MCP: ${config.publicOrigin}${config.mcpPath}`);
    console.log(`[editor:gateway] DOCX endpoint: ${config.publicOrigin}${config.docxServiceRoot}/edit/{documentId}`);
    console.log(`[editor:gateway] HWPX: ${config.publicOrigin}${config.hwpxBasePath}`);
    console.log(`[editor:gateway] Image Studio: ${config.publicOrigin}${config.imageBasePath}`);
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
  discardApiSessionState,
  extendFrameAncestors,
  isDocxRootPath,
  isDocxRuntimePath,
  isHwpxPath,
  isImagePath,
  normalizeBasePath,
  normalizeServiceRoot,
  main,
  renderDocxPage,
  resolveDocxActionPath,
  sanitizeEditorHtml,
  resolveStaticPath,
};
