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

test('Image Studio ships editable project persistence and an MIT vector workbench', () => {
  const hostScript = readFileSync(path.join(editorRoot, 'tlooto-image-studio.js'), 'utf8');
  assert.match(hostScript, /Save editable project/);
  assert.match(hostScript, /FileSave\.export_as_json/);
  assert.match(hostScript, /Save flattened image/);

  for (const file of ['index.html', 'app.js', 'styles.css']) {
    assert.equal(existsSync(path.join(editorRoot, 'vector', file)), true, `vector/${file} must be distributed`);
  }
  const vectorApp = readFileSync(path.join(editorRoot, 'vector', 'app.js'), 'utf8');
  for (const contract of [
    'loadSVGFromString',
    'save-project',
    'export-svg',
    'export-png',
    'ActiveSelection',
    'toActiveSelection',
    'PencilBrush',
  ]) {
    assert.match(vectorApp, new RegExp(contract), `${contract} must remain in the vector editing contract`);
  }

  const fabricPackage = JSON.parse(readFileSync(path.join(editorRoot, 'node_modules', 'fabric', 'package.json'), 'utf8'));
  assert.equal(fabricPackage.version, '7.4.0');
  assert.equal(fabricPackage.license, 'MIT');
});

test('every locked Image Studio npm package has an approved permissive license', () => {
  const lock = JSON.parse(readFileSync(path.join(editorRoot, 'package-lock.json'), 'utf8'));
  const approvedIdentifiers = new Set([
    '0BSD',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'CC0-1.0',
    'ISC',
    'MIT',
    'MIT-0',
    'WTFPL',
  ]);
  const rejected = [];
  for (const [packagePath, metadata] of Object.entries(lock.packages || {})) {
    if (!packagePath.startsWith('node_modules/')) continue;
    const license = String(metadata.license || '').trim();
    const identifiers = license.match(/[A-Za-z0-9.-]+/g) || [];
    const operators = identifiers.filter((identifier) => identifier === 'AND');
    const licenseIdentifiers = identifiers.filter((identifier) => identifier !== 'OR' && identifier !== 'AND');
    if (!license || operators.length || licenseIdentifiers.some((identifier) => !approvedIdentifiers.has(identifier))) {
      rejected.push(`${packagePath}: ${license || 'missing'}`);
    }
  }
  assert.deepEqual(rejected, []);
});
