import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CORE_ARTIFACT_FILES,
  materializeCoreArtifact,
  validateCoreArtifact,
} from './hwpx-runtime-readiness.mjs';

function artifactFixture(root, {
  name = '@rhwp/core',
  version = 'test',
  methods = [],
  jsMethods = methods,
  marker = 'source',
} = {}) {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, version }));
  writeFileSync(
    path.join(root, 'rhwp.d.ts'),
    `export class HwpDocument {\n${methods.map(method => `  ${method}(...args: unknown[]): unknown;`).join('\n')}\n}\n`,
  );
  writeFileSync(
    path.join(root, 'rhwp.js'),
    `// ${marker}\nexport class HwpDocument {\n${jsMethods.map(method => `  ${method}(...args) { return args; }`).join('\n')}\n}\n`,
  );
  writeFileSync(path.join(root, 'rhwp_bg.wasm'), Buffer.from(marker));
  writeFileSync(path.join(root, 'rhwp_bg.wasm.d.ts'), `// ${marker}\n`);
}

test('runtime readiness rejects an incomplete artifact with artifact, operation, and method', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rhwp-readiness-missing-'));
  artifactFixture(root, { version: '0.7.15', methods: ['insertText'] });

  assert.throws(
    () => validateCoreArtifact(root),
    error => error.code === 'HWPX_CORE_METHOD_UNAVAILABLE'
      && error.message.includes('@rhwp/core@0.7.15')
      && error.message.includes('deleteRange')
      && error.message.includes('deleteRange'),
  );
});

test('runtime readiness rejects methods declared only in typings, not the executable wrapper', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rhwp-readiness-js-surface-'));
  artifactFixture(root, {
    version: 'declarations-only',
    methods: [
      'insertText',
      'deleteRange',
      'createTableEx',
      'getCellProperties',
      'resizeTableCells',
      'insertTextInCell',
      'setTableProperties',
      'insertParagraph',
      'insertPicture',
      'setPageDef',
      'createStyle',
      'updateStyleShapes',
      'applyStyle',
      'applyCellStyle',
      'applyCharFormat',
      'applyCharFormatInCell',
      'applyParaFormat',
      'applyParaFormatInCell',
      'findOrCreateFontId',
    ],
    jsMethods: [],
  });

  assert.throws(
    () => validateCoreArtifact(root),
    error => error.code === 'HWPX_CORE_METHOD_UNAVAILABLE'
      && error.message.includes('@rhwp/core@declarations-only')
      && error.message.includes('insertText')
      && error.message.includes('JavaScript wrapper')
      && error.details?.surface === 'javascript-wrapper',
  );
});

test('runtime readiness accepts a complete fixture and materializes all files atomically', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rhwp-readiness-complete-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  artifactFixture(source, {
    methods: [
      'insertText',
      'deleteRange',
      'insertParagraph',
      'getStyleAt',
      'getCellStyleAt',
      'getParaPropertiesAt',
      'getCellParaPropertiesAt',
      'getCharPropertiesAt',
      'getCellCharPropertiesAt',
      'applyStyle',
      'applyParaFormat',
      'applyCharFormat',
      'createTableEx',
      'getCellProperties',
      'resizeTableCells',
      'insertTextInCell',
      'setTableProperties',
      'insertPicture',
      'setPageDef',
      'createHeaderFooter',
      'insertTextInHeaderFooter',
      'applyParaFormatInHf',
      'deleteHeaderFooter',
      'insertFootnote',
      'insertTextInFootnote',
      'createStyle',
      'updateStyleShapes',
      'applyCellStyle',
      'applyCharFormat',
      'applyCharFormatInCell',
      'applyParaFormat',
      'applyParaFormatInCell',
      'findOrCreateFontId',
    ],
  });

  const readiness = validateCoreArtifact(source);
  assert.equal(readiness.ok, true);
  assert.equal(readiness.artifact, '@rhwp/core@test');

  materializeCoreArtifact(source, destination);
  for (const fileName of CORE_ARTIFACT_FILES) {
    assert.deepEqual(
      readFileSync(path.join(destination, fileName)),
      readFileSync(path.join(source, fileName)),
    );
  }
});

test('failed validation leaves an existing destination byte-for-byte unchanged', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rhwp-readiness-rollback-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  artifactFixture(source, { methods: ['insertText'], marker: 'incomplete' });
  artifactFixture(destination, { methods: ['existingMethod'], marker: 'existing' });
  const before = new Map(CORE_ARTIFACT_FILES.map(fileName => [
    fileName,
    readFileSync(path.join(destination, fileName)),
  ]));

  assert.throws(() => materializeCoreArtifact(source, destination));
  for (const [fileName, bytes] of before) {
    assert.deepEqual(readFileSync(path.join(destination, fileName)), bytes);
  }
});

test('failed staging copy leaves an existing destination byte-for-byte unchanged', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rhwp-readiness-copy-failure-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  const methods = [
    'insertText',
    'insertParagraph',
    'deleteRange',
    'createTableEx',
    'getCellProperties',
    'resizeTableCells',
    'insertTextInCell',
    'setTableProperties',
    'insertPicture',
    'setPageDef',
    'createStyle',
    'updateStyleShapes',
    'applyStyle',
    'applyCellStyle',
    'applyCharFormat',
    'applyCharFormatInCell',
    'applyParaFormat',
    'applyParaFormatInCell',
    'findOrCreateFontId',
  ];
  artifactFixture(source, { methods, marker: 'complete' });
  artifactFixture(destination, { methods: ['existingMethod'], marker: 'existing' });
  const before = new Map(CORE_ARTIFACT_FILES.map(fileName => [
    fileName,
    readFileSync(path.join(destination, fileName)),
  ]));

  assert.throws(() => materializeCoreArtifact(source, destination, {
    copyArtifact: () => {
      throw new Error('simulated staging copy failure');
    },
  }), /simulated staging copy failure/);
  for (const [fileName, bytes] of before) {
    assert.deepEqual(readFileSync(path.join(destination, fileName)), bytes);
  }
});

test('backup cleanup failure returns committed success with an explicit warning', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rhwp-readiness-cleanup-warning-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  const methods = [
    'insertText',
    'insertParagraph',
    'deleteRange',
    'createTableEx',
    'getCellProperties',
    'resizeTableCells',
    'insertTextInCell',
    'setTableProperties',
    'insertPicture',
    'setPageDef',
    'createStyle',
    'updateStyleShapes',
    'applyStyle',
    'applyCellStyle',
    'applyCharFormat',
    'applyCharFormatInCell',
    'applyParaFormat',
    'applyParaFormatInCell',
    'findOrCreateFontId',
  ];
  artifactFixture(source, { methods, marker: 'new-committed' });
  artifactFixture(destination, { methods: ['existingMethod'], marker: 'old-backup' });

  const result = materializeCoreArtifact(source, destination, {
    removeBackup: target => {
      assert.match(path.basename(target), /^\.destination\.backup-/);
      throw new Error('simulated backup cleanup failure');
    },
  });

  assert.equal(result.committed, true);
  assert.equal(result.cleanupWarnings.length, 1);
  assert.match(result.cleanupWarnings[0].message, /simulated backup cleanup failure/);
  assert.equal(
    readFileSync(path.join(destination, 'rhwp.js'), 'utf8').includes('new-committed'),
    true,
  );
  for (const warning of result.cleanupWarnings) {
    if (warning.backupPath) rmSync(warning.backupPath, { recursive: true, force: true });
  }
});

test('installed dependency is ready for every available operation and metadata remains unavailable', () => {
  const installed = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'node_modules',
    '@rhwp',
    'core',
  );
  const readiness = validateCoreArtifact(installed);
  assert.equal(readiness.ok, true);
  assert.ok(!readiness.methods.includes('setDocumentMetadata'));
  assert.ok(!readiness.methods.includes('getDocumentMetadata'));
});
