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
