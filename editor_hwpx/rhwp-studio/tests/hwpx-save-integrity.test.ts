import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertControlCountsPreserved,
  assertHwpxSaveIntegrity,
  hwpxControlCounts,
} from '../src/core/hwpx-save-integrity.ts';

test('HWPX save integrity reads a real public-sector package and accepts byte-identical output', async () => {
  const fixturePath = fileURLToPath(new URL(
    '../../../evaluation/hwpx-public-sector-v1/attachments/source/moe-2025-briefing.hwpx',
    import.meta.url,
  ));
  const bytes = new Uint8Array(await readFile(fixturePath));
  const counts = await hwpxControlCounts(bytes);
  assert.equal(counts.picture, 9);
  assert.equal(counts.table, 14);
  await assert.doesNotReject(assertHwpxSaveIntegrity(bytes, bytes));
});

test('HWPX save integrity rejects any lost critical document control', () => {
  assert.throws(
    () => assertControlCountsPreserved(
      { picture: 9, table: 14, container: 1, shapeComment: 5 },
      { picture: 1, table: 14, container: 0, shapeComment: 0 },
    ),
    /picture 9→1.*container 1→0.*shapeComment 5→0/,
  );
});
