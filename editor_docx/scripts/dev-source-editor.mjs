import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE_REPO = 'https://gerrit.collaboraoffice.com/online';
const DEFAULT_SOURCE_REF = 'main';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readEnv(name, fallback) {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function commandName() {
  const value = process.argv[2];
  return value && !value.startsWith('--') ? value : 'doctor';
}

function run(command, args, options = {}) {
  console.log(`[dev-source] ${command} ${args.join(' ')}`);
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

function commandOutput(command, args, options = {}) {
  const result = runQuiet(command, args, options);
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${result.stderr}`);
  }
  return String(result.stdout || '').trim();
}

function commandExists(command) {
  const probe = process.platform === 'win32'
    ? runQuiet('where.exe', [command], { timeout: 2_000 })
    : runQuiet('sh', ['-lc', `command -v ${command}`], { timeout: 2_000 });
  return probe.status === 0;
}

function commandRuns(command, args = ['--version']) {
  const probe = runQuiet(command, args, { timeout: 2_000 });
  return probe.status === 0;
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function assertSafeDevDir(devRoot) {
  const resolved = path.resolve(devRoot);
  if (resolved === repoRoot || resolved === path.parse(resolved).root || !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Unsafe editor dev directory: ${resolved}. Use a directory inside this repository, such as .build/source-dev.`);
  }
}

function devRoot() {
  const root = resolveRepoPath(readEnv('EDITOR_DEV_ROOT', path.join(repoRoot, '.build', 'source-dev')));
  assertSafeDevDir(root);
  return root;
}

function sourceDir() {
  return resolveRepoPath(readEnv('EDITOR_DEV_SOURCE_DIR', path.join(repoRoot, 'editor_docx')));
}

function shellEnvPath() {
  return path.join(devRoot(), 'dev.env');
}

function writeDevEnv(sourcePath) {
  mkdirSync(devRoot(), { recursive: true });
  const content = [
    '# Source this file on Linux shells before manual editor hacking.',
    `export EDITOR_DEV_SOURCE_DIR="${sourcePath}"`,
    'export COOL_SERVE_FROM_FS=1',
    'export EDITOR_SKIP_COOL_HTML_HEALTHCHECK=false',
    '',
  ].join('\n');
  writeFileSync(shellEnvPath(), content, 'utf8');
}

function cloneOrUpdateSource() {
  const root = devRoot();
  const target = sourceDir();
  const sourceRepo = readEnv('EDITOR_SOURCE_REPO', DEFAULT_SOURCE_REPO);
  const sourceRef = readEnv('EDITOR_SOURCE_REF', DEFAULT_SOURCE_REF);
  const reset = readEnv('EDITOR_DEV_RESET', 'false') === 'true';

  mkdirSync(root, { recursive: true });

  if (reset) {
    rmSync(target, { recursive: true, force: true });
  }

  if (existsSync(path.join(target, 'autogen.sh')) && existsSync(path.join(target, 'browser'))) {
    console.log(`[dev-source] reusing editor_docx source tree at ${target}`);
    writeDevEnv(target);
    return target;
  }

  if (existsSync(target) && readdirSync(target).length > 0 && !existsSync(path.join(target, '.git'))) {
    throw new Error(`Refusing to clone into non-empty source directory without .git: ${target}`);
  }

  if (!existsSync(path.join(target, '.git'))) {
    run('git', [
      'clone',
      '--depth',
      '1',
      '--branch',
      sourceRef,
      sourceRepo,
      target,
    ]);
    const commit = commandOutput('git', ['-C', target, 'rev-parse', 'HEAD']);
    rmSync(path.join(target, '.git'), { recursive: true, force: true });
    writeFileSync(path.join(target, 'UPSTREAM_COMMIT'), `${commit}\n`, 'ascii');
  } else {
    console.log(`[dev-source] reusing source checkout at ${target}`);
  }

  writeDevEnv(target);
  return target;
}

function applyDebrandPatch(target) {
  run(process.execPath, [path.join(repoRoot, 'editor_docx', 'scripts', 'apply-docx-editor-patches.mjs'), target], {
    env: {
      ...process.env,
    },
  });
}

function ensureLinux(command) {
  if (process.platform !== 'linux') {
    throw new Error(`${command} is supported on Linux only. Run it on the Linux dev/build host or through WSL with the repository mounted.`);
  }
}

function prepare() {
  const target = cloneOrUpdateSource();
  applyDebrandPatch(target);
  console.log(`[dev-source] prepared source checkout at ${target}`);
  console.log(`[dev-source] shell env: ${shellEnvPath()}`);
}

function configureAndBuild() {
  ensureLinux('dev-source build');
  prepare();

  const target = sourceDir();
  const cocorePath = readEnv('EDITOR_DEV_COCOREPATH', path.join(target, 'engine'));
  const configureFlags = readEnv(
    'EDITOR_DEV_CONFIGURE_FLAGS',
    `--enable-silent-rules --with-lokit-path=${cocorePath}/include --with-lo-path=${cocorePath}/instdir --enable-debug --enable-cypress --disable-ssl`,
  );
  const makeJobs = readEnv('EDITOR_DEV_MAKE_JOBS', '$(nproc)');

  if (!existsSync(path.join(target, 'autogen.sh'))) {
    throw new Error(`Cannot find autogen.sh under ${target}. Check EDITOR_SOURCE_REPO and EDITOR_SOURCE_REF.`);
  }

  run('sh', ['-lc', './autogen.sh'], { cwd: target });
  run('sh', ['-lc', `./configure ${configureFlags}`], { cwd: target });
  run('sh', ['-lc', `make -j ${makeJobs}`], { cwd: target });
}

function runForeground() {
  ensureLinux('dev-source run');
  const target = sourceDir();
  if (!existsSync(path.join(target, 'Makefile'))) {
    throw new Error(`Cannot find ${path.join(target, 'Makefile')}. Run npm run dev:source:build first.`);
  }

  const child = spawn('make', ['run'], {
    cwd: target,
    stdio: 'inherit',
    env: {
      ...process.env,
      COOL_SERVE_FROM_FS: '1',
    },
  });

  const forward = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.once('SIGINT', () => forward('SIGINT'));
  process.once('SIGTERM', () => forward('SIGTERM'));

  child.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function stopSourceRuntime() {
  ensureLinux('dev-source stop');
  const target = sourceDir();
  if (!existsSync(path.join(target, 'Makefile'))) {
    console.log(`[dev-source] no Makefile found under ${target}; nothing to stop`);
    return;
  }

  const result = spawnSync('make', ['stop'], {
    cwd: target,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.log('[dev-source] make stop was not available or did not stop a runtime. If make run is in the foreground, stop that terminal with Ctrl+C.');
  }
}

function smoke() {
  run(process.execPath, [path.join(repoRoot, 'editor_docx', 'scripts', 'smoke-editor.mjs')]);
}

function doctor() {
  const checks = [
    ['git', commandExists('git')],
    ['bash', commandExists('bash') && commandRuns('bash')],
    ['python3/python', commandExists('python3') || commandExists('python')],
    ['make', commandExists('make')],
  ];

  for (const [name, ok] of checks) {
    console.log(`[dev-source] ${ok ? 'ok' : 'missing'} ${name}`);
  }

  console.log(`[dev-source] root=${devRoot()}`);
  console.log(`[dev-source] source=${sourceDir()}`);
  console.log('[dev-source] browser edits can use COOL_SERVE_FROM_FS=1 plus browser Shift+Reload after the first Linux build.');
}

function main() {
  switch (commandName()) {
    case 'doctor':
      doctor();
      break;
    case 'prepare':
      prepare();
      break;
    case 'build':
      configureAndBuild();
      break;
    case 'run':
      runForeground();
      break;
    case 'stop':
      stopSourceRuntime();
      break;
    case 'smoke':
      smoke();
      break;
    default:
      throw new Error('Usage: node editor_docx/scripts/dev-source-editor.mjs [doctor|prepare|build|run|stop|smoke]');
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
