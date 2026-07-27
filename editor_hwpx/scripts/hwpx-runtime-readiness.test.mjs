import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getHwpxCommandCatalog } from './hwpx-command-catalog.mjs';
import * as runtimeReadiness from './hwpx-runtime-readiness.mjs';

const {
  CORE_ARTIFACT_FILES,
  materializeCoreArtifact,
  validateCoreArtifact,
} = runtimeReadiness;

const COMPLETE_RUNTIME_METHODS = [...new Set(
  getHwpxCommandCatalog().commands.flatMap(command => command.nativeMethods),
)];

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
      'deleteTextInCell',
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
    methods: COMPLETE_RUNTIME_METHODS,
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
  const methods = COMPLETE_RUNTIME_METHODS;
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

test('staging cleanup failure cannot mask a swap failure or prevent backup restoration', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rhwp-readiness-cleanup-rollback-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  const methods = COMPLETE_RUNTIME_METHODS;
  artifactFixture(source, { methods, marker: 'new-staging' });
  artifactFixture(destination, { methods: ['existingMethod'], marker: 'old-destination' });
  const before = new Map(CORE_ARTIFACT_FILES.map(fileName => [
    fileName,
    readFileSync(path.join(destination, fileName)),
  ]));
  const primaryFailure = Object.freeze(new Error('simulated destination swap failure'));
  let renameCalls = 0;
  let thrown;

  try {
    assert.throws(() => materializeCoreArtifact(source, destination, {
      renameArtifact: (from, to) => {
        renameCalls += 1;
        if (renameCalls === 2) throw primaryFailure;
        renameSync(from, to);
      },
      removeStaging: () => {
        throw new Error('simulated staging cleanup failure');
      },
    }), error => {
      thrown = error;
      return error === primaryFailure;
    });
    assert.equal(thrown, primaryFailure);
    for (const [fileName, bytes] of before) {
      assert.deepEqual(readFileSync(path.join(destination, fileName)), bytes);
    }
    assert.equal(renameCalls, 3, 'destination move, failed swap, then backup restore');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup cleanup failure returns committed success with an explicit warning', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rhwp-readiness-cleanup-warning-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'destination');
  const methods = COMPLETE_RUNTIME_METHODS;
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

test('cleanup warnings format artifact backup evidence for startup logs', () => {
  assert.deepEqual(runtimeReadiness.formatCoreCleanupWarnings({
    cleanupWarnings: [{
      code: 'HWPX_CORE_BACKUP_CLEANUP_FAILED',
      message: 'access denied',
      backupPath: 'C:\\runtime\\.core.backup-123',
    }],
  }), [
    '[rhwp] warning: HWPX_CORE_BACKUP_CLEANUP_FAILED: access denied; backup=C:\\runtime\\.core.backup-123',
  ]);
});

test('source-built runtime exposes promoted native methods on three byte-identical surfaces', () => {
  const sourceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const roots = [
    path.join(sourceRoot, 'pkg'),
    path.join(sourceRoot, 'node_modules', '@rhwp', 'core'),
    path.join(sourceRoot, 'rhwp-studio', 'node_modules', '@rhwp', 'core'),
  ];
  const readiness = roots.map((root) => validateCoreArtifact(root));
  for (const result of readiness) {
    assert.equal(result.ok, true);
    for (const method of [
      'setDocumentMetadata',
      'getDocumentMetadata',
      'createHeaderFooter',
      'insertFootnote',
    ]) {
      assert.ok(result.methods.includes(method), `${result.artifactRoot} must expose ${method}`);
    }
  }
  const hashes = roots.map((root) => Object.fromEntries(
    CORE_ARTIFACT_FILES.map((fileName) => [
      fileName,
      createHash('sha256').update(readFileSync(path.join(root, fileName))).digest('hex'),
    ]),
  ));
  assert.deepEqual(hashes[1], hashes[0]);
  assert.deepEqual(hashes[2], hashes[0]);
});
