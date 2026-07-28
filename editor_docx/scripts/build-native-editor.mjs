import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DOCKER_REPO = 'https://gerrit.collaboraoffice.com/online';
const DEFAULT_SOURCE_REPO = 'https://gerrit.collaboraoffice.com/online';
const DEFAULT_SOURCE_REF = 'main';
const DEFAULT_ENGINE_ASSETS = 'https://github.com/CollaboraOnline/online/releases/download/for-code-assets/engine-main-assets.tar.gz';
const DEFAULT_ENGINE_LANGUAGES =
  'de en-US en-GB es fr ko';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

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

function assertSafeBuildDir(contextRoot) {
  const resolved = path.resolve(contextRoot);
  if (resolved === repoRoot || resolved === path.parse(resolved).root || !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Unsafe native build directory: ${resolved}. Use a directory inside this repository, such as .build/native-editor.`);
  }
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function prepareBuildContext(contextRoot, dockerRepo, dockerRef) {
  assertSafeBuildDir(contextRoot);
  const checkoutDir = path.join(contextRoot, 'official-online');
  const buildContextDir = path.join(contextRoot, 'from-source-gh-action');
  const legacySourceDir = path.join(checkoutDir, 'docker', 'from-source-gh-action');
  const currentSourceDir = path.join(checkoutDir, 'docker', 'from-source');

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
    'docker/from-source-gh-action/*\ndocker/from-source/*\n',
  );
  run('git', ['-C', checkoutDir, 'read-tree', '-mu', 'HEAD']);

  const usesLegacyLayout = existsSync(legacySourceDir);
  const sourceDir = usesLegacyLayout
    ? legacySourceDir
    : existsSync(currentSourceDir)
      ? currentSourceDir
      : null;
  if (sourceDir == null) {
    throw new Error(
      'The upstream repository contains neither docker/from-source-gh-action nor docker/from-source.',
    );
  }
  cpSync(sourceDir, buildContextDir, { recursive: true });

  cpSync(
    path.join(repoRoot, 'branding', 'debrand-online.sh'),
    path.join(buildContextDir, 'debrand-online.sh'),
  );
  writeUtf8Lf(path.join(buildContextDir, 'debrand-online.sh'), readUtf8Lf(path.join(buildContextDir, 'debrand-online.sh')));
  rmSync(checkoutDir, { recursive: true, force: true });

  const buildScriptPath = path.join(buildContextDir, 'build.sh');
  let buildScript = readUtf8Lf(buildScriptPath);
  if (usesLegacyLayout) {
    buildScript = buildScript.replace(
      /make -j \$\(nproc\)(\r?\n\s+)make install/,
      'make -j $(nproc) DEFAULT_TARGET=static_release$1make install DEFAULT_TARGET=static_release',
    );
  }
  buildScript = buildScript.replace(
    /(\( cd online && git fetch --all && git checkout -f \$COLLABORA_ONLINE_BRANCH && git clean -f -d && git pull -r \) \|\| exit 1\r?\n)/,
    `$1\n# Apply the public debranding patch before compiling browser/server assets.\n` +
      `bash "$SRCDIR/debrand-online.sh" "$BUILDDIR/online" || exit 1\n`,
  );
  buildScript = buildScript.replace(
    /(\.\/autogen\.sh --with-distro=CPLinux-LOKit [^)\r\n]*?--disable-symbols)(\s*\))/,
    '$1 --with-lang="$ENGINE_LANGUAGES"$2',
  );
  const languagePackGuard =
    'test -f online/engine/instdir/share/registry/Langpack-ko.xcd || {\n' +
    '  echo "Engine is missing the required Korean language pack. Build the engine from source with ENGINE_LANGUAGES including ko." >&2\n' +
    '  exit 1\n' +
    '}\n\n';
  buildScript = buildScript.replace(
    /((?:fi;?|# copy stuff)\r?\n(?:\r?\n)?)(mkdir -p "\$INSTDIR"\/opt\/)/,
    `$1${languagePackGuard}$2`,
  );
  buildScript = buildScript.replace(
    /git clone --depth=1 --branch "?\$COLLABORA_ONLINE_BRANCH"? "\$COLLABORA_ONLINE_REPO" online \|\| exit 1/,
    'git clone --depth=1 --filter=blob:none --branch $COLLABORA_ONLINE_BRANCH "$COLLABORA_ONLINE_REPO" online || exit 1',
  );
  const usesEngineBuildTarget = buildScript.includes('make $ENGINE_BUILD_TARGET');
  if (
    (usesLegacyLayout && !buildScript.includes('make -j $(nproc) DEFAULT_TARGET=static_release')) ||
    (!usesLegacyLayout && !usesEngineBuildTarget)
  ) {
    throw new Error('Failed to configure the upstream engine source build target.');
  }
  if (!buildScript.includes('debrand-online.sh')) {
    throw new Error('Failed to inject the debranding patch into the native source build script.');
  }
  if (!buildScript.includes('--with-lang="$ENGINE_LANGUAGES"') || !buildScript.includes('Langpack-ko.xcd')) {
    throw new Error('Failed to enforce the multilingual engine build contract.');
  }
  writeUtf8Lf(buildScriptPath, buildScript);

  return buildContextDir;
}

function main() {
  const contextRoot = readEnv(
    'EDITOR_NATIVE_BUILD_DIR',
    path.join(repoRoot, '.build', 'native-editor'),
  );
  const resolvedContextRoot = resolveRepoPath(contextRoot);
  const dockerRepo = readEnv('EDITOR_SOURCE_DOCKER_REPO', DEFAULT_DOCKER_REPO);
  const dockerRef = readEnv('EDITOR_SOURCE_DOCKER_REF', DEFAULT_SOURCE_REF);
  const sourceRepo = readEnv('EDITOR_SOURCE_REPO', DEFAULT_SOURCE_REPO);
  const sourceRef = readEnv('EDITOR_SOURCE_REF', DEFAULT_SOURCE_REF);
  const extraBuildOptions = readEnv('EDITOR_SOURCE_BUILD_OPTIONS', '--enable-experimental');
  const engineLanguages = readEnv('EDITOR_ENGINE_LANGUAGES', DEFAULT_ENGINE_LANGUAGES);
  const engineAssetsRaw = readEnv('EDITOR_ENGINE_ASSETS', DEFAULT_ENGINE_ASSETS);
  const engineAssets = /^(source|none|false)$/i.test(engineAssetsRaw) ? '' : engineAssetsRaw;
  const prepareOnly = readEnv('EDITOR_NATIVE_PREPARE_ONLY', 'false') === 'true';
  const buildContextDir = prepareBuildContext(
    resolvedContextRoot,
    dockerRepo,
    dockerRef,
  );

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
      ENGINE_LANGUAGES: engineLanguages,
      ENGINE_BUILD_TARGET: '',
      NO_DOCKER_IMAGE: 'true',
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
