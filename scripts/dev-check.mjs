import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const CHECKED_SCRIPTS = [
  'scripts/start-editor.mjs',
  'scripts/stop-editor.mjs',
  'scripts/status-editor.mjs',
  'scripts/smoke-editor.mjs',
  'scripts/dev-check.mjs',
  'scripts/dev-source-editor.mjs',
  'scripts/doctor-native-editor.mjs',
  'scripts/audit-native-editor-runtime.mjs',
  'scripts/export-source-offer.mjs',
  'scripts/build-native-editor.mjs',
  'scripts/install-native-editor.mjs',
  'scripts/install-native-artifact.mjs',
  'scripts/package-native-artifact.mjs',
  'scripts/run-native-editor.mjs',
  'scripts/build-source-editor-image.mjs',
];

function readEnv(name, fallback) {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function run(command, args, options = {}) {
  console.log(`[dev-check] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function runQuiet(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...options,
  });
}

function dockerInfo(command) {
  const result = runQuiet(command[0], [...command.slice(1), 'info', '--format', '{{.ServerVersion}}'], { timeout: 2_000 });
  return result.status === 0;
}

function dockerCommand() {
  if (dockerInfo(['docker']) || process.platform === 'win32') {
    return ['docker'];
  }
  return dockerInfo(['sudo', '-n', 'docker']) ? ['sudo', '-n', 'docker'] : ['docker'];
}

function dockerContainerExists(containerName) {
  const command = dockerCommand();
  const result = runQuiet(command[0], [
    ...command.slice(1),
    'ps',
    '-a',
    '--filter',
    `name=^/${containerName}$`,
    '--format',
    '{{.Names}}',
  ]);
  return result.status === 0 && String(result.stdout ?? '').split(/\r?\n/).map((line) => line.trim()).includes(containerName);
}

function pm2ProcessExists(name) {
  const result = runQuiet('pm2', ['describe', name], { timeout: 2_000 });
  return result.status === 0;
}

function pm2BinaryExists() {
  const result = runQuiet('pm2', ['--version'], { timeout: 2_000 });
  return result.status === 0;
}

function nativeInstalled() {
  return process.platform === 'linux' && existsSync(readEnv('EDITOR_NATIVE_COOLWSD_BIN', '/usr/bin/coolwsd'));
}

function runtimeWasRequested() {
  return process.argv.includes('--runtime') ||
    process.argv.some((arg) => arg.startsWith('--runtime=')) ||
    readEnv('EDITOR_DEV_RUNTIME_CHECK', 'false') === 'true';
}

function requestedRuntimeMode() {
  const index = process.argv.indexOf('--runtime');
  if (index >= 0) {
    const value = process.argv[index + 1];
    if (value && !value.startsWith('--')) {
      return value.toLowerCase();
    }
    return 'auto';
  }

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--runtime=')) {
      return arg.slice('--runtime='.length).toLowerCase();
    }
  }

  return readEnv('EDITOR_RUNTIME_MODE', 'auto').toLowerCase();
}

function resolvedRuntimeMode() {
  const requested = requestedRuntimeMode();
  if (requested !== 'auto') {
    return requested;
  }
  return nativeInstalled() && pm2BinaryExists() ? 'native' : 'docker';
}

function snapshotRuntime() {
  const dockerName = readEnv('EDITOR_CONTAINER_NAME', 'academic-editor-local');
  const pm2Name = readEnv('EDITOR_NATIVE_PM2_NAME', 'academic-editor-native');
  return {
    dockerName,
    dockerExists: dockerContainerExists(dockerName),
    pm2Name,
    pm2Exists: pm2ProcessExists(pm2Name),
  };
}

function stopCreatedRuntime(before, after) {
  const keepRunning = readEnv('EDITOR_DEV_KEEP_RUNNING', 'false') === 'true';
  if (keepRunning) {
    console.log('[dev-check] keeping runtime because EDITOR_DEV_KEEP_RUNNING=true');
    return;
  }

  if (!before.dockerExists && after.dockerExists) {
    run(process.execPath, ['scripts/stop-editor.mjs', '--runtime', 'docker']);
    return;
  }

  if (!before.pm2Exists && after.pm2Exists) {
    run(process.execPath, ['scripts/stop-editor.mjs', '--runtime', 'native']);
  }
}

function quickChecks() {
  run(process.execPath, ['scripts/verify-public-safety.mjs']);
  run(process.execPath, [
    '--test',
    'scripts/start-editor.test.mjs',
    'scripts/export-source-offer.test.mjs',
    'scripts/dev-tools.test.mjs',
  ]);
  for (const script of CHECKED_SCRIPTS) {
    run(process.execPath, ['--check', script]);
  }
}

function runtimeCheck() {
  const before = snapshotRuntime();
  let started = false;
  try {
    const mode = resolvedRuntimeMode();
    run(process.execPath, ['scripts/start-editor.mjs', '--runtime', mode]);
    started = true;
    run(process.execPath, ['scripts/smoke-editor.mjs']);
  } finally {
    if (started) {
      stopCreatedRuntime(before, snapshotRuntime());
    }
  }
}

function main() {
  quickChecks();

  if (runtimeWasRequested()) {
    runtimeCheck();
  } else {
    console.log('[dev-check] quick checks passed. Add --runtime to start, smoke-test, and clean up the editor runtime.');
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
