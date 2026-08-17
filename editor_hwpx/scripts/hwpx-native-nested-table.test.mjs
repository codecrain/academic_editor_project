import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { HwpxApiSession, initHwpxRuntime } from './hwpx-api-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '..', 'samples', 'inner-table-01.hwp');

test('binary HWP nested tables are addressable and survive a save/reopen edit', async () => {
  await initHwpxRuntime();
  const source = readFileSync(fixture);
  const session = new HwpxApiSession(source);
  const nested = session.readJson().tables.find((table) => table.nested && table.cells.length > 0);
  assert.ok(nested, 'the fixture must expose at least one nested table target');

  const targetCell = nested.cells.find((cell) => cell.text === '') ?? nested.cells[0];
  const original = targetCell.text;
  const replacement = '중첩 표 검증 값';
  const result = session.commandsBatch([{
    op: 'table.writeCell',
    location: { tableId: nested.id, cell: { number: targetCell.cellIndex } },
    text: replacement,
  }]);
  assert.ok(result.results.every((item) => item.ok), 'nested table write must succeed');

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes);
  const reopenedCell = reopened.readJson().tables
    .find((table) => table.id === nested.id)
    ?.cells.find((cell) => cell.cellIndex === targetCell.cellIndex);
  assert.equal(reopenedCell?.text, replacement);
  assert.notEqual(reopenedCell?.text, original || undefined);
});
