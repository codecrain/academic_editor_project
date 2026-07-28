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
    const html = await fetch(`${origin}/pdf/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Academic PDF Editor/);
    const pdfjs = await fetch(`${origin}/pdf/vendor/pdf.mjs`);
    assert.equal(pdfjs.status, 200);
    assert.match(pdfjs.headers.get('content-type'), /text\/javascript/);
    assert.ok((await pdfjs.arrayBuffer()).byteLength > 100_000);
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
    const applied = await post(`/v1/pdf/documents/${opened.documentId}/commands/apply`, {
      baseRevision: 1,
      commands: [{ op: 'text.add', page: 1, x: 48, y: 90, text: '검토 완료', fontSize: 14 }],
    });
    assert.equal(applied.revision, 2);
    const quality = await post(`/v1/pdf/documents/${opened.documentId}/quality/check`, { baseRevision: 2 });
    assert.equal(quality.ok, true, JSON.stringify(quality));
    const rendered = await post(`/v1/pdf/documents/${opened.documentId}/pages/render-page`, { page: 1 });
    assert.equal(rendered.renderer, 'poppler-pdftoppm');
    assert.equal(rendered.page.mimeType, 'image/png');
    const saved = await post(`/v1/pdf/documents/${opened.documentId}/documents/save-source`, {
      baseRevision: 2,
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
