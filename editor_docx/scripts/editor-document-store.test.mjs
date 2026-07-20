import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDocxBytes, getDocumentXml } from './docx-api-utils.mjs';
import { EditorDocumentStore } from './editor-document-store.mjs';

async function createStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'academic-editor-store-'));
  const store = new EditorDocumentStore({
    root,
    tokenSecret: 'test-token-secret-with-at-least-32-characters',
    tokenTtlMs: 60_000,
    maxDocuments: 10,
  });
  await store.init();
  return { root, store };
}

test('document store creates isolated persistent DOCX files', async () => {
  const { root, store } = await createStore();
  try {
    const first = await store.createBlank({ title: 'First', initialText: 'alpha' });
    const second = await store.createBlank({ title: 'Second', initialText: 'beta' });
    assert.notEqual(first.documentId, second.documentId);
    assert.match(getDocumentXml(await store.read(first.documentId)), /alpha/);
    assert.match(getDocumentXml(await store.read(second.documentId)), /beta/);
    assert.doesNotMatch(getDocumentXml(await store.read(first.documentId)), /beta/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('editor token is signed, expires, and is bound to one document', async () => {
  const { root, store } = await createStore();
  try {
    const first = await store.createBlank({ title: 'First' });
    const second = await store.createBlank({ title: 'Second' });
    const issued = store.issueToken(first.documentId);
    assert.equal(store.verifyToken(issued.token, first.documentId).canWrite, true);
    assert.throws(() => store.verifyToken(issued.token, second.documentId), /Invalid or expired/);
    assert.throws(() => store.verifyToken(`${issued.token}x`, first.documentId), /Invalid editor token/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('save replaces only the selected document and delete removes it', async () => {
  const { root, store } = await createStore();
  try {
    const first = await store.createBlank({ title: 'First', initialText: 'before' });
    const second = await store.createBlank({ title: 'Second', initialText: 'untouched' });
    const updated = await store.write(first.documentId, createDocxBytes({ paragraphs: ['after'] }));
    assert.notEqual(updated.version, first.version);
    assert.match(getDocumentXml(await store.read(first.documentId)), /after/);
    assert.match(getDocumentXml(await store.read(second.documentId)), /untouched/);
    await store.delete(first.documentId);
    await assert.rejects(() => store.get(first.documentId), /Document not found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid DOCX bytes are rejected before persistence', async () => {
  const { root, store } = await createStore();
  try {
    await assert.rejects(
      () => store.createFromBytes({ title: 'Invalid', filename: 'invalid.docx', bytes: Buffer.from('not-docx') }),
      /zip end of central directory|Invalid DOCX/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
