import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function readEnv(name, fallback) {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function sudo(args) {
  run('sudo', args);
}

function main() {
  if (process.platform !== 'linux') {
    throw new Error('Native editor install is supported on Linux servers only.');
  }

  const buildDir = resolveRepoPath(readEnv('EDITOR_NATIVE_BUILD_DIR', path.join(repoRoot, '.build', 'native-editor')));
  const installDir = readEnv(
    'EDITOR_NATIVE_INSTALL_DIR',
    path.join(buildDir, 'from-source-gh-action', 'instdir'),
  );
  const runtimeDir = readEnv('EDITOR_NATIVE_RUNTIME_DIR', '/var/lib/academic-editor');
  const cacheDir = readEnv('EDITOR_NATIVE_CACHE_DIR', '/var/cache/academic-editor');

  if (!existsSync(path.join(installDir, 'usr', 'bin', 'coolwsd'))) {
    throw new Error(`Native build output was not found at ${installDir}. Run npm run build:native first.`);
  }

  sudo(['rsync', '-a', `${installDir}/`, '/']);
  sudo(['setcap', 'cap_fowner,cap_chown,cap_sys_chroot=ep', '/usr/bin/coolforkit-caps']);
  sudo(['setcap', 'cap_sys_admin=ep', '/usr/bin/coolmount']);
  sudo(['mkdir', '-p', runtimeDir, path.join(runtimeDir, 'child-roots'), cacheDir, '/opt/cool/cache']);
  sudo(['touch', '/var/log/coolwsd.log']);
  sudo(['chown', '-R', `${process.getuid()}:${process.getgid()}`, runtimeDir, cacheDir, '/etc/coolwsd', '/var/log/coolwsd.log']);
  sudo(['chmod', '-R', 'u+rwX', runtimeDir, cacheDir, '/etc/coolwsd']);
  sudo(['coolwsd-systemplate-setup', path.join(runtimeDir, 'systemplate'), '/opt/collaboraoffice']);
  sudo(['chmod', '640', '/etc/coolwsd/coolwsd.xml']);

  console.log('[editor] native document editor runtime is installed.');
  console.log(`[editor] runtime dir: ${runtimeDir}`);
  console.log(`[editor] cache dir: ${cacheDir}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
