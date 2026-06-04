import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

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

function runStartEditor(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', 'start-editor.mjs')], {
      cwd: repoRoot,
      env,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('start-editor reuses an already renderable editor before Docker fallback checks', async () => {
  let port = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/hosting/discovery') {
      response.writeHead(200, { 'Content-Type': 'text/xml' });
      response.end(`<wopi-discovery><net-zone><app name="writer"><action ext="docx" name="edit" urlsrc="http://127.0.0.1:${port}/browser/test/cool.html?"/></app></net-zone></wopi-discovery>`);
      return;
    }

    if (request.url?.startsWith('/browser/test/cool.html?')) {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html><body>editor</body></html>');
      return;
    }

    response.writeHead(404);
    response.end();
  });

  const address = await listen(server);
  port = address.port;

  try {
    const result = await runStartEditor({
      ...process.env,
      EDITOR_RUNTIME_MODE: 'docker',
      EDITOR_DISCOVERY_SERVER_URL: `http://127.0.0.1:${address.port}`,
      EDITOR_DOCKER_WAIT_TIMEOUT_MS: '1',
      EDITOR_DOCKER_WAIT_INTERVAL_MS: '1',
      PATH: '',
      Path: '',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /already ready/);
  } finally {
    await close(server);
  }
});

test('start-editor rejects discovery-only editor when cool.html is broken', async () => {
  let port = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/hosting/discovery') {
      response.writeHead(200, { 'Content-Type': 'text/xml' });
      response.end(`<wopi-discovery><net-zone><app name="writer"><action ext="docx" name="edit" urlsrc="http://127.0.0.1:${port}/browser/test/cool.html?"/></app></net-zone></wopi-discovery>`);
      return;
    }

    if (request.url?.startsWith('/browser/test/cool.html?')) {
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('Cannot process the request - Bad URI syntax: bad or invalid port number: blank');
      return;
    }

    response.writeHead(404);
    response.end();
  });

  const address = await listen(server);
  port = address.port;

  try {
    const result = await runStartEditor({
      ...process.env,
      EDITOR_RUNTIME_MODE: 'docker',
      EDITOR_DISCOVERY_SERVER_URL: `http://127.0.0.1:${address.port}`,
      EDITOR_DOCKER_WAIT_TIMEOUT_MS: '1',
      EDITOR_DOCKER_WAIT_INTERVAL_MS: '1',
      PATH: '',
      Path: '',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /editor page is not renderable/);
    assert.match(result.stderr, /cool\.html returned 500/);
  } finally {
    await close(server);
  }
});

test('start-editor handles large discovery responses without hanging', async () => {
  let port = 0;
  const filler = '<app name="filler"><action ext="txt" name="view" urlsrc="http://127.0.0.1/filler/cool.html?"/></app>'.repeat(100);
  const server = http.createServer((request, response) => {
    if (request.url === '/hosting/discovery') {
      response.writeHead(200, { 'Content-Type': 'text/xml' });
      response.end(`<wopi-discovery><net-zone>${filler}<app name="writer"><action ext="docx" name="edit" urlsrc="http://127.0.0.1:${port}/browser/test/cool.html?"/></app></net-zone></wopi-discovery>`);
      return;
    }

    if (request.url?.startsWith('/browser/test/cool.html?')) {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html><body>editor</body></html>');
      return;
    }

    response.writeHead(404);
    response.end();
  });

  const address = await listen(server);
  port = address.port;

  try {
    const result = await runStartEditor({
      ...process.env,
      EDITOR_RUNTIME_MODE: 'docker',
      EDITOR_DISCOVERY_SERVER_URL: `http://127.0.0.1:${address.port}`,
      EDITOR_DOCKER_WAIT_TIMEOUT_MS: '1',
      EDITOR_DOCKER_WAIT_INTERVAL_MS: '1',
      PATH: '',
      Path: '',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /already ready/);
  } finally {
    await close(server);
  }
});

test('native runner does not pass --version to the long-running editor process', () => {
  const runner = readFileSync(path.join(repoRoot, 'scripts', 'run-native-editor.mjs'), 'utf8');
  assert.doesNotMatch(runner, /['"]--version['"]/);
});

test('docker runtime passes host:port as server_name without forcing websocket indirection', () => {
  const starter = readFileSync(path.join(repoRoot, 'scripts', 'start-editor.mjs'), 'utf8');
  assert.match(starter, /return new URL\(publicUrl\)\.host;/);
  assert.match(starter, /'server_name', publicHost/);
  assert.match(starter, /resolveWopiHealthBaseUrl/);
  assert.doesNotMatch(starter, /'indirection_endpoint\.url'/);
  assert.doesNotMatch(starter, /WOPISrc', 'http:\/\/127\.0\.0\.1\/editor-health-check'/);
});

test('docker fallback runs coolwsd directly without the source image version flag', () => {
  const starter = readFileSync(path.join(repoRoot, 'scripts', 'start-editor.mjs'), 'utf8');
  const dockerRunBlock = starter.slice(starter.indexOf("console.log(`[editor] starting Docker fallback"));
  assert.match(dockerRunBlock, /'--entrypoint',\s*'\/usr\/bin\/coolwsd'/);
  assert.match(starter, /const dockerCoolwsdArgs = \[/);
  assert.match(starter, /'--use-env-vars'/);
  assert.match(dockerRunBlock, /\.\.\.dockerCoolwsdArgs/);
  assert.doesNotMatch(dockerRunBlock, /'--version'/);
});

test('source debranding patch skips invalid CSP URL parsing in cool.html generation', () => {
  const patch = readFileSync(path.join(repoRoot, 'branding', 'debrand-online.sh'), 'utf8');
  assert.match(patch, /if \(url\.empty\(\)\)/);
  assert.match(patch, /url\.find\(":\/\/"\) == std::string::npos/);
  assert.match(patch, /url\.rfind\("\/\/", 0\) != 0/);
  assert.match(patch, /patched CSP URL handling for empty and authority-only sources/);
});
