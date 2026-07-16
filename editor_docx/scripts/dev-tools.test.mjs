import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readProjectFile(filePath) {
  return readFileSync(path.join(repoRoot, filePath), 'utf8');
}

test('dev source runner enables source-file serving for browser reload loops', () => {
  const sourceRunner = readProjectFile('editor_docx/scripts/dev-source-editor.mjs');
  assert.match(sourceRunner, /COOL_SERVE_FROM_FS: '1'/);
  assert.match(sourceRunner, /editor_docx/);
  assert.match(sourceRunner, /apply-docx-editor-patches\.mjs/);
  assert.match(sourceRunner, /dev-source-editor\.mjs \[doctor\|prepare\|build\|run\|stop\|smoke\]/);
});

test('cross-platform DOCX patch runner reuses the public debranding patch source', () => {
  const patchRunner = readProjectFile('editor_docx/scripts/apply-docx-editor-patches.mjs');
  assert.match(patchRunner, /branding', 'debrand-online\.sh'/);
  assert.match(patchRunner, /extractPythonBlocks/);
  assert.match(patchRunner, /user-facing trademark strings remain/);
});

test('debranding patch keeps the desktop sidebar hidden by default', () => {
  const patch = readProjectFile('branding/debrand-online.sh');
  assert.match(patch, /getBooleanDocTypePref\('ShowSidebar', true\)/);
  assert.match(patch, /getBooleanDocTypePref\('ShowSidebar', false\)/);
  assert.match(patch, /patched sidebar default to hidden/);
});

test('debranding patch covers build-time configure defaults', () => {
  const patch = readProjectFile('branding/debrand-online.sh');
  assert.match(patch, /"\.ac"/);
  assert.match(patch, /root \/ "configure\.ac"/);
  assert.match(patch, /https:\/\/www\.collaboraonline\.com/);
  assert.match(patch, /https:\/\/tlooto\.com/);
});

test('debranding patch removes unsafe upstream support surfaces from Help and About', () => {
  const patch = readProjectFile('branding/debrand-online.sh');
  assert.match(patch, /runtime build: \$\{info\.coolwsdHash\}/);
  assert.match(patch, /CodeCrain Co\., Ltd\./);
  assert.match(patch, /source terms remain available in the service legal notice/);
  assert.match(patch, /id === 'report-an-issue' \|\| id === 'forum'/);
  assert.match(patch, /Support is available from Tlooto/);
  assert.match(patch, /let hasLatestUpdates = false/);
  assert.match(patch, /var hasFeedback = false/);
  assert.match(patch, /var hasServerAudit = false/);
  assert.doesNotMatch(patch, /window\.open\('https:\/\/github\.com\/CollaboraOnline\/online\/issues'/);
  assert.doesNotMatch(patch, /window\.open\('https:\/\/forum\.collaboraonline\.com'/);
});

test('debranding patch keeps notebookbar document title visually restrained', () => {
  const patch = readProjectFile('branding/debrand-online.sh');
  assert.match(patch, /Tlooto document title sizing/);
  assert.match(patch, /#document-titlebar/);
  assert.match(patch, /max-width: 280px/);
  assert.match(patch, /#document-name-input/);
  assert.match(patch, /font-size: var\(--default-font-size\) !important/);
  assert.match(patch, /text-overflow: ellipsis/);
});

test('source and native builds apply the public debranding patch before compilation', () => {
  const sourceBuild = readProjectFile('editor_docx/scripts/build-source-editor-image.mjs');
  const nativeBuild = readProjectFile('editor_docx/scripts/build-native-editor.mjs');
  for (const script of [sourceBuild, nativeBuild]) {
    assert.match(script, /public debranding patch before compiling browser\/server assets/);
    assert.match(script, /debrand-online\.sh"\s*,?\s*"\$BUILDDIR\/online/);
  }
});

test('dev check cleans up only runtimes created by the check', () => {
  const devCheck = readProjectFile('editor_docx/scripts/dev-check.mjs');
  assert.match(devCheck, /snapshotRuntime\(\)/);
  assert.match(devCheck, /if \(!before\.dockerExists && after\.dockerExists\)/);
  assert.match(devCheck, /if \(!before\.pm2Exists && after\.pm2Exists\)/);
  assert.match(devCheck, /EDITOR_DEV_KEEP_RUNNING/);
});

test('smoke check validates discovery, browser rendering, and websocket upgrades', () => {
  const smoke = readProjectFile('editor_docx/scripts/smoke-editor.mjs');
  assert.match(smoke, /\/hosting\/discovery/);
  assert.match(smoke, /extractCoolHtmlUrl/);
  assert.match(smoke, /WOPISrc/);
  assert.match(smoke, /Editor page failed/);
  assert.match(smoke, /Sec-WebSocket-Accept/);
  assert.match(smoke, /Editor websocket failed/);
  assert.match(smoke, /ok websocket=/);
});

test('package exposes fast dev and source hot-loop commands', () => {
  const pkg = JSON.parse(readProjectFile('package.json'));
  assert.equal(pkg.license, 'MPL-2.0');
  assert.equal(pkg.scripts.dev, 'node editor_docx/scripts/start-local-editors.mjs');
  assert.equal(pkg.scripts.stop, 'node editor_docx/scripts/stop-local-editors.mjs');
  assert.equal(pkg.scripts['dev:check'], 'node editor_docx/scripts/dev-check.mjs');
  assert.equal(pkg.scripts['dev:check:runtime'], 'node editor_docx/scripts/dev-check.mjs --runtime');
  assert.equal(pkg.scripts['dev:source:run'], 'node editor_docx/scripts/dev-source-editor.mjs run');
  assert.equal(pkg.scripts['deploy:dev'], 'bash sh.start_dev');
  assert.equal(pkg.scripts['deploy:prod'], 'bash sh.start');
  assert.equal(pkg.scripts.smoke, 'node editor_docx/scripts/smoke-editor.mjs');
  assert.match(pkg.scripts['test:runtime'], /editor-gateway\.test\.mjs/);
  assert.equal(pkg.scripts['start:dev'], undefined);
});

test('local dev starts DOCX and HWPX on stable subpaths', () => {
  const localDev = readProjectFile('editor_docx/scripts/start-local-editors.mjs');
  const rhwpStart = readProjectFile('editor_hwpx/scripts/start-studio.mjs');
  const rhwpEnsure = readProjectFile('editor_hwpx/scripts/ensure-studio.mjs');

  assert.match(localDev, /EDITOR_SERVICE_ROOT/);
  assert.match(localDev, /editor-gateway\.mjs/);
  assert.match(localDev, /EDITOR_GATEWAY_HWPX_STATIC_ROOT/);
  assert.doesNotMatch(localDev, /RHWP_STUDIO_INTERNAL_PORT/);
  assert.match(localDev, /\/docx\//);
  assert.match(localDev, /\/hwpx\//);
  assert.match(rhwpStart, /\/hwpx\//);
  assert.match(rhwpEnsure, /\/hwpx\//);
});

test('ubuntu deployment entrypoints wrap the native runtime checks', () => {
  const prod = readProjectFile('sh.start');
  const dev = readProjectFile('sh.start_dev');
  const helper = readProjectFile('editor_docx/scripts/deploy-native-editor.sh');

  assert.match(prod, /EDITOR_REQUIRE_PUBLIC_URL/);
  assert.match(prod, /http:\/\/175\.193\.85\.86:11004/);
  assert.match(prod, /EDITOR_WOPI_BASE_URL=.*code-dev-v2\.tlooto\.com/);
  assert.match(prod, /EDITOR_WOPI_ALIASGROUP1=.*EDITOR_WOPI_BASE_URL/);
  assert.match(prod, /EDITOR_WOPI_ALIASGROUP2=.*https:\/\/tlooto\.com/);
  assert.match(prod, /EDITOR_WOPI_ALIASGROUP3=.*127\.0\.0\.1.*EDITOR_PUBLIC_URL/);
  assert.match(prod, /EDITOR_GATEWAY_PUBLIC_ORIGIN=.*EDITOR_PUBLIC_URL/);
  assert.match(prod, /EDITOR_GATEWAY_HOST=.*0\.0\.0\.0/);
  assert.match(prod, /academic-editor-native/);
  assert.match(prod, /deploy-native-editor\.sh/);
  assert.match(dev, /http:\/\/175\.193\.85\.86:11004/);
  assert.match(dev, /EDITOR_WOPI_BASE_URL=.*code-dev-v2\.tlooto\.com/);
  assert.match(dev, /EDITOR_WOPI_ALIASGROUP1=.*EDITOR_WOPI_BASE_URL/);
  assert.match(dev, /EDITOR_WOPI_ALIASGROUP2=.*https:\/\/tlooto\.com/);
  assert.match(dev, /EDITOR_WOPI_ALIASGROUP3=.*127\.0\.0\.1.*EDITOR_PUBLIC_URL/);
  assert.match(dev, /EDITOR_GATEWAY_PUBLIC_ORIGIN=.*EDITOR_PUBLIC_URL/);
  assert.match(dev, /EDITOR_GATEWAY_HOST=.*0\.0\.0\.0/);
  assert.match(dev, /academic-editor-native-dev/);
  assert.match(dev, /EDITOR_NATIVE_AUTO_LATEST/);
  assert.match(dev, /deploy-native-editor\.sh/);
  assert.match(helper, /git pull --ff-only/);
  assert.match(helper, /before_head=.*git rev-parse HEAD/);
  assert.match(helper, /repository updated; restarting deployment with the latest script/);
  assert.match(helper, /exec bash "\$0" "\$@"/);
  assert.match(helper, /npm run install:native:artifact/);
  assert.match(helper, /sync_native_systemplate/);
  assert.match(helper, /sudo.*coolwsd-systemplate-setup|sudo "\$\{setup\[@\]\}"/);
  assert.match(helper, /install_artifact_if_needed\s+sync_native_systemplate\s+run_optional_checks/);
  assert.match(helper, /run_docx_runtime_npm start:native/);
  assert.match(helper, /prepare_rhwp_static_assets/);
  assert.match(helper, /start_editor_gateway/);
  assert.match(helper, /127\.0\.0\.1:\$\{EDITOR_GATEWAY_PORT\}.*RHWP_STUDIO_BASE_PATH/);
  assert.match(helper, /academic-editor-gateway-dev/);
  assert.match(helper, /academic-editor-gateway-prod/);
  assert.match(helper, /EDITOR_GATEWAY_PORT/);
  assert.match(helper, /EDITOR_GATEWAY_HWPX_STATIC_ROOT/);
  assert.doesNotMatch(helper, /RHWP_STUDIO_INTERNAL_PORT/);
  assert.match(helper, /run_docx_runtime_npm audit:native -- --output/);
  assert.match(helper, /npm run source-offer -- --output/);
  assert.match(helper, /npm run smoke/);
  assert.match(helper, /pm2 save/);
});
