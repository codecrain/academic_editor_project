import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeHwpxReferenceTransformation } from './hwpx-reference-comparison.mjs';

function doc({ pages, paragraphs, tables, pictures, characters }) {
  return {
    pageCount: pages,
    paragraphCount: paragraphs,
    tableCount: tables,
    blocks: [{ text: 'x'.repeat(characters) }],
    tables: Array.from({ length: tables }, (_, index) => ({ id: `t${index}`, cells: [] })),
    objectCounts: { pictures, images: pictures },
  };
}

test('reference transformation rejects a form-fill candidate far below the completed reference', () => {
  const result = analyzeHwpxReferenceTransformation({
    referenceTemplate: doc({ pages: 10, paragraphs: 100, tables: 20, pictures: 0, characters: 1000 }),
    referenceFinal: doc({ pages: 50, paragraphs: 500, tables: 50, pictures: 60, characters: 10000 }),
    targetTemplate: doc({ pages: 15, paragraphs: 200, tables: 40, pictures: 0, characters: 2000 }),
    candidate: doc({ pages: 20, paragraphs: 210, tables: 32, pictures: 3, characters: 3000 }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.failed.some((check) => check.name === 'paragraphGrowth'));
  assert.ok(result.failed.some((check) => check.name === 'pictureCount'));
});

test('reference transformation accepts an equivalently developed candidate', () => {
  const result = analyzeHwpxReferenceTransformation({
    referenceTemplate: doc({ pages: 10, paragraphs: 100, tables: 20, pictures: 0, characters: 1000 }),
    referenceFinal: doc({ pages: 50, paragraphs: 500, tables: 50, pictures: 60, characters: 10000 }),
    targetTemplate: doc({ pages: 15, paragraphs: 200, tables: 40, pictures: 0, characters: 2000 }),
    candidate: doc({ pages: 45, paragraphs: 600, tables: 60, pictures: 30, characters: 12000 }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failed, []);
});
