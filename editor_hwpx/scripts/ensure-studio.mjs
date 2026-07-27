import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCoreArtifactParity,
  formatCoreCleanupWarnings,
  materializeCoreArtifact,
  validateCoreArtifact,
} from './hwpx-runtime-readiness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(__dirname, '..');
const studioRoot = path.resolve(sourceRoot, 'rhwp-studio');
const pkgRoot = path.resolve(sourceRoot, 'pkg');
const sourceFontsRoot = path.resolve(sourceRoot, 'web', 'fonts');
const studioFontsRoot = path.resolve(studioRoot, 'public', 'fonts');
const basePath = normalizeBasePath(process.env.RHWP_STUDIO_BASE_PATH || '/hwpx/');

function hasArg(name) {
  return process.argv.includes(name);
}

function normalizeBasePath(value) {
  const raw = String(value || '/hwpx/').trim() || '/hwpx/';
  const withStart = raw.startsWith('/') ? raw : `/${raw}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
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
    cwd: sourceRoot,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function ensureNpmInstall(root, label) {
  const nodeModules = path.resolve(root, 'node_modules');
  if (existsSync(nodeModules)) {
    return;
  }

  const lockFile = path.resolve(root, 'package-lock.json');
  const args = existsSync(lockFile) ? ['ci'] : ['install'];
  console.log(`[rhwp] installing ${label} dependencies with npm ${args[0]}...`);
  run(npmCommand(), args, { cwd: root });
}

function syncSourceBuiltCorePackage() {
  validateCoreArtifact(pkgRoot, { catalog: [] });
  const destinations = [
    path.resolve(sourceRoot, 'node_modules', '@rhwp', 'core'),
    path.resolve(studioRoot, 'node_modules', '@rhwp', 'core'),
  ];
  const results = destinations.map((destination) =>
    materializeCoreArtifact(pkgRoot, destination, { catalog: [] }));
  assertCoreArtifactParity([pkgRoot, ...destinations]);
  return results;
}

function ensureStudioFonts() {
  const sentinel = 'NotoSansKR-Regular.woff2';
  if (existsSync(path.resolve(studioFontsRoot, sentinel))) {
    return;
  }
  if (!existsSync(path.resolve(sourceFontsRoot, sentinel))) {
    throw new Error(`Missing RHWP Studio font assets: ${sourceFontsRoot}`);
  }

  rmSync(studioFontsRoot, { recursive: true, force: true });
  cpSync(sourceFontsRoot, studioFontsRoot, { recursive: true });
  console.log(`[rhwp] materialized rhwp-studio fonts from ${sourceFontsRoot}`);
}

function shouldBuild() {
  if (hasArg('--build')) {
    return true;
  }
  if (String(process.env.RHWP_STUDIO_REBUILD || '').toLowerCase() === 'true') {
    return true;
  }
  return !existsSync(path.resolve(studioRoot, 'dist', 'index.html'));
}

function buildStudio() {
  console.log(`[rhwp] building rhwp-studio with base ${basePath}...`);
  run(npmCommand(), ['run', 'build', '--', `--base=${basePath}`], {
    cwd: studioRoot,
  });
}

function assertUpstreamPresent() {
  if (!existsSync(path.resolve(studioRoot, 'package.json'))) {
    throw new Error(`RHWP Studio package was not found: ${studioRoot}`);
  }
  if (!existsSync(path.resolve(sourceRoot, 'LICENSE'))) {
    throw new Error(`RHWP source was not found: ${sourceRoot}`);
  }
}

assertUpstreamPresent();
ensureNpmInstall(sourceRoot, 'wrapper');
ensureNpmInstall(studioRoot, 'rhwp-studio');
const coreReadiness = syncSourceBuiltCorePackage();
for (const result of coreReadiness) {
  for (const warning of formatCoreCleanupWarnings(result)) {
    console.warn(warning);
  }
}
ensureStudioFonts();

if (shouldBuild()) {
  buildStudio();
}

const wasm = path.resolve(pkgRoot, 'rhwp_bg.wasm');
console.log(
  `[rhwp] ready: core=source-built@1.93.1, studio=${studioRoot}, wasm=${Math.round(statSync(wasm).size / 1024)}KB`,
);
