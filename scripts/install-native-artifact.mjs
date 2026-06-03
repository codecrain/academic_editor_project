import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_RELEASE_ASSET = 'academic-editor-native-linux-x64.tar.gz';

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
  const result = spawnSync(command, args, { stdio: 'inherit', encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sudo(args) {
  run('sudo', args);
}

function resolveArtifactUrl() {
  const explicitUrl = parseArg('url') || readEnv('EDITOR_NATIVE_ARTIFACT_URL');
  if (explicitUrl) {
    return explicitUrl;
  }

  const releaseTag = parseArg('tag') || readEnv('EDITOR_NATIVE_RELEASE_TAG');
  if (!releaseTag) {
    return '';
  }

  const repository = readEnv('EDITOR_NATIVE_RELEASE_REPOSITORY', 'codecrain/academic_editor_project');
  const asset = readEnv('EDITOR_NATIVE_RELEASE_ASSET', DEFAULT_RELEASE_ASSET);
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(asset)}`;
}

function downloadArtifact(url, outputPath) {
  console.log(`[editor] downloading native artifact from ${url}`);
  run('curl', ['-fL', '--retry', '3', '--retry-delay', '2', '-o', outputPath, url]);
}

function verifySha256(artifactPath, sha256) {
  if (!sha256) {
    return;
  }

  run('sh', ['-lc', `printf '%s  %s\n' ${shellQuote(sha256)} ${shellQuote(artifactPath)} | sha256sum -c -`]);
}

function locateInstallDir(stagingDir) {
  const candidates = [
    path.join(stagingDir, 'instdir'),
    stagingDir,
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'usr', 'bin', 'coolwsd'))) {
      return candidate;
    }
  }

  throw new Error(`Native artifact does not contain usr/bin/coolwsd under ${stagingDir}.`);
}

function installFromDir(installDir) {
  const runtimeDir = readEnv('EDITOR_NATIVE_RUNTIME_DIR', '/var/lib/academic-editor');
  const cacheDir = readEnv('EDITOR_NATIVE_CACHE_DIR', '/var/cache/academic-editor');

  sudo(['rsync', '-a', `${installDir}/`, '/']);
  sudo(['setcap', 'cap_fowner,cap_chown,cap_sys_chroot=ep', '/usr/bin/coolforkit-caps']);
  sudo(['setcap', 'cap_sys_admin=ep', '/usr/bin/coolmount']);
  sudo(['mkdir', '-p', runtimeDir, path.join(runtimeDir, 'child-roots'), cacheDir, '/opt/cool/cache']);
  sudo(['touch', '/var/log/coolwsd.log']);
  sudo(['chown', '-R', `${process.getuid()}:${process.getgid()}`, runtimeDir, cacheDir, '/etc/coolwsd', '/var/log/coolwsd.log']);
  sudo(['chmod', '-R', 'u+rwX', runtimeDir, cacheDir, '/etc/coolwsd']);
  sudo(['coolwsd-systemplate-setup', path.join(runtimeDir, 'systemplate'), '/opt/collaboraoffice']);
  sudo(['chmod', '640', '/etc/coolwsd/coolwsd.xml']);

  console.log('[editor] native document editor runtime is installed from artifact.');
  console.log(`[editor] runtime dir: ${runtimeDir}`);
  console.log(`[editor] cache dir: ${cacheDir}`);
}

function main() {
  if (process.platform !== 'linux') {
    throw new Error('Native editor artifact install is supported on Linux only.');
  }

  const artifactArg = parseArg('artifact') || readEnv('EDITOR_NATIVE_ARTIFACT');
  const artifactUrl = resolveArtifactUrl();
  const artifactCacheDir = resolveRepoPath(readEnv('EDITOR_NATIVE_ARTIFACT_CACHE_DIR', path.join(repoRoot, '.build', 'artifacts')));
  const stagingDir = resolveRepoPath(readEnv('EDITOR_NATIVE_ARTIFACT_STAGING_DIR', path.join(repoRoot, '.build', 'native-editor-artifact')));
  const artifactPath = artifactArg
    ? resolveRepoPath(artifactArg)
    : path.join(artifactCacheDir, readEnv('EDITOR_NATIVE_RELEASE_ASSET', DEFAULT_RELEASE_ASSET));

  if (!artifactArg && !artifactUrl) {
    throw new Error('Set EDITOR_NATIVE_ARTIFACT, EDITOR_NATIVE_ARTIFACT_URL, or EDITOR_NATIVE_RELEASE_TAG.');
  }

  mkdirSync(path.dirname(artifactPath), { recursive: true });
  if (artifactUrl) {
    downloadArtifact(artifactUrl, artifactPath);
  }

  verifySha256(artifactPath, parseArg('sha256') || readEnv('EDITOR_NATIVE_ARTIFACT_SHA256'));

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  run('tar', ['-xzf', artifactPath, '-C', stagingDir]);
  installFromDir(locateInstallDir(stagingDir));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
