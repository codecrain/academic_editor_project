import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readProjectFile(filePath) {
  return readFileSync(path.join(repoRoot, filePath), 'utf8');
}

test('dev source runner enables source-file serving for browser reload loops', () => {
  const sourceRunner = readProjectFile('scripts/dev-source-editor.mjs');
  assert.match(sourceRunner, /COOL_SERVE_FROM_FS: '1'/);
  assert.match(sourceRunner, /branding', 'debrand-online\.sh'/);
  assert.match(sourceRunner, /dev-source-editor\.mjs \[doctor\|prepare\|build\|run\|stop\|smoke\]/);
});

test('debranding patch keeps the desktop sidebar hidden by default', () => {
  const patch = readProjectFile('branding/debrand-online.sh');
  assert.match(patch, /getBooleanDocTypePref\('ShowSidebar', true\)/);
  assert.match(patch, /getBooleanDocTypePref\('ShowSidebar', false\)/);
  assert.match(patch, /patched sidebar default to hidden/);
});

test('source and native builds apply the public debranding patch before compilation', () => {
  const sourceBuild = readProjectFile('scripts/build-source-editor-image.mjs');
  const nativeBuild = readProjectFile('scripts/build-native-editor.mjs');
  for (const script of [sourceBuild, nativeBuild]) {
    assert.match(script, /public debranding patch before compiling browser\/server assets/);
    assert.match(script, /debrand-online\.sh"\s*,?\s*"\$BUILDDIR\/online/);
  }
});

test('dev check cleans up only runtimes created by the check', () => {
  const devCheck = readProjectFile('scripts/dev-check.mjs');
  assert.match(devCheck, /snapshotRuntime\(\)/);
  assert.match(devCheck, /if \(!before\.dockerExists && after\.dockerExists\)/);
  assert.match(devCheck, /if \(!before\.pm2Exists && after\.pm2Exists\)/);
  assert.match(devCheck, /EDITOR_DEV_KEEP_RUNNING/);
});

test('smoke check validates discovery and browser cool.html renderability', () => {
  const smoke = readProjectFile('scripts/smoke-editor.mjs');
  assert.match(smoke, /\/hosting\/discovery/);
  assert.match(smoke, /extractCoolHtmlUrl/);
  assert.match(smoke, /WOPISrc/);
  assert.match(smoke, /Editor page failed/);
});

test('package exposes fast dev and source hot-loop commands', () => {
  const pkg = JSON.parse(readProjectFile('package.json'));
  assert.equal(pkg.license, 'MPL-2.0');
  assert.equal(pkg.scripts['dev:check'], 'node scripts/dev-check.mjs');
  assert.equal(pkg.scripts['dev:check:runtime'], 'node scripts/dev-check.mjs --runtime');
  assert.equal(pkg.scripts['dev:source:run'], 'node scripts/dev-source-editor.mjs run');
  assert.equal(pkg.scripts.smoke, 'node scripts/smoke-editor.mjs');
});
