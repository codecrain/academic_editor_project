import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const requiredFonts = ['HANBatang.woff', 'HANBatangB.woff', 'HCRDotum.woff'];

test('HWPX runtime fonts are vendored and do not use a CDN', async () => {
  const source = await readFile(new URL('../src/core/font-loader.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net/);

  for (const fileName of requiredFonts) {
    const bytes = await readFile(new URL(`../public/fonts/${fileName}`, import.meta.url));
    assert.ok(bytes.length > 10_000, `${fileName} must contain a vendored font`);
    assert.match(source, new RegExp(`fonts/${fileName.replace('.', '\\.')}['\"]`));
  }
});

test('embedded HWPX loads auto-fix validation warnings without blocking on a modal', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /type ValidationLoadMode = 'prompt' \| 'auto-fix' \| 'as-is'/);
  assert.match(source, /validationMode === 'prompt'[\s\S]*showValidationModalIfNeeded\(report\)[\s\S]*validationMode/);
  assert.match(source, /loadBytes\(bytes, msg\.fileName \|\| 'document\.hwp', null, performance\.now\(\), 'auto-fix'\)/);
  assert.match(source, /loadBytes\(bytes, params\.fileName \|\| 'document\.hwp', null, performance\.now\(\), 'auto-fix'\)/);
});
