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
  assert.deepEqual(HWPX_COMMAND_OPS, [
    'text.replaceParagraph',
    'text.insertAfterParagraph',
    'text.replace',
    'text.replaceTracked',
    'insertText',
    'deleteRange',
    'appendParagraph',
    'table.writeCell',
    'table.writeRichCell',
    'table.writeCells',
    'table.applyCellStyle',
    'table.create',
    'table.insertCaption',
    'style.applyText',
    'paragraph.applyStyle',
    'style.clone',
    'applyStyle',
    'setRunStyle',
    'setParagraphStyle',
    'list.writeBullets',
    'list.applyNumbering',
    'layout.fitText',
    'image.replace',
    'image.insertAfterParagraph',
    'image.generateAndReplace',
    'setDocumentMetadata',
    'defineStyle',
    'setPageSetup',
    'setHeaderFooter',
    'insertFootnote',
    'object.deleteTextBoxByText',
    'object.replaceTextBoxText',
  ]);
  assert.equal(catalog.commandCount, HWPX_COMMAND_OPS.length);
  assert.equal(new Set(HWPX_COMMAND_OPS).size, HWPX_COMMAND_OPS.length);
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('text'));
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('table'));
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('image'));
});

test('HWPX command catalog publishes every operation as executable', () => {
  const promoted = [
    'text.replaceTracked',
    'insertText',
    'deleteRange',
    'appendParagraph',
    'table.create',
    'table.insertCaption',
    'applyStyle',
    'setRunStyle',
    'setParagraphStyle',
    'image.insertAfterParagraph',
    'setDocumentMetadata',
    'defineStyle',
    'setPageSetup',
    'setHeaderFooter',
    'insertFootnote',
  ];

  for (const op of promoted) {
    assert.ok(HWPX_COMMAND_OPS.includes(op), `${op} must be public`);
    assert.equal(getHwpxCommandCatalog({ op }).commandCount, 1);
  }
  const tracked = getHwpxCommandCatalog({ op: 'text.replaceTracked' }).commands[0];
  assert.equal(tracked.readiness, 'available');
  assert.equal(tracked.execution, 'tracked-package-transform');
  for (const op of promoted.filter(value => value !== 'text.replaceTracked')) {
    const entry = getHwpxCommandCatalog({ op }).commands[0];
    assert.equal(entry.readiness, 'available', op);
    assert.equal(entry.capability, 'available', op);
    assert.ok(
      ['structural-adapter', 'preserve-package-adapter'].includes(entry.execution),
      op,
    );
    if (entry.execution === 'structural-adapter') {
      assert.ok(entry.nativeMethods.length > 0, op);
    }
  }
  const metadata = getHwpxCommandCatalog({ op: 'setDocumentMetadata' }).commands[0];
  assert.equal(metadata.readiness, 'available');
  assert.equal(metadata.capability, 'available');
  assert.equal(metadata.execution, 'structural-adapter');
  assert.deepEqual(metadata.nativeMethods, [
    'setDocumentMetadata',
    'getDocumentMetadata',
  ]);
  assert.doesNotThrow(() => validateHwpxCommands([{
    op: 'setDocumentMetadata',
    title: '공공기관 업무보고',
  }]));
  for (const op of [
    'table.insertCaption',
    'setRunStyle',
    'setHeaderFooter',
    'insertFootnote',
  ]) {
    const entry = getHwpxCommandCatalog({ op }).commands[0];
    assert.equal(entry.readiness, 'available', op);
    assert.equal(entry.capability, 'available', op);
    assert.equal(entry.execution, 'structural-adapter', op);
    assert.ok(entry.notes.length > 0, op);
  }
});

test('HWPX promoted contracts expose optional fields and enforced enums', () => {
  const createTable = getHwpxCommandCatalog({ op: 'table.create' }).commands[0];
  assert.deepEqual(createTable.optional, ['width', 'height', 'cellTexts', 'caption']);
  assert.doesNotThrow(() => validateHwpxCommands([{
    op: 'table.create',
    target: { paragraph: { section: 0, number: 0 } },
    rows: 1,
    columns: 1,
    caption: '표 1. 생성 시 캡션',
  }]));

  const pageSetup = getHwpxCommandCatalog({ op: 'setPageSetup' }).commands[0];
  assert.deepEqual(pageSetup.enum.orientation, ['portrait', 'landscape']);

  const headerFooter = getHwpxCommandCatalog({ op: 'setHeaderFooter' }).commands[0];
  assert.ok(headerFooter.required.includes('target'));
  assert.ok(!headerFooter.required.includes('sectionIndex'));
  assert.deepEqual(headerFooter.enum.type, ['header', 'footer']);
  assert.deepEqual(headerFooter.enum.applyTo, ['both', 'odd', 'even']);

  assert.doesNotThrow(() => validateHwpxCommands([{
    op: 'setPageSetup',
    sectionIndex: 0,
    width: 59528,
    height: 84189,
    orientation: 'landscape',
  }]));
  assert.throws(() => validateHwpxCommands([{
    op: 'setPageSetup',
    sectionIndex: 0,
    width: 59528,
    height: 84189,
    orientation: 'diagonal',
  }]), /orientation must be one of: portrait, landscape/);
  assert.deepEqual(headerFooter.enum.align, ['left', 'center', 'right']);
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
  assert.equal(
    stableHwpxTargetKey({ sectionIndex: 2, paragraphIndex: 7 }),
    'paragraph:2:7',
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

test('HWPX promoted target operations require stable inspection targets', () => {
  const commands = [
    {
      op: 'text.replaceTracked',
      target: { paragraph: { section: 0, number: 1 } },
      text: '수정',
      author: '검토자',
    },
    {
      op: 'table.create',
      target: { paragraph: { section: 0, number: 2 } },
      rows: 2,
      columns: 3,
    },
  ];
  const entries = validateHwpxCommands(commands);
  assert.deepEqual(
    requiredInspectionTargets(commands, entries).map((target) => target.key),
    ['paragraph:0:1', 'paragraph:0:2'],
  );
});

test('appendParagraph inspection includes its optional paragraph or cell style source', () => {
  const command = {
    op: 'appendParagraph',
    target: { paragraph: { section: 0, number: 2 } },
    styleSource: { tableId: 'tbl_0', cell: { number: 1 } },
    text: '복제 서식 문단',
  };
  const entries = validateHwpxCommands([command]);
  assert.deepEqual(
    requiredInspectionTargets([command], entries).map(target => [target.role, target.key]),
    [
      ['target', 'paragraph:0:2'],
      ['styleSource', 'table:tbl_0/cell:1'],
    ],
  );
});
