import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DocxApiSession,
  applyDocxCommand,
  createDocxBytes,
  generatePngBytes,
  getDocumentXml,
  getZipText,
  readZip,
  resolveDocxTextTarget,
} from './docx-api-utils.mjs';

function createStyledDocx() {
  return createDocxBytes({
    paragraphs: [
      { text: 'Template Title', paragraphStyle: { align: 'center', spacingAfter: 240 }, runStyle: { bold: true, fontSize: 16, textColor: '#1F4E79' } },
      { text: 'Plain target paragraph', paragraphStyle: { align: 'left' }, runStyle: { fontSize: 10 } },
    ],
    tables: [{
      rows: [
        [
          { text: 'Header style', cellStyle: { fill: '#D9EAF7', width: 3200, verticalAlign: 'center' }, paragraphStyle: { align: 'center' }, runStyle: { bold: true, textColor: '#1F4E79', fontSize: 10 } },
          { text: 'Value style', cellStyle: { fill: '#E2F0D9', width: 3200 }, paragraphStyle: { align: 'center' }, runStyle: { italic: true, textColor: '#375623', fontSize: 10 } },
        ],
        ['Target A', 'Target B'],
      ],
    }],
    includeImage: true,
  });
}

test('DOCX API preserve save returns original bytes when no commands run', () => {
  const input = readFileSync('editor_docx/test/data/template.docx');
  const session = new DocxApiSession(input);
  const saved = session.save();
  assert.equal(Buffer.compare(input, saved.bytes), 0);
  assert.equal(saved.validation.sourceFormat, 'docx');
});

test('DOCX API read/target/object APIs expose editable guidance', () => {
  const session = new DocxApiSession(createStyledDocx());
  const json = session.readJson();
  const table = json.tables[0];
  assert.ok(json.editableTargets.paragraphs.length >= 2);
  assert.equal(table.dims.cellCount, 4);
  assert.ok(session.targetMap().cells.length >= 4);
  assert.equal(session.inspectTarget({ tableId: table.id, cell: { number: 0 } }).kind, 'cell');
  assert.equal(session.objectInventory().images[0].name, 'word/media/image1.png');
  assert.equal(session.objectInventory().pictures[0].relationshipId, 'rIdImage1');
  assert.ok(session.qualityCheck().ok);
});

test('DOCX API table.writeRichCell clones source paragraph and run style through save/reopen', () => {
  const session = new DocxApiSession(createStyledDocx());
  const table = session.readJson().tables[0];
  const sourceStyle = session.styleFingerprint({ tableId: table.id, cell: { number: 0 } }).basis;

  session.apply([{
    commandId: 'rich-cell',
    op: 'table.writeRichCell',
    location: { tableId: table.id, cell: { number: 3 } },
    styleSource: { tableId: table.id, cell: { number: 0 } },
    text: 'API styled value',
  }]);

  const reopened = new DocxApiSession(session.save().bytes);
  const reopenedTable = reopened.readJson().tables[0];
  const targetCell = reopenedTable.cells.find((cell) => cell.cellIndex === 3);
  const targetStyle = reopened.styleFingerprint({ tableId: table.id, cell: { number: 3 } }).basis;
  assert.equal(targetCell.text, 'API styled value');
  assert.equal(targetStyle.text.bold, sourceStyle.text.bold);
  assert.equal(targetStyle.text.textColor, sourceStyle.text.textColor);
  assert.equal(targetStyle.paragraph.align, sourceStyle.paragraph.align);
});

test('DOCX API style.applyText can rewrite a cell while preserving chosen source style', () => {
  const session = new DocxApiSession(createStyledDocx());
  const table = session.readJson().tables[0];

  session.apply([{
    commandId: 'apply-text-style',
    op: 'style.applyText',
    location: { tableId: table.id, cell: { number: 2 } },
    styleSource: { tableId: table.id, cell: { number: 1 } },
    text: 'Styled KPI: 92%',
  }]);

  const reopened = new DocxApiSession(session.save().bytes);
  const target = reopened.inspectTarget({ tableId: table.id, cell: { number: 2 } });
  const style = reopened.styleFingerprint({ tableId: table.id, cell: { number: 2 } }).basis;
  assert.equal(target.currentText, 'Styled KPI: 92%');
  assert.equal(style.text.italic, true);
  assert.equal(style.text.textColor, '375623');
});

test('DOCX API table.applyCellStyle clones outer cell style through save/reopen', () => {
  const session = new DocxApiSession(createStyledDocx());
  const table = session.readJson().tables[0];
  const sourceFill = session.styleFingerprint({ tableId: table.id, cell: { number: 0 } }).basis.cell.fill;

  session.apply([{
    commandId: 'cell-style',
    op: 'table.applyCellStyle',
    location: { tableId: table.id, cell: { number: 3 } },
    styleSource: { tableId: table.id, cell: { number: 0 } },
  }]);

  const reopened = new DocxApiSession(session.save().bytes);
  const targetFill = reopened.styleFingerprint({ tableId: table.id, cell: { number: 3 } }).basis.cell.fill;
  assert.equal(targetFill, sourceFill);
});

test('DOCX API list.applyNumbering writes stable numbered text with preserved paragraph style', () => {
  const session = new DocxApiSession(createStyledDocx());
  const table = session.readJson().tables[0];
  const source = session.styleFingerprint({ tableId: table.id, cell: { number: 0 } }).basis.text;

  session.apply([{
    commandId: 'numbered-cell',
    op: 'list.applyNumbering',
    location: { tableId: table.id, cell: { number: 2 } },
    styleSource: { tableId: table.id, cell: { number: 0 } },
    startAt: 3,
    suffix: ')',
    items: ['scope locked', 'style preserved', 'save verified'],
  }]);

  const reopened = new DocxApiSession(session.save().bytes);
  const target = reopened.inspectTarget({ tableId: table.id, cell: { number: 2 } });
  const style = reopened.styleFingerprint({ tableId: table.id, cell: { number: 2 } }).basis.text;
  assert.equal(target.currentText, '3) scope locked\n4) style preserved\n5) save verified');
  assert.equal(style.bold, source.bold);
});

test('DOCX API paragraph.applyStyle clones top-level paragraph style without changing text', () => {
  const session = new DocxApiSession(createStyledDocx());
  const beforeText = session.inspectTarget({ paragraph: { number: 1 } }).currentText;
  const sourceStyle = session.styleFingerprint({ paragraph: { number: 0 } }).basis;

  session.apply([{
    commandId: 'paragraph-style',
    op: 'paragraph.applyStyle',
    location: { paragraph: { number: 1 } },
    styleSource: { paragraph: { number: 0 } },
  }]);

  const reopened = new DocxApiSession(session.save().bytes);
  const target = reopened.inspectTarget({ paragraph: { number: 1 } });
  const targetStyle = reopened.styleFingerprint({ paragraph: { number: 1 } }).basis;
  assert.equal(target.currentText, beforeText);
  assert.equal(targetStyle.text.bold, sourceStyle.text.bold);
  assert.equal(targetStyle.paragraph.align, sourceStyle.paragraph.align);
});

test('DOCX API image.generateAndReplace updates embedded media package bytes', () => {
  const input = createStyledDocx();
  const session = new DocxApiSession(input);
  const image = session.objectInventory().images[0];
  const beforeLength = readZip(input).get(image.name).length;

  session.apply([{
    commandId: 'chart-image',
    op: 'image.generateAndReplace',
    imageName: image.name,
    generator: { width: 360, height: 160, accent: '#C00000', values: [2, 8, 5, 9] },
  }]);

  const saved = session.save().bytes;
  const afterLength = readZip(saved).get(image.name).length;
  assert.notEqual(afterLength, beforeLength);
  assert.ok(new DocxApiSession(saved).objectInventory().images.some((item) => item.name === image.name));
});

test('DOCX API keeps legacy command wrappers compatible', () => {
  let bytes = createDocxBytes({ tables: [{ rows: [['', ''], ['', '']] }] });
  const target = resolveDocxTextTarget(bytes, 'Alpha');
  bytes = applyDocxCommand(bytes, { op: 'insertText', target, text: 'API-' });
  bytes = applyDocxCommand(bytes, { op: 'createTable', rows: 1, cols: 2 });
  bytes = applyDocxCommand(bytes, { op: 'setCellText', target: { tableCell: { row: 0, col: 1 } }, text: 'Cell API' });

  const xml = getDocumentXml(bytes);
  assert.match(xml, /API-Alpha/);
  assert.match(xml, /Cell API/);
});

test('DOCX API can define styles, metadata, page setup, header, and footnote in one batch', () => {
  const session = new DocxApiSession(createDocxBytes());
  const target = session.resolveText('Alpha');
  session.apply([
    { commandId: 'meta', op: 'setDocumentMetadata', title: 'API manuscript', subject: 'docx contract' },
    { commandId: 'page', op: 'setPageSetup', width: 11906, height: 16838, margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    { commandId: 'style', op: 'defineStyle', style: { styleId: 'BodyAPI', name: 'Body API', runStyle: { fontSize: 10 } } },
    { commandId: 'header', op: 'setHeaderFooter', text: 'API manuscript header' },
    { commandId: 'note', op: 'insertFootnote', target, text: 'Footnote through DOCX API only.' },
  ]);
  const saved = session.save().bytes;
  assert.match(getDocumentXml(saved), /w:pgSz w:w="11906" w:h="16838"/);
  assert.match(getZipText(saved, 'docProps/core.xml'), /API manuscript/);
  assert.match(getZipText(saved, 'word/header1.xml'), /API manuscript header/);
  assert.match(getZipText(saved, 'word/footnotes.xml'), /DOCX API only/);
});

test('DOCX API image.replace accepts caller-provided bytes', () => {
  const input = createStyledDocx();
  const session = new DocxApiSession(input);
  const image = session.objectInventory().images[0];
  const replacement = generatePngBytes({ width: 180, height: 90, values: [1, 4, 2] });
  session.apply([{ commandId: 'replace-image', op: 'image.replace', imageName: image.name, bytes: replacement }]);
  const saved = session.save().bytes;
  assert.equal(readZip(saved).get(image.name).length, replacement.length);
});
