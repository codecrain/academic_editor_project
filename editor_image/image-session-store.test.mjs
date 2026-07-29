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
});

test('image session store rejects bytes outside the supported local image boundary', () => {
  assert.equal(detectImageMimeType(Buffer.from('not an image')), '');
  const store = new ImageSessionStore({ maxImageBytes: 10 });
  assert.throws(() => store.create({ bytes: Buffer.alloc(11), filename: 'too-large.png' }), /exceeds/);
  assert.throws(() => store.create({ bytes: Buffer.from('nope'), filename: 'bad.png' }), /complete PNG/);
});
