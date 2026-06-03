import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const DEFAULT_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_INTERVAL_MS = 2_000;
const DEFAULT_EDITOR_READY_TIMEOUT_MS = 90_000;
const DEFAULT_EDITOR_READY_INTERVAL_MS = 1_500;
const DEFAULT_EDITOR_IMAGE = 'academic-editor/document-editor:source';
const BLOCKED_CODE_IMAGE_NAMES = new Set([
  'collabora/code',
  'docker.io/collabora/code',
  'registry.hub.docker.com/collabora/code',
]);

function readEnv(primary, fallbackKey, fallback) {
  const value = process.env[primary] ?? (fallbackKey ? process.env[fallbackKey] : undefined);
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

function normalizeImageName(image) {
  const raw = String(image ?? '').trim().toLowerCase();
  if (!raw) {
    return '';
  }

  const withoutDigest = raw.split('@')[0] ?? raw;
  const lastColonIndex = withoutDigest.lastIndexOf(':');
  const lastSlashIndex = withoutDigest.lastIndexOf('/');
  if (lastColonIndex > lastSlashIndex) {
    return withoutDigest.slice(0, lastColonIndex);
  }
  return withoutDigest;
}

function assertAllowedEditorImage(image) {
  const normalized = normalizeImageName(image);
  if (BLOCKED_CODE_IMAGE_NAMES.has(normalized)) {
    throw new Error(
      [
        'Blocked document editor image: collabora/code is not allowed in this project.',
        'Commercial SaaS deployments must use a source-built image from this public repository',
        'or another image with a documented commercial-safe license basis.',
      ].join(' '),
    );
  }
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

function dockerInfo(command = ['docker']) {
  const result = runQuiet(command[0], [...command.slice(1), 'info', '--format', '{{.ServerVersion}}'], { timeout: 2_000 });
  if (result.error?.code === 'ENOENT') {
    throw new Error('Docker CLI is not installed or not available in PATH.');
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

  if (process.platform === 'darwin') {
    runQuiet('open', ['-gja', 'Docker']);
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
      console.log('[editor] Docker is not ready; attempting to start it...');
      startDockerDaemon();
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Docker daemon is not ready. Start Docker and retry.');
}

function runDocker(dockerCommand, args) {
  return run(dockerCommand[0], [...dockerCommand.slice(1), ...args]);
}

function runDockerQuiet(dockerCommand, args) {
  return runQuiet(dockerCommand[0], [...dockerCommand.slice(1), ...args]);
}

function dockerImageExists(dockerCommand, image) {
  const result = runDockerQuiet(dockerCommand, ['image', 'inspect', image]);
  return result.status === 0;
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

function getRuntimeMismatchReasons(current, expected) {
  if (!current) {
    return ['inspect'];
  }

  const reasons = [];
  for (const [key, value] of Object.entries(expected.env)) {
    if (current.env[key] !== value) {
      reasons.push(key);
    }
  }

  const hostPorts = getHostPorts(current.portBindings);
  if (!hostPorts.includes(expected.hostPort)) {
    reasons.push('host-port');
  }

  if (current.image !== expected.image) {
    reasons.push('image');
  }

  return reasons;
}

function requiresLocalSourceImage(image) {
  return normalizeImageName(image) === normalizeImageName(DEFAULT_EDITOR_IMAGE);
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

async function main() {
  const enabled = readEnv('EDITOR_ENABLED', null, 'true');
  if (enabled !== 'true') {
    console.log(`[editor] skipped because EDITOR_ENABLED=${enabled}`);
    return;
  }

  const containerName = readEnv('EDITOR_CONTAINER_NAME', null, 'academic-editor-local');
  const image = readEnv('EDITOR_IMAGE', null, DEFAULT_EDITOR_IMAGE);
  assertAllowedEditorImage(image);
  const hostPort = readEnv('EDITOR_HOST_PORT', null, '9980');
  const allowedDomain = readEnv('EDITOR_ALLOWED_DOMAIN', null, '.*');
  const adminUsername = readEnv('EDITOR_ADMIN_USERNAME', null, 'admin');
  const adminPassword = readEnv('EDITOR_ADMIN_PASSWORD', null, 'document-editor-password');
  const extraParams = withPublicServerName(
    readEnv(
      'EDITOR_EXTRA_PARAMS',
      null,
      buildDefaultExtraParams(),
    ),
  );
  const recreate = readEnv('EDITOR_RECREATE', null, 'false') === 'true';
  const readyTimeoutMs = parsePositiveInteger(
    process.env.EDITOR_READY_TIMEOUT_MS,
    DEFAULT_EDITOR_READY_TIMEOUT_MS,
  );
  const readyIntervalMs = parsePositiveInteger(
    process.env.EDITOR_READY_INTERVAL_MS,
    DEFAULT_EDITOR_READY_INTERVAL_MS,
  );
  const discoveryUrl = resolveEditorDiscoveryUrl(hostPort);

  const discoveryAlreadyReachable = !recreate && (await waitForEditor(discoveryUrl, 2_000, 500));
  const dockerCommand = await waitForDocker();
  if (requiresLocalSourceImage(image) && !dockerImageExists(dockerCommand, image)) {
    throw new Error(
      `Document editor image ${image} is not built yet. Run "npm run build:source" in academic_editor_project first.`,
    );
  }

  const expectedRuntime = {
    image,
    hostPort,
    env: {
      domain: allowedDomain,
      username: adminUsername,
      password: adminPassword,
      extra_params: extraParams,
    },
  };

  if (discoveryAlreadyReachable && !dockerNames(dockerCommand, true).has(containerName)) {
    console.log(`[editor] document editor is already reachable at ${discoveryUrl}.`);
    return;
  }

  if (recreate && dockerNames(dockerCommand, true).has(containerName)) {
    console.log(`[editor] recreating ${containerName}...`);
    runDocker(dockerCommand, ['rm', '-f', containerName]);
  }

  if (dockerNames(dockerCommand, false).has(containerName)) {
    const mismatchReasons = getRuntimeMismatchReasons(
      inspectContainer(dockerCommand, containerName),
      expectedRuntime,
    );
    if (mismatchReasons.length) {
      console.log(`[editor] recreating ${containerName} because runtime config changed: ${mismatchReasons.join(', ')}`);
      runDocker(dockerCommand, ['rm', '-f', containerName]);
    } else {
      console.log(`[editor] ${containerName} is already running. Waiting for ${discoveryUrl}...`);
      if (await waitForEditor(discoveryUrl, readyTimeoutMs, readyIntervalMs)) {
        console.log(`[editor] document editor is ready at ${discoveryUrl}.`);
        return;
      }
      console.log(`[editor] ${containerName} is running but not ready; recreating it.`);
      runDocker(dockerCommand, ['rm', '-f', containerName]);
    }
  }

  if (dockerNames(dockerCommand, false).has(containerName)) {
    console.log(`[editor] ${containerName} is already running. Waiting for ${discoveryUrl}...`);
    if (await waitForEditor(discoveryUrl, readyTimeoutMs, readyIntervalMs)) {
      console.log(`[editor] document editor is ready at ${discoveryUrl}.`);
      return;
    }
    throw new Error(`Document editor container is running but ${discoveryUrl} did not become ready.`);
  }

  if (dockerNames(dockerCommand, true).has(containerName)) {
    runDocker(dockerCommand, ['rm', '-f', containerName]);
  }

  console.log(`[editor] starting ${image} on port ${hostPort}...`);
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
    `${hostPort}:9980`,
    '-e',
    `domain=${allowedDomain}`,
    '-e',
    `username=${adminUsername}`,
    '-e',
    `password=${adminPassword}`,
    '-e',
    `extra_params=${extraParams}`,
    image,
  ]);

  console.log(`[editor] waiting for ${discoveryUrl}...`);
  if (!(await waitForEditor(discoveryUrl, readyTimeoutMs, readyIntervalMs))) {
    throw new Error(`Document editor started but ${discoveryUrl} did not become ready in ${readyTimeoutMs}ms.`);
  }

  console.log(`[editor] document editor is ready at ${discoveryUrl}.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
