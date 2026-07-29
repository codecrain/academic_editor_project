import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PDFDocument, StandardFonts } from 'pdf-lib';

import { createGatewayServer } from '../../editor_server/editor-gateway.mjs';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('gateway serves the PDF editor and only its pinned vendor entrypoints on /pdf', async () => {
  const server = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: 'http://127.0.0.1:9980',
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1',
    enableSampleDocx: false,
  });
  const address = await listen(server);
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const canonical = await fetch(`${origin}/pdf`, { redirect: 'manual' });
    assert.equal(canonical.status, 308);
    assert.equal(canonical.headers.get('location'), '/pdf/');
    const html = await fetch(`${origin}/pdf/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Academic PDF Editor/);
    const browserCookie = html.headers.get('set-cookie');
    assert.match(browserCookie, /academic_pdf_session=/);
    assert.match(browserCookie, /HttpOnly/);
    assert.match(browserCookie, /SameSite=Strict/);
    const deniedBrowserApi = await fetch(`${origin}/pdf/api/documents/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ filename: 'sample.pdf', source: { bytesBase64: (await samplePdf()).toString('base64') } }),
    });
    assert.equal(deniedBrowserApi.status, 403);
    const browserOpened = await fetch(`${origin}/pdf/api/documents/open`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: browserCookie.split(';', 1)[0],
        origin,
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ filename: 'sample.pdf', source: { bytesBase64: (await samplePdf()).toString('base64') } }),
    });
    assert.equal(browserOpened.status, 200);
    assert.equal((await browserOpened.json()).fmt, 'pdf');
    const pdfjs = await fetch(`${origin}/pdf/vendor/pdf.mjs`);
    assert.equal(pdfjs.status, 200);
    assert.match(pdfjs.headers.get('content-type'), /text\/javascript/);
    assert.ok((await pdfjs.arrayBuffer()).byteLength > 100_000);
    const embedPdf = await fetch(`${origin}/pdf/vendor/embedpdf/embedpdf.js`);
    assert.equal(embedPdf.status, 200);
    assert.match(embedPdf.headers.get('content-type'), /text\/javascript/);
    assert.ok((await embedPdf.arrayBuffer()).byteLength > 1_000);
    const pdfium = await fetch(`${origin}/pdf/vendor/embedpdf/pdfium.wasm`);
    assert.equal(pdfium.status, 200);
    assert.equal(pdfium.headers.get('content-type'), 'application/wasm');
    assert.ok((await pdfium.arrayBuffer()).byteLength > 1_000_000);
    const blockedEmbedPdf = await fetch(`${origin}/pdf/vendor/embedpdf/index.html`);
    assert.equal(blockedEmbedPdf.status, 404);
    await blockedEmbedPdf.text();
    const blocked = await fetch(`${origin}/pdf/vendor/package.json`);
    assert.equal(blocked.status, 404);
    await blocked.text();
  } finally {
    await close(server);
  }
});

async function samplePdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([420, 594]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('Gateway PDF API acceptance', { x: 48, y: 520, size: 16, font });
  return Buffer.from(await document.save());
}

test('gateway exposes revision-bound PDF open, apply, quality, render, and save', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'academic-editor-pdf-gateway-'));
  const outputPath = path.join(tempRoot, 'edited.pdf');
  const server = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: 'http://127.0.0.1:9980',
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1',
    enableSampleDocx: false,
  });
  const address = await listen(server);
  const origin = `http://127.0.0.1:${address.port}`;
  const post = async (pathname, body) => {
    const response = await fetch(`${origin}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.ok, true, JSON.stringify(payload));
    return payload;
  };
  try {
    const opened = await post('/v1/pdf/documents/open', {
      filename: 'sample.pdf',
      source: { bytesBase64: (await samplePdf()).toString('base64') },
    });
    assert.equal(opened.fmt, 'pdf');
    assert.equal(opened.revision, 1);
    const inventory = await post(`/v1/pdf/documents/${opened.documentId}/object/inventory`, {});
    const target = inventory.textObjects.find((object) => object.text === 'Gateway PDF API acceptance');
    assert.ok(target);
    await post(`/v1/pdf/documents/${opened.documentId}/target/inspect`, {
      locations: [{ page: target.page, objectId: target.id, objectIndex: target.objectIndex }],
    });
    const replaced = await post(`/v1/pdf/documents/${opened.documentId}/commands/apply`, {
      baseRevision: 1,
      commands: [{
        op: 'text.replaceObject',
        page: target.page,
        objectIndex: target.objectIndex,
        objectId: target.id,
        expectedText: target.text,
        text: 'Gateway object editing verified',
      }],
    });
    assert.equal(replaced.revision, 2);
    const applied = await post(`/v1/pdf/documents/${opened.documentId}/commands/apply`, {
      baseRevision: 2,
      commands: [{ op: 'text.add', page: 1, x: 48, y: 90, text: '검토 완료', fontSize: 14 }],
    });
    assert.equal(applied.revision, 3);
    const quality = await post(`/v1/pdf/documents/${opened.documentId}/quality/check`, { baseRevision: 3 });
    assert.equal(quality.ok, true, JSON.stringify(quality));
    const buffered = await post(`/v1/pdf/documents/${opened.documentId}/documents/save-buffer`, {
      baseRevision: 3,
      filename: 'edited.pdf',
    });
    assert.equal(Buffer.from(buffered.bytesBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
    const rendered = await post(`/v1/pdf/documents/${opened.documentId}/pages/render-page`, { page: 1 });
    assert.equal(rendered.renderer, 'poppler-pdftoppm');
    assert.equal(rendered.page.mimeType, 'image/png');
    const saved = await post(`/v1/pdf/documents/${opened.documentId}/documents/save-source`, {
      baseRevision: 3,
      filename: 'edited.pdf',
      outputPath,
    });
    assert.equal(saved.verified, true);
    const bytes = await readFile(outputPath);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  } finally {
    await close(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
