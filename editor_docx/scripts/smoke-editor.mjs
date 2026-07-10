import http from 'node:http';
import https from 'node:https';
import { createHash, randomBytes } from 'node:crypto';

const DEFAULT_HOST_PORT = '9980';
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function readEnv(name, fallback) {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  try {
    return new URL(raw).toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function resolveDiscoveryUrl() {
  const explicit = readEnv('EDITOR_DISCOVERY_URL', '');
  if (explicit) {
    return explicit;
  }

  const hostPort = readEnv('EDITOR_HOST_PORT', DEFAULT_HOST_PORT);
  const discoveryOrigin = normalizeOrigin(readEnv('EDITOR_DISCOVERY_SERVER_URL', ''));
  const internalOrigin = normalizeOrigin(readEnv('EDITOR_INTERNAL_SERVER_URL', ''));
  const origin = discoveryOrigin || internalOrigin || `http://127.0.0.1:${hostPort}`;
  return `${origin}/hosting/discovery`;
}

function fetchUrl(url, timeoutMs) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      resolve({ ok: false, statusCode: 0, body: '', error: error instanceof Error ? error.message : String(error) });
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        const statusCode = response.statusCode ?? 0;
        resolve({
          ok: statusCode >= 200 && statusCode < 400,
          statusCode,
          body,
          error: '',
        });
      });
    });

    request.once('timeout', () => {
      request.destroy();
      resolve({ ok: false, statusCode: 0, body: '', error: 'timeout' });
    });
    request.once('error', (error) => {
      resolve({ ok: false, statusCode: 0, body: '', error: error.message });
    });
  });
}

function decodeXmlAttribute(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractCoolHtmlUrl(discoveryXml, discoveryUrl) {
  const match = String(discoveryXml ?? '').match(/urlsrc="([^"]*\/browser\/[^"]*\/cool\.html\?[^"]*)"/);
  if (!match) {
    return '';
  }

  const base = new URL(discoveryUrl);
  const discovered = new URL(decodeXmlAttribute(match[1]), base);
  return `${base.origin}${discovered.pathname}${discovered.search}`;
}

function buildCoolHtmlHealthUrl(coolHtmlUrl) {
  const url = new URL(coolHtmlUrl);
  url.searchParams.set('WOPISrc', 'http://127.0.0.1/editor-health-check');
  url.searchParams.set('access_token', 'editor-health-check');
  url.searchParams.set('access_token_ttl', '0');
  return url.toString();
}

function buildWebSocketHealthUrl(coolHtmlUrl) {
  const url = new URL(coolHtmlUrl);
  const browserMarkerIndex = url.pathname.indexOf('/browser/');
  const serviceRoot = browserMarkerIndex >= 0 ? url.pathname.slice(0, browserMarkerIndex) : '';
  const wopiSrc = url.searchParams.get('WOPISrc') || 'http://127.0.0.1/editor-health-check';

  url.pathname = `${serviceRoot}/cool/ws`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.searchParams.set('WOPISrc', wopiSrc);
  url.searchParams.set('access_token', 'editor-health-check');
  url.searchParams.set('access_token_ttl', '0');
  url.searchParams.set('compat', '');
  return url.toString();
}

function upgradeWebSocket(url, timeoutMs) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const websocketKey = randomBytes(16).toString('base64');
    const expectedAccept = createHash('sha1').update(`${websocketKey}${WEBSOCKET_GUID}`).digest('base64');
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const request = client.request(parsed, {
      headers: {
        Connection: 'Upgrade',
        Origin: `${parsed.protocol}//${parsed.host}`,
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': websocketKey,
        'Sec-WebSocket-Version': '13',
      },
    });

    request.once('upgrade', (response, socket) => {
      const accept = String(response.headers['sec-websocket-accept'] || '');
      socket.destroy();
      finish({
        ok: response.statusCode === 101 && accept === expectedAccept,
        statusCode: response.statusCode || 0,
        error: accept === expectedAccept ? '' : 'invalid Sec-WebSocket-Accept header',
      });
    });
    request.once('response', (response) => {
      response.resume();
      finish({ ok: false, statusCode: response.statusCode || 0, error: 'upgrade rejected' });
    });
    request.once('timeout', () => {
      request.destroy();
      finish({ ok: false, statusCode: 0, error: 'timeout' });
    });
    request.once('error', (error) => {
      finish({ ok: false, statusCode: 0, error: error.message });
    });
    request.setTimeout(timeoutMs);
    request.end();
  });
}

async function main() {
  const timeoutMs = parsePositiveInteger(process.env.EDITOR_SMOKE_TIMEOUT_MS, 5_000);
  const discoveryUrl = resolveDiscoveryUrl();

  const discovery = await fetchUrl(discoveryUrl, timeoutMs);
  if (!discovery.ok) {
    throw new Error(`Discovery failed at ${discoveryUrl}: ${discovery.statusCode || discovery.error || 'unknown error'}`);
  }

  const coolHtmlUrl = extractCoolHtmlUrl(discovery.body, discoveryUrl);
  if (!coolHtmlUrl) {
    throw new Error(`Discovery at ${discoveryUrl} did not include a browser cool.html action URL.`);
  }

  const healthUrl = buildCoolHtmlHealthUrl(coolHtmlUrl);
  const editor = await fetchUrl(healthUrl, timeoutMs);
  if (!editor.ok) {
    const detail = (editor.body || editor.error || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(`Editor page failed at ${healthUrl}: ${editor.statusCode || editor.error || 'unknown error'}${detail ? `: ${detail}` : ''}`);
  }

  const websocketUrl = buildWebSocketHealthUrl(healthUrl);
  const websocket = await upgradeWebSocket(websocketUrl, timeoutMs);
  if (!websocket.ok) {
    throw new Error(
      `Editor websocket failed at ${websocketUrl}: ${websocket.statusCode || websocket.error || 'unknown error'}`,
    );
  }

  console.log(`[editor:smoke] ok discovery=${discoveryUrl}`);
  console.log(`[editor:smoke] ok cool.html=${healthUrl}`);
  console.log(`[editor:smoke] ok websocket=${websocketUrl}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
