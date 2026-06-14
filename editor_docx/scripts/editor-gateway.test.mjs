import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createGatewayServer,
  isDocxRootPath,
  isDocxRuntimePath,
  isHwpxPath,
  normalizeBasePath,
  normalizeServiceRoot,
  renderDocxPage,
  resolveDocxActionPath,
  resolveStaticPath,
  sanitizeEditorHtml,
} from './editor-gateway.mjs';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function requestWebSocketUpgrade(port, pathname) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let response = '';
    let settled = false;

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    }

    socket.setTimeout(5000, () => finish(new Error('websocket upgrade timed out')));
    socket.once('error', finish);
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.includes('\r\n\r\n')) {
        finish();
      }
    });
    socket.once('connect', () => {
      socket.write(
        [
          `GET ${pathname} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Version: 13',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          `Origin: http://127.0.0.1:${port}`,
          '',
          '',
        ].join('\r\n'),
      );
    });
  });
}

test('gateway normalizes public editor subpaths', () => {
  assert.equal(normalizeServiceRoot('docx/'), '/docx');
  assert.equal(normalizeServiceRoot('/docx/'), '/docx');
  assert.equal(normalizeBasePath('hwpx'), '/hwpx/');
  assert.equal(normalizeBasePath('/hwpx/'), '/hwpx/');
});

test('gateway routes DOCX root, runtime, and HWPX paths separately', () => {
  assert.equal(isDocxRootPath('/docx', '/docx'), true);
  assert.equal(isDocxRootPath('/docx/', '/docx'), true);
  assert.equal(isDocxRuntimePath('/docx/browser/hash/cool.html', '/docx'), true);
  assert.equal(isDocxRuntimePath('/docx/hosting/discovery', '/docx'), true);
  assert.equal(isDocxRuntimePath('/browser/hash/branding.css', '/docx'), true);
  assert.equal(isDocxRuntimePath('/cool/ws', '/docx'), true);
  assert.equal(isHwpxPath('/hwpx/', '/hwpx/'), true);
  assert.equal(isHwpxPath('/hwpx/assets/index.js', '/hwpx/'), true);
  assert.equal(isHwpxPath('/docx/browser/hash/cool.html', '/hwpx/'), false);
});

test('gateway resolves DOCX action URL from discovery XML', () => {
  const path = resolveDocxActionPath(
    '<wopi-discovery><net-zone><app name="writer"><action name="edit" ext="docx" urlsrc="http://127.0.0.1:9980/docx/browser/abc/cool.html?"/></app></net-zone></wopi-discovery>',
    '/docx',
  );
  assert.equal(path, '/docx/browser/abc/cool.html');
});

test('gateway DOCX page embeds the editor URL directly', () => {
  const html = renderDocxPage('http://127.0.0.1:11004/docx/browser/abc/cool.html?WOPISrc=x');
  assert.match(html, /<iframe/);
  assert.match(html, /<title>Tlooto DOCX Editor<\/title>/);
  assert.match(html, /Tlooto DOCX Editor for opening, editing, and saving DOCX documents/);
  assert.match(html, /DOCX editor/);
  assert.doesNotMatch(html, /class="top"/);
  assert.doesNotMatch(html, />HWPX</);
  assert.match(html, /height: 100%/);
  assert.match(html, /WOPISrc=x/);
});

test('gateway strips upstream branding from proxied editor HTML', () => {
  const html = sanitizeEditorHtml(
    '<input type="hidden" id="init-product-branding-url" value="https://www.collaboraonline.com" />' +
      '<h1>Collabora Online Development Edition</h1>' +
      '<img src="collabora-office-white.svg">',
  );

  assert.doesNotMatch(html, /collabora/i);
  assert.match(html, /Document Editor/);
  assert.match(html, /document-editor-white\.svg/);
  assert.match(html, /id="init-product-branding-url" value=""/);
});

test('gateway forwards DOCX websocket upgrades with public proxy headers', async () => {
  let capturedRequest = null;
  const upstream = http.createServer();
  upstream.on('upgrade', (request, socket) => {
    capturedRequest = {
      url: request.url,
      headers: request.headers,
    };
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.end();
  });

  const upstreamAddress = await listen(upstream);
  assert.equal(typeof upstreamAddress, 'object');

  const gateway = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: `http://127.0.0.1:${upstreamAddress.port}`,
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
  });
  const gatewayAddress = await listen(gateway);
  assert.equal(typeof gatewayAddress, 'object');

  try {
    const response = await requestWebSocketUpgrade(gatewayAddress.port, '/cool/ws?WOPISrc=x');
    assert.match(response, /101 Switching Protocols/);
    assert.equal(capturedRequest?.url, '/cool/ws?WOPISrc=x');
    assert.equal(capturedRequest?.headers.host, '127.0.0.1:11004');
    assert.equal(capturedRequest?.headers.origin, 'http://127.0.0.1:11004');
    assert.equal(capturedRequest?.headers['x-forwarded-host'], '127.0.0.1:11004');
    assert.equal(capturedRequest?.headers['x-forwarded-proto'], 'http');
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('gateway serves HWPX static assets on the public /hwpx path', async () => {
  const staticRoot = await mkdtemp(path.join(tmpdir(), 'academic-editor-hwpx-'));
  await mkdir(path.join(staticRoot, 'assets'), { recursive: true });
  await writeFile(path.join(staticRoot, 'index.html'), '<!doctype html><div id="studio-root"></div>');
  await writeFile(path.join(staticRoot, 'assets', 'app.js'), 'console.log("hwpx");');

  const server = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: 'http://127.0.0.1:9980',
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: staticRoot,
    wopiBaseUrl: 'http://127.0.0.1',
    sampleDocxPath: path.join(staticRoot, 'sample.docx'),
  });

  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const html = await fetch(`${origin}/hwpx/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /studio-root/);

    const script = await fetch(`${origin}/hwpx/assets/app.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /hwpx/);
  } finally {
    await close(server);
    await rm(staticRoot, { recursive: true, force: true });
  }
});

test('gateway exposes HWPX document API bridge for open, inspect, command, render, and save', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'academic-editor-api-'));
  const outputPath = path.join(tempRoot, 'bridge-smoke.hwpx');
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
    sampleDocxPath: path.join(tempRoot, 'sample.docx'),
  });
  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const sourcePath = path.resolve('editor_hwpx/samples/hwpx/ref/ref_text.hwpx');

  async function post(pathname, payload) {
    const response = await fetch(`${origin}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    assert.equal(response.ok, true, `${pathname}: ${JSON.stringify(json)}`);
    return json;
  }

  try {
    const opened = await post('/v1/hwpx/documents/open', {
      source: { bytesRef: sourcePath },
      filename: 'ref_text.hwpx',
    });
    assert.equal(opened.ok, true);
    assert.equal(opened.fmt, 'hwpx');

    const structure = await post(`/v1/hwpx/documents/${opened.documentId}/documents/read-json`, {});
    assert.equal(structure.sourceFormat, 'hwpx');
    const firstParagraph = structure.sections[0].paragraphs.find((paragraph) => paragraph.text.trim().length > 0);
    assert.ok(firstParagraph);

    const location = { paragraph: { section: firstParagraph.section, number: firstParagraph.para } };
    const inspected = await post(`/v1/hwpx/documents/${opened.documentId}/target/inspect`, { locations: [location] });
    assert.equal(inspected.targets.length, 1);

    const command = await post(`/v1/hwpx/documents/${opened.documentId}/commands/apply`, {
      commands: [{
        commandId: 'gateway-smoke-replace',
        op: 'text.replaceParagraph',
        location,
        text: `${firstParagraph.text} API bridge`,
      }],
    });
    assert.equal(command.revision, 2);

    const quality = await post(`/v1/hwpx/documents/${opened.documentId}/quality/check`, {});
    assert.equal(quality.ok, true);
    assert.equal(quality.pageCount, structure.pageCount);

    const rendered = await post(`/v1/hwpx/documents/${opened.documentId}/pages/render-all`, { pages: [1] });
    assert.equal(rendered.renderer, 'rhwp-svg');
    assert.equal(rendered.pages[0].nonBlank, true);

    const renderedPage = await post(`/v1/hwpx/documents/${opened.documentId}/pages/render-page`, { page: 1 });
    assert.equal(renderedPage.renderer, 'rhwp-svg');
    assert.equal(renderedPage.page.page, 1);
    assert.equal(renderedPage.page.nonBlank, true);
    assert.equal(renderedPage.pages.length, 1);

    const saved = await post(`/v1/hwpx/documents/${opened.documentId}/documents/save-source`, {
      outputPath,
      filename: 'bridge-smoke.hwpx',
    });
    assert.equal(saved.ok, true);
    assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  } finally {
    await close(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('gateway prevents HWPX static path traversal', () => {
  const staticRoot = path.join(tmpdir(), 'academic-editor-static-root');
  assert.equal(resolveStaticPath(staticRoot, '/hwpx/', '/hwpx/../secret.txt'), '');
});
