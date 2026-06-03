import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_INTERVAL_MS = 2_000;
const DEFAULT_EDITOR_READY_TIMEOUT_MS = 90_000;
const DEFAULT_EDITOR_READY_INTERVAL_MS = 1_500;
const DEFAULT_EDITOR_IMAGE = 'academic-editor/document-editor:source';
const DEFAULT_NATIVE_PM2_NAME = 'academic-editor-native';
const BLOCKED_CODE_IMAGE_NAMES = new Set([
  'collabora/code',
  'docker.io/collabora/code',
  'registry.hub.docker.com/collabora/code',
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readEnv(name, fallback) {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function readFirstEnv(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
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

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const url = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const parsed = new URL(url);
  return parsed.toString().replace(/\/$/, '');
}

function normalizeImageName(image) {
  const raw = String(image ?? '').trim().toLowerCase();
  if (!raw) {
    return '';
  }

  const withoutDigest = raw.split('@')[0] ?? raw;
  const lastColonIndex = withoutDigest.lastIndexOf(':');
  const lastSlashIndex = withoutDigest.lastIndexOf('/');
  return lastColonIndex > lastSlashIndex ? withoutDigest.slice(0, lastColonIndex) : withoutDigest;
}

function assertAllowedEditorImage(image) {
  if (BLOCKED_CODE_IMAGE_NAMES.has(normalizeImageName(image))) {
    throw new Error(
      [
        'Blocked document editor image: collabora/code is not allowed in this project.',
        'Commercial SaaS deployments must use the native source-built runtime,',
        'this repository source-built image, or another documented commercial-safe runtime.',
      ].join(' '),
    );
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
  return result;
}

function runQuiet(command, args, options = {}) {
  return spawnSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...options });
}

function resolvePublicHost() {
  const publicUrl = readFirstEnv([
    'EDITOR_PUBLIC_URL',
    'EDITOR_DOCUMENT_SERVER_URL',
  ]);
  if (!publicUrl) {
    return '';
  }

  try {
    return new URL(publicUrl).host;
  } catch {
    return '';
  }
}

function resolvePublicProtocol() {
  const publicUrl = readFirstEnv([
    'EDITOR_PUBLIC_URL',
    'EDITOR_DOCUMENT_SERVER_URL',
  ]);
  if (!publicUrl) {
    return '';
  }

  try {
    return new URL(publicUrl).protocol;
  } catch {
    return '';
  }
}

function buildDefaultExtraParams() {
  const sslTermination = resolvePublicProtocol() === 'https:' ? 'true' : 'false';
  return `--o:ssl.enable=false --o:ssl.termination=${sslTermination} --o:welcome.enable=false --o:allow_update_popup=false`;
}

function withPublicServerName(extraParams) {
  if (/(^|\s)--o:server_name=/.test(extraParams)) {
    return extraParams;
  }

  const publicHost = resolvePublicHost();
  return publicHost ? `${extraParams} --o:server_name=${publicHost}` : extraParams;
}

function resolveEditorDiscoveryUrl(hostPort) {
  const configured = readFirstEnv([
    'EDITOR_HEALTH_URL',
    'EDITOR_DISCOVERY_SERVER_URL',
    'EDITOR_INTERNAL_SERVER_URL',
  ]);
  const origin = normalizeOrigin(configured || `http://127.0.0.1:${hostPort}`);
  return `${origin}/hosting/discovery`;
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
    const request = client.get(parsed, { timeout: 2_000 }, (response) => {
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

async function waitForEditor(discoveryUrl, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await canFetch(discoveryUrl)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

function dockerInfo(command = ['docker']) {
  const result = runQuiet(command[0], [...command.slice(1), 'info', '--format', '{{.ServerVersion}}'], { timeout: 2_000 });
  if (result.error?.code === 'ENOENT') {
    return false;
  }
  const stdout = String(result.stdout ?? '').trim();
  const stderr = String(result.stderr ?? '');
  return result.status === 0 && Boolean(stdout) && !/error during connect|cannot connect/i.test(stderr);
}

function resolveDockerCommand() {
  if (dockerInfo(['docker'])) {
    return ['docker'];
  }

  if (process.platform !== 'win32' && dockerInfo(['sudo', '-n', 'docker'])) {
    return ['sudo', '-n', 'docker'];
  }

  return null;
}

function startDockerDaemon() {
  if (process.platform === 'win32') {
    const dockerDesktopPath = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe');
    if (existsSync(dockerDesktopPath)) {
      runQuiet('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Start-Process -FilePath '${dockerDesktopPath.replace(/'/g, "''")}' -WindowStyle Hidden`,
      ]);
    }
    runQuiet('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Start-Service -Name com.docker.service -ErrorAction SilentlyContinue',
    ]);
    return;
  }

  runQuiet('sudo', ['-n', 'systemctl', 'start', 'docker']);
  runQuiet('sudo', ['-n', 'service', 'docker', 'start']);
}

async function waitForDocker() {
  const timeoutMs = parsePositiveInteger(process.env.EDITOR_DOCKER_WAIT_TIMEOUT_MS, DEFAULT_WAIT_TIMEOUT_MS);
  const intervalMs = parsePositiveInteger(process.env.EDITOR_DOCKER_WAIT_INTERVAL_MS, DEFAULT_WAIT_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  let attemptedStart = false;

  while (Date.now() < deadline) {
    const dockerCommand = resolveDockerCommand();
    if (dockerCommand) {
      return dockerCommand;
    }

    if (!attemptedStart) {
      attemptedStart = true;
      console.log('[editor] Docker is not ready; attempting to start it for fallback runtime...');
      startDockerDaemon();
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Docker daemon is not ready. Native runtime is preferred; use npm run build:native && npm run install:native on Linux.');
}

function runDockerQuiet(dockerCommand, args) {
  return runQuiet(dockerCommand[0], [...dockerCommand.slice(1), ...args]);
}

function runDocker(dockerCommand, args) {
  return run(dockerCommand[0], [...dockerCommand.slice(1), ...args]);
}

function shouldAutoBuildSourceImage() {
  return readEnv('EDITOR_AUTO_BUILD_SOURCE_IMAGE', 'false') === 'true';
}

function dockerImageExists(dockerCommand, image) {
  return runDockerQuiet(dockerCommand, ['image', 'inspect', image]).status === 0;
}

function dockerNames(dockerCommand, all = false) {
  const args = all ? ['ps', '-a', '--format', '{{.Names}}'] : ['ps', '--format', '{{.Names}}'];
  const result = runDockerQuiet(dockerCommand, args);
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function inspectContainer(dockerCommand, containerName) {
  const result = runDockerQuiet(dockerCommand, [
    'inspect',
    containerName,
    '--format',
    '{{json .Config.Env}}\n{{json .HostConfig.PortBindings}}\n{{.Config.Image}}',
  ]);
  if (result.status !== 0) {
    return null;
  }

  const [envJson = '[]', portBindingsJson = '{}', image = ''] = result.stdout.trim().split(/\r?\n/);
  const envEntries = JSON.parse(envJson);
  const env = Object.fromEntries(
    envEntries
      .map((entry) => {
        const index = String(entry).indexOf('=');
        return index >= 0 ? [String(entry).slice(0, index), String(entry).slice(index + 1)] : null;
      })
      .filter(Boolean),
  );

  return {
    env,
    image,
    portBindings: JSON.parse(portBindingsJson),
  };
}

function getHostPorts(portBindings) {
  const bindings = portBindings?.['9980/tcp'];
  if (!Array.isArray(bindings)) {
    return [];
  }
  return bindings.map((binding) => String(binding?.HostPort ?? '')).filter(Boolean);
}

function getDockerMismatchReasons(current, expected) {
  if (!current) {
    return ['inspect'];
  }

  const reasons = [];
  for (const [key, value] of Object.entries(expected.env)) {
    if (current.env[key] !== value) {
      reasons.push(key);
    }
  }

  if (!getHostPorts(current.portBindings).includes(expected.hostPort)) {
    reasons.push('host-port');
  }

  if (current.image !== expected.image) {
    reasons.push('image');
  }

  return reasons;
}

function pm2Exists() {
  return runQuiet('pm2', ['--version'], { timeout: 2_000 }).status === 0;
}

function nativeInstalled() {
  return process.platform === 'linux' && existsSync(readEnv('EDITOR_NATIVE_COOLWSD_BIN', '/usr/bin/coolwsd'));
}

function resolveRuntimeMode() {
  const requested = (parseArg('runtime') || readEnv('EDITOR_RUNTIME_MODE', 'auto')).toLowerCase();
  if (!['auto', 'native', 'docker'].includes(requested)) {
    throw new Error(`Invalid EDITOR_RUNTIME_MODE=${requested}. Use auto, native, or docker.`);
  }

  if (requested !== 'auto') {
    return requested;
  }

  return nativeInstalled() && pm2Exists() ? 'native' : 'docker';
}

async function startNative(context) {
  if (process.platform !== 'linux') {
    throw new Error('Native document editor runtime is supported on Linux only. Use EDITOR_RUNTIME_MODE=auto for Windows local fallback.');
  }
  if (!nativeInstalled()) {
    throw new Error('Native document editor is not installed. Run npm run deps:native, npm run build:native, then npm run install:native.');
  }
  if (!pm2Exists()) {
    throw new Error('pm2 is required for native editor runtime. Install pm2 or run npm run deps:native on the server.');
  }

  const pm2Name = readEnv('EDITOR_NATIVE_PM2_NAME', DEFAULT_NATIVE_PM2_NAME);
  const runnerPath = path.join(__dirname, 'run-native-editor.mjs');
  const describe = runQuiet('pm2', ['describe', pm2Name]);
  const recreate = readEnv('EDITOR_RECREATE', 'false') === 'true';
  const env = {
    ...process.env,
    EDITOR_ALLOWED_DOMAIN: context.allowedDomain,
    EDITOR_ADMIN_USERNAME: context.adminUsername,
    EDITOR_ADMIN_PASSWORD: context.adminPassword,
    EDITOR_HOST_PORT: context.hostPort,
    EDITOR_EXTRA_PARAMS: context.extraParams,
  };

  if (!recreate && describe.status === 0 && (await waitForEditor(context.discoveryUrl, 2_000, 500))) {
    console.log(`[editor] native pm2 process ${pm2Name} is already ready at ${context.discoveryUrl}.`);
    return;
  }

  if (describe.status === 0) {
    console.log(`[editor] restarting native pm2 process ${pm2Name}...`);
    run('pm2', ['restart', pm2Name, '--update-env'], { env });
  } else {
    console.log(`[editor] starting native pm2 process ${pm2Name}...`);
    run('pm2', ['start', runnerPath, '--name', pm2Name, '--update-env'], { env });
  }

  console.log(`[editor] waiting for ${context.discoveryUrl}...`);
  if (!(await waitForEditor(context.discoveryUrl, context.readyTimeoutMs, context.readyIntervalMs))) {
    throw new Error(`Native document editor started but ${context.discoveryUrl} did not become ready in ${context.readyTimeoutMs}ms.`);
  }

  console.log(`[editor] native document editor is ready at ${context.discoveryUrl}.`);
}

async function startDocker(context) {
  const image = readEnv('EDITOR_IMAGE', DEFAULT_EDITOR_IMAGE);
  assertAllowedEditorImage(image);
  const containerName = readEnv('EDITOR_CONTAINER_NAME', 'academic-editor-local');
  const recreate = readEnv('EDITOR_RECREATE', 'false') === 'true';
  const discoveryAlreadyReachable = !recreate && (await waitForEditor(context.discoveryUrl, 2_000, 500));
  if (discoveryAlreadyReachable) {
    console.log(`[editor] document editor is already reachable at ${context.discoveryUrl}.`);
    return;
  }

  const dockerCommand = await waitForDocker();

  if (normalizeImageName(image) === normalizeImageName(DEFAULT_EDITOR_IMAGE) && !dockerImageExists(dockerCommand, image)) {
    if (!shouldAutoBuildSourceImage()) {
      throw new Error(
        `Document editor image ${image} is not built yet. Prefer native runtime on Linux or run "npm run build:source" for Docker fallback.`,
      );
    }

    console.log(`[editor] source-built fallback image ${image} is missing; building it now...`);
    run(process.execPath, [path.join(__dirname, 'build-source-editor-image.mjs')], {
      env: {
        ...process.env,
        EDITOR_IMAGE: image,
      },
    });
  }

  const expectedRuntime = {
    image,
    hostPort: context.hostPort,
    env: {
      domain: context.allowedDomain,
      username: context.adminUsername,
      password: context.adminPassword,
      extra_params: context.extraParams,
    },
  };

  if (recreate && dockerNames(dockerCommand, true).has(containerName)) {
    console.log(`[editor] recreating ${containerName}...`);
    runDocker(dockerCommand, ['rm', '-f', containerName]);
  }

  if (dockerNames(dockerCommand, false).has(containerName)) {
    const mismatchReasons = getDockerMismatchReasons(
      inspectContainer(dockerCommand, containerName),
      expectedRuntime,
    );
    if (mismatchReasons.length) {
      console.log(`[editor] recreating ${containerName} because runtime config changed: ${mismatchReasons.join(', ')}`);
      runDocker(dockerCommand, ['rm', '-f', containerName]);
    } else if (await waitForEditor(context.discoveryUrl, context.readyTimeoutMs, context.readyIntervalMs)) {
      console.log(`[editor] docker fallback editor is ready at ${context.discoveryUrl}.`);
      return;
    } else {
      console.log(`[editor] ${containerName} is running but not ready; recreating it.`);
      runDocker(dockerCommand, ['rm', '-f', containerName]);
    }
  }

  if (dockerNames(dockerCommand, true).has(containerName)) {
    runDocker(dockerCommand, ['rm', '-f', containerName]);
  }

  console.log(`[editor] starting Docker fallback ${image} on port ${context.hostPort}...`);
  runDocker(dockerCommand, [
    'run',
    '-d',
    '--name',
    containerName,
    '--restart',
    'unless-stopped',
    '--cap-add',
    'MKNOD',
    '--add-host=host.docker.internal:host-gateway',
    '-p',
    `${context.hostPort}:9980`,
    '-e',
    `domain=${context.allowedDomain}`,
    '-e',
    `username=${context.adminUsername}`,
    '-e',
    `password=${context.adminPassword}`,
    '-e',
    `extra_params=${context.extraParams}`,
    image,
  ]);

  console.log(`[editor] waiting for ${context.discoveryUrl}...`);
  if (!(await waitForEditor(context.discoveryUrl, context.readyTimeoutMs, context.readyIntervalMs))) {
    throw new Error(`Docker fallback editor started but ${context.discoveryUrl} did not become ready in ${context.readyTimeoutMs}ms.`);
  }

  console.log(`[editor] docker fallback editor is ready at ${context.discoveryUrl}.`);
}

async function main() {
  const enabled = readEnv('EDITOR_ENABLED', 'true');
  if (enabled !== 'true') {
    console.log(`[editor] skipped because EDITOR_ENABLED=${enabled}`);
    return;
  }

  const hostPort = readEnv('EDITOR_HOST_PORT', '9980');
  const runtimeMode = resolveRuntimeMode();
  const context = {
    runtimeMode,
    hostPort,
    allowedDomain: readEnv('EDITOR_ALLOWED_DOMAIN', '.*'),
    adminUsername: readEnv('EDITOR_ADMIN_USERNAME', 'admin'),
    adminPassword: readEnv('EDITOR_ADMIN_PASSWORD', 'document-editor-password'),
    extraParams: withPublicServerName(readEnv('EDITOR_EXTRA_PARAMS', buildDefaultExtraParams())),
    discoveryUrl: resolveEditorDiscoveryUrl(hostPort),
    readyTimeoutMs: parsePositiveInteger(process.env.EDITOR_READY_TIMEOUT_MS, DEFAULT_EDITOR_READY_TIMEOUT_MS),
    readyIntervalMs: parsePositiveInteger(process.env.EDITOR_READY_INTERVAL_MS, DEFAULT_EDITOR_READY_INTERVAL_MS),
  };

  console.log(`[editor] runtime mode: ${runtimeMode}`);
  if (runtimeMode === 'native') {
    await startNative(context);
    return;
  }

  await startDocker(context);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
