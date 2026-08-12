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
    'field.setValues',
    'text.replaceParagraph',
    'text.insertAfterParagraph',
    'text.replace',
    'text.replaceTracked',
    'insertText',
    'deleteRange',
    'appendParagraph',
    'text.deleteParagraphs',
    'table.writeCell',
    'table.writeCells',
    'table.applyCellStyle',
    'table.insertRows',
    'table.setSize',
    'table.setCellSize',
    'table.autoFit',
    'table.create',
    'table.insertCaption',
    'table.structure',
    'style.applyText',
    'applyStyle',
    'setRunStyle',
    'setParagraphStyle',
    'format.apply',
    'paragraph.structure',
    'image.replace',
    'image.insertAfterParagraph',
    'image.replaceInCell',
    'image.cloneToCell',
    'image.generateAndReplace',
    'setDocumentMetadata',
    'defineStyle',
    'setPageSetup',
    'setHeaderFooter',
    'insertFootnote',
    'object.deleteTextBoxByText',
    'object.format',
    'object.replaceTextBoxText',
  ]);
  assert.equal(catalog.commandCount, HWPX_COMMAND_OPS.length);
  assert.equal(new Set(HWPX_COMMAND_OPS).size, HWPX_COMMAND_OPS.length);
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('text'));
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('table'));
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('image'));
  assert.ok(HWPX_COMMAND_CATEGORIES.includes('field'));
});

test('HWPX field updates require bounded unambiguous selectors', () => {
  const byId = {
    op: 'field.setValues',
    values: [{ fieldId: 7, value: '승인' }],
  };
  const byName = {
    op: 'field.setValues',
    values: [{ name: '담당자', occurrence: 1, value: '홍길동' }],
  };
  assert.doesNotThrow(() => validateHwpxCommands([byId]));
  assert.doesNotThrow(() => validateHwpxCommands([byName]));
  assert.throws(
    () => validateHwpxCommands([{ ...byId, values: [{ fieldId: 7, name: '담당자', value: '중복' }] }]),
    /exactly one of fieldId or name/,
  );
  assert.throws(
    () => validateHwpxCommands([{ ...byId, values: [{ name: '담당자', occurrence: -1, value: '오류' }] }]),
    /nonnegative integer/,
  );
  assert.throws(
    () => validateHwpxCommands([{ ...byId, values: [{ fieldId: '7', value: '문자열 ID' }] }]),
    /exactly one of fieldId or name/,
  );
  assert.throws(
    () => validateHwpxCommands([{ ...byId, values: [{ fieldId: 7, value: '값', extra: true }] }]),
    /unsupported field/,
  );
  const entry = getHwpxCommandCatalog({ op: 'field.setValues' }).commands[0];
  assert.equal(entry.precondition, 'editor_hwpx_inspect(view="fields")');
});

test('HWP catalog exposes source-format availability instead of silent package-only no-ops', () => {
  const catalog = getHwpxCommandCatalog({ sourceFormat: 'hwp' });
  assert.equal(catalog.sourceFormat, 'hwp');
  assert.ok(catalog.availableCommandCount < catalog.commandCount);
  assert.equal(catalog.commands.find(entry => entry.op === 'image.replace').readiness, 'unavailable-for-source-format');
  assert.equal(catalog.commands.find(entry => entry.op === 'image.insertAfterParagraph').readiness, 'available');
  assert.equal(catalog.commands.find(entry => entry.op === 'setParagraphStyle').sourceSupport.hwp, true);
});

test('HWPX location-changing commands require explicit stable targets and bounded shapes', () => {
  const deleteCommand = {
    op: 'text.deleteParagraphs',
    locations: [
      { paragraph: { section: 0, number: 3 } },
      { paragraph: { section: 0, number: 4 } },
    ],
  };
  assert.doesNotThrow(() => validateHwpxCommands([deleteCommand]));
  assert.deepEqual(
    requiredInspectionTargets([deleteCommand]).map((item) => item.key),
    ['paragraph:0:3', 'paragraph:0:4'],
  );
  assert.throws(
    () => validateHwpxCommands([{
      op: 'text.deleteParagraphs',
      locations: [{ tableId: 'tbl_0', cell: { number: 0 } }],
    }]),
    /top-level paragraphs/,
  );
  assert.throws(
    () => validateHwpxCommands([{
      op: 'text.deleteParagraphs',
      locations: [
        { paragraph: { section: 0, number: 3 } },
        { paragraph: { section: 0, number: 3 } },
      ],
    }]),
    /must be unique/,
  );

  const insertRows = {
    op: 'table.insertRows',
    target: { tableId: 'tbl_0', cell: { number: 0 } },
    rowIndex: 3,
    count: 2,
    templateRow: 2,
  };
  assert.doesNotThrow(() => validateHwpxCommands([insertRows]));
  assert.doesNotThrow(() => validateHwpxCommands([{ ...insertRows, extendBoundarySpans: true }]));
  assert.deepEqual(
    requiredInspectionTargets([insertRows]).map((item) => item.key),
    ['table:tbl_0/cell:0'],
  );
  assert.throws(
    () => validateHwpxCommands([{ ...insertRows, count: 21 }]),
    /1 through 20/,
  );
  assert.throws(
    () => validateHwpxCommands([{ ...insertRows, extendBoundarySpans: 'yes' }]),
    /extendBoundarySpans must be a boolean/,
  );

  const setSize = {
    op: 'table.setSize',
    target: { tableId: 'tbl_0', cell: { number: 0 } },
    height: 70902,
  };
  assert.doesNotThrow(() => validateHwpxCommands([setSize]));
  assert.throws(() => validateHwpxCommands([{ ...setSize, height: 0 }]), /positive integer/);

  const setCellSize = {
    op: 'table.setCellSize',
    target: { tableId: 'tbl_0', cell: { number: 4 } },
    height: 15932,
  };
  assert.doesNotThrow(() => validateHwpxCommands([setCellSize]));
  assert.deepEqual(
    requiredInspectionTargets([setCellSize]).map((item) => item.key),
    ['table:tbl_0/cell:4'],
  );
  assert.throws(() => validateHwpxCommands([{ ...setCellSize, width: -1 }]), /positive integer/);

  const autoFit = {
    op: 'table.autoFit',
    target: { tableId: 'tbl_0', cell: { number: 4 } },
    extraPadding: 200,
  };
  assert.doesNotThrow(() => validateHwpxCommands([autoFit]));
  assert.deepEqual(
    requiredInspectionTargets([autoFit]).map((item) => item.key),
    ['table:tbl_0/cell:4'],
  );
  assert.throws(() => validateHwpxCommands([{ ...autoFit, minHeight: -1 }]), /nonnegative integer/);

  const clonePicture = {
    op: 'image.cloneToCell',
    target: { tableId: 'tbl_0', cell: { number: 0 } },
    sourcePictureId: 'pic_0',
    targetParagraphIndex: 2,
  };
  assert.doesNotThrow(() => validateHwpxCommands([clonePicture]));
  assert.throws(() => validateHwpxCommands([{ ...clonePicture, sourcePictureId: 'image1' }]), /picture ID/);
});

test('HWPX rich cell commands validate one paragraph-style entry per text paragraph', () => {
  const command = {
    op: 'table.writeCell',
    location: { tableId: 'tbl_0', cell: { number: 2 } },
    text: '첫 문단\n둘째 문단',
    paragraphStyleIds: [
      { paraPrIDRef: 22, styleIDRef: 17 },
      { paraPrIDRef: 45, styleIDRef: 0 },
    ],
    paragraphTemplateIndices: [0, 17],
  };
  assert.doesNotThrow(() => validateHwpxCommands([command]));
  assert.throws(
    () => validateHwpxCommands([{ ...command, paragraphStyleIds: [{ paraPrIDRef: 22 }] }]),
    /exactly one entry/,
  );
  assert.throws(
    () => validateHwpxCommands([{ ...command, paragraphStyleIds: [{ paraPrIDRef: 22 }, {}] }]),
    /nonnegative integer style IDs/,
  );
  assert.throws(
    () => validateHwpxCommands([{ ...command, paragraphTemplateIndices: [0] }]),
    /exactly one entry/,
  );
});

test('HWPX catalog advertises mixed paragraph and structural template options', () => {
  for (const op of ['table.writeCell', 'table.writeCells']) {
    const entry = getHwpxCommandCatalog({ op }).commands[0];
    assert.ok(entry.optional.includes('paragraphStyleIds'));
    assert.ok(entry.optional.includes('paragraphTemplateIndices'));
  }
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
  assert.equal(metadata.execution, 'preserve-package-adapter');
  assert.deepEqual(metadata.nativeMethods, []);
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

test('HWPX command catalog resolves only exact canonical operation names', () => {
  assert.equal(resolveHwpxCommand('table.writeCell').op, 'table.writeCell');
  assert.equal(resolveHwpxCommand({ op: 'table.writeCell' }).op, 'table.writeCell');
  assert.equal(resolveHwpxCommand('table-write-cell'), null);
  assert.equal(resolveHwpxCommand({ group: 'table', action: 'writeCell' }), null);
  assert.equal(getHwpxCommandCatalog({ op: 'table-write-cell' }).commandCount, 0);
});

test('HWPX commands reject stale aliases and undeclared fields before mutation', () => {
  const paragraph = { paragraph: { section: 0, number: 1 } };
  const source = { paragraph: { section: 0, number: 0 } };
  assert.throws(
    () => validateHwpxCommands([{
      op: 'style.applyText',
      target: paragraph,
      source,
    }]),
    /unsupported field\(s\): source/,
  );
  assert.throws(
    () => validateHwpxCommands([{
      op: 'table.applyCellStyle',
      target: { tableId: 'tbl_0', cell: { number: 1 } },
      styleSource: { tableId: 'tbl_0', cell: { number: 0 } },
      cloneStyleFrom: { tableId: 'tbl_0', cell: { number: 2 } },
    }]),
    /unsupported field\(s\): cloneStyleFrom/,
  );
  assert.throws(
    () => validateHwpxCommands([{
      op: 'table.writeCells',
      tableId: 'tbl_0',
      cells: [{ cell: { number: 0 }, text: 'value', content: { text: 'legacy' } }],
    }]),
    /cells\[0\] has unsupported field\(s\): content/,
  );
  const catalogJson = JSON.stringify(getHwpxCommandCatalog());
  assert.equal(catalogJson.includes('Alias of styleSource'), false);
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
  }]), /Unsupported HWPX command/);
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
