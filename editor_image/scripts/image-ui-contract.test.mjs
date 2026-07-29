import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(here, '..');
const miniPaintRoot = path.join(editorRoot, 'vendor', 'minipaint');

test('Image Studio keeps the MIT-licensed miniPaint source and core local-editing controls', () => {
  const licensePath = path.join(miniPaintRoot, 'MIT-LICENSE.txt');
  const bundlePath = path.join(miniPaintRoot, 'dist', 'bundle.js');

  assert.equal(existsSync(licensePath), true, 'miniPaint MIT license must be distributed with the source');
  const license = readFileSync(licensePath, 'utf8');
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.equal(existsSync(bundlePath), true, 'the pinned editor bundle must be present');

  for (const sourceFile of [
    'src/js/actions/prepare-canvas.js',
    'src/js/actions/refresh-layers-gui.js',
    'src/js/tools/magic_erase.js',
    'src/js/modules/tools/content_fill.js',
    'src/js/libs/imagefilters.js',
  ]) {
    assert.equal(existsSync(path.join(miniPaintRoot, sourceFile)), true, `${sourceFile} must remain available`);
  }
});
