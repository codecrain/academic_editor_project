import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, '..', '..');
const rhwpRoot =
  process.env.RHWP_RUNTIME_ROOT ||
  path.resolve(editorRoot, 'editor_hwpx');
const rhwpPm2Name = process.env.RHWP_STUDIO_PM2_NAME || 'rhwp-studio-dev';
const gatewayPm2Name = process.env.EDITOR_GATEWAY_PM2_NAME || 'academic-editor-gateway-dev';
const gatewayHost = process.env.EDITOR_GATEWAY_HOST || '127.0.0.1';
const gatewayPort = String(process.env.EDITOR_GATEWAY_PORT || '11004');
const gatewayOrigin = normalizeOrigin(
  process.env.EDITOR_GATEWAY_PUBLIC_ORIGIN || `http://${gatewayHost}:${gatewayPort}`,
);
const rhwpBasePath = normalizeBasePath(process.env.RHWP_STUDIO_BASE_PATH || '/hwpx/');
const rhwpStaticRoot = path.resolve(rhwpRoot, 'rhwp-studio', 'dist');
const gatewayDocxReadyUrl = `${gatewayOrigin}/docx/`;
const gatewayHwpxReadyUrl = `${gatewayOrigin}${rhwpBasePath}`;
const docxHostPort = String(process.env.EDITOR_HOST_PORT || '9980');
const docxServiceRoot = normalizeServiceRoot(
  process.env.EDITOR_SERVICE_ROOT || process.env.EDITOR_DOCX_BASE_PATH || '/docx/',
);
const docxRuntimeInternalServerUrl = normalizeOrigin(
  process.env.EDITOR_RUNTIME_INTERNAL_SERVER_URL || `http://127.0.0.1:${docxHostPort}${docxServiceRoot}`,
);
const docxDiscoveryBase = normalizeOrigin(
  process.env.EDITOR_RUNTIME_DISCOVERY_SERVER_URL || docxRuntimeInternalServerUrl,
);
const docxReadyUrl = `${docxDiscoveryBase}/hosting/discovery`;
const gatewayWopiBaseUrl = normalizeOrigin(
  process.env.EDITOR_GATEWAY_WOPI_BASE_URL ||
    `http://${defaultWopiHost()}:${gatewayPort}`,
);
const foregroundChildren = [];
let cleanedUp = false;

function normalizeBasePath(value) {
  const raw = String(value || '/hwpx/').trim() || '/hwpx/';
  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
}

function normalizeServiceRoot(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') {
    return '';
  }

  const basePath = normalizeBasePath(raw);
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  const url = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  return new URL(url).toString().replace(/\/$/, '');
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function defaultWopiHost() {
  const runtimeMode = String(process.env.EDITOR_RUNTIME_MODE || 'auto').toLowerCase();
  if (runtimeMode === 'docker' || (runtimeMode === 'auto' && process.platform !== 'linux')) {
    return 'host.docker.internal';
  }
  return gatewayHost;
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

function run(command, args, options = {}) {
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    cwd: editorRoot,
    stdio: 'inherit',
    env: process.env,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function resolvePm2Command() {
  if (process.platform !== 'win32') {
    return 'pm2';
  }

  const probe = spawnSync('where.exe', ['pm2'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    windowsHide: true,
  });
  if (probe.status !== 0) {
    return '';
  }

  return String(probe.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function stopChild(child) {
  if (!child || child.killed || child.exitCode != null) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill('SIGTERM');
}

function cleanupForegroundChildren() {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;
  for (const child of foregroundChildren) {
    stopChild(child);
  }
}

function installCleanupHandlers() {
  process.once('SIGINT', () => {
    cleanupForegroundChildren();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanupForegroundChildren();
    process.exit(143);
  });
  process.once('exit', cleanupForegroundChildren);
}

function pm2Exists() {
  const command = resolvePm2Command();
  if (!command) {
    return false;
  }

  const resolved = resolveCommand(command, ['--version']);
  return spawnSync(resolved.command, resolved.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  }).status === 0;
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

async function waitFor(url, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canFetch(url)) {
      console.log(`[editors] ${label} ready: ${url}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

function startDocumentEditor() {
  console.log('[editors] starting DOCX document editor runtime...');
  run(process.execPath, [path.resolve(editorRoot, 'editor_docx', 'scripts', 'start-editor.mjs')], {
    cwd: editorRoot,
    env: {
      ...process.env,
      EDITOR_PUBLIC_URL: process.env.EDITOR_PUBLIC_URL || gatewayOrigin,
      EDITOR_SERVICE_ROOT: process.env.EDITOR_SERVICE_ROOT || docxServiceRoot,
      EDITOR_INTERNAL_SERVER_URL: process.env.EDITOR_RUNTIME_INTERNAL_SERVER_URL || docxRuntimeInternalServerUrl,
      EDITOR_DISCOVERY_SERVER_URL: process.env.EDITOR_RUNTIME_DISCOVERY_SERVER_URL || docxDiscoveryBase,
      EDITOR_WOPI_BASE_URL: process.env.EDITOR_WOPI_BASE_URL || gatewayWopiBaseUrl,
      EDITOR_WOPI_ALIASES: [process.env.EDITOR_WOPI_ALIASES, gatewayOrigin]
        .filter(Boolean)
        .join(','),
    },
  });
}

async function prepareRhwpStudioStaticBuild() {
  if (!existsSync(path.resolve(rhwpRoot, 'package.json'))) {
    throw new Error(
      `RHWP runtime package was not found: ${rhwpRoot}. Set RHWP_RUNTIME_ROOT if it lives elsewhere.`,
    );
  }
  console.log('[editors] building HWPX editor static assets...');
  if (pm2Exists()) {
    spawnSync('pm2', ['delete', rhwpPm2Name], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
      windowsHide: true,
    });
  }
  run(npmCommand(), ['run', 'build'], {
    cwd: rhwpRoot,
    env: {
      ...process.env,
      RHWP_STUDIO_BASE_PATH: rhwpBasePath,
    },
  });

  if (!existsSync(path.resolve(rhwpStaticRoot, 'index.html'))) {
    throw new Error(`HWPX editor static build was not found: ${rhwpStaticRoot}`);
  }
  console.log(`[editors] HWPX static assets ready: ${rhwpStaticRoot}`);
}

async function startGateway() {
  const gatewayScript = path.resolve(editorRoot, 'editor_docx', 'scripts', 'editor-gateway.mjs');
  const gatewayEnv = {
    ...process.env,
    EDITOR_GATEWAY_HOST: gatewayHost,
    EDITOR_GATEWAY_PORT: gatewayPort,
    EDITOR_GATEWAY_PUBLIC_ORIGIN: gatewayOrigin,
    EDITOR_GATEWAY_WOPI_BASE_URL: gatewayWopiBaseUrl,
    EDITOR_GATEWAY_DOCX_ORIGIN: `http://127.0.0.1:${docxHostPort}`,
    EDITOR_GATEWAY_HWPX_STATIC_ROOT: rhwpStaticRoot,
    EDITOR_SERVICE_ROOT: docxServiceRoot,
    RHWP_STUDIO_BASE_PATH: rhwpBasePath,
  };

  if (!pm2Exists()) {
    console.log('[editors] pm2 was not found; running editor gateway in the foreground with this dev process.');
    const child = spawn(process.execPath, [gatewayScript], {
      cwd: editorRoot,
      stdio: 'inherit',
      env: gatewayEnv,
      windowsHide: true,
    });
    foregroundChildren.push(child);
    child.once('exit', (code, signal) => {
      if (!cleanedUp && (code || signal)) {
        console.warn(`[editors] editor gateway exited with code=${code}${signal ? ` signal=${signal}` : ''}`);
      }
    });
    await waitFor(gatewayDocxReadyUrl, 'DOCX gateway');
    await waitFor(gatewayHwpxReadyUrl, 'HWPX gateway');
    return;
  }

  spawnSync('pm2', ['delete', gatewayPm2Name], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
    windowsHide: true,
  });

  run('pm2', ['start', process.execPath, '--name', gatewayPm2Name, '--', gatewayScript], {
    cwd: editorRoot,
    env: gatewayEnv,
    shell: process.platform === 'win32',
  });

  await waitFor(gatewayDocxReadyUrl, 'DOCX gateway');
  await waitFor(gatewayHwpxReadyUrl, 'HWPX gateway');
}

try {
  installCleanupHandlers();
  startDocumentEditor();
  await prepareRhwpStudioStaticBuild();
  await startGateway();
  console.log('[editors] local editor runtimes are ready.');
  console.log(`[editors] DOCX runtime: ${docxReadyUrl}`);
  console.log(`[editors] public DOCX: ${gatewayDocxReadyUrl}`);
  console.log(`[editors] public HWPX: ${gatewayHwpxReadyUrl}`);
  if (foregroundChildren.length > 0) {
    console.log('[editors] foreground mode is active. Press Ctrl+C to stop the editor gateway.');
    await new Promise(() => {});
  }
} catch (error) {
  cleanupForegroundChildren();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
