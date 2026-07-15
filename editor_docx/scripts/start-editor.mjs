import { existsSync, readdirSync, statSync } from 'node:fs';
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
const DOCX_EXTRA_FONTS_TARGET = '/opt/collaboraoffice/share/fonts/truetype/tlooto';
const BLOCKED_CODE_IMAGE_NAMES = new Set([
  'collabora/code',
  'docker.io/collabora/code',
  'registry.hub.docker.com/collabora/code',
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const DEFAULT_DOCX_EXTRA_FONTS_DIR = path.join(repoRoot, 'editor_docx', 'assets', 'fonts');

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

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function resolveDocxExtraFontsDir() {
  const configured = readFirstEnv([
    'EDITOR_DOCX_EXTRA_FONTS_DIR',
    'EDITOR_EXTRA_FONTS_DIR',
  ]) || DEFAULT_DOCX_EXTRA_FONTS_DIR;

  if (/^(none|false|0|off)$/i.test(configured)) {
    return '';
  }

  const resolved = resolveRepoPath(configured);
  try {
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      return '';
    }
    return readdirSync(resolved).some((name) => /\.(ttf|otf|ttc)$/i.test(name)) ? resolved : '';
  } catch {
    return '';
  }
}

function getDocxExtraFontBinds(sourceDir) {
  return sourceDir ? [`${sourceDir}:${DOCX_EXTRA_FONTS_TARGET}:ro`] : [];
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

function parseDockerByteSize(value, fallback = 0) {
  const raw = String(value ?? '').trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)([bkmg])?$/);
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return fallback;
  }

  const multipliers = {
    b: 1,
    k: 1024,
    m: 1024 * 1024,
    g: 1024 * 1024 * 1024,
  };
  return Math.round(amount * (multipliers[match[2] || 'b'] ?? 1));
}

function splitArgs(input) {
  const args = [];
  let current = '';
  let quote = '';
  let escaped = false;

  for (const char of String(input ?? '')) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current) {
    args.push(current);
  }
  return args;
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

function normalizeServiceRoot(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '/') {
    return '';
  }

  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart.slice(0, -1) : withStart;
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

function resolvePublicUrl() {
  const publicUrl = readFirstEnv([
    'EDITOR_PUBLIC_URL',
    'EDITOR_DOCUMENT_SERVER_URL',
  ]);
  return publicUrl;
}

function resolvePublicOrigin() {
  const publicUrl = resolvePublicUrl();
  if (!publicUrl) {
    return '';
  }

  try {
    return new URL(publicUrl).origin;
  } catch {
    return '';
  }
}

function resolvePublicHost() {
  const publicUrl = resolvePublicUrl();
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
  const publicUrl = resolvePublicUrl();
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
  return `--o:ssl.enable=false --o:ssl.termination=${sslTermination} --o:welcome.enable=false --o:allow_update_popup=false --o:experimental_features=false`;
}

function normalizeAliasOrigin(value) {
  try {
    return normalizeOrigin(value);
  } catch {
    return '';
  }
}

function splitAliasList(value) {
  return String(value || '')
    .split(',')
    .map((item) => normalizeAliasOrigin(item.trim()))
    .filter(Boolean);
}

function resolveWopiAliasGroup() {
  const explicit = readFirstEnv([
    'EDITOR_WOPI_ALIASGROUP1',
    'EDITOR_WOPI_ALIAS_GROUP',
  ]);
  if (explicit) {
    return explicit;
  }

  const configured = readFirstEnv([
    'EDITOR_WOPI_BASE_URL',
    'EDITOR_DEFAULT_WOPI_HOST',
  ]);
  if (!configured) {
    return '';
  }

  const canonical = normalizeAliasOrigin(configured);
  if (!canonical) {
    return '';
  }

  return [canonical, ...splitAliasList(process.env.EDITOR_WOPI_ALIASES)]
    .filter((item, index, items) => item && items.indexOf(item) === index)
    .join(',');
}

function withConfigParam(extraParams, key, value) {
  const paramPrefix = `--o:${key}=`;
  if (extraParams.split(/\s+/).some((part) => part.startsWith(paramPrefix))) {
    return extraParams;
  }

  return `${extraParams} ${paramPrefix}${value}`;
}

function withNativeWopiAliasGroupParams(extraParams, aliasGroup) {
  const origins = String(aliasGroup || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    return extraParams;
  }

  let params = withConfigParam(extraParams, 'storage.wopi.alias_groups[@mode]', 'groups');
  params = withConfigParam(params, 'storage.wopi.alias_groups.group[0].host[@allow]', 'true');
  params = withConfigParam(params, 'storage.wopi.alias_groups.group[0].host', origins[0]);
  for (const [index, origin] of origins.slice(1).entries()) {
    params = withConfigParam(params, `storage.wopi.alias_groups.group[0].alias[${index}]`, origin);
  }
  return params;
}

function withPublicEditorParams(extraParams) {
  let params = extraParams;
  const publicHost = resolvePublicHost();

  if (publicHost) {
    params = withConfigParam(params, 'server_name', publicHost);
  }

  return params;
}

function withServiceRootParam(extraParams, serviceRoot) {
  if (!serviceRoot) {
    return extraParams;
  }

  return withConfigParam(extraParams, 'net.service_root', serviceRoot);
}

function resolveWopiHealthBaseUrl() {
  const configured = readFirstEnv([
    'EDITOR_WOPI_BASE_URL',
    'EDITOR_DEFAULT_WOPI_HOST',
  ]);

  if (configured) {
    return normalizeOrigin(configured);
  }

  return resolvePublicOrigin() || 'http://127.0.0.1';
}

function ensureUrlUsesServiceRoot(url, serviceRoot) {
  const normalized = normalizeOrigin(url);
  const root = normalizeServiceRoot(serviceRoot);
  if (!root) {
    return normalized;
  }

  const parsed = new URL(normalized);
  const pathname = parsed.pathname.replace(/\/$/, '');
  if (!pathname || pathname === '/') {
    parsed.pathname = root;
    return parsed.toString().replace(/\/$/, '');
  }
  if (pathname === root || pathname.startsWith(`${root}/`)) {
    return parsed.toString().replace(/\/$/, '');
  }
  if (pathname === '/hosting/discovery') {
    parsed.pathname = `${root}/hosting/discovery`;
    return parsed.toString().replace(/\/$/, '');
  }
  return normalized;
}

function resolveEditorDiscoveryUrl(hostPort, serviceRoot = '') {
  const configured = readFirstEnv([
    'EDITOR_HEALTH_URL',
    'EDITOR_DISCOVERY_SERVER_URL',
    'EDITOR_INTERNAL_SERVER_URL',
  ]);
  const origin = ensureUrlUsesServiceRoot(configured || `http://127.0.0.1:${hostPort}${serviceRoot}`, serviceRoot);
  return /\/hosting\/discovery\/?$/i.test(origin) ? origin : `${origin}/hosting/discovery`;
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

function fetchUrl(url) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      resolve({ ok: false, statusCode: 0, body: '', error: error instanceof Error ? error.message : String(error) });
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const request = client.get(parsed, { timeout: 5_000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        const statusCode = response.statusCode ?? 0;
        resolve({
          ok: statusCode >= 200 && statusCode < 400,
          statusCode,
          body,
          error: '',
        });
      });
    });

    request.once('timeout', () => {
      request.destroy();
      resolve({ ok: false, statusCode: 0, body: '', error: 'timeout' });
    });
    request.once('error', (error) => {
      resolve({ ok: false, statusCode: 0, body: '', error: error.message });
    });
  });
}

function decodeXmlAttribute(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractCoolHtmlUrl(discoveryXml, discoveryUrl) {
  const match = String(discoveryXml ?? '').match(/urlsrc="([^"]*\/browser\/[^"]*\/cool\.html\?[^"]*)"/);
  if (!match) {
    return '';
  }

  const base = new URL(discoveryUrl);
  const discovered = new URL(decodeXmlAttribute(match[1]), base);
  return `${base.origin}${discovered.pathname}${discovered.search}`;
}

function buildCoolHtmlHealthUrl(coolHtmlUrl) {
  const url = new URL(coolHtmlUrl);
  url.searchParams.set('WOPISrc', `${resolveWopiHealthBaseUrl()}/editor-health-check`);
  url.searchParams.set('access_token', 'editor-health-check');
  url.searchParams.set('access_token_ttl', '0');
  return url.toString();
}

async function checkRenderableEditor(discoveryUrl) {
  const discovery = await fetchUrl(discoveryUrl);
  if (!discovery.ok) {
    return {
      ok: false,
      message: `discovery returned ${discovery.statusCode || discovery.error || 'unknown error'}`,
    };
  }

  const coolHtmlUrl = extractCoolHtmlUrl(discovery.body, discoveryUrl);
  if (!coolHtmlUrl) {
    return {
      ok: false,
      message: 'discovery did not include a cool.html action URL',
    };
  }

  const healthUrl = buildCoolHtmlHealthUrl(coolHtmlUrl);
  const editor = await fetchUrl(healthUrl);
  if (!editor.ok) {
    const detail = (editor.body || editor.error || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    return {
      ok: false,
      message: `cool.html returned ${editor.statusCode || editor.error || 'unknown error'}${detail ? `: ${detail}` : ''}`,
    };
  }

  return { ok: true, message: healthUrl };
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

async function waitForRenderableEditor(discoveryUrl, timeoutMs, intervalMs) {
  if (readEnv('EDITOR_SKIP_COOL_HTML_HEALTHCHECK', 'false') === 'true') {
    return { ok: true, message: 'cool.html health check skipped' };
  }

  const deadline = Date.now() + timeoutMs;
  let lastResult = { ok: false, message: 'not checked' };

  while (Date.now() < deadline) {
    lastResult = await checkRenderableEditor(discoveryUrl);
    if (lastResult.ok) {
      return lastResult;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return lastResult;
}

async function assertEditorReady(discoveryUrl, timeoutMs, intervalMs, runtimeLabel) {
  if (!(await waitForEditor(discoveryUrl, timeoutMs, intervalMs))) {
    throw new Error(`${runtimeLabel} started but ${discoveryUrl} did not become ready in ${timeoutMs}ms.`);
  }

  const renderable = await waitForRenderableEditor(discoveryUrl, timeoutMs, intervalMs);
  if (!renderable.ok) {
    throw new Error(`${runtimeLabel} discovery is reachable, but the editor page is not renderable. ${renderable.message}`);
  }
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
    '{{json .Config.Env}}\n{{json .HostConfig.PortBindings}}\n{{json .HostConfig.Binds}}\n{{.Config.Image}}\n{{json .Config.Entrypoint}}\n{{json .Config.Cmd}}\n{{json .HostConfig.CapAdd}}\n{{json .HostConfig.SecurityOpt}}\n{{.HostConfig.ShmSize}}',
  ]);
  if (result.status !== 0) {
    return null;
  }

  const [
    envJson = '[]',
    portBindingsJson = '{}',
    bindsJson = '[]',
    image = '',
    entrypointJson = 'null',
    cmdJson = 'null',
    capAddJson = '[]',
    securityOptJson = '[]',
    shmSize = '0',
  ] = result.stdout.trim().split(/\r?\n/);
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
    entrypoint: JSON.parse(entrypointJson),
    cmd: JSON.parse(cmdJson),
    binds: JSON.parse(bindsJson) ?? [],
    portBindings: JSON.parse(portBindingsJson),
    capAdd: JSON.parse(capAddJson) ?? [],
    securityOpt: JSON.parse(securityOptJson) ?? [],
    shmSize: Number(shmSize) || 0,
  };
}

function getHostPorts(portBindings) {
  const bindings = portBindings?.['9980/tcp'];
  if (!Array.isArray(bindings)) {
    return [];
  }
  return bindings.map((binding) => String(binding?.HostPort ?? '')).filter(Boolean);
}

function sameJsonValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function normalizeOptionalDockerList(value) {
  return Array.isArray(value) ? value : [];
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

  if (!sameJsonValue(current.entrypoint, expected.entrypoint)) {
    reasons.push('entrypoint');
  }

  if (!sameJsonValue(current.cmd, expected.cmd)) {
    reasons.push('cmd');
  }

  if (!sameJsonValue(current.binds ?? [], expected.binds ?? [])) {
    reasons.push('binds');
  }

  if (!sameJsonValue(normalizeOptionalDockerList(current.capAdd), expected.capAdd)) {
    reasons.push('cap-add');
  }

  if (!sameJsonValue(normalizeOptionalDockerList(current.securityOpt), expected.securityOpt)) {
    reasons.push('security-opt');
  }

  if (Number(current.shmSize ?? 0) !== Number(expected.shmSize ?? 0)) {
    reasons.push('shm-size');
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
  const extraFontsDir = resolveDocxExtraFontsDir();
  const nativeExtraParams = withNativeWopiAliasGroupParams(context.extraParams, context.wopiAliasGroup);
  const env = {
    ...process.env,
    EDITOR_ALLOWED_DOMAIN: context.allowedDomain,
    EDITOR_ADMIN_USERNAME: context.adminUsername,
    EDITOR_ADMIN_PASSWORD: context.adminPassword,
    EDITOR_HOST_PORT: context.hostPort,
    EDITOR_EXTRA_PARAMS: nativeExtraParams,
    ...(extraFontsDir ? { SAL_PRIVATE_FONTPATH: extraFontsDir } : {}),
  };

  if (extraFontsDir) {
    console.log(`[editor] using native DOCX extra fonts: ${extraFontsDir}`);
  }

  if (!recreate && describe.status === 0 && (await waitForRenderableEditor(context.discoveryUrl, 2_000, 500)).ok) {
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
  await assertEditorReady(
    context.discoveryUrl,
    context.readyTimeoutMs,
    context.readyIntervalMs,
    'Native document editor',
  );

  console.log(`[editor] native document editor is ready at ${context.discoveryUrl}.`);
}

async function startDocker(context) {
  const image = readEnv('EDITOR_IMAGE', DEFAULT_EDITOR_IMAGE);
  assertAllowedEditorImage(image);
  const containerName = readEnv('EDITOR_CONTAINER_NAME', 'academic-editor-local');
  const recreate = readEnv('EDITOR_RECREATE', 'false') === 'true';
  const discoveryAlreadyReachable = !recreate && (await waitForEditor(context.discoveryUrl, 2_000, 500));
  if (discoveryAlreadyReachable) {
    const dockerCommand = resolveDockerCommand();
    if (!dockerCommand || !dockerNames(dockerCommand, true).has(containerName)) {
      await assertEditorReady(context.discoveryUrl, 2_000, 500, 'External document editor');
      console.log(`[editor] external document editor is already ready at ${context.discoveryUrl}.`);
      return;
    }
  }

  const dockerCommand = await waitForDocker();
  const extraFontsDir = resolveDocxExtraFontsDir();
  const fontBinds = getDocxExtraFontBinds(extraFontsDir);

  if (normalizeImageName(image) === normalizeImageName(DEFAULT_EDITOR_IMAGE) && !dockerImageExists(dockerCommand, image)) {
    if (!shouldAutoBuildSourceImage()) {
      throw new Error(
        `Document editor image ${image} is not built yet. Prefer native runtime on Linux or run "npm run build:source" for Docker fallback.`,
      );
    }

    console.log(`[editor] source-built fallback image ${image} is missing; building it now...`);
    run(process.execPath, [path.join(__dirname, 'build-source-editor-image.mjs')], {
      cwd: repoRoot,
      env: {
        ...process.env,
        EDITOR_IMAGE: image,
      },
    });
  }

  const dockerCoolwsdArgs = [
    '--use-env-vars',
    '--o:sys_template_path=/opt/cool/systemplate',
    '--o:child_root_path=/opt/cool/child-roots',
    '--o:file_server_root_path=/usr/share/coolwsd',
    '--o:cache_files.path=/opt/cool/cache',
    '--o:logging.color=false',
    '--o:stop_on_config_change=false',
    ...splitArgs(context.extraParams),
  ];

  const dockerEnv = {
    domain: context.allowedDomain,
    username: context.adminUsername,
    password: context.adminPassword,
    extra_params: context.extraParams,
    ...(extraFontsDir ? { SAL_PRIVATE_FONTPATH: DOCX_EXTRA_FONTS_TARGET } : {}),
    ...(context.wopiAliasGroup ? { aliasgroup1: context.wopiAliasGroup } : {}),
  };
  const dockerCapAdd = ['MKNOD'];
  const dockerSecurityOpt = splitArgs(readEnv('EDITOR_DOCKER_SECURITY_OPT', 'seccomp=unconfined'));
  const dockerShmSize = readEnv('EDITOR_DOCKER_SHM_SIZE', '1g');

  const expectedRuntime = {
    image,
    hostPort: context.hostPort,
    entrypoint: ['/usr/bin/coolwsd'],
    cmd: dockerCoolwsdArgs,
    env: dockerEnv,
    binds: fontBinds,
    capAdd: dockerCapAdd,
    securityOpt: dockerSecurityOpt,
    shmSize: parseDockerByteSize(dockerShmSize),
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
    } else if ((await waitForRenderableEditor(context.discoveryUrl, context.readyTimeoutMs, context.readyIntervalMs)).ok) {
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
  if (extraFontsDir) {
    console.log(`[editor] mounting DOCX extra fonts: ${extraFontsDir} -> ${DOCX_EXTRA_FONTS_TARGET}`);
  }
  runDocker(dockerCommand, [
    'run',
    '-d',
    '--name',
    containerName,
    '--restart',
    'unless-stopped',
    ...dockerCapAdd.flatMap((capability) => ['--cap-add', capability]),
    ...(dockerShmSize ? ['--shm-size', dockerShmSize] : []),
    ...dockerSecurityOpt.flatMap((option) => ['--security-opt', option]),
    '--add-host=host.docker.internal:host-gateway',
    '--entrypoint',
    '/usr/bin/coolwsd',
    '-p',
    `${context.hostPort}:9980`,
    ...fontBinds.flatMap((bind) => ['-v', bind]),
    ...Object.entries(dockerEnv).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    image,
    ...dockerCoolwsdArgs,
  ]);

  console.log(`[editor] waiting for ${context.discoveryUrl}...`);
  await assertEditorReady(
    context.discoveryUrl,
    context.readyTimeoutMs,
    context.readyIntervalMs,
    'Docker fallback editor',
  );

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
  const serviceRoot = normalizeServiceRoot(readEnv('EDITOR_SERVICE_ROOT', ''));
  const context = {
    runtimeMode,
    hostPort,
    allowedDomain: readEnv('EDITOR_ALLOWED_DOMAIN', '.*'),
    adminUsername: readEnv('EDITOR_ADMIN_USERNAME', 'admin'),
    adminPassword: readEnv('EDITOR_ADMIN_PASSWORD', 'document-editor-password'),
    extraParams: withServiceRootParam(
      withPublicEditorParams(readEnv('EDITOR_EXTRA_PARAMS', buildDefaultExtraParams())),
      serviceRoot,
    ),
    wopiAliasGroup: resolveWopiAliasGroup(),
    discoveryUrl: resolveEditorDiscoveryUrl(hostPort, serviceRoot),
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
