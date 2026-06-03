import assert from 'node:assert/strict';
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

test('start-editor reuses an already reachable editor before Docker fallback checks', async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/hosting/discovery') {
      response.writeHead(200, { 'Content-Type': 'text/xml' });
      response.end('<wopi-discovery />');
      return;
    }

    response.writeHead(404);
    response.end();
  });

  const address = await listen(server);

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
    assert.match(result.stdout, /already reachable/);
  } finally {
    await close(server);
  }
});
