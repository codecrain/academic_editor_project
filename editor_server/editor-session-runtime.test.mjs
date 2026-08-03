import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  EditorSessionWorkerPool,
  documentLane,
} from './editor-session-runtime.mjs';

test('document sessions use stable CPU lanes without a user-count heuristic', () => {
  assert.equal(documentLane('doc-a', 8), documentLane('doc-a', 8));
  assert.ok(documentLane('doc-a', 8) >= 0);
  assert.ok(documentLane('doc-a', 8) < 8);
});

test('worker-backed sessions preserve the existing session response contract', async () => {
  const bytes = await readFile('editor_docx/test/data/template.docx');
  const runtime = new EditorSessionWorkerPool({ size: 2 });
  try {
    const opened = await Promise.all([
      runtime.open('doc-worker-a', 'docx', bytes),
      runtime.open('doc-worker-b', 'docx', bytes),
    ]);
    const [first, second] = await Promise.all(opened.map(({ session }) => session.readJson()));
    assert.equal(first.sourceFormat, 'docx');
    assert.equal(second.sourceFormat, 'docx');
    assert.equal(opened[0].session.revision, 1);
    const saved = await opened[0].session.save();
    assert.ok(Buffer.isBuffer(saved.bytes));
    assert.ok(saved.bytes.length > 0);
  } finally {
    await runtime.close();
  }
});

test('different document lanes execute CPU work concurrently', async () => {
  const runtime = new EditorSessionWorkerPool({
    size: 2,
    workerUrl: new URL('./test-fixtures/editor-session-probe-worker.mjs', import.meta.url),
  });
  const idsByLane = [[], []];
  for (let index = 0; idsByLane.some((ids) => ids.length < 2); index += 1) {
    const id = `probe-${index}`;
    idsByLane[documentLane(id, 2)].push(id);
  }
  try {
    await Promise.all(idsByLane.map(([id]) => runtime.call(id, 'probe', { durationMs: 1 })));

    const serialStartedAt = performance.now();
    await Promise.all(idsByLane[0].slice(0, 2).map((id) => runtime.call(id, 'probe', { durationMs: 180 })));
    const serialDuration = performance.now() - serialStartedAt;

    const parallelStartedAt = performance.now();
    await Promise.all(idsByLane.map(([id]) => runtime.call(id, 'probe', { durationMs: 180 })));
    const parallelDuration = performance.now() - parallelStartedAt;

    assert.ok(parallelDuration < serialDuration * 0.8, { serialDuration, parallelDuration });
  } finally {
    await runtime.close();
  }
});

test('a failed worker cannot reject requests handled by its replacement', async () => {
  const runtime = new EditorSessionWorkerPool({
    size: 1,
    workerUrl: new URL('./test-fixtures/editor-session-probe-worker.mjs', import.meta.url),
  });
  try {
    await assert.rejects(runtime.call('worker-restart', 'crash'), /intentional worker crash/);
    const replacementResult = await runtime.call('worker-restart', 'probe', { durationMs: 1 });
    assert.equal(replacementResult.durationMs, 1);
  } finally {
    await runtime.close();
  }
});
