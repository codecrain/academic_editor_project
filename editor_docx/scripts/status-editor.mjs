import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

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
      return process.argv[index + 1] ?? '';
    }
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return '';
}

function run(command, args) {
  return spawnSync(command, args, { stdio: 'inherit', encoding: 'utf8' });
}

function runQuiet(command, args) {
  return spawnSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

function dockerInfo(command) {
  const result = runQuiet(command[0], [...command.slice(1), 'info', '--format', '{{.ServerVersion}}']);
  return result.status === 0;
}

function dockerCommand() {
  if (dockerInfo(['docker']) || process.platform === 'win32') {
    return ['docker'];
  }
  return dockerInfo(['sudo', '-n', 'docker']) ? ['sudo', '-n', 'docker'] : ['docker'];
}

function nativeInstalled() {
  return process.platform === 'linux' && existsSync(readEnv('EDITOR_NATIVE_COOLWSD_BIN', '/usr/bin/coolwsd'));
}

function mode() {
  const requested = (parseArg('runtime') || readEnv('EDITOR_RUNTIME_MODE', 'auto')).toLowerCase();
  if (requested !== 'auto') {
    return requested;
  }
  return nativeInstalled() ? 'native' : 'docker';
}

const runtimeMode = mode();
if (runtimeMode === 'native') {
  const name = readEnv('EDITOR_NATIVE_PM2_NAME', 'academic-editor-native');
  const result = run('pm2', ['describe', name]);
  process.exit(result.status ?? 1);
}

const name = readEnv('EDITOR_CONTAINER_NAME', 'academic-editor-local');
const command = dockerCommand();
const result = run(command[0], [...command.slice(1), 'ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}']);
process.exit(result.status ?? 1);
