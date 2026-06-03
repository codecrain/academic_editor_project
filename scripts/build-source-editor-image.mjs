import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_IMAGE = 'academic-editor/document-editor:source';
const DEFAULT_DOCKER_REPO = 'https://gerrit.collaboraoffice.com/online';
const DEFAULT_SOURCE_REPO = 'https://gerrit.collaboraoffice.com/online';
const DEFAULT_SOURCE_REF = 'main';
const DEFAULT_ENGINE_ASSETS = 'https://github.com/CollaboraOnline/online/releases/download/for-code-assets/engine-main-assets.tar.gz';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const BLOCKED_CODE_IMAGES = new Set([
  'collabora/code',
  'docker.io/collabora/code',
  'registry.hub.docker.com/collabora/code',
]);

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

function normalizeImageName(image) {
  const raw = String(image ?? '').trim().toLowerCase();
  const withoutDigest = raw.split('@')[0] ?? raw;
  const lastColonIndex = withoutDigest.lastIndexOf(':');
  const lastSlashIndex = withoutDigest.lastIndexOf('/');
  return lastColonIndex > lastSlashIndex ? withoutDigest.slice(0, lastColonIndex) : withoutDigest;
}

function assertNotCodeImage(image) {
  if (BLOCKED_CODE_IMAGES.has(normalizeImageName(image))) {
    throw new Error('Refusing to build or tag collabora/code. Use a source-built image name.');
  }
}

function readUtf8Lf(filePath) {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function writeUtf8Lf(filePath, text) {
  writeFileSync(filePath, text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
}

function assertSafeBuildDir(contextDir) {
  const resolved = path.resolve(contextDir);
  if (resolved === repoRoot || resolved === path.parse(resolved).root || !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Unsafe source image build directory: ${resolved}. Use a directory inside this repository, such as .build/document-editor-source-image.`);
  }
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function prepareOfficialDockerContext(contextDir, dockerRepo, dockerRef) {
  assertSafeBuildDir(contextDir);
  const checkoutDir = path.join(contextDir, 'official-online');
  const buildContextDir = path.join(contextDir, 'from-source-gh-action');

  rmSync(contextDir, { recursive: true, force: true });
  mkdirSync(contextDir, { recursive: true });

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
    path.join(repoRoot, 'branding', 'debrand-online.sh'),
    path.join(buildContextDir, 'debrand-online.sh'),
  );
  writeUtf8Lf(path.join(buildContextDir, 'debrand-online.sh'), readUtf8Lf(path.join(buildContextDir, 'debrand-online.sh')));

  const dockerfilePath = path.join(buildContextDir, 'Dockerfile');
  let dockerfile = readUtf8Lf(dockerfilePath);
  dockerfile = dockerfile
    .replace(
      'RUN chmod +x /start-collabora-online.sh',
      "RUN sed -i 's/\\r$//' /start-collabora-online.sh && chmod +x /start-collabora-online.sh",
    )
    .replace(
      'apt-get install -y --no-install-recommends adduser fontconfig libcap2-bin libnss-wrapper',
      'apt-get install -y --no-install-recommends adduser fontconfig libcap2-bin libnss-wrapper libpixman-1-0',
    )
    .replace(
      'git build-essential zip ccache autoconf gperf nasm xsltproc flex bison',
      'git build-essential zip ccache autoconf gperf nasm xsltproc flex bison uuid-dev meson ninja-build',
    )
    .replace(
      /^ENV ENGINE_ASSETS=.*$/m,
      'ARG ENGINE_ASSETS=\nENV ENGINE_ASSETS=${ENGINE_ASSETS}',
    )
    .replace(
      /^ENV COLLABORA_ONLINE_REPO=.*$/m,
      'ARG COLLABORA_ONLINE_REPO=https://gerrit.collaboraoffice.com/online\nENV COLLABORA_ONLINE_REPO=${COLLABORA_ONLINE_REPO}',
    )
    .replace(
      /^ENV COLLABORA_ONLINE_BRANCH=.*$/m,
      'ARG COLLABORA_ONLINE_BRANCH=main\nENV COLLABORA_ONLINE_BRANCH=${COLLABORA_ONLINE_BRANCH}',
    )
    .replace(
      /^ENV ONLINE_EXTRA_BUILD_OPTIONS=.*$/m,
      'ARG ONLINE_EXTRA_BUILD_OPTIONS=--enable-experimental\nENV ONLINE_EXTRA_BUILD_OPTIONS=${ONLINE_EXTRA_BUILD_OPTIONS}',
    );
  writeUtf8Lf(dockerfilePath, dockerfile);

  const buildScriptPath = path.join(buildContextDir, 'build.sh');
  let buildScript = readUtf8Lf(buildScriptPath);
  buildScript = buildScript.replace(
    /make -j \$\(nproc\)(\r?\n\s+)make install/,
    'make -j $(nproc) DEFAULT_TARGET=static_release$1make install DEFAULT_TARGET=static_release',
  );
  buildScript = buildScript.replace(
    /(\( cd online && git fetch --all && git checkout -f \$COLLABORA_ONLINE_BRANCH && git clean -f -d && git pull -r \) \|\| exit 1\r?\n)/,
    `$1\n# Apply the public debranding patch before compiling browser/server assets.\n` +
      `bash "$SRCDIR/debrand-online.sh" "$BUILDDIR/online" || exit 1\n`,
  );
  if (!buildScript.includes('make -j $(nproc) DEFAULT_TARGET=static_release')) {
    throw new Error('Failed to switch POCO source build to the static_release target.');
  }
  if (!buildScript.includes('debrand-online.sh')) {
    throw new Error('Failed to inject the debranding patch into the generated source build script.');
  }
  writeUtf8Lf(buildScriptPath, buildScript);

  return buildContextDir;
}

function main() {
  const image = readEnv('EDITOR_IMAGE', DEFAULT_IMAGE);
  const dockerRepo = readEnv('EDITOR_SOURCE_DOCKER_REPO', DEFAULT_DOCKER_REPO);
  const dockerRef = readEnv('EDITOR_SOURCE_DOCKER_REF', DEFAULT_SOURCE_REF);
  const sourceRepo = readEnv('EDITOR_SOURCE_REPO', DEFAULT_SOURCE_REPO);
  const sourceRef = readEnv('EDITOR_SOURCE_REF', DEFAULT_SOURCE_REF);
  const extraBuildOptions = readEnv('EDITOR_SOURCE_BUILD_OPTIONS', '--enable-experimental');
  const engineAssetsRaw = readEnv('EDITOR_ENGINE_ASSETS', DEFAULT_ENGINE_ASSETS);
  const engineAssets = /^(source|none|false)$/i.test(engineAssetsRaw) ? '' : engineAssetsRaw;
  const noCache = readEnv('EDITOR_DOCKER_NO_CACHE', 'false') === 'true';
  const prepareOnly = readEnv('EDITOR_PREPARE_ONLY', 'false') === 'true';
  const contextRoot = readEnv(
    'EDITOR_SOURCE_BUILD_DIR',
    path.join(repoRoot, '.build', 'document-editor-source-image'),
  );
  const resolvedContextRoot = resolveRepoPath(contextRoot);

  assertNotCodeImage(image);

  if (engineAssets) {
    console.log(`[editor] using engine assets: ${engineAssets}`);
  } else {
    console.log('[editor] EDITOR_ENGINE_ASSETS disables engine assets; building the engine from source.');
  }

  const buildContextDir = prepareOfficialDockerContext(resolvedContextRoot, dockerRepo, dockerRef);
  if (prepareOnly) {
    console.log(`[editor] prepared source build context at ${buildContextDir}`);
    return;
  }

  console.log(`[editor] building source-based document editor image ${image}`);
  run('docker', [
    'build',
    ...(noCache ? ['--no-cache'] : []),
    '-t',
    image,
    '--build-arg',
    `ENGINE_ASSETS=${engineAssets}`,
    '--build-arg',
    `COLLABORA_ONLINE_REPO=${sourceRepo}`,
    '--build-arg',
    `COLLABORA_ONLINE_BRANCH=${sourceRef}`,
    '--build-arg',
    `ONLINE_EXTRA_BUILD_OPTIONS=${extraBuildOptions}`,
    buildContextDir,
  ]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
