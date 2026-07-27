import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE_REPO = 'https://gerrit.collaboraoffice.com/online';
const DEFAULT_SOURCE_REF = 'main';
const DEFAULT_ENGINE_ASSETS = 'https://github.com/CollaboraOnline/online/releases/download/for-code-assets/engine-main-assets.tar.gz';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

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

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout ?? '').trim();
}

function readOptionalFile(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8').trim() : '';
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join('.build', 'source-offers', `document-editor-source-offer-${timestamp}.txt`);
}

function buildSourceOffer() {
  const publicCommit = runGit(['rev-parse', 'HEAD']);
  const publicRemote = runGit(['remote', 'get-url', 'origin']);
  const dirty = runGit(['status', '--porcelain']);
  const allowDirty = readEnv('EDITOR_ALLOW_DIRTY_SOURCE_OFFER', 'false') === 'true';

  if (dirty && !allowDirty) {
    throw new Error('Refusing to write a release source offer from a dirty public repository.');
  }

  const sourceRepo = readEnv('EDITOR_SOURCE_REPO', DEFAULT_SOURCE_REPO);
  const sourceRef = readEnv('EDITOR_SOURCE_REF', DEFAULT_SOURCE_REF);
  const sourceDockerRepo = readEnv('EDITOR_SOURCE_DOCKER_REPO', DEFAULT_SOURCE_REPO);
  const sourceDockerRef = readEnv('EDITOR_SOURCE_DOCKER_REF', DEFAULT_SOURCE_REF);
  const engineAssets = readEnv('EDITOR_ENGINE_ASSETS', DEFAULT_ENGINE_ASSETS);
  const vendoredDocxCommit = readOptionalFile(path.join('editor_docx', 'UPSTREAM_COMMIT'));
  const vendoredHwpxCommit = readOptionalFile(path.join('editor_hwpx', 'UPSTREAM_COMMIT'));

  return [
    'Document Editor Source Offer',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'Public runtime repository',
    `- remote: ${publicRemote}`,
    `- commit: ${publicCommit}`,
    `- dirty: ${dirty ? 'yes' : 'no'}`,
    '',
    'Upstream source used for the native runtime',
    `- EDITOR_SOURCE_REPO=${sourceRepo}`,
    `- EDITOR_SOURCE_REF=${sourceRef}`,
    `- EDITOR_ENGINE_ASSETS=${engineAssets}`,
    '',
    'Upstream source-build context used by the build orchestration',
    `- EDITOR_SOURCE_DOCKER_REPO=${sourceDockerRepo}`,
    `- EDITOR_SOURCE_DOCKER_REF=${sourceDockerRef}`,
    '',
    'Vendored source trees in this repository',
    `- editor_docx/UPSTREAM_COMMIT=${vendoredDocxCommit || 'not recorded'}`,
    `- editor_hwpx/UPSTREAM_COMMIT=${vendoredHwpxCommit || 'not recorded'}`,
    '',
    'How to reconstruct the modified source tree',
    '1. Clone the public runtime repository and check out the commit above.',
    '2. Use editor_docx/ directly, or clone the upstream source repository at EDITOR_SOURCE_REF.',
    '3. Reapply editor_docx/scripts/apply-docx-editor-patches.mjs, which executes the patch blocks from branding/debrand-online.sh.',
    '4. Build with editor_docx/scripts/build-native-editor.mjs or editor_docx/scripts/build-source-editor-image.mjs using the same env values above.',
    '',
    'Example',
    '```bash',
    'git clone https://github.com/codecrain/academic_editor_project.git',
    'cd academic_editor_project',
    `git checkout ${publicCommit}`,
    'npm run dev:source:prepare',
    '```',
    '',
    'Notices',
    '- Preserve LICENSE, NOTICE, COMPLIANCE.md, upstream license notices, and third-party notices.',
    '- Keep WOPI secrets, service URLs, database credentials, and private Tlooto service code outside this public repository.',
    '- Do not distribute prebuilt CODE images or proprietary executable builds as the Tlooto SaaS editor runtime.',
    '',
  ].join('\n');
}

function main() {
  const outputPath = path.resolve(parseArg('output') || defaultOutputPath());
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buildSourceOffer(), 'utf8');
  console.log(`[source-offer] wrote ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
