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
    assert.match(await vectorPage.text(), /Tlooto Vector Studio/);

    const fabric = await fetch(`${origin}/image/vendor/fabric.mjs`);
    assert.equal(fabric.status, 200);
    assert.match(fabric.headers.get('content-type') || '', /javascript/);

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
