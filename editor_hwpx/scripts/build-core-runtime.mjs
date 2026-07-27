import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCoreArtifactParity,
  coreArtifactHashes,
  materializeCoreArtifact,
  validateCoreArtifact,
} from './hwpx-runtime-readiness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(__dirname, '..');
const pkgRoot = path.join(sourceRoot, 'pkg');
const nodeRuntimeRoot = path.join(sourceRoot, 'node_modules', '@rhwp', 'core');
const studioRuntimeRoot = path.join(sourceRoot, 'rhwp-studio', 'node_modules', '@rhwp', 'core');
const buildImage = process.env.HWPX_WASM_BUILD_IMAGE || 'editor_hwpx-wasm:1.93.1';
const wasmPackVersion = '0.15.0';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: sourceRoot,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function commandExists(command) {
  const probe = spawnSync(command, ['--version'], {
    cwd: sourceRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return probe.status === 0;
}

function dockerImageExists(image) {
  const probe = spawnSync('docker', ['image', 'inspect', image], {
    cwd: sourceRoot,
    stdio: 'ignore',
    shell: false,
    windowsHide: true,
  });
  return probe.status === 0;
}

function buildWithLocalWasmPack() {
  const version = spawnSync('wasm-pack', ['--version'], {
    cwd: sourceRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (!String(version.stdout || '').includes(wasmPackVersion)) {
    throw new Error(`wasm-pack ${wasmPackVersion} is required; found ${String(version.stdout || '').trim() || 'unknown'}.`);
  }
  run('wasm-pack', ['build', '--target', 'web', '--release', '--out-dir', 'pkg', '--out-name', 'rhwp'], {
    env: { ...process.env, RUSTUP_TOOLCHAIN: '1.93.1' },
  });
}

function buildWithDocker() {
  if (!commandExists('docker')) {
    throw new Error('Neither wasm-pack nor Docker is available to build the HWPX runtime.');
  }
  if (!dockerImageExists(buildImage)) {
    run('docker', [
      'build',
      '--tag', buildImage,
      '--file', path.join(sourceRoot, 'Dockerfile'),
      sourceRoot,
    ]);
  }
  const containerUser = process.platform === 'win32'
    ? '0:0'
    : `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
  run('docker', [
    'run',
    '--rm',
    '--user', containerUser,
    '--volume', `${sourceRoot}:/app`,
    '--workdir', '/app',
    buildImage,
    'wasm-pack',
    'build',
    '--target', 'web',
    '--release',
    '--out-dir', 'pkg',
    '--out-name', 'rhwp',
  ]);
}

if (commandExists('wasm-pack')) {
  buildWithLocalWasmPack();
} else {
  buildWithDocker();
}

rmSync(path.join(pkgRoot, '.gitignore'), { force: true });
validateCoreArtifact(pkgRoot, { catalog: [] });
for (const destination of [nodeRuntimeRoot, studioRuntimeRoot]) {
  materializeCoreArtifact(pkgRoot, destination, { catalog: [] });
}
const parity = assertCoreArtifactParity([pkgRoot, nodeRuntimeRoot, studioRuntimeRoot]);
console.log(JSON.stringify({
  ok: true,
  toolchain: '1.93.1',
  wasmPack: wasmPackVersion,
  canonical: pkgRoot,
  hashes: coreArtifactHashes(pkgRoot),
  surfaces: parity.surfaces.map((surface) => surface.artifactRoot),
}));
