import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { HwpxApiSession, initHwpxRuntime } from './hwpx-api-utils.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = (...parts) => path.join(PROJECT_ROOT, 'samples', ...parts);
const BODY_HWP = sample('re-align-left-hancom.hwp');
const TABLE_HWP = sample('table-001.hwp');
const SIMPLE_TABLE_HWP = sample('table-ipc.hwp');
const BASIC_TABLE_HWPX = sample('hwpx', 'basic-table-01.hwpx');
const IMAGE_HWPX = sample('test-image.hwpx');
const SHAPE_HWP = sample('shape-001.hwp');

async function bodySession() {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(BODY_HWP));
  const paragraph = session.readJson().sections[0].paragraphs.find(item => item.text.length >= 4);
  assert.ok(paragraph);
  return { session, paragraph };
}

async function tableSession() {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(TABLE_HWP));
  const table = session.readJson().tables[0];
  assert.ok(table?.cells?.length);
  return {
    session,
    table,
    tableTarget: { tableId: table.id, native: table.native },
    cellTarget: { tableId: table.id, cell: { number: 0 }, native: table.cells[0].native },
  };
}

async function simpleTableSession() {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(SIMPLE_TABLE_HWP));
  const table = session.readJson().tables[0];
  assert.ok(table?.cells?.length);
  return { session, table, tableTarget: { tableId: table.id, native: table.native } };
}

async function basicHwpxTableSession() {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(BASIC_TABLE_HWPX));
  const table = session.readJson().tables[0];
  assert.ok(table?.cells?.length);
  return {
    session,
    table,
    cellTarget: { tableId: table.id, cell: { number: 0 }, native: table.cells[0].native },
  };
}

function readCellProperties(session, cellTarget) {
  const { section, paragraph, control, cellIndex } = cellTarget.native;
  return JSON.parse(session.doc.getCellProperties(section, paragraph, control, cellIndex));
}

function firstPageControl(session, predicate) {
  for (let page = 0; page < session.doc.pageCount(); page += 1) {
    const layout = JSON.parse(session.doc.getPageControlLayout(page));
    const control = layout.controls?.find(predicate);
    if (control) return control;
  }
  return null;
}

const characterCases = [
  ['bold', { bold: true }],
  ['italic', { italic: true }],
  ['underline', { underline: true }],
  ['strikethrough', { strikethrough: true }],
  ['font size', { fontSizePt: 11.5 }],
  ['text color', { color: '#112233' }],
  ['shade color', { shadeColor: '#eeeeee' }],
  ['kerning', { kerning: true }],
];

for (const [name, properties] of characterCases) {
  test(`red-team actual character format: ${name}`, async () => {
    const { session, paragraph } = await bodySession();
    const length = Math.min(3, [...paragraph.text].length);
    const beforeText = paragraph.text;
    session.commandsBatch([{
      op: 'format.apply', scope: 'character',
      target: { native: { section: 0, para: paragraph.para, offset: 0, length } },
      properties,
    }]);
    const reopened = new HwpxApiSession(session.save().bytes);
    assert.equal(reopened.inspectTarget({ paragraph: { section: 0, number: paragraph.para } }).currentText, beforeText);
    assert.equal(reopened.qualityCheck().ok, true);
  });
}

const paragraphCases = [
  ['center alignment', { alignment: 'center' }],
  ['right alignment', { alignment: 'right' }],
  ['justification', { alignment: 'justify' }],
  ['line spacing', { lineSpacingType: 'Percent', lineSpacing: 180 }],
  ['indent', { indent: 750 }],
  ['left margin', { marginLeft: 1500 }],
  ['before/after spacing', { spacingBefore: 150, spacingAfter: 300 }],
  ['keep flags', { keepWithNext: true, keepLines: true, pageBreakBefore: true }],
];

for (const [name, properties] of paragraphCases) {
  test(`red-team actual paragraph format: ${name}`, async () => {
    const { session, paragraph } = await bodySession();
    session.commandsBatch([{
      op: 'format.apply', scope: 'paragraph',
      target: { paragraph: { section: 0, number: paragraph.para } }, properties,
    }]);
    const reopened = new HwpxApiSession(session.save().bytes);
    assert.equal(reopened.qualityCheck().ok, true);
  });
}

const cellCases = [
  ['left/right padding', { paddingLeft: 210, paddingRight: 220 }],
  ['top/bottom padding', { paddingTop: 230, paddingBottom: 240 }],
  ['vertical center', { verticalAlign: 'center' }],
  ['vertical bottom', { verticalAlign: 'bottom' }],
  ['header flag', { isHeader: true }],
  ['cell protection', { cellProtect: true }],
];

for (const [name, properties] of cellCases) {
  test(`red-team actual cell format: ${name}`, async () => {
    const { session, cellTarget } = await tableSession();
    session.commandsBatch([{ op: 'format.apply', scope: 'cell', target: cellTarget, properties }]);
    const reopened = new HwpxApiSession(session.save().bytes);
    assert.equal(reopened.qualityCheck().ok, true);
  });
}

test('red-team actual cell advanced properties and sparse fill preserve the inspected border/fill state', async () => {
  const { session, cellTarget } = await basicHwpxTableSession();
  const before = readCellProperties(session, cellTarget);
  session.commandsBatch([{
    op: 'format.apply', scope: 'cell', target: cellTarget,
    properties: { applyInnerMargin: true, fieldName: 'audit-field', editableInForm: true },
  }]);
  let reopened = new HwpxApiSession(session.save().bytes);
  let properties = readCellProperties(reopened, cellTarget);
  assert.equal(properties.applyInnerMargin, true);
  assert.equal(properties.fieldName, 'audit-field');
  assert.equal(properties.editableInForm, true);

  reopened.commandsBatch([{
    op: 'format.apply', scope: 'cell', target: cellTarget,
    properties: { fillColor: '#fff2cc' },
  }]);
  reopened = new HwpxApiSession(reopened.save().bytes);
  properties = readCellProperties(reopened, cellTarget);
  assert.equal(properties.fillType, 'solid');
  assert.equal(properties.fillColor, '#fff2cc');
  assert.deepEqual(properties.borderLeft, before.borderLeft);
  assert.deepEqual(properties.borderRight, before.borderRight);
  assert.deepEqual(properties.borderTop, before.borderTop);
  assert.deepEqual(properties.borderBottom, before.borderBottom);
  assert.equal(reopened.qualityCheck().ok, true);
});

test('red-team actual cell diagonal format round-trips exactly', async () => {
  const { session, cellTarget } = await basicHwpxTableSession();
  session.commandsBatch([{
    op: 'format.apply', scope: 'cell', target: cellTarget,
    properties: {
      diagonalLine: 1, diagonalSlash: 2, diagonalBackSlash: 0,
      diagonalWidth: 3, diagonalColor: '#123456', centerLine: 'NONE',
    },
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const properties = readCellProperties(reopened, cellTarget);
  assert.equal(properties.diagonalLine, 1);
  assert.equal(properties.diagonalSlash, 2);
  assert.equal(properties.diagonalBackSlash, 0);
  assert.equal(properties.diagonalWidth, 3);
  assert.equal(properties.diagonalColor, '#123456');
  assert.equal(properties.centerLine, 'NONE');
  assert.equal(reopened.qualityCheck().ok, true);
});

const tableCases = [
  ['cell spacing', { cellSpacing: 120 }],
  ['inner padding', { paddingLeft: 140, paddingRight: 160 }],
  ['repeat header', { repeatHeader: true }],
  ['row page break', { pageBreak: 'RowBreak' }],
  ['floating wrap', { treatAsChar: false, textWrap: 'TopAndBottom' }],
];

for (const [name, properties] of tableCases) {
  test(`red-team actual table format: ${name}`, async () => {
    const { session, tableTarget } = await tableSession();
    session.commandsBatch([{ op: 'format.apply', scope: 'table', target: tableTarget, properties }]);
    const reopened = new HwpxApiSession(session.save().bytes);
    assert.equal(reopened.qualityCheck().ok, true);
  });
}

const imageCases = [
  ['size', { width: 15000, height: 12000 }],
  ['inline mode', { treatAsChar: true }],
  ['padding', { paddingLeft: 100, paddingRight: 120, paddingBottom: 140 }],
];

for (const [name, properties] of imageCases) {
  test(`red-team actual image format: ${name}`, async () => {
    await initHwpxRuntime();
    const session = new HwpxApiSession(readFileSync(IMAGE_HWPX));
    const control = firstPageControl(session, item => item.type === 'image');
    assert.ok(control);
    session.commandsBatch([{
      op: 'object.format', scope: 'image',
      target: { native: { section: control.secIdx, para: control.paraIdx, control: control.controlIdx } },
      properties,
    }]);
    const reopened = new HwpxApiSession(session.save().bytes);
    assert.equal(reopened.objectInventory().pictures.length, session.objectInventory().pictures.length);
  });
}

const shapeCases = [
  ['rotation', { rotationAngle: 900 }],
  ['border', { borderColor: 0x00112233, borderWidth: 100 }],
  ['solid fill', { fillType: 'solid', fillBgColor: 0x00ddeeff, fillAlpha: 200 }],
];

for (const [name, properties] of shapeCases) {
  test(`red-team actual shape format: ${name}`, async () => {
    await initHwpxRuntime();
    const session = new HwpxApiSession(readFileSync(SHAPE_HWP));
    const control = firstPageControl(session, item => item.type !== 'image' && Number.isInteger(item.controlIdx));
    assert.ok(control);
    session.commandsBatch([{
      op: 'object.format', scope: 'shape',
      target: { native: { section: control.secIdx, para: control.paraIdx, control: control.controlIdx } },
      properties,
    }]);
    const reopened = new HwpxApiSession(session.save().bytes);
    assert.equal(reopened.qualityCheck().ok, true);
  });
}

test('red-team actual table structure: insert/delete row and column', async () => {
  const { session, table, tableTarget } = await tableSession();
  const before = JSON.parse(session.doc.getTableDimensions(table.native.section, table.native.paragraph, table.native.control));
  session.commandsBatch([{ op: 'table.structure', target: tableTarget, action: 'insertRow', row: 0, side: 'after' }]);
  session.commandsBatch([{ op: 'table.structure', target: tableTarget, action: 'deleteRow', row: 1 }]);
  session.commandsBatch([{ op: 'table.structure', target: tableTarget, action: 'insertColumn', column: 0, side: 'after' }]);
  session.commandsBatch([{ op: 'table.structure', target: tableTarget, action: 'deleteColumn', column: 1 }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const after = JSON.parse(reopened.doc.getTableDimensions(table.native.section, table.native.paragraph, table.native.control));
  assert.equal(after.rowCount, before.rowCount);
  assert.equal(after.colCount, before.colCount);
});

test('red-team actual table structure: merge then split cells', async () => {
  const { session, table, tableTarget } = await simpleTableSession();
  const dimensions = JSON.parse(session.doc.getTableDimensions(table.native.section, table.native.paragraph, table.native.control));
  assert.ok(dimensions.colCount >= 2);
  session.commandsBatch([{
    op: 'table.structure', target: tableTarget, action: 'mergeCells',
    startRow: 0, startColumn: 0, endRow: 0, endColumn: 1,
  }]);
  session.commandsBatch([{
    op: 'table.structure', target: tableTarget, action: 'splitCell',
    row: 0, column: 0, rows: 1, columns: 2,
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(reopened.qualityCheck().ok, true);
});

test('red-team atomic rejection leaves bytes and revision unchanged', async () => {
  const { session, paragraph } = await bodySession();
  const before = session.save().bytes;
  const revision = session.revision;
  assert.throws(() => session.commandsBatch([{
    op: 'format.apply', scope: 'paragraph',
    target: { paragraph: { section: 0, number: paragraph.para } },
    properties: { alignment: 'center', undocumentedHeuristic: true },
  }]), error => error?.code === 'HWPX_FORMAT_PROPERTY_UNSUPPORTED');
  assert.equal(session.revision, revision);
  assert.equal(Buffer.compare(session.save().bytes, before), 0);
});
