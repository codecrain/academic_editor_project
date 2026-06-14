import http from 'node:http';
import https from 'node:https';

const host = process.env.RHWP_STUDIO_HOST || '127.0.0.1';
const port = String(process.env.RHWP_STUDIO_PORT || '11004');
const basePath = normalizeBasePath(process.env.RHWP_STUDIO_BASE_PATH || '/hwpx/');
const origin = normalizeOrigin(
  process.env.RHWP_STUDIO_PROXY_ORIGIN || `http://${host}:${port}`,
);
const url = `${origin}${basePath}`;

function normalizeBasePath(value) {
  const raw = String(value || '/hwpx/').trim() || '/hwpx/';
  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  const href = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  return new URL(href).toString().replace(/\/$/, '');
}

function fetchText(targetUrl) {
  return new Promise((resolve) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, { timeout: 5000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body,
          error: '',
        });
      });
    });
    request.once('timeout', () => {
      request.destroy();
      resolve({ statusCode: 0, body: '', error: 'timeout' });
    });
    request.once('error', (error) => {
      resolve({ statusCode: 0, body: '', error: error.message });
    });
  });
}

function fetchBuffer(targetUrl) {
  return new Promise((resolve) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const chunks = [];
    const request = client.get(parsed, { timeout: 5000 }, (response) => {
      response.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body: Buffer.concat(chunks),
          error: '',
        });
      });
    });
    request.once('timeout', () => {
      request.destroy();
      resolve({ statusCode: 0, body: Buffer.alloc(0), error: 'timeout' });
    });
    request.once('error', (error) => {
      resolve({ statusCode: 0, body: Buffer.alloc(0), error: error.message });
    });
  });
}

const result = await fetchText(url);
if (result.statusCode < 200 || result.statusCode >= 400) {
  console.error(`[rhwp] smoke failed: ${url} -> ${result.statusCode || result.error}`);
  process.exit(1);
}

if (!result.body.includes('rhwp') && !result.body.includes(basePath)) {
  console.error(`[rhwp] smoke failed: ${url} did not look like RHWP Studio HTML`);
  process.exit(1);
}

const stylesheetMatch = result.body.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i);
if (!stylesheetMatch) {
  console.error(`[rhwp] smoke failed: ${url} did not include a stylesheet link`);
  process.exit(1);
}

const stylesheetUrl = new URL(stylesheetMatch[1], url).toString();
const stylesheet = await fetchText(stylesheetUrl);
if (stylesheet.statusCode < 200 || stylesheet.statusCode >= 400) {
  console.error(`[rhwp] smoke failed: ${stylesheetUrl} -> ${stylesheet.statusCode || stylesheet.error}`);
  process.exit(1);
}
if (/^\s*<!doctype html/i.test(stylesheet.body) || !stylesheet.body.includes('#studio-root')) {
  console.error(`[rhwp] smoke failed: ${stylesheetUrl} did not return RHWP Studio CSS`);
  process.exit(1);
}

const fontUrl = new URL('fonts/NotoSansKR-Regular.woff2', url).toString();
const font = await fetchBuffer(fontUrl);
if (font.statusCode < 200 || font.statusCode >= 400) {
  console.error(`[rhwp] smoke failed: ${fontUrl} -> ${font.statusCode || font.error}`);
  process.exit(1);
}
if (font.body.length < 1024 || font.body.subarray(0, 4).toString('ascii') !== 'wOF2') {
  console.error(`[rhwp] smoke failed: ${fontUrl} did not return a WOFF2 font`);
  process.exit(1);
}

console.log(`[rhwp] smoke ok: ${url}`);
