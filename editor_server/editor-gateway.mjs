import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { copyFile, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

import { handleEditorMcpJsonRpc } from './editor-mcp.mjs';
import { HWPX_MCP_CONTRACT_VERSION } from './hwpx-mcp-contract.mjs';
import {
  DocxActivityHub,
  activityDescriptor,
  commandDescription,
  commandReviewMode,
} from './docx-activity.mjs';
import { EditorSessionWorkerPool, defaultWorkerCount } from './editor-session-runtime.mjs';
import { analyzeSvgCellClipping, analyzeSvgPageMetrics, svgHasVisibleContent } from './svg-render-evidence.mjs';
import { analyzeHwpxSemanticEvidence, suggestHwpxTemplateRegions } from './hwpx-semantic-evidence.mjs';
import { analyzeHwpxVisualEvidence } from './hwpx-visual-evidence.mjs';
import {
  docxAdapter,
  formatAdapters,
  hwpxAdapter,
  pdfAdapter,
} from './format-adapters/index.mjs';
import { ImageSessionStore } from '../editor_image/image-session-store.mjs';

const EditorDocumentStore = docxAdapter.documentStoreClass;
const DEFAULT_EDITOR_TOKEN_TTL_MS = docxAdapter.defaultDocumentTokenTtlMs;
const DEFAULT_DOCX_UI_LANGUAGE = 'en-US';
const editorOperationContext = new AsyncLocalStorage();

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
const NATIVE_HWP_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp']);
const STATIC_MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
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

function normalizeDocxUiLanguage(value) {
  const normalized = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  if (normalized === 'ko' || normalized.startsWith('ko-')) return 'ko';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en-US';
  return '';
}

function resolveDocxUiLanguage(explicitLanguage, acceptLanguage = '') {
  const explicit = normalizeDocxUiLanguage(explicitLanguage);
  if (explicit) return explicit;
  if (String(explicitLanguage || '').trim()) return DEFAULT_DOCX_UI_LANGUAGE;

  const accepted = String(acceptLanguage || '')
    .split(',')
    .map((entry, index) => {
      const [language, ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
      const quality = qualityParameter ? Number.parseFloat(qualityParameter.split('=')[1]) : 1;
      return { language, quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const entry of accepted) {
    const supported = normalizeDocxUiLanguage(entry.language);
    if (supported) return supported;
  }
  return DEFAULT_DOCX_UI_LANGUAGE;
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

function getDocxActivityDocumentId(pathname, docxServiceRoot) {
  const prefix = `${docxServiceRoot}/activity/`;
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

function isPdfPath(pathname, pdfBasePath) {
  const normalizedBasePath = normalizeBasePath(pdfBasePath || '/pdf/');
  return pathname === normalizedBasePath.slice(0, -1) || pathname.startsWith(normalizedBasePath);
}

function isImagePath(pathname, imageBasePath) {
  const normalizedBasePath = normalizeBasePath(imageBasePath || '/image/');
  return pathname === normalizedBasePath.slice(0, -1) || pathname.startsWith(normalizedBasePath);
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

function renderDocxActivityUi(options = {}) {
  const documentId = String(options.documentId || '');
  const accessToken = String(options.accessToken || '');
  if (!documentId || !accessToken) return '';
  const uiLanguage = resolveDocxUiLanguage(options.uiLanguage);
  const messages = uiLanguage === 'ko'
    ? {
        readOnlyPreview: '읽기 전용 미리보기',
        documentActivity: '문서 활동',
        editingEnabled: '편집 가능',
        dismissActivity: '문서 활동 닫기',
        status: { running: '진행 중', completed: '완료', failed: '실패' },
      }
    : {
        readOnlyPreview: 'Read-only preview',
        documentActivity: 'Document activity',
        editingEnabled: 'Editing enabled',
        dismissActivity: 'Dismiss document activity',
        status: { running: 'running', completed: 'completed', failed: 'failed' },
      };
  const activityUrl = `${options.docxServiceRoot || '/docx'}/activity/${encodeURIComponent(documentId)}?access_token=${encodeURIComponent(accessToken)}`;
  const clientConfig = JSON.stringify({
    activityUrl,
    idleMs: 10_000,
    eventLifetimeMs: 7_000,
    readOnly: options.readOnly === true,
    statusLabels: messages.status,
    readOnlyLabel: messages.readOnlyPreview,
    dismissActivityLabel: messages.dismissActivity,
  }).replace(/</g, '\\u003c');
  return `
  <div id="docx-activity-shell" class="${options.readOnly === true ? 'is-read-only' : ''}" aria-live="polite">
    <button id="docx-readonly-pill" type="button" aria-label="${messages.readOnlyPreview}">
      <span aria-hidden="true">🔒</span><span>Read-only preview</span>
    </button>
    <section id="docx-activity-panel" aria-label="${messages.documentActivity}">
      <header>
        <div>
          <strong>${messages.documentActivity}</strong>
          <span id="docx-activity-mode">${options.readOnly === true ? messages.readOnlyPreview : messages.editingEnabled}</span>
        </div>
        <button id="docx-activity-close" type="button" aria-label="Dismiss document activity">×</button>
      </header>
      <ol id="docx-activity-events"></ol>
    </section>
  </div>
  <style>
    #docx-activity-shell {
      --activity-border: rgba(148, 163, 184, .28);
      --activity-surface: rgba(15, 23, 42, .94);
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483000;
      width: min(360px, calc(100vw - 36px));
      color: #f8fafc;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: none;
    }
    #docx-activity-panel {
      overflow: hidden;
      border: 1px solid var(--activity-border);
      border-radius: 14px;
      background: var(--activity-surface);
      box-shadow: 0 18px 48px rgba(15, 23, 42, .28);
      opacity: 0;
      transform: translateY(14px) scale(.985);
      visibility: hidden;
      transition: opacity 180ms ease, transform 220ms cubic-bezier(.2, .8, .2, 1), visibility 0s linear 220ms;
      backdrop-filter: blur(16px);
      pointer-events: auto;
    }
    #docx-activity-shell.activity-active #docx-activity-panel {
      opacity: 1;
      transform: translateY(0) scale(1);
      visibility: visible;
      transition-delay: 0s;
    }
    #docx-activity-panel header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 14px 11px;
      border-bottom: 1px solid var(--activity-border);
    }
    #docx-activity-panel header div { display: grid; gap: 1px; min-width: 0; }
    #docx-activity-panel header strong { font-size: 13px; font-weight: 650; letter-spacing: .01em; }
    #docx-activity-mode { color: #94a3b8; font-size: 11px; }
    #docx-activity-close {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #cbd5e1;
      font: 22px/1 sans-serif;
      cursor: pointer;
    }
    #docx-activity-close:hover, #docx-activity-close:focus-visible { background: rgba(148, 163, 184, .16); color: #fff; }
    #docx-activity-events { display: grid; gap: 0; max-height: 270px; margin: 0; padding: 7px 0; overflow: hidden; list-style: none; }
    .docx-activity-event {
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr);
      align-items: start;
      gap: 8px;
      min-height: 24px;
      padding: 5px 14px;
      color: #e2e8f0;
      opacity: 1;
      transform: translateY(0);
      transition: opacity 180ms ease, transform 220ms cubic-bezier(.2, .8, .2, 1), max-height 220ms ease, padding 220ms ease;
    }
    .docx-activity-event.entering { opacity: 0; transform: translateY(12px); }
    .docx-activity-event.leaving { max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; transform: translateY(-12px); }
    .docx-activity-icon {
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      color: #cbd5e1;
      font-size: 11px;
    }
    .docx-activity-event[data-status="running"] .docx-activity-icon {
      box-sizing: border-box;
      border: 2px solid rgba(148, 163, 184, .45);
      border-top-color: #60a5fa;
      animation: docx-activity-spin 850ms linear infinite;
    }
    .docx-activity-event[data-status="completed"] .docx-activity-icon { background: rgba(34, 197, 94, .16); color: #86efac; }
    .docx-activity-event[data-status="failed"] .docx-activity-icon { background: rgba(239, 68, 68, .16); color: #fca5a5; }
    .docx-activity-copy { display: grid; min-width: 0; gap: 1px; }
    .docx-activity-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .docx-activity-detail {
      overflow: hidden;
      color: #94a3b8;
      font-size: 11px;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #docx-readonly-pill {
      display: none;
      margin-left: auto;
      align-items: center;
      gap: 7px;
      min-height: 34px;
      padding: 7px 11px;
      border: 1px solid var(--activity-border);
      border-radius: 999px;
      background: var(--activity-surface);
      box-shadow: 0 8px 24px rgba(15, 23, 42, .22);
      color: #e2e8f0;
      font: inherit;
      cursor: pointer;
      pointer-events: auto;
      opacity: 1;
      transform: translateY(0);
      transition: opacity 160ms ease, transform 180ms ease;
    }
    #docx-activity-shell.is-read-only:not(.activity-active) #docx-readonly-pill { display: flex; }
    @keyframes docx-activity-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      #docx-activity-panel, #docx-readonly-pill, .docx-activity-event { transition: none; }
      .docx-activity-event[data-status="running"] .docx-activity-icon { animation-duration: 1.8s; }
    }
  </style>
  <script>
    (() => {
      const config = ${clientConfig};
      const shell = document.getElementById('docx-activity-shell');
      const list = document.getElementById('docx-activity-events');
      const closeButton = document.getElementById('docx-activity-close');
      const readOnlyPill = document.getElementById('docx-readonly-pill');
      readOnlyPill.setAttribute('aria-label', config.readOnlyLabel);
      readOnlyPill.querySelector('span:last-child').textContent = config.readOnlyLabel;
      closeButton.setAttribute('aria-label', config.dismissActivityLabel);
      const rows = new Map();
      const expiryTimers = new Map();
      let currentOperationId = '';
      let dismissedOperationId = '';
      let idleTimer = null;

      const hide = () => shell.classList.remove('activity-active');
      const show = (force = false) => {
        if (!force && currentOperationId && dismissedOperationId === currentOperationId) return;
        shell.classList.add('activity-active');
      };
      const scheduleIdle = (lastActivityAt = Date.now()) => {
        clearTimeout(idleTimer);
        const delay = Math.max(0, config.idleMs - Math.max(0, Date.now() - Number(lastActivityAt || 0)));
        idleTimer = setTimeout(hide, delay);
      };
      const removeRow = (id) => {
        const row = rows.get(id);
        if (!row) return;
        clearTimeout(expiryTimers.get(id));
        expiryTimers.delete(id);
        rows.delete(id);
        row.classList.add('leaving');
        setTimeout(() => {
          row.remove();
          if (!rows.size) hide();
        }, 240);
      };
      const upsert = (event) => {
        if (!event || !event.id || !event.label) return;
        const expiresAt = Number(event.createdAt || 0) + config.eventLifetimeMs;
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          removeRow(event.id);
          return;
        }
        let row = rows.get(event.id);
        if (!row) {
          row = document.createElement('li');
          row.className = 'docx-activity-event entering';
          const icon = document.createElement('span');
          icon.className = 'docx-activity-icon';
          icon.setAttribute('aria-hidden', 'true');
          const label = document.createElement('span');
          label.className = 'docx-activity-label';
          const detail = document.createElement('span');
          detail.className = 'docx-activity-detail';
          const copy = document.createElement('span');
          copy.className = 'docx-activity-copy';
          copy.append(label, detail);
          row.append(icon, copy);
          list.append(row);
          rows.set(event.id, row);
          requestAnimationFrame(() => row.classList.remove('entering'));
        }
        row.dataset.status = event.status;
        row.querySelector('.docx-activity-label').textContent = event.label;
        const detail = row.querySelector('.docx-activity-detail');
        detail.textContent = event.detail || '';
        detail.hidden = !event.detail;
        const icon = row.querySelector('.docx-activity-icon');
        icon.textContent = event.status === 'completed' ? '✓' : event.status === 'failed' ? '!' : '';
        row.setAttribute('aria-label', event.label + ': ' + (config.statusLabels[event.status] || event.status));
        clearTimeout(expiryTimers.get(event.id));
        expiryTimers.set(event.id, setTimeout(() => removeRow(event.id), Math.max(0, expiresAt - Date.now())));
      };
      const resetRows = () => {
        for (const timer of expiryTimers.values()) clearTimeout(timer);
        expiryTimers.clear();
        rows.clear();
        list.replaceChildren();
      };
      const receive = (payload) => {
        if (!payload || !payload.type) return;
        if (payload.operationId && payload.operationId !== currentOperationId) {
          currentOperationId = payload.operationId;
          dismissedOperationId = '';
          resetRows();
        }
        if (payload.type === 'snapshot') {
          for (const event of payload.events || []) upsert(event);
          if (payload.events?.length && Date.now() - Number(payload.lastActivityAt || 0) < config.idleMs) show();
          scheduleIdle(payload.lastActivityAt);
          return;
        }
        if (payload.type === 'activity' && payload.event) {
          upsert(payload.event);
          show();
          scheduleIdle(payload.event.updatedAt);
        }
      };

      closeButton.addEventListener('click', () => {
        dismissedOperationId = currentOperationId;
        hide();
      });
      readOnlyPill.addEventListener('click', () => {
        dismissedOperationId = '';
        show(true);
      });
      const source = new EventSource(config.activityUrl);
      source.onmessage = (message) => {
        try { receive(JSON.parse(message.data)); } catch (_error) { /* Ignore malformed third-party events. */ }
      };
      window.addEventListener('pagehide', () => {
        clearTimeout(idleTimer);
        for (const timer of expiryTimers.values()) clearTimeout(timer);
        source.close();
      }, { once: true });
    })();
  </script>`;
}

function renderDocxPage(editorUrl, formParameters = null, activityOptions = null) {
  const editorLanguage = resolveDocxUiLanguage(new URL(editorUrl, 'http://localhost').searchParams.get('lang'));
  const documentLanguage = editorLanguage === 'ko' ? 'ko' : 'en';
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
<html lang="${documentLanguage}">
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
  <script>document.getElementById('docx-editor-form').submit();</script>${frameBridge}${renderDocxActivityUi(activityOptions || {})}
</body>
</html>`;
  }
  return `<!doctype html>
<html lang="${documentLanguage}">
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

const PDF_BROWSER_SESSION_COOKIE = 'academic_pdf_session';
const PDF_BROWSER_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function requestCookies(req) {
  return Object.fromEntries(String(getHeader(req, 'cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      return separator === -1
        ? [decodeURIComponent(part), '']
        : [decodeURIComponent(part.slice(0, separator)), decodeURIComponent(part.slice(separator + 1))];
    }));
}

function issuePdfBrowserSession(state, config) {
  state.pdfBrowserSessions ??= new Map();
  const now = Date.now();
  for (const [token, lastAccessedAt] of state.pdfBrowserSessions) {
    if (now - lastAccessedAt > PDF_BROWSER_SESSION_TTL_MS) state.pdfBrowserSessions.delete(token);
  }
  while (state.pdfBrowserSessions.size >= 200) {
    state.pdfBrowserSessions.delete(state.pdfBrowserSessions.keys().next().value);
  }
  const token = randomBytes(32).toString('base64url');
  state.pdfBrowserSessions.set(token, now);
  const secure = String(config.publicOrigin || '').startsWith('https:') ? '; Secure' : '';
  return `${PDF_BROWSER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=${normalizeBasePath(config.pdfBasePath || '/pdf/')}; Max-Age=${Math.floor(PDF_BROWSER_SESSION_TTL_MS / 1000)}; HttpOnly; SameSite=Strict${secure}`;
}

function authorizePdfBrowserSession(req, res, config, state) {
  const token = requestCookies(req)[PDF_BROWSER_SESSION_COOKIE];
  const lastAccessedAt = state.pdfBrowserSessions?.get(token);
  const requestOrigin = String(getHeader(req, 'origin') || '');
  const configuredOrigin = new URL(config.publicOrigin).origin;
  const forwardedProtocol = String(getHeader(req, 'x-forwarded-proto') || '').split(',', 1)[0].trim();
  const requestProtocol = forwardedProtocol || new URL(config.publicOrigin).protocol.slice(0, -1);
  const hostOrigin = getHeader(req, 'host') ? `${requestProtocol}://${getHeader(req, 'host')}` : '';
  const sameOrigin = [configuredOrigin, hostOrigin].includes(requestOrigin)
    && String(getHeader(req, 'sec-fetch-site') || 'same-origin') === 'same-origin';
  if (!token || !lastAccessedAt || Date.now() - lastAccessedAt > PDF_BROWSER_SESSION_TTL_MS || !sameOrigin) {
    if (token) state.pdfBrowserSessions?.delete(token);
    sendJson(res, 403, { ok: false, message: 'Open /pdf/ again to create a valid same-origin PDF editing session.' });
    return false;
  }
  state.pdfBrowserSessions.set(token, Date.now());
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
  return /^\/v1\/(?:docx|hwpx|pdf)\//.test(pathname);
}

function isLoopbackHwpxLiveSourceRequest(req, config, pathname) {
  return req.method === 'GET'
    && isLoopbackHost(config.host)
    && /^\/v1\/hwpx\/documents\/[^/]+\/live-source$/.test(pathname);
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

function imageSessionApiMatch(pathname) {
  if (pathname === '/api/image-sessions') return { action: 'collection', sessionId: '' };
  const match = pathname.match(
    /^\/api\/image-sessions\/(img_[0-9a-f-]+)\/([A-Za-z0-9_-]{20,})\/(source|export|download|project|project-download)$/,
  );
  return match ? { action: match[3], sessionId: match[1], token: match[2] } : null;
}

function imageSessionUrls(config, record) {
  const sourcePath = `/api/image-sessions/${record.id}/${record.token}/source`;
  const exportPath = `/api/image-sessions/${record.id}/${record.token}/export`;
  const downloadPath = `/api/image-sessions/${record.id}/${record.token}/download`;
  const projectExportPath = `/api/image-sessions/${record.id}/${record.token}/project`;
  const projectDownloadPath = `/api/image-sessions/${record.id}/${record.token}/project-download`;
  return {
    sourceUrl: `${config.publicOrigin}${sourcePath}`,
    exportUrl: `${config.publicOrigin}${exportPath}`,
    downloadUrl: `${config.publicOrigin}${downloadPath}`,
    projectExportUrl: `${config.publicOrigin}${projectExportPath}`,
    projectDownloadUrl: `${config.publicOrigin}${projectDownloadPath}`,
    editorUrl: `${config.publicOrigin}${config.imageBasePath}?image=${sourcePath}&save=${exportPath}&projectSave=${projectExportPath}`,
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
      const record = store.create({ bytes: Buffer.from(String(body.bytesBase64 || ''), 'base64'), filename: body.filename });
      sendJson(res, 201, { ok: true, sessionId: record.id, filename: record.filename, mimeType: record.sourceMimeType, byteLength: record.sourceBytes.length, expiresAt: record.lastAccessedAt + config.imageSessionTtlMs, ...imageSessionUrls(config, record) });
      return true;
    }
    const record = store.get(route.sessionId, route.token);
    if (!record) { sendJson(res, 404, { ok: false, message: 'Image session was not found or the capability token is invalid.' }); return true; }
    if (route.action === 'source' && req.method === 'GET') { sendImageSessionBytes(res, record.sourceBytes, record.sourceMimeType); return true; }
    if (route.action === 'export' && req.method === 'POST') {
      const body = await readJsonBody(req, Math.ceil(config.imageSessionMaxBytes * 1.4) + 4096);
      const saved = store.save(record.id, record.token, Buffer.from(String(body.bytesBase64 || ''), 'base64'));
      sendJson(res, 200, { ok: true, sessionId: saved.id, mimeType: saved.resultMimeType, byteLength: saved.resultBytes.length, downloadUrl: imageSessionUrls(config, saved).downloadUrl });
      return true;
    }
    if (route.action === 'project' && req.method === 'POST') {
      const projectBytes = await readRequestBody(req, config.imageProjectMaxBytes);
      const saved = store.saveProject(record.id, record.token, projectBytes);
      sendJson(res, 200, {
        ok: true,
        sessionId: saved.id,
        mimeType: saved.projectMimeType,
        byteLength: saved.projectBytes.length,
        downloadUrl: imageSessionUrls(config, saved).projectDownloadUrl,
      });
      return true;
    }
    if (route.action === 'download' && req.method === 'GET') {
      if (!record.resultBytes) { sendJson(res, 409, { ok: false, message: 'The image session has no saved result yet.' }); return true; }
      sendImageSessionBytes(res, record.resultBytes, record.resultMimeType, record.filename.replace(/\.[^.]+$/, '.png'));
      return true;
    }
    if (route.action === 'project-download' && req.method === 'GET') {
      if (!record.projectBytes) {
        sendJson(res, 409, { ok: false, message: 'The image session has no saved editable project yet.' });
        return true;
      }
      sendImageSessionBytes(
        res,
        record.projectBytes,
        record.projectMimeType,
        record.filename.replace(/\.[^.]+$/, '.tlooto-image.json'),
      );
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

async function readApiSourceBytes(fmt, source = {}, config = {}) {
  const sourcePath = source.bytesRef || source.path || source.filePath || source.localPath;
  const storedDocumentId = String(source.storedDocumentId || '').trim();
  const sourceCount = Number(Boolean(source.bytesBase64))
    + Number(Boolean(sourcePath && !String(sourcePath).startsWith('blob://')))
    + Number(Boolean(storedDocumentId));
  if (sourceCount !== 1) {
    const alternatives = fmt === 'docx'
      ? 'source.bytesBase64, a trusted source path, or source.storedDocumentId'
      : 'source.bytesBase64 or a trusted source path';
    throw new Error(`${fmt.toUpperCase()} API open requires exactly one of ${alternatives}.`);
  }
  if (source.bytesBase64) {
    return Buffer.from(String(source.bytesBase64), 'base64');
  }
  if (sourcePath && !String(sourcePath).startsWith('blob://')) {
    return readFile(path.resolve(String(sourcePath)));
  }
  if (storedDocumentId) {
    if (fmt !== 'docx') {
      throw new Error('storedDocumentId is supported only for DOCX documents.');
    }
    if (!config.documentStore) {
      throw new Error('Academic Editor document storage is unavailable.');
    }
    return config.documentStore.read(storedDocumentId);
  }
  throw new Error(`${fmt.toUpperCase()} API open source is invalid.`);
}

async function createApiSession(fmt, documentId, bytes, options, config) {
  if (config.editorSessionRuntime) {
    return config.editorSessionRuntime.open(documentId, fmt, bytes, options);
  }
  const adapter = formatAdapters.get(fmt);
  if (!adapter) throw new Error(`unsupported format: ${fmt}`);
  const session = await adapter.createSession(bytes, options);
  return { session, json: await session.readJson() };
}

function apiStore(state) {
  state.apiDocuments ??= new Map();
  return state.apiDocuments;
}

function discardApiSessionState(state, documentId, options = {}) {
  const store = apiStore(state);
  const record = store.get(documentId);
  const deleted = store.delete(documentId);
  if (record?.session?.close) {
    Promise.resolve(record.session.close()).catch(() => undefined);
  }
  if (options.clearLock !== false) {
    const activeQueue = state.documentOperations?.get(documentId);
    if (!activeQueue?.activeOwner) {
      state.documentOperations?.delete(documentId);
    }
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
    qualityProfile: null,
    qualityVisualPolicy: null,
  };
  record.preconditions.qualityVisualPolicy ??= null;
  return record.preconditions;
}

// Visual-policy objects arrive over JSON, so callers may use a different key
// order while expressing the same policy.  Canonicalize recursively before
// storing the review precondition; this keeps the gate strict without making
// semantically identical requests fail spuriously.
function stableJson(value) {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function visualPolicyKey(policy) {
  return stableJson(policy ?? null);
}

function clearRecordPreconditions(record) {
  const preconditions = recordPreconditions(record);
  preconditions.inspectionRevision = null;
  preconditions.inspectedTargetKeys = new Set();
  preconditions.inventoryRevision = null;
  preconditions.qualityRevision = null;
  preconditions.qualityProfile = null;
  preconditions.qualityVisualPolicy = null;
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

  if ((action === 'save-source' || action === 'prepare-review' || action === 'export-pdf')
    && preconditions.qualityRevision !== baseRevision) {
    throw new EditorContractError(
      'quality_check_required',
      'run a clean quality check at the current revision before finalizing the document.',
    );
  }
  if ((action === 'save-source' || action === 'export-pdf') && record.fmt === 'hwpx') {
    const requiredProfile = body?.profile === 'submission' ? 'submission' : 'structural';
    if (preconditions.qualityProfile !== requiredProfile) {
      throw new EditorContractError(
        'quality_profile_required',
        `run a clean ${requiredProfile} review at the current revision before finalizing the document.`,
        409,
        { requiredProfile, reviewedProfile: preconditions.qualityProfile },
      );
    }
    const requestedVisualPolicy = visualPolicyKey(body?.visualPolicy);
    if (preconditions.qualityVisualPolicy !== requestedVisualPolicy) {
      throw new EditorContractError(
        'quality_visual_policy_required',
        'finalization must use the exact visualPolicy that passed the current-revision review.',
        409,
        {
          reviewedVisualPolicy: preconditions.qualityVisualPolicy,
          requestedVisualPolicy,
        },
      );
    }
  }

  return { baseRevision, commandEntries };
}

function flattenEditableTargets(targetMap = {}) {
  return [
    ...(Array.isArray(targetMap.paragraphs) ? targetMap.paragraphs : []),
    ...(Array.isArray(targetMap.cells) ? targetMap.cells : []),
  ];
}

function pruneExpiredApiSessions(state, ttlMs) {
  const cutoff = Date.now() - Math.max(60_000, Number(ttlMs || 60 * 60 * 1000));
  for (const [id, record] of apiStore(state)) {
    if (Number(record.lastAccessedAt || record.createdAt || 0) < cutoff) {
      discardApiSessionState(state, id);
    }
  }
}

async function pageCountFromSession(session) {
  try {
    return (await session.readJson()).pageCount ?? 1;
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

const MCP_ARTIFACT_EXTENSIONS = new Set(['docx', 'hwp', 'hwpx', 'pdf']);

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
            : extension === 'hwp'
              ? 'application/x-hwp'
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
    .filter((name) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:docx|hwp|hwpx|pdf)$/i.test(name))
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

function emitHwpxLifecycleTrace(event, payload = {}) {
  if (/^(?:0|false|off|no)$/i.test(readEnv('EDITOR_HWPX_TRACE_ENABLED', 'true'))) return;
  const trace = {
    schemaVersion: 'academic-editor-hwpx-lifecycle/v2',
    timestamp: new Date().toISOString(),
    event,
    ...payload,
  };
  const line = JSON.stringify(trace);
  console.log(`[editor:hwpx] ${line}`);
  const traceFile = readEnv('EDITOR_HWPX_TRACE_FILE', '').trim();
  if (traceFile) {
    const resolved = path.resolve(traceFile);
    mkdirSync(path.dirname(resolved), { recursive: true });
    appendFileSync(resolved, `${line}\n`, 'utf8');
  }
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
    throw new EditorContractError('invalid_cursor', 'Pagination cursor length is invalid. Start a new read without cursor.', 422);
  }
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    throw new EditorContractError('invalid_cursor', 'Pagination cursor is malformed. Start a new read without cursor.', 422);
  }
  const expected = createHmac('sha256', mcpPaginationKey(state)).update(parts[1]).digest();
  let supplied;
  try {
    supplied = Buffer.from(parts[2], 'base64url');
  } catch {
    supplied = Buffer.alloc(0);
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new EditorContractError('invalid_cursor', 'Pagination cursor signature is invalid. Start a new read without cursor.', 422);
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new EditorContractError('invalid_cursor', 'Pagination cursor payload is invalid. Start a new read without cursor.', 422);
  }
  if (!decoded || decoded.v !== 1 || typeof decoded.documentId !== 'string' ||
      !Number.isInteger(decoded.revision) || !Number.isInteger(decoded.offset) ||
      decoded.offset < 0 || !decoded.query || typeof decoded.query !== 'object') {
    throw new EditorContractError('invalid_cursor', 'Pagination cursor payload is incomplete. Start a new read without cursor.', 422);
  }
  return decoded;
}

function assertCursorStream(cursor, { documentId, revision, stream }) {
  if (cursor.stream !== stream || cursor.documentId !== documentId) {
    throw new EditorContractError('invalid_cursor', 'Pagination cursor belongs to a different document or stream.', 422);
  }
  if (cursor.revision !== revision) {
    throw new EditorContractError('stale_cursor', `stale_cursor: cursor revision ${cursor.revision} does not match current revision ${revision}. Start a new read without cursor.`, 409);
  }
}

function assertCursorQueryArguments(args, query, keys) {
  for (const key of keys) {
    if (!Object.hasOwn(args, key) || args[key] === undefined || args[key] === null) {
      continue;
    }
    if (JSON.stringify(args[key]) !== JSON.stringify(query[key])) {
      throw new EditorContractError('cursor_query_mismatch', `${key} cannot change while following nextCursor.`, 422);
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
    sectionCount: json.sectionCount ?? json.sections?.length ?? 0,
    paragraphCount: json.paragraphCount ?? (json.sections ?? []).reduce((sum, section) => sum + (section.paragraphs?.length ?? 0), 0),
    blockCount: json.blockCount ?? json.blocks?.length ?? 0,
    tableCount: json.tableCount ?? tables.length,
    referenceCount: json.references?.length ?? 0,
    cellCount: json.cellCount ?? tables.reduce((sum, table) => sum + (table.cells?.length ?? 0), 0),
    styleCount: json.styleGraph?.count ?? json.styleGraph?.styles?.length ?? 0,
    objectCounts: {
      images: json.objectCounts?.images ?? objectGraph.images?.length ?? 0,
      pictures: json.objectCounts?.pictures ?? objectGraph.pictures?.length ?? 0,
      charts: json.objectCounts?.charts ?? objectGraph.charts?.length ?? 0,
      relationships: objectGraph.relationships?.length ?? 0,
      xmlFiles: objectGraph.xmlFiles?.length ?? 0,
      binaryFiles: objectGraph.binaryFiles?.length ?? 0,
    },
    warningCount: json.warningCount ?? rawWarnings.length,
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

async function boundedDocxReadPage(state, documentId, session, args = {}) {
  const json = await session.readJson();
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

async function boundedDocxTargetMapPage(state, documentId, session, args = {}) {
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

  const targetMap = await session.targetMap();
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

async function boundedHwpxOutlinePage(state, documentId, session, args = {}) {
  const revision = Number(session.revision);
  const limit = boundedInteger(args.limit, MCP_TARGET_DEFAULT_LIMIT, 1, MCP_TARGET_MAX_LIMIT, 'limit');
  const kind = args.kind == null ? null : String(args.kind);
  if (kind !== null && !['paragraph', 'cell'].includes(kind)) {
    throw new Error('kind must be paragraph, cell, or null.');
  }
  const tableId = args.tableId == null ? null : String(args.tableId);
  const textPreviewChars = boundedInteger(args.textPreviewChars, 200, 32, 512, 'textPreviewChars');
  let offset = 0;
  if (args.cursor) {
    const cursor = decodeMcpCursor(state, args.cursor);
    assertCursorStream(cursor, { documentId, revision, stream: 'hwpx-outline' });
    assertCursorQueryArguments(args, cursor.query, ['limit', 'kind', 'tableId', 'textPreviewChars']);
    offset = cursor.offset;
  }
  let total;
  let items;
  if (typeof session.outlinePage === 'function') {
    const page = await session.outlinePage({ offset, limit, kind, tableId, textPreviewChars });
    total = page.total;
    items = page.items;
  } else {
    const map = await session.targetMap();
    const ordered = flattenEditableTargets(map)
      .filter((target) => !kind || target.kind === kind)
      .filter((target) => !tableId || target.location?.tableId === tableId)
      .filter((target) => target?.flow)
      .sort((left, right) => (
        Number(left.flow.section || 0) - Number(right.flow.section || 0)
        || Number(left.flow.paragraph || 0) - Number(right.flow.paragraph || 0)
        || Number(left.flow.order || 0) - Number(right.flow.order || 0)
      ));
    const pageTargets = ordered.slice(offset, offset + limit);
    const inspected = pageTargets.length && typeof session.inspectTargets === 'function'
      ? await session.inspectTargets(pageTargets.map((target) => target.location))
      : pageTargets;
    total = ordered.length;
    items = inspected.map((target) => ({
      targetId: target.id,
      kind: target.kind,
      flow: target.flow,
      pageHint: target.pageHint ?? null,
      text: String(target.currentText || '').slice(0, textPreviewChars),
      textLength: target.textLength,
      textTruncated: String(target.currentText || '').length > textPreviewChars,
      styleFingerprint: target.styleFingerprint?.hash ? { hash: target.styleFingerprint.hash } : null,
      layout: target.layout ?? null,
      location: target.location,
    }));
  }
  const nextOffset = offset + items.length;
  const nextCursor = nextOffset < total ? encodeMcpCursor(state, {
    documentId,
    revision,
    stream: 'hwpx-outline',
    query: { limit, kind, tableId, textPreviewChars },
    offset: nextOffset,
  }) : null;
  return {
    ok: true,
    revision,
    view: 'outline',
    kind,
    tableId,
    textPreviewChars,
    total,
    returned: items.length,
    nextCursor,
    items,
  };
}

async function boundedHwpxStyleProfile(state, documentId, session, args = {}) {
  const revision = Number(session.revision);
  const limit = boundedInteger(args.limit, MCP_TARGET_DEFAULT_LIMIT, 1, MCP_TARGET_MAX_LIMIT, 'limit');
  let offset = 0;
  if (args.cursor) {
    const cursor = decodeMcpCursor(state, args.cursor);
    assertCursorStream(cursor, { documentId, revision, stream: 'hwpx-styles' });
    assertCursorQueryArguments(args, cursor.query, ['limit']);
    offset = cursor.offset;
  }
  const page = await session.styleProfile({ offset, limit });
  const nextOffset = offset + page.items.length;
  return {
    ok: true,
    documentId,
    revision,
    view: 'styles',
    total: page.total,
    returned: page.items.length,
    nextCursor: nextOffset < page.total ? encodeMcpCursor(state, {
      documentId,
      revision,
      stream: 'hwpx-styles',
      query: { limit },
      offset: nextOffset,
    }) : null,
    items: page.items,
  };
}

function normalizeCommands(body = {}) {
  return body.commands || body.ops || body.commandBatch || [];
}

function normalizeTemplatePolicy(policy = {}) {
  const uniqueStrings = (value) => [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim()).filter(Boolean))];
  const normalized = {
    protectedLocations: Array.isArray(policy.protectedLocations) ? policy.protectedLocations : [],
    requiredTableIds: uniqueStrings(policy.requiredTableIds),
    removableTableIds: uniqueStrings(policy.removableTableIds),
    requiredImageNames: uniqueStrings(policy.requiredImageNames),
    replaceableImageNames: uniqueStrings(policy.replaceableImageNames),
    requiredLocations: Array.isArray(policy.requiredLocations) ? policy.requiredLocations : [],
    instructionLocations: Array.isArray(policy.instructionLocations) ? policy.instructionLocations : [],
    freeformLocations: Array.isArray(policy.freeformLocations) ? policy.freeformLocations : [],
    allowedUnresolvedLocations: Array.isArray(policy.allowedUnresolvedLocations) ? policy.allowedUnresolvedLocations : [],
    repeatableTableIds: uniqueStrings(policy.repeatableTableIds),
    conditionalTableIds: uniqueStrings(policy.conditionalTableIds),
  };
  const overlappingTables = normalized.requiredTableIds
    .filter(value => normalized.removableTableIds.includes(value));
  const overlappingImages = normalized.requiredImageNames
    .filter(value => normalized.replaceableImageNames.includes(value));
  const tableRoles = [
    ['required', normalized.requiredTableIds],
    ['removable', normalized.removableTableIds],
    ['repeatable', normalized.repeatableTableIds],
    ['conditional', normalized.conditionalTableIds],
  ];
  const conflictingTableRoles = [];
  for (let left = 0; left < tableRoles.length; left += 1) {
    for (let right = left + 1; right < tableRoles.length; right += 1) {
      const overlap = tableRoles[left][1].filter(value => tableRoles[right][1].includes(value));
      if (overlap.length) conflictingTableRoles.push({ roles: [tableRoles[left][0], tableRoles[right][0]], tableIds: overlap });
    }
  }
  const locationRoles = [
    ['protected', normalized.protectedLocations],
    ['required', normalized.requiredLocations],
    ['instruction', normalized.instructionLocations],
    ['freeform', normalized.freeformLocations],
  ].map(([role, locations]) => [role, locations.map(location => hwpxAdapter.stableTargetKey(location)).filter(Boolean)]);
  const conflictingLocationRoles = [];
  for (let left = 0; left < locationRoles.length; left += 1) {
    for (let right = left + 1; right < locationRoles.length; right += 1) {
      const overlap = locationRoles[left][1].filter(value => locationRoles[right][1].includes(value));
      if (overlap.length) conflictingLocationRoles.push({ roles: [locationRoles[left][0], locationRoles[right][0]], locationKeys: overlap });
    }
  }
  if (overlappingTables.length || overlappingImages.length || conflictingTableRoles.length || conflictingLocationRoles.length) {
    throw new EditorContractError(
      'template_policy_conflict',
      'Template items cannot be both required and removable or replaceable.',
      422,
      { overlappingTables, overlappingImages, conflictingTableRoles, conflictingLocationRoles },
    );
  }
  return normalized;
}

function enforceTemplatePolicy(record, commands) {
  const policy = normalizeTemplatePolicy(record.templatePolicy);
  const requiredTables = new Set(policy.requiredTableIds);
  const requiredImages = new Set(policy.requiredImageNames);
  for (const [commandIndex, command] of commands.entries()) {
    const op = String(command?.op ?? '');
    const location = command?.target ?? command?.location;
    if (op === 'table.structure' && command.action === 'deleteTable'
      && requiredTables.has(String(location?.tableId ?? ''))) {
      throw new EditorContractError(
        'template_required_table',
        'A table marked required by the active template policy cannot be deleted.',
        422,
        { commandIndex, tableId: location.tableId },
      );
    }
    if (['image.replace', 'image.generateAndReplace'].includes(op)
      && requiredImages.has(String(command.imageName ?? ''))) {
      throw new EditorContractError(
        'template_required_image',
        'An image marked required by the active template policy cannot be replaced.',
        422,
        { commandIndex, imageName: command.imageName },
      );
    }
  }
  const protectedKeys = new Set(policy.protectedLocations.map((location) => hwpxAdapter.stableTargetKey(location)).filter(Boolean));
  if (!protectedKeys.size) return;
  const attempted = hwpxAdapter.requiredInspectionTargets(commands)
    .map((entry) => ({ ...entry, key: entry.key || hwpxAdapter.stableTargetKey(entry.value) }))
    .filter((entry) => !['source', 'styleSource'].includes(entry.role) && protectedKeys.has(entry.key));
  if (attempted.length) {
    throw new EditorContractError(
      'template_protected_region',
      'The command batch targets a location explicitly protected by the active template policy.',
      422,
      { attempted: attempted.map((entry) => ({ commandIndex: entry.commandIndex, role: entry.role, key: entry.key })) },
    );
  }
}

async function resolveCrossDocumentResources(state, targetDocumentId, commands) {
  const resolved = [];
  const transfers = [];
  const targetRecord = findApiRecord(state, 'hwpx', targetDocumentId);
  for (const command of commands) {
    if (!command?.assetRef && !command?.styleRef) {
      resolved.push(command);
      continue;
    }
    if (command.styleRef) {
      const sourceDocumentId = String(command.styleRef.documentId || '').trim();
      const location = command.styleRef.location;
      const scope = String(command.scope || command.styleRef.scope || '').trim();
      const sourceRecord = findApiRecord(state, 'hwpx', sourceDocumentId);
      if (!sourceRecord || !location || !['character', 'paragraph', 'cell', 'table'].includes(scope)) {
        throw new EditorContractError('style_ref_invalid', 'styleRef requires an open source document, exact location, and supported scope.', 422);
      }
      const [sourceTarget] = await sourceRecord.session.inspectTargets([location]);
      const sourceProperties = scope === 'character'
        ? sourceTarget.characterFormat ?? sourceTarget.style?.text
        : scope === 'paragraph'
          ? sourceTarget.paragraphFormat ?? sourceTarget.style?.paragraph
          : scope === 'cell'
            ? sourceTarget.style?.cell
            : sourceTarget.table?.layout?.properties ?? sourceTarget.table?.style ?? sourceTarget.style?.table;
      if (!sourceProperties || typeof sourceProperties !== 'object') {
        throw new EditorContractError('style_ref_unavailable', `The source target does not expose transferable ${scope} properties.`, 422);
      }
      const portableFields = {
        character: new Set([
          'fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'strikethrough',
          'textColor', 'shadeColor', 'underlineType', 'underlineColor', 'strikeColor',
          'subscript', 'superscript', 'kerning', 'ratios', 'spacings', 'relativeSizes', 'charOffsets',
        ]),
        paragraph: new Set([
          'alignment', 'lineSpacing', 'lineSpacingType', 'indent', 'marginLeft', 'marginRight',
          'spacingBefore', 'spacingAfter', 'headType', 'paraLevel', 'numberingId',
        ]),
        cell: new Set([
          'width', 'height', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
          'verticalAlign', 'textDirection', 'isHeader', 'cellProtect',
        ]),
        table: new Set([
          'treatAsChar', 'wrapText', 'flowWithText', 'allowOverlap', 'anchorType', 'textWrap',
          'zOrder', 'outerLeft', 'outerRight', 'outerTop', 'outerBottom', 'cellSpacing',
          'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'pageBreak', 'repeatHeader',
        ]),
      }[scope];
      const transferableFields = new Set(hwpxAdapter.formatPropertyNames(targetRecord?.sourceFormat, scope)
        .filter((field) => portableFields.has(field)));
      const properties = Object.fromEntries(Object.entries(sourceProperties)
        .filter(([field, value]) => transferableFields.has(field) && value !== undefined && value !== null));
      if (!Object.keys(properties).length) {
        throw new EditorContractError('style_ref_unavailable', `The source target exposes no target-format-safe ${scope} properties.`, 422);
      }
      const { styleRef: _styleRef, ...rest } = command;
      resolved.push({ ...rest, scope, properties });
      transfers.push({
        type: 'style',
        commandId: command.commandId,
        sourceDocumentId,
        targetDocumentId,
        scope,
        sourceLocation: location,
        sourceFingerprint: sourceTarget.styleFingerprint?.hash ?? null,
      });
      continue;
    }
    const sourceDocumentId = String(command.assetRef.documentId || '').trim();
    const imageName = String(command.assetRef.imageName || '').trim();
    if (!sourceDocumentId || !imageName) {
      throw new EditorContractError('asset_ref_invalid', 'assetRef requires documentId and imageName.', 422);
    }
    const sourceRecord = findApiRecord(state, 'hwpx', sourceDocumentId);
    if (!sourceRecord) {
      throw new EditorContractError('asset_source_not_found', 'The source HWP/HWPX session is unavailable.', 404);
    }
    const asset = await sourceRecord.session.readAsset(imageName);
    if (targetRecord?.sourceFormat === 'hwp'
      && command.op === 'image.insertAfterParagraph'
      && !NATIVE_HWP_IMAGE_MIME_TYPES.has(asset.mimeType)) {
      throw new EditorContractError(
        'asset_target_format_unsupported',
        `Native HWP image insertion supports PNG, JPEG, GIF, and BMP; source asset ${imageName} reports ${asset.mimeType || 'an unknown MIME type'}.`,
        422,
        {
          imageName,
          mimeType: asset.mimeType ?? null,
          targetSourceFormat: targetRecord.sourceFormat,
          supportedMimeTypes: [...NATIVE_HWP_IMAGE_MIME_TYPES],
        },
      );
    }
    const { assetRef: _assetRef, ...rest } = command;
    resolved.push({
      ...rest,
      bytesBase64: Buffer.from(asset.bytes).toString('base64'),
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
    });
    transfers.push({
      type: 'asset',
      commandId: command.commandId,
      sourceDocumentId,
      targetDocumentId,
      imageName,
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      mimeType: asset.mimeType,
    });
  }
  return { commands: resolved, transfers };
}

async function renderHwpxSvgPages(session, pages = []) {
  if (typeof session.renderHwpxSvgPages === 'function') {
    return session.renderHwpxSvgPages(pages);
  }
  if (typeof session.doc?.renderPageSvg !== 'function') {
    return [];
  }
  return pages.map((page) => {
    const pageNumber = Math.max(1, Number(page) || 1);
    const svg = session.doc.renderPageSvg(pageNumber - 1);
    return {
      page: pageNumber,
      format: 'svg',
      nonBlank: svgHasVisibleContent(svg),
      layout: { ...analyzeSvgCellClipping(svg), pageMetrics: analyzeSvgPageMetrics(svg) },
      svg,
    };
  });
}

async function renderHwpxBaselinePages(config, documentId, sourceBytes, pages) {
  if (config.editorSessionRuntime) {
    return config.editorSessionRuntime.renderHwpxBytes(`${documentId}:baseline`, sourceBytes, pages);
  }
  const baselineSession = hwpxAdapter.createRawSession(sourceBytes);
  const pageCount = Math.max(1, Number(baselineSession.readJson().pageCount) || 1);
  const requestedPages = pages.map(Number).filter((page) => Number.isFinite(page) && page > 0);
  const availablePages = requestedPages.filter((page) => page <= pageCount);
  return {
    pageCount,
    pages: baselineSession.doc?.renderPageSvg
      ? availablePages.map((page) => {
          const svg = baselineSession.doc.renderPageSvg(Math.max(1, Number(page) || 1) - 1);
          return {
            page,
            format: 'svg',
            nonBlank: svgHasVisibleContent(svg),
            layout: { ...analyzeSvgCellClipping(svg), pageMetrics: analyzeSvgPageMetrics(svg) },
            svg,
          };
        })
      : [],
    unavailablePages: requestedPages.filter((page) => page > pageCount),
  };
}

function resolveRenderedCellTarget(json, provenance) {
  const native = provenance?.native;
  const cellNumber = Number(provenance?.cell?.number);
  if (!native || !Number.isInteger(cellNumber) || cellNumber < 0) return null;
  const table = (json.tables || []).find((candidate) => (
    Number(candidate.section) === Number(native.section)
    && Number(candidate.para) === Number(native.paragraph)
    && Number(candidate.control) === Number(native.control)
  ));
  const cell = table?.cells?.find((candidate) => Number(candidate.cellIndex) === cellNumber);
  if (!table || !cell) return null;
  return {
    targetId: cell.id,
    tableId: table.id,
    location: cell.location,
  };
}

async function qualityWithRenderedLayout(session, options = {}) {
  const quality = await session.qualityCheck(options);
  const json = await session.readJson();
  const semantic = analyzeHwpxSemanticEvidence(json, {
    profile: options.profile,
    templatePolicy: options.templatePolicy,
  });
  const estimateCodes = new Set([
    'cell-overflow-risk',
    'cell-line-overflow-risk',
    'cell-content-clipped',
  ]);
  const estimatedIssues = (quality.issues || []).filter(issue => estimateCodes.has(issue.code));
  const structuralIssues = (quality.issues || []).filter(issue => !estimateCodes.has(issue.code));
  const pageCount = Math.max(1, Number(quality.pageCount || await pageCountFromSession(session) || 1));
  const pages = Array.from({ length: pageCount }, (_value, index) => index + 1);
  const rendered = await renderHwpxSvgPages(session, pages);
  const targetMap = typeof session.targetMap === 'function' ? await session.targetMap() : null;
  const layoutIssues = rendered.flatMap((page) => (page.layout?.issues || []).map((issue) => ({
    severity: 'error',
    code: 'render-cell-clip',
    message: 'Rendered table-cell content extends outside its clip rectangle.',
    page: page.page,
    ...issue,
    ...(resolveRenderedCellTarget(json, issue.provenance) || {}),
  })));
  const blankPageIssues = rendered
    .filter((page) => page.nonBlank !== true)
    .map((page) => ({
      severity: 'warning',
      code: 'render-blank-page',
      message: 'A rendered page contains no visible document content; review it because intentional blank pages are permitted.',
      page: page.page,
    }));
  const readabilityIssues = rendered.flatMap((page) => {
    const metrics = page.layout?.pageMetrics || {};
    const pageIssues = [];
    if (Number.isFinite(metrics.minFontSize) && metrics.minFontSize < 6) {
      pageIssues.push({
        severity: 'warning',
        code: 'render-font-size-suspiciously-small',
        message: 'Rendered text contains a font size below the readability threshold.',
        page: page.page,
        minFontSize: metrics.minFontSize,
      });
    }
    if (Number(metrics.lineCount || 0) > 100) {
      pageIssues.push({
        severity: 'warning',
        code: 'render-page-density-high',
        message: 'Rendered page contains an unusually high number of text baselines.',
        page: page.page,
        lineCount: metrics.lineCount,
      });
    }
    if (metrics.sparseContent === true) {
      pageIssues.push({
        severity: 'warning',
        code: 'render-page-sparse-content',
        message: 'A rendered page contains very little text and no image; inspect pagination and conditional template remnants.',
        page: page.page,
        textCount: metrics.textCount,
        textCharacters: metrics.textCharacters,
        verticalOccupancy: metrics.verticalOccupancy,
      });
    } else if (Number.isFinite(metrics.verticalOccupancy) && metrics.verticalOccupancy < 0.12
      && Number(metrics.textCharacters || 0) < 180) {
      pageIssues.push({
        severity: 'warning',
        code: 'render-page-low-occupancy',
        message: 'Visible content occupies an unusually small vertical span on this page.',
        page: page.page,
        textCharacters: metrics.textCharacters,
        verticalOccupancy: metrics.verticalOccupancy,
      });
    }
    return pageIssues;
  });
  const visual = analyzeHwpxVisualEvidence({
    json,
    targetMap,
    renderedPages: rendered,
    profile: options.profile,
    visualPolicy: options.visualPolicy,
  });
  const issues = [
    ...structuralIssues,
    ...layoutIssues,
    ...blankPageIssues,
    ...readabilityIssues,
    ...semantic.issues,
    ...visual.issues,
  ];
  const result = {
    ...quality,
    ok: quality.ok === true && issues.every((issue) => issue.severity !== 'error'),
    stable: quality.stable !== false && issues.every((issue) => issue.severity !== 'error'),
    issues,
    advisoryEstimates: {
      suppressedBecauseAllPagesRendered: true,
      total: estimatedIssues.length,
      byCode: Object.fromEntries([...estimateCodes].map(code => [
        code,
        estimatedIssues.filter(issue => issue.code === code).length,
      ])),
    },
    renderedLayout: {
      pageCount,
      renderedPageCount: rendered.length,
      clippedCellCount: layoutIssues.length,
      blankPageCount: blankPageIssues.length,
      suspiciousReadabilityCount: readabilityIssues.length,
      pages: rendered.map((page) => ({ page: page.page, ...page.layout?.pageMetrics })),
    },
    semantic,
    visual,
    reviewProfile: semantic.profile,
  };
  if (options.includeRenderedPages === true) result._renderedPages = rendered;
  return result;
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

function countDocxRevisionElements(bytes) {
  return docxAdapter.countRevisionElements(bytes);
}

async function compareDocxBytes(config, candidateBytes, baselineBytes, filename = 'document.docx') {
  const form = new FormData();
  const safeFilename = path.basename(String(filename || 'document.docx')).replace(/[^\w.\- ]/g, '_') || 'document.docx';
  form.append('data', new Blob([candidateBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), safeFilename);
  form.append('compare', new Blob([baselineBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), `baseline-${safeFilename}`);
  form.append('format', 'docx');
  const serviceRoot = String(config.docxServiceRoot || '').replace(/\/$/, '');
  const response = await fetch(`${config.docxRuntimeOrigin}${serviceRoot}/cool/convert-to`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(config.docxRenderOperationTimeoutSeconds * 1000),
  });
  if (!response.ok) {
    throw new Error(`DOCX review comparison failed with HTTP ${response.status}.`);
  }
  const trackedBytes = Buffer.from(await response.arrayBuffer());
  if (trackedBytes.length < 4 || trackedBytes[0] !== 0x50 || trackedBytes[1] !== 0x4b) {
    throw new Error('DOCX review comparison returned a non-DOCX payload.');
  }
  if (trackedBytes.length > config.docxRenderMaxResultBytes) {
    throw new Error('DOCX review comparison exceeded the configured result limit.');
  }
  const revisionElements = config.editorSessionRuntime
    ? await config.editorSessionRuntime.countDocxRevisionElements(`review:${randomUUID()}`, trackedBytes)
    : countDocxRevisionElements(trackedBytes);
  if (!revisionElements.total) {
    throw new Error('DOCX review comparison produced no revision markup.');
  }
  return { trackedBytes, revisionElements };
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

function projectHwpxSvgEvidence(page, includeSvg = false) {
  if (!page || typeof page !== 'object') return page;
  const svg = String(page.svg || '');
  const { svg: _svg, ...rest } = page;
  return {
    ...rest,
    svgByteLength: Buffer.byteLength(svg, 'utf8'),
    svgSha256: sha256(Buffer.from(svg, 'utf8')),
    ...(includeSvg ? { svg } : {}),
  };
}

function compactHwpxReviewPayload(result, includeSvg = false) {
  const compactGroup = (group) => group && typeof group === 'object'
    ? { ...group, pages: Array.isArray(group.pages)
      ? group.pages.map(page => projectHwpxSvgEvidence(page, includeSvg))
      : group.pages }
    : group;
  const render = result?.render;
  if (!render || typeof render !== 'object') return result;
  return {
    ...result,
    render: render.current || render.baseline
      ? { ...render, current: compactGroup(render.current), baseline: compactGroup(render.baseline) }
      : compactGroup(render),
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
    bytes = await readApiSourceBytes(fmt, body.source || {}, config);
  } catch (error) {
    sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
    return true;
  }
  const id = `doc_${randomUUID()}`;
  if (fmt === 'hwpx') {
    emitHwpxLifecycleTrace('open.started', {
      documentId: id,
      filename: path.basename(String(body.filename || `document.${fmt}`)),
      byteLength: bytes.length,
    });
  }
  const { session, json } = await createApiSession(fmt, id, bytes, body, config);
  pruneExpiredApiSessions(state, config.apiSessionTtlMs);
  const now = Date.now();
  const record = {
    id,
    fmt,
    filename: body.filename || `document.${fmt}`,
    sourceBytes: Buffer.from(bytes),
    sourceFormat: String(json.sourceFormat || fmt),
    baselineJson: json,
    templatePolicy: normalizeTemplatePolicy(),
    deletedBaselineTableIds: new Set(),
    reviewChanges: [],
    intentionalSectionLayoutChanges: new Set(),
    session,
    createdAt: now,
    lastAccessedAt: now,
  };
  apiStore(state).set(id, record);
  if (fmt === 'hwpx') {
    emitHwpxLifecycleTrace('open.completed', {
      documentId: id,
      revision: session.revision,
      sourceFormat: record.sourceFormat,
      pageCount: json.pageCount,
      paragraphCount: record.baselineJson?.paragraphCount,
      tableCount: record.baselineJson?.tableCount,
      cellCount: record.baselineJson?.cellCount,
      objectCounts: record.baselineJson?.objectCounts,
    });
  }
  const issued = fmt === 'docx' && config.documentStore
    ? config.documentStore.issueToken(id, { canWrite: false })
    : null;
  const hwpxLiveSourcePath = fmt === 'hwpx'
    ? `/v1/hwpx/documents/${id}/live-source`
    : null;
  sendJson(res, 200, {
    ok: true,
    documentId: id,
    sessionId: id,
    fmt,
    revision: session.revision,
    pageCount: json.pageCount ?? await pageCountFromSession(session),
    ...(json.pageCountEstimate !== undefined ? { pageCountEstimate: json.pageCountEstimate } : {}),
    ...(json.pageCountSource ? { pageCountSource: json.pageCountSource } : {}),
    ...(json.pageCountIsEstimate !== undefined ? { pageCountIsEstimate: Boolean(json.pageCountIsEstimate) } : {}),
    capabilities: [...new Set([
      ...(fmt === 'hwpx'
        ? ['inspect', 'edit', 'review', 'save']
        : ['json', 'targetMap', 'targetInspect', 'objectInventory', 'commandCatalog', 'commands']),
      'save',
      'quality',
      'renderPage',
      'renderAll',
      'renderCompare',
      'exportPdf',
    ])],
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
    } : hwpxLiveSourcePath ? {
      liveEditorSession: {
        documentId: id,
        sourcePath: hwpxLiveSourcePath,
        expiresAt: now + config.apiSessionTtlMs,
        readOnly: true,
      },
    } : {}),
  });
  return true;
}

async function handleEditorApiAction(req, res, config, state, fmt, id, actionPath) {
  const record = findApiRecord(state, fmt, id);
  if (!record) {
    sendJson(res, 404, { ok: false, message: 'Document session not found.' });
    return true;
  }
  record.lastAccessedAt = Date.now();
  if (fmt === 'hwpx' && actionPath === 'live-source' && req.method === 'GET') {
    const saved = await record.session.save();
    const bytes = Buffer.from(saved.bytes || saved);
    res.writeHead(200, {
      'Content-Type': record.sourceFormat === 'hwp' ? 'application/x-hwp' : 'application/vnd.hancom.hwpx',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    });
    res.end(bytes);
    return true;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Method not allowed. Use POST.' }, { Allow: 'POST' });
    return true;
  }
  const body = await readJsonBody(req);
  const { session } = record;

  if (fmt === 'hwpx' && !new Set(['inspect', 'edit', 'review', 'save', 'export-pdf', 'discard']).has(actionPath)) {
    sendJson(res, 404, {
      ok: false,
      code: 'legacy_hwpx_route_removed',
      message: 'Use the canonical HWPX actions: inspect, edit, review, save, export-pdf, or discard.',
    });
    return true;
  }

  if (fmt === 'hwpx' && actionPath === 'inspect') {
    const view = String(body.view || 'summary');
    emitHwpxLifecycleTrace('inspect.started', { documentId: id, revision: session.revision, view });
    if (body.baseRevision !== undefined) assertCurrentRevision({ revision: session.revision }, Number(body.baseRevision));
    if (view === 'summary') {
      const result = await boundedDocxReadPage(state, id, session, {
        ...body,
        responseMode: MCP_BOUNDED_RESPONSE_MODE,
        view: 'summary',
      });
      emitHwpxLifecycleTrace('inspect.completed', { documentId: id, revision: session.revision, view });
      sendJson(res, 200, result);
      return true;
    }
    if (view === 'outline' || view === 'targets') {
      const result = await boundedHwpxOutlinePage(state, id, session, body);
      emitHwpxLifecycleTrace('inspect.completed', { documentId: id, revision: session.revision, view, returned: result.returned, total: result.total });
      sendJson(res, 200, result);
      return true;
    }
    if (view === 'styles') {
      const result = await boundedHwpxStyleProfile(state, id, session, body);
      emitHwpxLifecycleTrace('inspect.completed', { documentId: id, revision: session.revision, view, returned: result.returned, total: result.total });
      sendJson(res, 200, result);
      return true;
    }
    if (view === 'target') {
      const locations = body.locations || (body.location ? [body.location] : []);
      if (!locations.length && body.query) {
        const target = await session.resolveText(body.query, body.match || {});
        emitHwpxLifecycleTrace('inspect.completed', { documentId: id, revision: session.revision, view, targetCount: 1, queryResolved: true });
        sendJson(res, 200, { target, ambiguous: false });
        return true;
      }
      if (!locations.length) throw new EditorContractError('inspection_target_required', 'inspect view=target requires locations or query.', 422);
      const targets = await session.inspectTargets(locations);
      const inspectedTargetKeys = targets.map((target) => hwpxAdapter.stableTargetKey(target.location));
      if (inspectedTargetKeys.some((key) => !key)) {
        throw new EditorContractError('unstable_inspection_target', 'target inspection returned an unstable target.', 422);
      }
      const preconditions = recordPreconditions(record);
      if (preconditions.inspectionRevision !== session.revision) preconditions.inspectedTargetKeys = new Set();
      preconditions.inspectionRevision = session.revision;
      inspectedTargetKeys.forEach((key) => preconditions.inspectedTargetKeys.add(key));
      emitHwpxLifecycleTrace('inspect.completed', { documentId: id, revision: session.revision, view, targetCount: targets.length });
      sendJson(res, 200, { revision: session.revision, targets, inspectedTargetKeys: [...preconditions.inspectedTargetKeys] });
      return true;
    }
    if (view === 'objects') {
      const inventory = await session.objectInventory();
      recordPreconditions(record).inventoryRevision = session.revision;
      emitHwpxLifecycleTrace('inspect.completed', {
        documentId: id,
        revision: session.revision,
        view,
        imageCount: inventory.images?.length || 0,
        pictureCount: inventory.pictures?.length || 0,
      });
      sendJson(res, 200, { revision: session.revision, ...inventory });
      return true;
    }
    if (view === 'template') {
      const json = await session.readJson();
      const policy = normalizeTemplatePolicy(record.templatePolicy);
      const requiredTables = new Set(policy.requiredTableIds);
      const removableTables = new Set(policy.removableTableIds);
      const requiredImages = new Set(policy.requiredImageNames);
      const replaceableImages = new Set(policy.replaceableImageNames);
      const repeatableTables = new Set(policy.repeatableTableIds);
      const conditionalTables = new Set(policy.conditionalTableIds);
      const suggestedRegions = suggestHwpxTemplateRegions(json, policy);
      sendJson(res, 200, {
        revision: session.revision,
        policy,
        deletedBaselineTableIds: [...record.deletedBaselineTableIds],
        policySource: 'caller-explicit',
        unclassifiedBehavior: 'review-warning',
        fields: json.fields || [],
        tables: (json.tables || []).map((table) => ({
          id: table.id,
          dims: table.dims,
          location: table.location ?? table.native,
          classification: requiredTables.has(table.id) ? 'required'
            : removableTables.has(table.id) ? 'removable'
              : repeatableTables.has(table.id) ? 'repeatable'
                : conditionalTables.has(table.id) ? 'conditional'
              : 'unclassified',
        })),
        images: (json.objectGraph?.images || []).map((image) => ({
          name: image.name,
          mimeType: image.mimeType,
          byteLength: image.byteLength,
          sha256: image.sha256,
          classification: requiredImages.has(image.name) ? 'required'
            : replaceableImages.has(image.name) ? 'replaceable'
              : 'unclassified',
        })),
        suggestedRegions,
        suggestionPolicy: 'advisory-only; explicit templatePolicy remains authoritative',
        warning: 'Unclassified regions are never silently protected or removed. Review suggestedRegions and submit an explicit templatePolicy.',
      });
      return true;
    }
    if (view === 'page') {
      const page = Math.max(1, Number(body.page || 1));
      const pageCount = await pageCountFromSession(session);
      if (page > pageCount) throw new EditorContractError('page_out_of_range', `Page ${page} exceeds page count ${pageCount}.`, 422);
      const rendered = await renderHwpxSvgPages(session, [page]);
      const returnLimit = Math.min(120, Number(body.limit || 60));
      const pageTargets = [];
      let offset = 0;
      let total = 0;
      do {
        const outlinePage = await session.outlinePage({ kind: body.kind, offset, limit: 120, textPreviewChars: body.textPreviewChars });
        total = Number(outlinePage.total || 0);
        pageTargets.push(...(outlinePage.items || []).filter((target) => Number(target.pageHint) === page));
        offset += (outlinePage.items || []).length;
        if (!(outlinePage.items || []).length) break;
      } while (offset < total);
      sendJson(res, 200, {
        revision: session.revision,
        page,
        pageCount,
        render: rendered[0] || null,
        targets: pageTargets.slice(0, returnLimit),
        targetCoverage: {
          scannedDocumentTargets: total,
          matchedPageTargets: pageTargets.length,
          returnedPageTargets: Math.min(returnLimit, pageTargets.length),
          truncated: pageTargets.length > returnLimit,
        },
      });
      return true;
    }
    if (view === 'catalog') {
      const catalog = hwpxAdapter.commandCatalog({
        category: body.category,
        op: body.op,
        sourceFormat: record.sourceFormat,
      });
      emitHwpxLifecycleTrace('inspect.completed', { documentId: id, revision: session.revision, view, commandCount: catalog.commandCount });
      sendJson(res, 200, catalog);
      return true;
    }
    if (view === 'quality') {
      const quality = await qualityWithRenderedLayout(session, {
        baselineJson: record.baselineJson,
        templatePolicy: record.templatePolicy,
        deletedTableIds: [...record.deletedBaselineTableIds],
        profile: body.profile,
        visualPolicy: body.visualPolicy,
      });
      emitHwpxLifecycleTrace('inspect.completed', { documentId: id, revision: session.revision, view, ok: quality.ok, issueCount: quality.issues?.length || 0 });
      sendJson(res, 200, quality);
      return true;
    }
    throw new EditorContractError('unsupported_inspection_view', `Unsupported HWPX inspection view: ${view}.`, 422);
  }
  if (fmt === 'hwpx' && actionPath === 'edit') actionPath = 'commands/apply';
  if (fmt === 'hwpx' && actionPath === 'export-pdf') actionPath = 'documents/export-pdf';
  if (fmt === 'hwpx' && actionPath === 'save') {
    actionPath = body.mode === 'checkpoint' ? 'documents/save-checkpoint' : 'documents/save-source';
  }
  if (fmt === 'hwpx' && actionPath === 'review') {
    const baseRevision = requireBaseRevision(record, body);
    emitHwpxLifecycleTrace('review.started', {
      documentId: id,
      revision: baseRevision,
      requestedPageCount: Array.isArray(body.pages) && body.pages.length ? body.pages.length : 'all',
    });
    const qualityResult = await qualityWithRenderedLayout(session, {
      baselineJson: record.baselineJson,
      templatePolicy: record.templatePolicy,
      deletedTableIds: [...record.deletedBaselineTableIds],
      includeRenderedPages: true,
      profile: body.profile,
      visualPolicy: body.visualPolicy,
    });
    const { _renderedPages: allRenderedPages = [], ...quality } = qualityResult;
    const reviewPassed = qualityAllowsFinalization(quality, 'hwpx');
    recordPreconditions(record).qualityRevision = reviewPassed ? baseRevision : null;
    recordPreconditions(record).qualityProfile = reviewPassed ? quality.reviewProfile : null;
    recordPreconditions(record).qualityVisualPolicy = reviewPassed
      ? visualPolicyKey(body.visualPolicy)
      : null;
    const pageCount = Math.max(1, Number(quality.pageCount || 1));
    const requestedPages = Array.isArray(body.pages) && body.pages.length
      ? body.pages.map(Number)
      : Array.from({ length: pageCount }, (_value, index) => index + 1);
    const pages = requestedPages.filter((page) => Number.isFinite(page) && page > 0 && page <= pageCount);
    const unavailablePages = requestedPages.filter((page) => !pages.includes(page));
    const currentPages = allRenderedPages.filter((page) => pages.includes(page.page));
    const render = body.includeBaseline === true
      ? {
          baseline: await renderHwpxBaselinePages(config, id, record.sourceBytes, pages),
          current: {
            revision: session.revision,
            pageCount,
            pages: currentPages,
            unavailablePages,
          },
          visualComparisonRequired: true,
        }
      : { renderer: 'rhwp-svg', pages: currentPages, unavailablePages };
    emitHwpxLifecycleTrace('review.completed', {
      documentId: id,
      revision: baseRevision,
      ok: reviewPassed,
      profile: quality.reviewProfile,
      pageCount,
      reviewedPageCount: pages.length,
      errorCount: quality.issues?.filter((issue) => issue.severity === 'error').length || 0,
      warningCount: quality.issues?.filter((issue) => issue.severity === 'warning').length || 0,
      clippedCellCount: quality.renderedLayout?.clippedCellCount || 0,
    });
    sendJson(res, 200, {
      ok: qualityAllowsFinalization(quality, 'hwpx'),
      revision: baseRevision,
      quality,
      render,
      reviewedPages: pages,
      unavailablePages,
    });
    return true;
  }

  if (actionPath === 'documents/discard' || actionPath === 'discard') {
    assertMutationPreconditions(record, 'discard', body);
    const deleted = discardApiSessionState(state, id);
    if (fmt === 'hwpx') emitHwpxLifecycleTrace('discard.completed', { documentId: id, revision: body.baseRevision, deleted });
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
      sendJson(res, 200, await boundedDocxReadPage(state, id, session, body));
      return true;
    }
    sendJson(res, 200, await session.readJson());
    return true;
  }
  if (actionPath === 'target/map' || actionPath === 'targets/map') {
    if (body.responseMode === MCP_BOUNDED_RESPONSE_MODE) {
      sendJson(res, 200, await boundedDocxTargetMapPage(state, id, session, body));
      return true;
    }
    const targetMap = await session.targetMap();
    sendJson(res, 200, { editableTargets: targetMap, locations: targetMap });
    return true;
  }
  if (actionPath === 'target/inspect' || actionPath === 'targets/inspect') {
    const locations = body.locations || (body.location ? [body.location] : []);
    const targets = typeof session.inspectTargets === 'function'
      ? await session.inspectTargets(locations)
      : locations.map((location) => session.inspectTarget(location));
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
    sendJson(res, 200, { target: await session.resolveText(query, body.match || {}), ambiguous: false });
    return true;
  }
  if (actionPath === 'object/inventory' || actionPath === 'objects/inventory') {
    const inventory = await session.objectInventory();
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
    let commands = normalizeCommands(body);
    if (!Array.isArray(commands)) {
      sendJson(res, 400, { ok: false, message: 'commands/apply requires commands or ops array.' });
      return true;
    }
    let resourceTransfers = [];
    if (fmt === 'hwpx' && commands.some((command) => command?.assetRef || command?.styleRef)) {
      const resolvedResources = await resolveCrossDocumentResources(state, id, commands);
      commands = resolvedResources.commands;
      resourceTransfers = resolvedResources.transfers;
    }
    assertMutationPreconditions(record, 'apply', body, commands);
    const previousRevision = session.revision;
    const previousTemplatePolicy = normalizeTemplatePolicy(record.templatePolicy);
    let proposedTemplatePolicy = previousTemplatePolicy;
    if (fmt === 'hwpx') {
      proposedTemplatePolicy = body.templatePolicy !== undefined
        ? normalizeTemplatePolicy(body.templatePolicy)
        : previousTemplatePolicy;
      enforceTemplatePolicy({ ...record, templatePolicy: proposedTemplatePolicy }, commands);
    }
    if (fmt === 'hwpx') emitHwpxLifecycleTrace('edit.started', {
      documentId: id,
      revision: session.revision,
      commandCount: commands.length,
      commands: commands.map((command) => ({ commandId: command.commandId, op: command.op })),
    });
    let result;
    try {
      result = await session.apply(commands);
    } catch (error) {
      if (fmt === 'hwpx') emitHwpxLifecycleTrace('edit.failed', {
        documentId: id,
        revision: session.revision,
        commandCount: commands.length,
        code: error?.code || 'editor_error',
        message: error instanceof Error ? error.message : String(error),
      });
      if (error?.code === 'FIT_TEXT_LOSS_NOT_AUTHORIZED') {
        throw new EditorContractError(
          'text_loss_not_authorized',
          error instanceof Error ? error.message : String(error),
          422,
        );
      }
      if (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.code)) {
        throw new EditorContractError(
          error.code,
          error instanceof Error ? error.message : String(error),
          422,
          error.details,
        );
      }
      throw error;
    }
    if (fmt === 'hwpx') record.templatePolicy = proposedTemplatePolicy;
    for (const command of commands) {
      if (fmt === 'hwpx' && command?.op === 'table.structure' && command.action === 'deleteTable') {
        const tableId = String((command.target ?? command.location)?.tableId ?? '');
        if (tableId) record.deletedBaselineTableIds.add(tableId);
      }
      if (String(command?.op ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase() === 'setpagesetup') {
        record.intentionalSectionLayoutChanges.add(command.section === 'all' ? 'all' : Number(command.section ?? 0));
      }
      if (fmt === 'docx') {
        record.reviewChanges.push({
          description: commandDescription(command),
          reviewMode: commandReviewMode(command),
        });
      }
    }
    if (session.revision !== previousRevision) {
      clearRecordPreconditions(record);
    } else if (JSON.stringify(previousTemplatePolicy) !== JSON.stringify(proposedTemplatePolicy)) {
      recordPreconditions(record).qualityRevision = null;
    }
    if (fmt === 'hwpx') emitHwpxLifecycleTrace('edit.completed', {
      documentId: id,
      previousRevision: body.baseRevision,
      revision: result.revision,
      commandCount: commands.length,
    });
    sendJson(res, 200, { ...result, resourceTransfers, warnings: [] });
    return true;
  }
  if (actionPath === 'documents/save-source' || actionPath === 'save'
    || actionPath === 'documents/save-checkpoint') {
    const checkpoint = actionPath === 'documents/save-checkpoint';
    assertMutationPreconditions(record, checkpoint ? 'save-checkpoint' : 'save-source', body);
    if (fmt === 'hwpx') emitHwpxLifecycleTrace('save.started', { documentId: id, revision: session.revision, checkpoint, sourceFormat: record.sourceFormat });
    const saved = await session.save();
    let reopen = null;
    if (fmt === 'hwpx' && !checkpoint) {
      const verifier = await hwpxAdapter.createSession(saved.bytes);
      const verification = await qualityWithRenderedLayout(verifier, {
        baselineJson: record.baselineJson,
        templatePolicy: record.templatePolicy,
        deletedTableIds: [...record.deletedBaselineTableIds],
        profile: body.profile,
        visualPolicy: body.visualPolicy,
      });
      if (!qualityAllowsFinalization(verification, 'hwpx')) {
        throw new EditorContractError(
          'saved_document_verification_failed',
          'The saved HWP/HWPX failed quality or rendered-layout verification after reopening.',
          422,
          { verification },
        );
      }
      if (String(verification.sourceFormat || saved.validation?.sourceFormat || '') !== String(record.sourceFormat || '')) {
        throw new EditorContractError(
          'saved_document_format_changed',
          'Verified save changed the source document format unexpectedly.',
          422,
          { sourceFormat: record.sourceFormat, savedFormat: saved.validation?.sourceFormat },
        );
      }
      reopen = {
        ok: true,
        sourceFormat: saved.validation?.sourceFormat,
        pageCount: verification.pageCount,
        renderedPageCount: verification.renderedLayout?.renderedPageCount,
        clippedCellCount: verification.renderedLayout?.clippedCellCount,
        sha256: sha256(saved.bytes),
      };
    }
    const outputPath = body.outputPath ? path.resolve(String(body.outputPath)) : bytesRefForSavedDocument(config, body.filename || record.filename);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, saved.bytes);
    if (fmt === 'hwpx') emitHwpxLifecycleTrace('save.completed', {
      documentId: id,
      revision: saved.revision,
      checkpoint,
      sourceFormat: saved.validation?.sourceFormat,
      pageCount: saved.validation?.pageCount,
      byteLength: saved.bytes.length,
      sha256: sha256(saved.bytes),
      reopen,
    });
    sendJson(res, 200, {
      ok: true,
      revision: saved.revision,
      bytesRef: outputPath,
      byteLength: saved.bytes.length,
      sha256: sha256(saved.bytes),
      ...(fmt === 'docx' ? { visibleTextHash: sha256(Buffer.from(docxAdapter.visibleText(saved.bytes), 'utf8')) } : {}),
      validation: saved.validation,
      ...(reopen ? { reopen } : {}),
      reviewProfile: checkpoint ? null : recordPreconditions(record).qualityProfile,
      checkpoint,
      verified: !checkpoint,
    });
    return true;
  }
  if (fmt === 'docx' && actionPath === 'documents/prepare-review') {
    assertMutationPreconditions(record, 'prepare-review', body);
    const saved = await session.save();
    const { trackedBytes, revisionElements } = await compareDocxBytes(
      config,
      saved.bytes,
      record.sourceBytes,
      body.filename || record.filename,
    );
    const candidateOutputPathValue = String(body.candidateOutputPath || '').trim();
    const reviewOutputPathValue = String(body.reviewOutputPath || '').trim();
    if (!candidateOutputPathValue || !reviewOutputPathValue) {
      throw new EditorContractError(
        'review_output_required',
        'candidateOutputPath and reviewOutputPath are required.',
        400,
      );
    }
    const candidateOutputPath = path.resolve(candidateOutputPathValue);
    const reviewOutputPath = path.resolve(reviewOutputPathValue);
    mkdirSync(path.dirname(candidateOutputPath), { recursive: true });
    mkdirSync(path.dirname(reviewOutputPath), { recursive: true });
    await writeFile(candidateOutputPath, saved.bytes);
    await writeFile(reviewOutputPath, trackedBytes);
    const changes = record.reviewChanges.slice(0, 200);
    sendJson(res, 200, {
      ok: true,
      revision: saved.revision,
      candidate: {
        bytesRef: candidateOutputPath,
        sha256: sha256(saved.bytes),
        byteLength: saved.bytes.length,
      },
      review: {
        bytesRef: reviewOutputPath,
        sha256: sha256(trackedBytes),
        byteLength: trackedBytes.length,
        revisionElements,
      },
      changes,
      truncatedChanges: record.reviewChanges.length > changes.length,
      reviewPolicy: {
        textChanges: 'docx-redline',
        packageChanges: 'snapshot-rollback',
        approve: 'commit-candidate-snapshot',
        reject: 'restore-question-start-snapshot',
      },
      verified: true,
    });
    return true;
  }
  if (actionPath === 'documents/save-buffer') {
    assertMutationPreconditions(record, 'save-source', body);
    const saved = await session.save();
    sendJson(res, 200, {
      ok: true,
      revision: saved.revision,
      filename: path.basename(String(body.filename || record.filename || `edited.${fmt}`)),
      mimeType: fmt === 'pdf' ? 'application/pdf' : 'application/octet-stream',
      bytesBase64: saved.bytes.toString('base64'),
      byteLength: saved.bytes.length,
      sha256: sha256(saved.bytes),
      validation: saved.validation,
      verified: true,
    });
    return true;
  }
  if (actionPath === 'quality/check' || actionPath === 'health/check') {
    const { baseRevision } = assertMutationPreconditions(record, 'quality-check', body);
    const quality = fmt === 'hwpx' ? await qualityWithRenderedLayout(session, {
      baselineJson: record.baselineJson,
      templatePolicy: record.templatePolicy,
      deletedTableIds: [...record.deletedBaselineTableIds],
      allowedSectionLayoutChanges: [...record.intentionalSectionLayoutChanges],
      profile: body.profile,
      visualPolicy: body.visualPolicy,
    }) : await session.qualityCheck({
      baselineJson: record.baselineJson,
      allowedSectionLayoutChanges: [...record.intentionalSectionLayoutChanges],
    });
    const qualityPassed = qualityAllowsFinalization(quality, fmt);
    recordPreconditions(record).qualityRevision = qualityPassed ? baseRevision : null;
    recordPreconditions(record).qualityProfile = qualityPassed && fmt === 'hwpx'
      ? quality.reviewProfile
      : null;
    recordPreconditions(record).qualityVisualPolicy = qualityPassed && fmt === 'hwpx'
      ? visualPolicyKey(body.visualPolicy)
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
      const pages = await renderHwpxSvgPages(session, [pageNumber]);
      sendJson(res, 200, { page: pages[0], pages, renderer: 'rhwp-svg' });
      return true;
    }
    if (fmt === 'pdf') {
      const saved = await session.save();
      const rendered = await (config.pdfRenderer || pdfAdapter.renderPages)(saved.bytes, { pages: [pageNumber] });
      const response = publicRenderedPages(rendered, session.revision);
      sendJson(res, 200, { ...response, page: response.pages[0] });
      return true;
    }
    const rendered = await renderDocxBytes(config, (await session.save()).bytes, [pageNumber]);
    const response = publicRenderedPages(rendered, session.revision);
    sendJson(res, 200, { ...response, page: response.pages[0] });
    return true;
  }
  if (actionPath === 'pages/render-all' || actionPath === 'export' && body.type === 'pages-image') {
    const pageCount = await pageCountFromSession(session);
    const pages = renderPageSelection(body, 'all');
    if (fmt === 'hwpx') {
      const hwpxPages = pages === 'all'
        ? Array.from({ length: pageCount }, (_value, index) => index + 1)
        : pages;
      sendJson(res, 200, { pages: await renderHwpxSvgPages(session, hwpxPages), renderer: 'rhwp-svg' });
      return true;
    }
    if (fmt === 'pdf') {
      const saved = await session.save();
      const rendered = await (config.pdfRenderer || pdfAdapter.renderPages)(saved.bytes, { pages });
      sendJson(res, 200, publicRenderedPages(rendered, session.revision));
      return true;
    }
    const rendered = await renderDocxBytes(config, (await session.save()).bytes, pages);
    sendJson(res, 200, publicRenderedPages(rendered, session.revision));
    return true;
  }
  if (actionPath === 'quality/render-compare') {
    const quality = fmt === 'hwpx' ? await qualityWithRenderedLayout(session, {
      baselineJson: record.baselineJson,
      templatePolicy: record.templatePolicy,
      deletedTableIds: [...record.deletedBaselineTableIds],
      allowedSectionLayoutChanges: [...record.intentionalSectionLayoutChanges],
    }) : await session.qualityCheck({
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
    if (fmt === 'pdf') {
      const pages = renderPageSelection(body, 'first');
      const baselineRendered = await (config.pdfRenderer || pdfAdapter.renderPages)(record.sourceBytes, { pages });
      const currentSaved = await session.save();
      const currentRendered = await (config.pdfRenderer || pdfAdapter.renderPages)(currentSaved.bytes, { pages });
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
    const pageCount = await pageCountFromSession(session);
    const pages = normalizePageRange(body, pageCount);
    const baseline = config.editorSessionRuntime
      ? await config.editorSessionRuntime.renderHwpxBytes(`${id}:baseline`, record.sourceBytes, pages)
      : (() => {
          const baselineSession = hwpxAdapter.createRawSession(record.sourceBytes);
          return {
            pageCount: baselineSession.readJson().pageCount ?? 1,
            pages: baselineSession.doc?.renderPageSvg
              ? pages.map((page) => {
                  const svg = baselineSession.doc.renderPageSvg(Math.max(1, Number(page) || 1) - 1);
                  return { page, format: 'svg', nonBlank: String(svg || '').length > 80, svg };
                })
              : [],
          };
        })();
    sendJson(res, 200, {
      ok: quality.ok,
      revision: session.revision,
      baseline: {
        revision: 1,
        pageCount: baseline.pageCount,
        pages: baseline.pages,
      },
      current: {
        revision: session.revision,
        pageCount,
        pages: await renderHwpxSvgPages(session, pages),
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
        command: config.hwpxPdfCommand,
        dockerImage: config.hwpxPdfDockerImage,
        timeoutMs: config.hwpxPdfTimeoutMs,
        tempRoot: config.hwpxPdfTempRoot,
      })
      : fmt === 'pdf'
        ? await (config.pdfRenderer || pdfAdapter.renderPages)(sourceBytes, { pages: 'none' })
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
  const openMatch = pathname.match(/^\/v1\/(docx|hwpx|pdf)\/(?:documents\/open|sessions)$/);
  if (openMatch) {
    return handleEditorApiOpen(req, res, config, state, openMatch[1]);
  }
  const collectionMatch = pathname.match(/^\/v1\/(docx|hwpx|pdf)\/(?:documents|sessions)$/);
  if (collectionMatch) {
    sendJson(res, 405, { ok: false, message: 'Method not allowed. Use POST to open a document.' }, { Allow: 'POST' });
    return true;
  }
  const documentMatch = pathname.match(/^\/v1\/(docx|hwpx|pdf)\/documents\/([^/]+)\/(.+)$/);
  if (documentMatch) {
    return withDocumentOperation(
      state,
      documentMatch[2],
      () => handleEditorApiAction(req, res, config, state, documentMatch[1], documentMatch[2], documentMatch[3]),
      getHeader(req, 'x-editor-operation-owner'),
    );
  }
  const sessionMatch = pathname.match(/^\/v1\/(docx|hwpx|pdf)\/sessions\/([^/]+)\/(.+)$/);
  if (sessionMatch) {
    return withDocumentOperation(
      state,
      sessionMatch[2],
      () => handleEditorApiAction(req, res, config, state, sessionMatch[1], sessionMatch[2], sessionMatch[3]),
      getHeader(req, 'x-editor-operation-owner'),
    );
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

const PDF_VENDOR_FILES = Object.freeze(new Map([
  ['pdf.mjs', ['pdfjs-dist', 'legacy', 'build', 'pdf.mjs']],
  ['pdf.worker.mjs', ['pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs']],
  ['pdf-lib.min.js', ['pdf-lib', 'dist', 'pdf-lib.min.js']],
]));

const PDF_EMBEDPDF_VENDOR_FILE = /^(?:embedpdf(?:-[A-Za-z0-9_-]+)?|browser-[A-Za-z0-9_-]+|direct-engine-[A-Za-z0-9_-]+|worker-engine-[A-Za-z0-9_-]+)\.js$|^pdfium\.wasm$/;

function handlePdfStaticRequest(req, res, config, pathname, headers = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return true;
  }
  const basePath = normalizeBasePath(config.pdfBasePath || '/pdf/');
  if (pathname === basePath.slice(0, -1)) {
    res.writeHead(308, {
      Location: basePath,
      'Cache-Control': 'no-store',
    });
    res.end();
    return true;
  }
  const relative = pathname === basePath.slice(0, -1)
    ? ''
    : decodeURIComponent(pathname.slice(basePath.length));
  if (relative.startsWith('vendor/')) {
    const embedPdfRelative = relative.slice('vendor/embedpdf/'.length);
    if (relative.startsWith('vendor/embedpdf/')) {
      if (!PDF_EMBEDPDF_VENDOR_FILE.test(embedPdfRelative)) {
        sendText(res, 404, 'Not found');
        return true;
      }
      const filePath = path.join(config.pdfVendorRoot, '@embedpdf', 'snippet', 'dist', embedPdfRelative);
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        sendText(res, 502, 'PDFium editor dependencies are not installed. Run npm install in editor_pdf.');
        return true;
      }
      sendStaticFile(req, res, filePath);
      return true;
    }
    const vendorFile = PDF_VENDOR_FILES.get(relative.slice('vendor/'.length));
    if (!vendorFile) {
      sendText(res, 404, 'Not found');
      return true;
    }
    const filePath = path.join(config.pdfVendorRoot, ...vendorFile);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      sendText(res, 502, 'PDF editor dependencies are not installed. Run npm install in editor_pdf.');
      return true;
    }
    sendStaticFile(req, res, filePath);
    return true;
  }
  let filePath = resolveStaticPath(config.pdfStaticRoot, basePath, pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const hasExtension = Boolean(path.extname(pathname));
    const fallbackPath = path.join(config.pdfStaticRoot, 'index.html');
    if (!hasExtension && existsSync(fallbackPath) && statSync(fallbackPath).isFile()) {
      filePath = fallbackPath;
    } else {
      sendText(res, 404, 'Not found');
      return true;
    }
  }
  sendStaticFile(req, res, filePath, headers);
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
    .replace(
      '<script src="dist/bundle.js"></script>',
      '<link rel="stylesheet" href="vendor/phosphor/regular/style.css">'
        + '<link rel="stylesheet" href="tlooto-image-studio.css">'
        + '<script src="dist/bundle.js"></script><script defer src="tlooto-image-studio.js"></script>',
    );
}

function handleImageStaticRequest(req, res, config, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { sendText(res, 405, 'Method not allowed'); return true; }
  const imageBasePath = normalizeBasePath(config.imageBasePath || '/image/');
  const vectorBasePath = `${imageBasePath}vector/`;
  if (pathname === vectorBasePath.slice(0, -1)) {
    res.writeHead(308, { Location: vectorBasePath, 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }
  if (pathname.startsWith(vectorBasePath)) {
    const vectorRoot = path.join(config.imageIntegrationRoot, 'vector');
    const filePath = resolveStaticPath(vectorRoot, vectorBasePath, pathname);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      sendText(res, 404, 'Not found');
      return true;
    }
    sendStaticFile(req, res, filePath, {
      'Content-Security-Policy': IMAGE_EDITOR_CSP,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    return true;
  }
  if (pathname === `${imageBasePath}vendor/fabric.mjs`) {
    const fabricPath = path.join(config.imageVendorRoot, 'fabric', 'dist', 'index.min.mjs');
    if (!existsSync(fabricPath) || !statSync(fabricPath).isFile()) {
      sendText(res, 404, 'Not found');
      return true;
    }
    sendStaticFile(req, res, fabricPath, {
      'Content-Security-Policy': IMAGE_EDITOR_CSP,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    return true;
  }
  const phosphorMatch = pathname.match(
    new RegExp(`^${imageBasePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}vendor/phosphor/regular/(style\\.css|Phosphor\\.(?:woff2|woff|ttf|svg))$`),
  );
  if (phosphorMatch) {
    const phosphorPath = path.join(
      config.imageVendorRoot,
      '@phosphor-icons',
      'web',
      'src',
      'regular',
      phosphorMatch[1],
    );
    if (!existsSync(phosphorPath) || !statSync(phosphorPath).isFile()) {
      sendText(res, 404, 'Not found');
      return true;
    }
    sendStaticFile(req, res, phosphorPath, {
      'Content-Security-Policy': IMAGE_EDITOR_CSP,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    return true;
  }
  const integrationMatch = pathname.match(
    new RegExp(`^${imageBasePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(tlooto-image-studio\\.(?:js|css))$`),
  );
  if (integrationMatch) {
    sendStaticFile(req, res, path.join(config.imageIntegrationRoot, integrationMatch[1]), {
      'Content-Security-Policy': IMAGE_EDITOR_CSP, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    });
    return true;
  }
  let filePath = resolveStaticPath(config.imageStaticRoot, config.imageBasePath, pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const fallbackPath = path.join(config.imageStaticRoot, 'index.html');
    if (!path.extname(pathname) && existsSync(fallbackPath) && statSync(fallbackPath).isFile()) filePath = fallbackPath;
    else { sendText(res, 404, 'Not found'); return true; }
  }
  const headers = { 'Content-Security-Policy': IMAGE_EDITOR_CSP, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
  if (path.extname(filePath).toLowerCase() !== '.html') { sendStaticFile(req, res, filePath, headers); return true; }
  sendText(res, 200, debrandImageEditorHtml(readFileSync(filePath, 'utf8')), 'text/html; charset=utf-8', headers);
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
  const saved = await record.session.save();
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

function writeDocxActivityEvent(res, payload) {
  if (!res.destroyed && !res.writableEnded) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

async function handleDocxActivityStream(req, res, config, state, documentId) {
  if (req.method !== 'GET') {
    sendText(res, 405, 'Document activity requires GET', 'text/plain; charset=utf-8', { Allow: 'GET' });
    return true;
  }
  const parsed = new URL(req.url || '/', 'http://localhost');
  const token = parsed.searchParams.get('access_token') || '';
  try {
    config.documentStore.verifyToken(token, documentId);
  } catch (error) {
    sendJson(res, 401, { message: error instanceof Error ? error.message : String(error) });
    return true;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  });
  res.write('retry: 2000\n\n');
  let unsubscribe;
  try {
    unsubscribe = state.docxActivityHub.subscribe(
      documentId,
      (payload) => writeDocxActivityEvent(res, payload),
    );
  } catch (error) {
    writeDocxActivityEvent(res, {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    res.end();
    return true;
  }
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(': keep-alive\n\n');
  }, 15_000);
  heartbeat.unref?.();
  req.once('close', () => {
    clearInterval(heartbeat);
    unsubscribe?.();
  });
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
  const operationOwner = editorOperationContext.getStore()?.owner;
  if (operationOwner) {
    headers['X-Editor-Operation-Owner'] = operationOwner;
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
    throw new EditorContractError(
      payload?.code || 'editor_api_request_failed',
      payload?.message || `Editor API returned HTTP ${response.status}.`,
      response.status,
      payload?.details,
    );
  }
  return payload;
}

async function withDocumentOperation(state, documentId, operation, requestedOwner = '') {
  state.documentOperations ??= new Map();
  let queue = state.documentOperations.get(documentId);
  if (requestedOwner && queue?.activeOwner === requestedOwner) {
    return operation(requestedOwner);
  }
  if (!queue) {
    queue = { activeOwner: '', tail: Promise.resolve() };
    state.documentOperations.set(documentId, queue);
  }
  const owner = randomUUID();
  const current = queue.tail.catch(() => undefined).then(async () => {
    queue.activeOwner = owner;
    try {
      return await operation(owner);
    } finally {
      if (queue.activeOwner === owner) queue.activeOwner = '';
    }
  });
  queue.tail = current;
  try {
    return await current;
  } finally {
    if (state.documentOperations.get(documentId) === queue && queue.tail === current && !queue.activeOwner) {
      state.documentOperations.delete(documentId);
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
  if (fmt === 'hwpx' || fmt === 'pdf') {
    return quality.issues.every((issue) => issue?.severity !== 'error');
  }
  return quality.issues.every((issue) => issue?.severity === 'info');
}

async function executeEditorMcpTool(req, config, state, name, args = {}) {
  if (name.startsWith('editor_image_')) {
    const store = config.imageSessionStore;
    if (name === 'editor_image_open') {
      const record = store.create({ bytes: Buffer.from(args.bytesBase64, 'base64'), filename: args.filename });
      return { ok: true, sessionId: record.id, token: record.token, filename: record.filename, mimeType: record.sourceMimeType, byteLength: record.sourceBytes.length, expiresAt: record.lastAccessedAt + config.imageSessionTtlMs, ...imageSessionUrls(config, record) };
    }
    const record = store.get(args.sessionId, args.token);
    if (!record) throw new Error('Image session was not found or the capability token is invalid.');
    if (name === 'editor_image_session_read') return { ok: true, sessionId: record.id, token: record.token, filename: record.filename, source: { mimeType: record.sourceMimeType, byteLength: record.sourceBytes.length }, result: record.resultBytes ? { mimeType: record.resultMimeType, byteLength: record.resultBytes.length } : null, expiresAt: record.lastAccessedAt + config.imageSessionTtlMs, ...imageSessionUrls(config, record) };
    if (name === 'editor_image_session_result_read') {
      if (!record.resultBytes) throw new Error('The image session has no saved result yet.');
      return { ok: true, sessionId: record.id, filename: record.filename.replace(/\.[^.]+$/, '.png'), mimeType: record.resultMimeType, byteLength: record.resultBytes.length, sha256: sha256(record.resultBytes), bytesBase64: record.resultBytes.toString('base64') };
    }
    if (name === 'editor_image_session_save') {
      const saved = store.save(record.id, record.token, Buffer.from(args.bytesBase64, 'base64'));
      return { ok: true, sessionId: saved.id, mimeType: saved.resultMimeType, byteLength: saved.resultBytes.length, downloadUrl: imageSessionUrls(config, saved).downloadUrl };
    }
    if (name === 'editor_image_session_project_save') {
      const saved = store.saveProject(record.id, record.token, Buffer.from(args.bytesBase64, 'base64'));
      return {
        ok: true,
        sessionId: saved.id,
        mimeType: saved.projectMimeType,
        byteLength: saved.projectBytes.length,
        downloadUrl: imageSessionUrls(config, saved).projectDownloadUrl,
      };
    }
    if (name === 'editor_image_session_project_read') {
      if (!record.projectBytes) throw new Error('The image session has no saved editable project yet.');
      return {
        ok: true,
        sessionId: record.id,
        filename: record.filename.replace(/\.[^.]+$/, '.tlooto-image.json'),
        mimeType: record.projectMimeType,
        byteLength: record.projectBytes.length,
        sha256: sha256(record.projectBytes),
        bytesBase64: record.projectBytes.toString('base64'),
      };
    }
    if (name === 'editor_image_session_delete') return { ok: true, sessionId: record.id, deleted: store.delete(record.id, record.token) };
    throw new Error(`Unsupported Image Studio MCP tool: ${name}`);
  }
  const fmt = name.match(/^editor_(docx|hwpx|pdf)_/)?.[1];
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
    const opened = await postLocalEditorApi(req, config, `/v1/${fmt}/documents/open`, {
      filename: args.filename,
      source: {
        ...(args.bytesBase64 ? { bytesBase64: args.bytesBase64 } : {}),
        ...(args.bytesRef ? { bytesRef: args.bytesRef } : {}),
        ...(args.storedDocumentId ? { storedDocumentId: args.storedDocumentId } : {}),
      },
    });
    if (fmt !== 'hwpx' || !isLoopbackHost(config.host) || !opened.liveEditorSession?.sourcePath) {
      return opened;
    }
    const editorUrl = new URL(config.hwpxBasePath, config.publicOrigin);
    editorUrl.searchParams.set('url', opened.liveEditorSession.sourcePath);
    editorUrl.searchParams.set('filename', args.filename);
    const browserUrl = editorUrl.toString();
    return {
      ...opened,
      liveEditorSession: {
        ...opened.liveEditorSession,
        editorUrl: browserUrl,
      },
      browserPresentation: {
        url: browserUrl,
        surface: 'codex_in_app_browser_side_panel',
        refreshMode: 'reload_after_revision_change',
        readOnly: true,
      },
    };
  }

  if (name === `${toolPrefix}_artifact_read` || name === `${toolPrefix}_artifact_delete`) {
    const artifactId = String(args.artifactId || '').trim();
    const expectedSha256 = String(args.expectedSha256 || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error('expectedSha256 must be a lowercase SHA-256 digest.');
    }
    const artifact = await resolveMcpArtifact(artifactId);
    const formatMatches = artifact.extension === fmt
      || artifact.extension === 'pdf'
      || fmt === 'hwpx' && artifact.extension === 'hwp';
    if (!formatMatches) {
      throw new EditorContractError(
        'artifact_format_mismatch',
        `Expected a ${fmt.toUpperCase()} lifecycle artifact, found ${artifact.extension}.`,
        422,
      );
    }
    const bytes = await readFile(artifact.filePath);
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== expectedSha256) {
      throw new EditorContractError(
        'artifact_hash_mismatch',
        `Finalized ${fmt.toUpperCase()} artifact did not match the expected hash.`,
        422,
      );
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

  return withDocumentOperation(state, documentId, (operationOwner) => editorOperationContext.run(
    { owner: operationOwner },
    async () => {
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
      const discarded = await postLocalEditorApi(req, config, `${prefix}/${fmt === 'hwpx' ? 'discard' : 'documents/discard'}`, {
        baseRevision: args.baseRevision,
      });
      return {
        ...discarded,
        status: 'completed',
      };
    }

    const prefix = `/v1/${fmt}/documents/${encodeURIComponent(documentId)}`;
    if (name === 'editor_hwpx_inspect') {
      const inspected = await postLocalEditorApi(req, config, `${prefix}/inspect`, args);
      if (args.view === 'page' && inspected?.render) {
        return {
          ...inspected,
          render: projectHwpxSvgEvidence(inspected.render, args.includeSvg === true),
        };
      }
      return inspected;
    }
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
    const structure = fmt === 'hwpx'
      ? await postLocalEditorApi(req, config, `${prefix}/inspect`, { view: 'summary' })
      : await postLocalEditorApi(req, config, `${prefix}/documents/read-json`, {
          responseMode: MCP_BOUNDED_RESPONSE_MODE,
          view: 'summary',
        });
    const baseRevision = Number(args.baseRevision);
    assertCurrentRevision(structure, baseRevision);

    if (name === `${toolPrefix}_apply` || name === 'editor_hwpx_edit') {
      return postLocalEditorApi(req, config, `${prefix}/${name === 'editor_hwpx_edit' ? 'edit' : 'commands/apply'}`, {
        baseRevision,
        commands: args.commands,
        ...(args.templatePolicy !== undefined ? { templatePolicy: args.templatePolicy } : {}),
      });
    }
    if (name === 'editor_hwpx_review') {
      const reviewed = await postLocalEditorApi(req, config, `${prefix}/review`, args);
      return compactHwpxReviewPayload(reviewed, args.includeSvg === true);
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
    if (name === `${toolPrefix}_quality_check` || name === 'editor_hwpx_inspect' && args.view === 'quality') {
      return postLocalEditorApi(req, config, `${prefix}/quality/check`, {
        baseRevision,
        profile: args.profile,
        visualPolicy: args.visualPolicy,
      });
    }
    if (name === `${toolPrefix}_export_pdf`) {
      await pruneExpiredMcpArtifacts(config);
      const artifactId = randomUUID();
      const outputPath = mcpArtifactPath(artifactId, 'pdf');
      try {
        const exported = await postLocalEditorApi(req, config, `${prefix}/${fmt === 'hwpx' ? 'export-pdf' : 'documents/export-pdf'}`, {
          baseRevision,
          filename: args.filename,
          profile: args.profile,
          visualPolicy: args.visualPolicy,
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
    if (name === 'editor_docx_prepare_review') {
      await pruneExpiredMcpArtifacts(config);
      const candidateArtifactId = randomUUID();
      const reviewArtifactId = randomUUID();
      const candidateOutputPath = mcpArtifactPath(candidateArtifactId, 'docx');
      const reviewOutputPath = mcpArtifactPath(reviewArtifactId, 'docx');
      try {
        const prepared = await postLocalEditorApi(
          req,
          config,
          `${prefix}/documents/prepare-review`,
          {
            baseRevision,
            filename: args.filename,
            candidateOutputPath,
            reviewOutputPath,
          },
        );
        const {
          candidate: candidateWithPath,
          review: reviewWithPath,
          ...publicResult
        } = prepared;
        const { bytesRef: _candidatePath, ...candidate } = candidateWithPath || {};
        const { bytesRef: _reviewPath, ...review } = reviewWithPath || {};
        discardApiSessionState(state, documentId, { clearLock: false });
        return {
          ...publicResult,
          candidate: { ...candidate, artifactId: candidateArtifactId },
          review: { ...review, artifactId: reviewArtifactId },
          sessionClosed: true,
        };
      } catch (error) {
        await Promise.all([
          unlink(candidateOutputPath).catch((unlinkError) => {
            if (unlinkError?.code !== 'ENOENT') throw unlinkError;
          }),
          unlink(reviewOutputPath).catch((unlinkError) => {
            if (unlinkError?.code !== 'ENOENT') throw unlinkError;
          }),
        ]);
        throw error;
      }
    }
    if (name === `${toolPrefix}_save_source` || name === 'editor_hwpx_save' && args.mode !== 'checkpoint') {
      await pruneExpiredMcpArtifacts(config);
      const artifactId = randomUUID();
      const artifactExtension = fmt === 'hwpx'
        && findApiRecord(state, 'hwpx', documentId)?.sourceFormat === 'hwp'
        ? 'hwp'
        : fmt;
      const saved = await postLocalEditorApi(req, config, `${prefix}/${name === 'editor_hwpx_save' ? 'save' : 'documents/save-source'}`, {
        baseRevision,
        filename: args.filename,
        profile: args.profile,
        visualPolicy: args.visualPolicy,
        ...(name === 'editor_hwpx_save' ? { mode: 'verified' } : {}),
        outputPath: mcpArtifactPath(artifactId, artifactExtension),
      });
      const { bytesRef: _serverLocalPath, ...publicResult } = saved;
      discardApiSessionState(state, documentId, { clearLock: false });
      return { ...publicResult, artifactId, sessionClosed: true };
    }
    if (name === `${toolPrefix}_save_checkpoint` || name === 'editor_hwpx_save' && args.mode === 'checkpoint') {
      await pruneExpiredMcpArtifacts(config);
      const artifactId = randomUUID();
      const artifactExtension = fmt === 'hwpx'
        && findApiRecord(state, 'hwpx', documentId)?.sourceFormat === 'hwp'
        ? 'hwp'
        : fmt;
      const saved = await postLocalEditorApi(req, config, `${prefix}/${name === 'editor_hwpx_save' ? 'save' : 'documents/save-checkpoint'}`, {
        baseRevision,
        filename: args.filename,
        ...(name === 'editor_hwpx_save' ? { mode: 'checkpoint' } : {}),
        outputPath: mcpArtifactPath(artifactId, artifactExtension),
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
    },
  ));
}

async function handleEditorMcp(req, res, config, state) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'MCP Streamable HTTP endpoint requires POST.' }, { Allow: 'POST' });
    return;
  }
  const payload = await readJsonBody(req);
  const response = await handleEditorMcpJsonRpc(payload, {
    serverInfo: { name: 'academic-editor-mcp', version: HWPX_MCP_CONTRACT_VERSION },
    executeTool: async (name, args = {}) => {
      const activity = activityDescriptor(name, args);
      const documentId = String(args.documentId || '').trim();
      if (name === 'editor_docx_open') {
        const result = await executeEditorMcpTool(req, config, state, name, args);
        if (result?.documentId && activity) {
          state.docxActivityHub.complete(result.documentId, activity);
        }
        return result;
      }
      const handle = documentId && activity
        ? state.docxActivityHub.begin(documentId, activity)
        : null;
      try {
        const result = await executeEditorMcpTool(req, config, state, name, args);
        state.docxActivityHub.finish(handle, 'completed');
        return result;
      } catch (error) {
        state.docxActivityHub.finish(handle, 'failed');
        throw error;
      }
    },
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
    imageVendorRoot: path.join(repoRoot, 'editor_image', 'node_modules'),
    imageSessionMaxBytes: 25 * 1024 * 1024,
    imageProjectMaxBytes: 100 * 1024 * 1024,
    imageSessionTtlMs: 2 * 60 * 60 * 1000,
    pdfBasePath: '/pdf/',
    pdfStaticRoot: path.join(repoRoot, 'editor_pdf', 'public'),
    pdfVendorRoot: path.join(repoRoot, 'editor_pdf', 'node_modules'),
    ...config,
  };
  config.documentLocks ??= new Map();
  const ownsEditorSessionRuntime = !config.editorSessionRuntime;
  config.editorSessionRuntime ??= new EditorSessionWorkerPool({
    size: config.editorSessionWorkerCount || defaultWorkerCount(),
  });
  config.imageSessionStore ??= new ImageSessionStore({
    maxImageBytes: config.imageSessionMaxBytes,
    maxProjectBytes: config.imageProjectMaxBytes,
    ttlMs: config.imageSessionTtlMs,
  });
  const state = {
    lock: '',
    version: 1,
    docxActivityHub: new DocxActivityHub(),
  };

  const server = http.createServer(async (req, res) => {
    let pathname = '';
    try {
      pathname = getRequestPath(req.url);
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

      const imageSessionRoute = imageSessionApiMatch(pathname);
      if (imageSessionRoute && await handleImageSessionApi(req, res, config, imageSessionRoute)) return;

      const storedDocumentRoute = editorDocumentApiMatch(pathname);
      if (storedDocumentRoute && config.documentStore) {
        const handleStoredRequest = () => handleStoredDocumentApi(req, res, config, storedDocumentRoute);
        if (storedDocumentRoute.documentId) {
          await withDocumentOperation(state, storedDocumentRoute.documentId, handleStoredRequest);
        } else {
          await handleStoredRequest();
        }
        return;
      }

      const activityDocumentId = getDocxActivityDocumentId(pathname, config.docxServiceRoot);
      if (activityDocumentId) {
        await handleDocxActivityStream(req, res, config, state, activityDocumentId);
        return;
      }

      const documentId = getDocxEditDocumentId(pathname, config.docxServiceRoot);
      if (documentId) {
        if (req.method !== 'POST') {
          sendText(res, 405, 'Open the editor with a signed POST request');
          return;
        }
        let formParameters;
        let tokenPayload;
        let readOnly = true;
        let uiLanguage = DEFAULT_DOCX_UI_LANGUAGE;
        try {
          const params = await readFormBody(req);
          formParameters = validateExternalWopiRequest(documentId, params, config);
          const requestUrl = new URL(req.url || '/', config.publicOrigin);
          uiLanguage = resolveDocxUiLanguage(
            params.get('ui_language') || params.get('lang') ||
              requestUrl.searchParams.get('ui_language') || requestUrl.searchParams.get('lang'),
            getHeader(req, 'accept-language'),
          );
          if (!config.documentStore) {
            throw new Error('Editor document store is unavailable');
          }
          tokenPayload = config.documentStore.verifyToken(formParameters.access_token, documentId);
          if (config.documentStore.isDocumentId(documentId)) {
            await config.documentStore.get(documentId);
            readOnly = tokenPayload.canWrite !== true;
          } else if (!findApiRecord(state, 'docx', documentId)) {
            throw new Error('Live DOCX session not found');
          }
        } catch (error) {
          sendText(res, 400, error instanceof Error ? error.message : String(error));
          return;
        }
        const editorUrl = new URL(await buildDocxEditorActionUrl(config, config.publicOrigin));
        editorUrl.searchParams.set('WOPISrc', formParameters.WOPISrc);
        editorUrl.searchParams.set('lang', uiLanguage);
        sendText(res, 200, renderDocxPage(editorUrl.toString(), {
          access_token: formParameters.access_token,
          access_token_ttl: formParameters.access_token_ttl,
        }, {
          documentId,
          accessToken: formParameters.access_token,
          docxServiceRoot: config.docxServiceRoot,
          readOnly,
          uiLanguage,
        }), 'text/html; charset=utf-8', docxWrapperHeaders(config));
        return;
      }

      if (isEditorApiPath(pathname)) {
        const loopbackLiveSource = isLoopbackHwpxLiveSourceRequest(req, config, pathname);
        if (!loopbackLiveSource && !authorizeInternalRoute(req, res, config)) {
          return;
        }
        if (await handleEditorApi(req, res, config, state, pathname)) {
          return;
        }
      }

      const pdfBrowserApiPrefix = `${normalizeBasePath(config.pdfBasePath || '/pdf/')}api/`;
      if (pathname.startsWith(pdfBrowserApiPrefix)) {
        if (!authorizePdfBrowserSession(req, res, config, state)) return;
        const browserActionPath = pathname.slice(pdfBrowserApiPrefix.length);
        if (!browserActionPath || browserActionPath.includes('..')) {
          sendJson(res, 404, { ok: false, message: 'Unknown PDF browser API route.' });
          return;
        }
        await handleEditorApi(req, res, config, state, `/v1/pdf/${browserActionPath}`);
        return;
      }

      if (isDocxWopiPath(pathname, config.docxServiceRoot)) {
        const wopiDocumentId = getDocxWopiDocumentId(pathname, config.docxServiceRoot);
        if (config.documentStore?.isDocumentId(wopiDocumentId)) {
          await withDocumentOperation(
            state,
            wopiDocumentId,
            () => handleStoredDocxWopi(req, res, config, wopiDocumentId),
          );
          return;
        }
        if (findApiRecord(state, 'docx', wopiDocumentId)) {
          await withDocumentOperation(
            state,
            wopiDocumentId,
            () => handleLiveDocxWopi(req, res, config, state, wopiDocumentId),
          );
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
        const requestUrl = new URL(req.url || '/', config.publicOrigin);
        const uiLanguage = resolveDocxUiLanguage(
          requestUrl.searchParams.get('ui_language') || requestUrl.searchParams.get('lang'),
          getHeader(req, 'accept-language'),
        );
        editorUrl.searchParams.set('WOPISrc', wopiSrc);
        editorUrl.searchParams.set('lang', uiLanguage);
        sendText(res, 200, renderDocxPage(editorUrl.toString(), {
          access_token: DOCX_WOPI_TOKEN,
          access_token_ttl: String(Date.now() + 12 * 60 * 60 * 1000),
        }), 'text/html; charset=utf-8', docxWrapperHeaders(config));
        return;
      }

      if (isHwpxPath(pathname, config.hwpxBasePath) && handleHwpxStaticRequest(req, res, config, pathname)) {
        return;
      }

      if (isPdfPath(pathname, config.pdfBasePath)) {
        const pdfBasePath = normalizeBasePath(config.pdfBasePath || '/pdf/');
        const headers = pathname === pdfBasePath && req.method === 'GET'
          ? { 'Set-Cookie': issuePdfBrowserSession(state, config) }
          : {};
        if (handlePdfStaticRequest(req, res, config, pathname, headers)) {
          return;
        }
      }

      if (isImagePath(pathname, config.imageBasePath) && handleImageStaticRequest(req, res, config, pathname)) return;

      const targetOrigin = resolveTargetOrigin(req, config);
      if (targetOrigin) {
        proxyHttpRequest(req, res, targetOrigin, resolveProxyHeaderOptions(req, targetOrigin, config));
        return;
      }

      sendText(res, 404, 'Not found');
    } catch (error) {
      if (pathname.startsWith('/v1/hwpx/')) {
        const documentId = pathname.match(/\/v1\/hwpx\/(?:documents|sessions)\/(doc_[^/]+)/)?.[1];
        emitHwpxLifecycleTrace('request.failed', {
          ...(documentId ? { documentId } : {}),
          method: req.method,
          path: pathname,
          code: error?.code || 'internal_error',
          statusCode: error instanceof EditorContractError ? error.statusCode : 500,
        });
      }
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

  if (ownsEditorSessionRuntime) {
    server.once('close', () => {
      Promise.resolve(config.editorSessionRuntime.close()).catch(() => undefined);
    });
  }

  return server;
}

function buildConfigFromEnv() {
  const host = readEnv('EDITOR_GATEWAY_HOST', '127.0.0.1');
  const port = parsePositiveInteger(readEnv('EDITOR_GATEWAY_PORT', '11004'), 11004);
  const docxServiceRoot = normalizeServiceRoot(readEnv('EDITOR_SERVICE_ROOT', '/docx'));
  const hwpxBasePath = normalizeBasePath(readEnv('RHWP_STUDIO_BASE_PATH', '/hwpx/'));
  const imageBasePath = normalizeBasePath(readEnv('EDITOR_IMAGE_BASE_PATH', '/image/'));
  const pdfBasePath = normalizeBasePath(readEnv('EDITOR_PDF_BASE_PATH', '/pdf/'));
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
    pdfBasePath,
    docxRuntimeOrigin: normalizeOrigin(
      readEnv('EDITOR_GATEWAY_DOCX_ORIGIN', `http://127.0.0.1:${readEnv('EDITOR_HOST_PORT', '9980')}`),
    ),
    hwpxRuntimeOrigin: normalizeOptionalOrigin(readEnv('EDITOR_GATEWAY_HWPX_ORIGIN', '')),
    hwpxStaticRoot: path.resolve(
      readEnv('EDITOR_GATEWAY_HWPX_STATIC_ROOT', path.join(repoRoot, 'editor_hwpx', 'rhwp-studio', 'dist')),
    ),
    imageStaticRoot: path.resolve(readEnv('EDITOR_GATEWAY_IMAGE_STATIC_ROOT', path.join(repoRoot, 'editor_image', 'vendor', 'minipaint'))),
    imageIntegrationRoot: path.resolve(readEnv('EDITOR_GATEWAY_IMAGE_INTEGRATION_ROOT', path.join(repoRoot, 'editor_image'))),
    imageVendorRoot: path.resolve(
      readEnv('EDITOR_GATEWAY_IMAGE_VENDOR_ROOT', path.join(repoRoot, 'editor_image', 'node_modules')),
    ),
    imageSessionMaxBytes: parsePositiveInteger(readEnv('EDITOR_IMAGE_SESSION_MAX_BYTES', String(25 * 1024 * 1024)), 25 * 1024 * 1024),
    imageProjectMaxBytes: parsePositiveInteger(
      readEnv('EDITOR_IMAGE_PROJECT_MAX_BYTES', String(100 * 1024 * 1024)),
      100 * 1024 * 1024,
    ),
    imageSessionTtlMs: parsePositiveInteger(readEnv('EDITOR_IMAGE_SESSION_TTL_MS', String(2 * 60 * 60 * 1000)), 2 * 60 * 60 * 1000),
    pdfStaticRoot: path.resolve(
      readEnv('EDITOR_GATEWAY_PDF_STATIC_ROOT', path.join(repoRoot, 'editor_pdf', 'public')),
    ),
    pdfVendorRoot: path.resolve(
      readEnv('EDITOR_GATEWAY_PDF_VENDOR_ROOT', path.join(repoRoot, 'editor_pdf', 'node_modules')),
    ),
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
    editorSessionWorkerCount: parsePositiveInteger(
      readEnv('EDITOR_SESSION_WORKERS', String(defaultWorkerCount())),
      defaultWorkerCount(),
    ),
    unoPythonBin: readEnv('EDITOR_UNO_PYTHON_BIN', process.platform === 'linux' ? '/opt/collaboraoffice/program/python' : 'python'),
    sofficeBin: readEnv('EDITOR_SOFFICE_BIN', process.platform === 'linux' ? '/opt/collaboraoffice/program/soffice' : 'soffice'),
    docxRenderHelperPath: path.resolve(readEnv('EDITOR_DOCX_RENDER_HELPER', path.join(repoRoot, 'editor_docx', 'scripts', 'render-docx-uno.py'))),
    docxRenderQuality: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_QUALITY', '20'), 20),
    docxRenderMaxSize: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_MAX_SIZE', '1700'), 1700),
    docxRenderConnectTimeoutSeconds: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_CONNECT_TIMEOUT_SECONDS', '20'), 20),
    docxRenderOperationTimeoutSeconds: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_OPERATION_TIMEOUT_SECONDS', '180'), 180),
    docxRenderShutdownTimeoutSeconds: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_SHUTDOWN_TIMEOUT_SECONDS', '10'), 10),
    docxRenderMaxResultBytes: parsePositiveInteger(readEnv('EDITOR_DOCX_RENDER_MAX_RESULT_BYTES', String(64 * 1024 * 1024)), 64 * 1024 * 1024),
    hwpxPdfCommand: readEnv('EDITOR_HWPX_PDF_COMMAND', ''),
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
    documentMaxCount: parsePositiveInteger(readEnv('EDITOR_DOCUMENT_MAX_COUNT'), undefined),
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
  compareDocxBytes,
  countDocxRevisionElements,
  createGatewayServer,
  discardApiSessionState,
  extendFrameAncestors,
  isDocxRootPath,
  isDocxRuntimePath,
  isHwpxPath,
  isImagePath,
  isPdfPath,
  normalizeBasePath,
  normalizeServiceRoot,
  resolveDocxUiLanguage,
  main,
  renderDocxPage,
  resolveDocxActionPath,
  sanitizeEditorHtml,
  resolveStaticPath,
  withDocumentOperation,
};
