import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertSystemplateFontsSynced,
  collectFontManifest,
  resolveSystemplateFontDir,
} from './native-systemplate-fonts.mjs';

test('systemplate font verification ignores an absent optional source', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'editor-fonts-'));
  try {
    assert.deepEqual(
      assertSystemplateFontsSynced({
        sourceDir: path.join(root, 'missing'),
        systemplateDir: path.join(root, 'plate'),
      }),
      { count: 0, targetDir: null },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('systemplate font verification compares relative paths and sizes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'editor-fonts-'));
  const sourceDir = path.join(root, 'usr', 'local', 'share', 'fonts', 'academic');
  const systemplateDir = path.join(root, 'plate');
  const targetDir = resolveSystemplateFontDir(systemplateDir, sourceDir);
  try {
    mkdirSync(path.join(sourceDir, 'serif'), { recursive: true });
    mkdirSync(path.join(targetDir, 'serif'), { recursive: true });
    writeFileSync(path.join(sourceDir, 'serif', 'paper.ttf'), 'font-data');
    writeFileSync(path.join(targetDir, 'serif', 'paper.ttf'), 'font-data');

    assert.deepEqual(collectFontManifest(sourceDir), ['serif/paper.ttf|9']);
    assert.equal(
      assertSystemplateFontsSynced({ sourceDir, systemplateDir }).count,
      1,
    );

    writeFileSync(path.join(targetDir, 'serif', 'paper.ttf'), 'wrong');
    assert.throws(
      () => assertSystemplateFontsSynced({ sourceDir, systemplateDir }),
      /systemplate fonts are stale/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
