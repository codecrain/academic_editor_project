import assert from 'node:assert/strict';
import test from 'node:test';

import { detectImageMimeType, ImageSessionStore } from './image-session-store.mjs';

const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1WQAAAABJRU5ErkJggg==', 'base64');

test('image session store uses an opaque capability token and keeps source/result separate', () => {
  const store = new ImageSessionStore({ maxImageBytes: 1024, ttlMs: 1000 });
  const created = store.create({ bytes: PNG_BYTES, filename: 'diagram' });

  assert.match(created.id, /^img_/);
  assert.equal(created.filename, 'diagram.png');
  assert.equal(created.sourceMimeType, 'image/png');
  assert.equal(store.get(created.id, 'invalid-token'), null);
  assert.equal(store.get(created.id, created.token)?.sourceBytes.equals(PNG_BYTES), true);

  const saved = store.save(created.id, created.token, PNG_BYTES);
  assert.equal(saved.resultMimeType, 'image/png');
  assert.equal(saved.resultBytes.equals(PNG_BYTES), true);

  const project = JSON.stringify({
    info: { width: 1, height: 1 },
    layers: [{ id: 1, type: 'image', name: 'Layer 1' }],
    data: [],
  });
  const layered = store.saveProject(created.id, created.token, project);
  assert.equal(layered.projectMimeType, 'application/vnd.tlooto.image-project+json');
  assert.deepEqual(JSON.parse(layered.projectBytes.toString('utf8')).layers[0].name, 'Layer 1');
});

test('image session store rejects bytes outside the supported local image boundary', () => {
  assert.equal(detectImageMimeType(Buffer.from('not an image')), '');
  const store = new ImageSessionStore({ maxImageBytes: 10 });
  assert.throws(() => store.create({ bytes: Buffer.alloc(11), filename: 'too-large.png' }), /exceeds/);
  assert.throws(() => store.create({ bytes: Buffer.from('nope'), filename: 'bad.png' }), /complete PNG/);
  const projectStore = new ImageSessionStore({ maxProjectBytes: 1000 });
  const created = projectStore.create({ bytes: PNG_BYTES, filename: 'project.png' });
  assert.throws(() => projectStore.saveProject(created.id, created.token, '{}'), /info and layers/);
  assert.throws(
    () => projectStore.saveProject(created.id, created.token, JSON.stringify({ info: {}, layers: [] })),
    /numeric canvas dimensions/,
  );
  const tinyProjectStore = new ImageSessionStore({ maxProjectBytes: 10 });
  const tinyCreated = tinyProjectStore.create({ bytes: PNG_BYTES, filename: 'too-large-project.png' });
  assert.throws(
    () => tinyProjectStore.saveProject(tinyCreated.id, tinyCreated.token, JSON.stringify({
      info: { width: 1, height: 1 },
      layers: [],
    })),
    /exceeds/,
  );
});
