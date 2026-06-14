import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(__dirname, '..');
const studioRoot = path.resolve(runtimeRoot, 'rhwp-studio');

const mode = process.argv[2] === 'dev' ? 'dev' : 'preview';
const host = process.env.RHWP_STUDIO_HOST || '127.0.0.1';
const port = String(process.env.RHWP_STUDIO_PORT || '11004');
const basePath = normalizeBasePath(process.env.RHWP_STUDIO_BASE_PATH || '/hwpx/');
const origin = normalizeOrigin(
  process.env.RHWP_STUDIO_PROXY_ORIGIN || `http://${host}:${port}`,
);
const readyUrl = `${origin}${basePath}`;

function normalizeBasePath(value) {
  const raw = String(value || '/hwpx/').trim() || '/hwpx/';
  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  const url = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  return new URL(url).toString().replace(/\/$/, '');
}

function quoteWindowsArg(value) {
  const raw = String(value);
  return /[\s"&()^|<>]/.test(raw) ? `"${raw.replace(/"/g, '\\"')}"` : raw;
}

function resolveCommand(command, args) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(' ')],
    };
  }
  return { command, args };
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function nodeCommand() {
  return process.execPath;
}

function runEnsure() {
  const args = [path.resolve(__dirname, 'ensure-studio.mjs')];
  const result = spawnSync(nodeCommand(), args, {
    cwd: runtimeRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      RHWP_STUDIO_BASE_PATH: basePath,
    },
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function canFetch(url) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve(false);
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 500));
    });
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.once('error', () => resolve(false));
  });
}

async function waitForReady() {
  const deadline = Date.now() + Number(process.env.RHWP_STUDIO_READY_TIMEOUT_MS || 60000);
  while (Date.now() < deadline) {
    if (await canFetch(readyUrl)) {
      console.log(`[rhwp] ready: ${readyUrl}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.warn(`[rhwp] started but did not become reachable at ${readyUrl}`);
}

runEnsure();

const args =
  mode === 'dev'
    ? ['run', 'dev', '--', '--host', host, '--port', port, `--base=${basePath}`]
    : ['run', 'preview', '--', '--host', host, '--port', port, `--base=${basePath}`];

console.log(`[rhwp] starting ${mode} server on ${readyUrl}`);
const resolved = resolveCommand(npmCommand(), args);
const child = spawn(resolved.command, resolved.args, {
  cwd: studioRoot,
  stdio: 'inherit',
  env: process.env,
  shell: false,
  windowsHide: true,
});

void waitForReady();

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
