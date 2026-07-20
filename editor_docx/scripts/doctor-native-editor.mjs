import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { inspectAcademicFontReadiness } from './academic-font-readiness.mjs';

const REQUIRED_COMMANDS = [
  'git',
  'node',
  'npm',
  'pm2',
  'coolwsd',
  'coolwsd-systemplate-setup',
  'setcap',
  'rsync',
  'fc-match',
];

function readEnv(name, fallback) {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const exact = `--${name}`;
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === exact) {
      return process.argv[index + 1] ?? 'true';
    }
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return '';
}

function runQuiet(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...options,
  });
}

function commandExists(command) {
  const result = runQuiet('sh', ['-lc', `command -v ${command}`], { timeout: 3_000 });
  if (result.status === 0 && Boolean(String(result.stdout ?? '').trim())) {
    return true;
  }

  return ['/usr/sbin', '/sbin'].some((directory) => {
    const candidate = path.join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1_500);
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

function checkPathWritable(filePath) {
  try {
    accessSync(filePath, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function addResult(results, ok, label, detail = '') {
  results.push({ ok, label, detail });
}

function printResults(results) {
  for (const result of results) {
    const prefix = result.ok ? '[ok]' : '[fail]';
    console.log(`${prefix} ${result.label}${result.detail ? ` - ${result.detail}` : ''}`);
  }
}

async function main() {
  const requireInstalled = parseArg('require-installed') === 'true';
  const results = [];

  addResult(
    results,
    process.platform === 'linux',
    'platform',
    process.platform === 'linux' ? 'Linux native runtime supported' : `current platform is ${process.platform}`,
  );

  if (process.platform !== 'linux') {
    printResults(results);
    console.error('[doctor:native] native runtime checks must be run on the Linux editor server.');
    process.exit(1);
  }

  for (const command of REQUIRED_COMMANDS) {
    addResult(results, commandExists(command), `command ${command}`);
  }

  const nodeVersion = runQuiet('node', ['--version']);
  addResult(
    results,
    /^v20\./.test(String(nodeVersion.stdout ?? '').trim()),
    'node version',
    String(nodeVersion.stdout ?? nodeVersion.stderr ?? '').trim() || 'not available',
  );

  const coolwsdBin = readEnv('EDITOR_NATIVE_COOLWSD_BIN', '/usr/bin/coolwsd');
  addResult(results, existsSync(coolwsdBin), 'coolwsd binary', coolwsdBin);

  const configPath = '/etc/coolwsd/coolwsd.xml';
  addResult(results, existsSync(configPath), 'coolwsd config', configPath);

  const officeDir = '/opt/collaboraoffice';
  addResult(results, existsSync(officeDir), 'office engine install dir', officeDir);

  const academicFonts = inspectAcademicFontReadiness();
  results.push(...academicFonts.results);

  const runtimeDir = readEnv('EDITOR_NATIVE_RUNTIME_DIR', '/var/lib/academic-editor');
  const cacheDir = readEnv('EDITOR_NATIVE_CACHE_DIR', '/var/cache/academic-editor');
  addResult(results, existsSync(runtimeDir) && statSync(runtimeDir).isDirectory(), 'runtime directory exists', runtimeDir);
  addResult(results, existsSync(cacheDir) && statSync(cacheDir).isDirectory(), 'cache directory exists', cacheDir);
  addResult(results, existsSync(runtimeDir) && checkPathWritable(runtimeDir), 'runtime directory writable', runtimeDir);
  addResult(results, existsSync(cacheDir) && checkPathWritable(cacheDir), 'cache directory writable', cacheDir);

  const hostPort = Number.parseInt(readEnv('EDITOR_HOST_PORT', '9980'), 10);
  const portOpen = Number.isFinite(hostPort) ? await canConnect('127.0.0.1', hostPort) : false;
  addResult(results, Number.isFinite(hostPort), 'editor port value', String(hostPort));
  addResult(
    results,
    requireInstalled ? portOpen : true,
    'editor port reachable',
    requireInstalled ? `127.0.0.1:${hostPort}` : 'not required unless --require-installed is passed',
  );

  const pm2Name = readEnv('EDITOR_NATIVE_PM2_NAME', 'academic-editor-native');
  const pm2Describe = runQuiet('pm2', ['describe', pm2Name], { timeout: 5_000 });
  addResult(
    results,
    requireInstalled ? pm2Describe.status === 0 : true,
    'pm2 process',
    requireInstalled ? pm2Name : 'not required unless --require-installed is passed',
  );

  printResults(results);

  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    console.error(`[doctor:native] ${failed.length} check(s) failed.`);
    process.exit(1);
  }

  console.log('[doctor:native] ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
