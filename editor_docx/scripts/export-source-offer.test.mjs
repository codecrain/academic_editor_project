import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

test('export-source-offer writes reproducible public source evidence without secrets', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'academic-editor-source-offer-'));
  const outputPath = path.join(tempDir, 'offer.txt');

  try {
    const result = spawnSync(process.execPath, ['editor_docx/scripts/export-source-offer.mjs', '--output', outputPath], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        EDITOR_ALLOW_DIRTY_SOURCE_OFFER: 'true',
        EDITOR_SOURCE_REF: 'test-source-ref',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const offer = readFileSync(outputPath, 'utf8');
    assert.match(offer, /Document Editor Source Offer/);
    assert.match(offer, /codecrain\/academic_editor_project/);
    assert.match(offer, /EDITOR_SOURCE_REF=test-source-ref/);
    assert.doesNotMatch(offer, /EDITOR_ADMIN_PASSWORD|EDITOR_WOPI_SECRET|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('export-source-offer reads git metadata from its own repository', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'academic-editor-source-offer-cwd-'));
  const outputPath = path.join(tempDir, 'offer.txt');

  try {
    const result = spawnSync(process.execPath, [path.resolve('editor_docx/scripts/export-source-offer.mjs'), '--output', outputPath], {
      cwd: tempDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        EDITOR_ALLOW_DIRTY_SOURCE_OFFER: 'true',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(readFileSync(outputPath, 'utf8'), /Public runtime repository/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
