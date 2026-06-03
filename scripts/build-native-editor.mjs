import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const DEFAULT_DOCKER_REPO = 'https://github.com/CollaboraOnline/online.git';
const DEFAULT_SOURCE_REPO = 'https://github.com/CollaboraOnline/online.git';
const DEFAULT_SOURCE_REF = 'main';

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

function readUtf8Lf(filePath) {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function writeUtf8Lf(filePath, text) {
  writeFileSync(filePath, text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
}

function prepareBuildContext(contextRoot, dockerRepo, dockerRef) {
  const checkoutDir = path.join(contextRoot, 'official-online');
  const buildContextDir = path.join(contextRoot, 'from-source-gh-action');

  rmSync(contextRoot, { recursive: true, force: true });
  mkdirSync(contextRoot, { recursive: true });

  run('git', [
    'clone',
    '--depth',
    '1',
    '--filter=blob:none',
    '--sparse',
    '--branch',
    dockerRef,
    dockerRepo,
    checkoutDir,
  ]);
  run('git', ['-C', checkoutDir, 'sparse-checkout', 'init', '--no-cone']);
  writeFileSync(
    path.join(checkoutDir, '.git', 'info', 'sparse-checkout'),
    'docker/from-source-gh-action/*\n',
  );
  run('git', ['-C', checkoutDir, 'read-tree', '-mu', 'HEAD']);

  cpSync(
    path.join(checkoutDir, 'docker', 'from-source-gh-action'),
    buildContextDir,
    { recursive: true },
  );

  cpSync(
    path.resolve('branding', 'debrand-online.sh'),
    path.join(buildContextDir, 'debrand-online.sh'),
  );
  writeUtf8Lf(path.join(buildContextDir, 'debrand-online.sh'), readUtf8Lf(path.join(buildContextDir, 'debrand-online.sh')));

  const buildScriptPath = path.join(buildContextDir, 'build.sh');
  let buildScript = readUtf8Lf(buildScriptPath);
  buildScript = buildScript
    .replace(
      'COLLABORA_ONLINE_REPO="https://gerrit.collaboraoffice.com/online"',
      'COLLABORA_ONLINE_REPO="https://github.com/CollaboraOnline/online.git"',
    )
    .replace(
      /(\( cd online && git fetch --all && git checkout -f \$COLLABORA_ONLINE_BRANCH && git clean -f -d && git pull -r \) \|\| exit 1\r?\n)/,
      `$1\n# Apply the public debranding patch before compiling browser/server assets.\n` +
        `bash "$SRCDIR/debrand-online.sh" "$BUILDDIR/online" || exit 1\n`,
    );
  if (!buildScript.includes('debrand-online.sh')) {
    throw new Error('Failed to inject the debranding patch into the native source build script.');
  }
  writeUtf8Lf(buildScriptPath, buildScript);

  return buildContextDir;
}

function main() {
  const contextRoot = readEnv(
    'EDITOR_NATIVE_BUILD_DIR',
    path.resolve('.build', 'native-editor'),
  );
  const dockerRepo = readEnv('EDITOR_SOURCE_DOCKER_REPO', DEFAULT_DOCKER_REPO);
  const dockerRef = readEnv('EDITOR_SOURCE_DOCKER_REF', DEFAULT_SOURCE_REF);
  const sourceRepo = readEnv('EDITOR_SOURCE_REPO', DEFAULT_SOURCE_REPO);
  const sourceRef = readEnv('EDITOR_SOURCE_REF', DEFAULT_SOURCE_REF);
  const extraBuildOptions = readEnv('EDITOR_SOURCE_BUILD_OPTIONS', '--enable-experimental');
  const engineAssets = readEnv('EDITOR_ENGINE_ASSETS', '');
  const prepareOnly = readEnv('EDITOR_NATIVE_PREPARE_ONLY', 'false') === 'true';
  const buildContextDir = prepareBuildContext(contextRoot, dockerRepo, dockerRef);

  if (prepareOnly) {
    console.log(`[editor] prepared native source build context at ${buildContextDir}`);
    return;
  }

  if (process.platform !== 'linux') {
    throw new Error('Native editor builds are supported on Linux servers only. Use EDITOR_RUNTIME_MODE=auto or docker for Windows local development.');
  }

  console.log('[editor] building native document editor runtime from public source');
  run('bash', ['build.sh'], {
    cwd: buildContextDir,
    env: {
      ...process.env,
      COLLABORA_ONLINE_REPO: sourceRepo,
      COLLABORA_ONLINE_BRANCH: sourceRef,
      ONLINE_EXTRA_BUILD_OPTIONS: extraBuildOptions,
      ENGINE_ASSETS: engineAssets,
    },
  });
  console.log(`[editor] native build output: ${path.join(buildContextDir, 'instdir')}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
