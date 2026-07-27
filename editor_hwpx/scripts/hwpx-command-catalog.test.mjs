import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HWPX_COMMAND_CATEGORIES,
  HWPX_COMMAND_OPS,
  getHwpxCommandCatalog,
  requiredInspectionTargets,
  resolveHwpxCommand,
  stableHwpxTargetKey,
  validateHwpxCommands,
} from './hwpx-command-catalog.mjs';

test('HWPX command catalog exposes unique canonical operations and categories', () => {
  const catalog = getHwpxCommandCatalog();
  assert.equal(catalog.sourceFormat, 'hwpx');
  assert.equal(catalog.commandCount, HWPX_COMMAND_OPS.length);
  assert.equal(new Set(HWPX_COMMAND_OPS).size, HWPX_COMMAND_OPS.length);
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('text'));
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('table'));
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('image'));
});

test('HWPX command catalog resolves compatibility aliases but returns canonical entries', () => {
  assert.equal(resolveHwpxCommand('setCellText').op, 'table.writeCell');
  assert.equal(resolveHwpxCommand({ group: 'table', action: 'writeCell' }).op, 'table.writeCell');
  assert.equal(resolveHwpxCommand('paragraph.applyNumbering').op, 'list.applyNumbering');
  assert.equal(getHwpxCommandCatalog({ op: 'setCellText' }).commands[0].op, 'table.writeCell');
});

test('HWPX command validation rejects malformed batches before execution', () => {
  assert.throws(() => validateHwpxCommands([]), /at least one command/);
  assert.throws(() => validateHwpxCommands([{ op: 'unknown.op' }]), /Unsupported HWPX command/);
  assert.throws(() => validateHwpxCommands([{
    op: 'table.writeCells',
    tableId: 'tbl_0',
    cells: [{ cell: { number: 0 } }],
  }]), /requires a text string/);
  assert.throws(() => validateHwpxCommands([{
    op: 'list.writeBullets',
    location: { paragraph: { section: 0, number: 1 } },
    items: [],
  }]), /items/);
});

test('HWPX stable target keys cover paragraphs and table cells', () => {
  assert.equal(
    stableHwpxTargetKey({ paragraph: { section: 2, number: 7 } }),
    'paragraph:2:7',
  );
  assert.equal(
    stableHwpxTargetKey({ tableId: 'tbl_4', cell: { number: 3 } }),
    'table:tbl_4/cell:3',
  );
  assert.equal(stableHwpxTargetKey({ tableId: 'tbl_4' }), '');
});

test('HWPX inspection requirements include every batch cell and style source', () => {
  const commands = [{
    op: 'table.writeCells',
    tableId: 'tbl_0',
    cells: [
      { cell: { number: 1 }, text: '가' },
      {
        cell: { number: 2 },
        styleSource: { tableId: 'tbl_0', cell: { number: 0 } },
        text: '나',
      },
    ],
  }];
  const entries = validateHwpxCommands(commands);
  assert.deepEqual(
    requiredInspectionTargets(commands, entries).map((target) => target.key),
    ['table:tbl_0/cell:1', 'table:tbl_0/cell:2', 'table:tbl_0/cell:0'],
  );
});
