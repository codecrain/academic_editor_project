import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const exact = `--${name}`;
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === exact) {
      return process.argv[index + 1] ?? '';
    }
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return '';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout ?? 30_000,
    env: options.env ?? process.env,
  });

  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
    error: result.error?.message ?? '',
  };
}

function redact(value) {
  const raw = String(value ?? '');
  if (!raw) {
    return '';
  }
  return raw.length <= 6 ? '[set]' : `${raw.slice(0, 2)}...[redacted]`;
}

function safeRuntimeEnv() {
  return {
    EDITOR_RUNTIME_MODE: readEnv('EDITOR_RUNTIME_MODE', 'native'),
    EDITOR_NATIVE_PM2_NAME: readEnv('EDITOR_NATIVE_PM2_NAME', 'academic-editor-native'),
    EDITOR_HOST_PORT: readEnv('EDITOR_HOST_PORT', '9980'),
    EDITOR_PUBLIC_URL: readEnv('EDITOR_PUBLIC_URL'),
    EDITOR_INTERNAL_SERVER_URL: readEnv('EDITOR_INTERNAL_SERVER_URL'),
    EDITOR_DISCOVERY_SERVER_URL: readEnv('EDITOR_DISCOVERY_SERVER_URL'),
    EDITOR_ALLOWED_DOMAIN: readEnv('EDITOR_ALLOWED_DOMAIN'),
    EDITOR_NATIVE_RUNTIME_DIR: readEnv('EDITOR_NATIVE_RUNTIME_DIR', '/var/lib/academic-editor'),
    EDITOR_NATIVE_CACHE_DIR: readEnv('EDITOR_NATIVE_CACHE_DIR', '/var/cache/academic-editor'),
    EDITOR_SOURCE_REPO: readEnv('EDITOR_SOURCE_REPO', 'https://gerrit.collaboraoffice.com/online'),
    EDITOR_SOURCE_REF: readEnv('EDITOR_SOURCE_REF', 'main'),
    EDITOR_ADMIN_USERNAME: readEnv('EDITOR_ADMIN_USERNAME') ? '[set]' : '',
    EDITOR_ADMIN_PASSWORD: redact(readEnv('EDITOR_ADMIN_PASSWORD')),
  };
}

function fetchDiscovery(port) {
  return new Promise((resolve) => {
    const url = `http://127.0.0.1:${port}/hosting/discovery`;
    const request = http.get(url, { timeout: 5_000 }, (response) => {
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += Buffer.byteLength(chunk);
      });
      response.on('end', () => {
        resolve({
          command: `GET ${url}`,
          ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 500 && bytes > 0),
          status: response.statusCode ?? 0,
          bytes,
        });
      });
    });

    request.once('timeout', () => {
      request.destroy();
      resolve({ command: `GET ${url}`, ok: false, status: 0, bytes: 0, error: 'timeout' });
    });
    request.once('error', (error) => {
      resolve({ command: `GET ${url}`, ok: false, status: 0, bytes: 0, error: error.message });
    });
  });
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(repoRoot, '.build', 'audits', `native-runtime-audit-${timestamp}.json`);
}

async function main() {
  const outputPath = path.resolve(parseArg('output') || defaultOutputPath());
  const hostPort = Number.parseInt(readEnv('EDITOR_HOST_PORT', '9980'), 10);
  const audit = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    repository: {
      commit: run('git', ['rev-parse', 'HEAD']).stdout,
      dirty: run('git', ['status', '--porcelain']).stdout,
      remote: run('git', ['remote', 'get-url', 'origin']).stdout,
    },
    runtimeEnv: safeRuntimeEnv(),
    checks: {
      platform: {
        command: 'process.platform',
        ok: process.platform === 'linux',
        value: process.platform,
      },
      publicSafety: run(process.execPath, [path.join('scripts', 'verify-public-safety.mjs')]),
      doctor: run(process.execPath, [path.join('scripts', 'doctor-native-editor.mjs'), '--require-installed'], {
        env: {
          ...process.env,
          EDITOR_RUNTIME_MODE: 'native',
        },
      }),
      status: run(process.execPath, [path.join('scripts', 'status-editor.mjs'), '--runtime', 'native'], {
        env: {
          ...process.env,
          EDITOR_RUNTIME_MODE: 'native',
        },
      }),
      discovery: Number.isFinite(hostPort)
        ? await fetchDiscovery(hostPort)
        : { command: 'parse EDITOR_HOST_PORT', ok: false, status: 0, bytes: 0, error: 'invalid port' },
    },
  };

  audit.ok = Object.values(audit.checks).every((check) => check.ok === true);

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);

  console.log(`[audit:native] wrote ${outputPath}`);
  console.log(`[audit:native] ${audit.ok ? 'ok' : 'failed'}`);
  if (!audit.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
