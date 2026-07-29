import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createGatewayServer } from '../editor_server/editor-gateway.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1WQAAAABJRU5ErkJggg==',
  'base64',
);

function listen(server, port = 0) {
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function reservePort() {
  const probe = net.createServer();
  const address = await listen(probe);
  assert.equal(typeof address, 'object');
  await close(probe);
  return address.port;
}

test('gateway serves both image editors and round-trips editable projects', async () => {
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = createGatewayServer({
    host: '127.0.0.1',
    port,
    publicOrigin: origin,
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    imageStaticRoot: path.join(here, 'vendor', 'minipaint'),
    imageIntegrationRoot: here,
    imageVendorRoot: path.join(here, 'node_modules'),
  });

  await listen(server, port);
  try {
    const vectorRedirect = await fetch(`${origin}/image/vector`, { redirect: 'manual' });
    const vectorRedirectBody = await vectorRedirect.text();
    assert.equal(vectorRedirect.status, 308, vectorRedirectBody);
    assert.equal(vectorRedirect.headers.get('location'), '/image/vector/');

    const vectorPage = await fetch(`${origin}/image/vector/`);
    assert.equal(vectorPage.status, 200);
    const vectorHtml = await vectorPage.text();
    assert.match(vectorHtml, /Tlooto Image Studio — Vector/);
    assert.match(vectorHtml, /command-search/);
    assert.match(vectorHtml, /panel-tabs/);

    const fabric = await fetch(`${origin}/image/vendor/fabric.mjs`);
    assert.equal(fabric.status, 200);
    assert.match(fabric.headers.get('content-type') || '', /javascript/);

    const phosphorStyles = await fetch(`${origin}/image/vendor/phosphor/regular/style.css`);
    assert.equal(phosphorStyles.status, 200);
    assert.match(phosphorStyles.headers.get('content-type') || '', /text\/css/);
    assert.match(await phosphorStyles.text(), /\.ph\.ph-cursor:before/);

    const phosphorFont = await fetch(`${origin}/image/vendor/phosphor/regular/Phosphor.woff2`);
    assert.equal(phosphorFont.status, 200);
    assert.match(phosphorFont.headers.get('content-type') || '', /font\/woff2|application\/octet-stream/);

    const rasterPage = await fetch(`${origin}/image/`);
    assert.equal(rasterPage.status, 200);
    const rasterHtml = await rasterPage.text();
    assert.match(rasterHtml, /tlooto-image-studio\.css/);
    assert.match(rasterHtml, /vendor\/phosphor\/regular\/style\.css/);
    assert.match(rasterHtml, /tlooto-image-studio\.js/);

    const createdResponse = await fetch(`${origin}/api/image-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'layered.png',
        bytesBase64: PNG_BYTES.toString('base64'),
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.match(created.editorUrl, /projectSave=/);

    const project = {
      info: { width: 1, height: 1 },
      layers: [{ id: 1, type: 'image', name: 'source', visible: true }],
      data: [],
    };
    const savedResponse = await fetch(created.projectExportUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(project),
    });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.equal(saved.mimeType, 'application/vnd.tlooto.image-project+json');

    const readResponse = await fetch(created.projectDownloadUrl);
    assert.equal(readResponse.status, 200);
    assert.match(readResponse.headers.get('content-disposition') || '', /\.tlooto-image\.json/);
    assert.deepEqual(await readResponse.json(), project);
  } finally {
    await close(server);
  }
});
