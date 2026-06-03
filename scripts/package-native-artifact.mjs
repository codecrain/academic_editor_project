import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readEnv(name, fallback) {
  const value = process.env[name];
  return value == null || String(value).trim() === '' ? fallback : String(value).trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function runText(command, args) {
  const result = spawnSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (result.status !== 0) {
    return '';
  }
  return String(result.stdout ?? '').trim();
}

function main() {
  if (process.platform !== 'linux') {
    throw new Error('Native editor artifact packaging is supported on Linux only.');
  }

  const buildDir = readEnv('EDITOR_NATIVE_BUILD_DIR', path.join(repoRoot, '.build', 'native-editor'));
  const installDir = path.resolve(readEnv(
    'EDITOR_NATIVE_INSTALL_DIR',
    path.join(buildDir, 'from-source-gh-action', 'instdir'),
  ));
  const artifactName = readEnv('EDITOR_NATIVE_ARTIFACT_NAME', 'academic-editor-native-linux-x64.tar.gz');
  const outputDir = path.resolve(readEnv('EDITOR_NATIVE_ARTIFACT_DIR', path.join(repoRoot, 'dist')));
  const artifactPath = path.join(outputDir, artifactName);
  const metadataPath = path.join(outputDir, 'academic-editor-native-linux-x64.metadata.json');

  mkdirSync(outputDir, { recursive: true });
  run('test', ['-x', path.join(installDir, 'usr', 'bin', 'coolwsd')]);
  run('tar', ['-czf', artifactPath, '-C', path.dirname(installDir), path.basename(installDir)]);
  run('sh', ['-lc', `cd "${outputDir.replace(/"/g, '\\"')}" && sha256sum "${artifactName.replace(/"/g, '\\"')}" > "${artifactName.replace(/"/g, '\\"')}.sha256"`]);

  const metadata = {
    builtAt: new Date().toISOString(),
    repositoryCommit: runText('git', ['rev-parse', 'HEAD']),
    sourceRepository: readEnv('EDITOR_SOURCE_REPO', 'https://gerrit.collaboraoffice.com/online'),
    sourceRef: readEnv('EDITOR_SOURCE_REF', 'main'),
    engineAssets: readEnv(
      'EDITOR_ENGINE_ASSETS',
      'https://github.com/CollaboraOnline/online/releases/download/for-code-assets/engine-main-assets.tar.gz',
    ),
    artifact: artifactName,
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(`[editor] packaged native artifact: ${artifactPath}`);
  console.log(`[editor] wrote metadata: ${metadataPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
