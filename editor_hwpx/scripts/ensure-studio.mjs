import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function copyCoreWasmPackage() {
  const coreRoot = path.resolve(sourceRoot, 'node_modules', '@rhwp', 'core');
  if (!existsSync(coreRoot)) {
    throw new Error('Missing @rhwp/core. Run npm install in editor_hwpx first.');
  }

  mkdirSync(pkgRoot, { recursive: true });
  for (const fileName of [
    'rhwp.js',
    'rhwp.d.ts',
    'rhwp_bg.wasm',
    'rhwp_bg.wasm.d.ts',
  ]) {
    const source = path.resolve(coreRoot, fileName);
    if (!existsSync(source)) {
      throw new Error(`Missing @rhwp/core artifact: ${source}`);
    }
    copyFileSync(source, path.resolve(pkgRoot, fileName));
  }
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
copyCoreWasmPackage();
ensureNpmInstall(studioRoot, 'rhwp-studio');
ensureStudioFonts();

if (shouldBuild()) {
  buildStudio();
}

const wasm = path.resolve(pkgRoot, 'rhwp_bg.wasm');
console.log(
  `[rhwp] ready: studio=${studioRoot}, wasm=${Math.round(statSync(wasm).size / 1024)}KB`,
);
