import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as hwpxApiUtils from './hwpx-api-utils.mjs';

const {
  HwpxApiSession,
  initHwpxRuntime,
  readZip,
} = hwpxApiUtils;

const ESG_FIXTURE_PATH = 'editor_hwpx/samples/api-fixtures/esg-original.hwpx';
const PUBLIC_BRIEFING_FIXTURE_PATH = 'evaluation/hwpx-public-sector-v1/attachments/source/moe-2025-briefing.hwpx';

test('HWPX API preserve save returns original bytes when no commands run', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const saved = session.save();
  assert.equal(Buffer.compare(input, saved.bytes), 0);
  assert.equal(saved.validation.pageCount, 2);
});

test('HWPX API reports encrypted public-sector packages with an actionable error code', async () => {
  await initHwpxRuntime();
  const input = readFileSync('evaluation/hwpx-public-sector-v1/attachments/source/moe-2025-work-plan.hwpx');
  assert.throws(
    () => new HwpxApiSession(input),
    (error) => error?.code === 'unsupported_encrypted_hwpx'
      && /배포용 또는 암호화된 HWPX/.test(error.message),
  );
});

test('HWPX API keeps legacy setCellText compatibility for existing callers', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);

  session.commandsBatch([
    {
      opId: 'receipt',
      op: 'setCellText',
      target: { tableId: table.id, tableCell: { cellIndex: 1 } },
      text: 'ESG-TEST-001',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const reopenedTable = reopened.tables.find((item) => item.id === table.id);
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 1).text, 'ESG-TEST-001');
  assert.equal(saved.validation.pageCount, 2);
});

test('HWPX API read/target/layout APIs expose editable cell guidance', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const json = session.readJson();
  const table = json.tables.find((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);

  assert.ok(json.styleGraph);
  assert.ok(json.layoutGraph.tables.length >= 1);
  assert.ok(json.editableTargets.cells.length >= table.cells.length);
  assert.ok(session.targetMap().cells.length >= table.cells.length);
  assert.ok(session.objectInventory().sections.length >= 1);

  const target = session.inspectTarget({ tableId: table.id, cell: { number: 1 } });
  assert.equal(target.kind, 'cell');
  assert.equal(target.location.cell.number, 1);
  assert.ok(target.style.cell);
  assert.ok(target.layout.capacity);
  const searchableCell = table.cells.find((cell) => cell.text.trim().length > 0);
  const resolvedCell = session.resolveText(searchableCell.text.trim().slice(0, 5));
  assert.equal(resolvedCell.kind, 'cell');
  assert.equal(resolvedCell.location.tableId, table.id);

  const fit = session.fitText(
    { tableId: table.id, cell: { number: 1 } },
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ '.repeat(20),
    { maxLines: 1 },
  );
  assert.equal(typeof fit.text, 'string');
  assert.ok(fit.text.length > 0);

  const wrapOnly = session.fitText(
    { tableId: table.id, cell: { number: 1 } },
    'ABCDEFGHIJ KLMNOPQRST UVWXYZ',
    { maxCharsPerLine: 8, maxLines: 1, truncate: false },
  );
  assert.equal(wrapOnly.truncated, false);
  assert.ok(wrapOnly.lineCount > 1);
});

test('HWPX API table.writeRichCell can clone source cell text style through save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);
  const sourceStyle = session.styleFingerprint({ tableId: table.id, cell: { number: 1 } }).basis.text;

  session.apply([
    {
      commandId: 'rich-cell',
      op: 'table.writeRichCell',
      location: { tableId: table.id, cell: { number: 3 } },
      styleSource: { tableId: table.id, cell: { number: 1 } },
      text: 'RICH-STYLE',
    },
  ]);

  const saved = session.save();
  const reopenedSession = new HwpxApiSession(saved.bytes);
  const reopened = reopenedSession.readJson();
  const reopenedTable = reopened.tables.find((item) => item.id === table.id);
  const targetStyle = reopenedSession.styleFingerprint({ tableId: table.id, cell: { number: 3 } }).basis.text;
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 3).text, 'RICH-STYLE');
  assert.equal(targetStyle.fontFamily, sourceStyle.fontFamily);
  assert.equal(targetStyle.fontSize, sourceStyle.fontSize);
  assert.equal(targetStyle.italic, sourceStyle.italic);
  assert.equal(targetStyle.textColor, sourceStyle.textColor);
});

test('HWPX API style.applyText can rewrite a cell with explicit source style ids', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);
  const sourceIds = session.paragraphStyleIds({ tableId: table.id, cell: { number: 0 } });

  session.apply([
    {
      commandId: 'apply-title-style',
      op: 'style.applyText',
      location: { tableId: table.id, cell: { number: 3 } },
      styleSource: { tableId: table.id, cell: { number: 0 } },
      text: 'STYLE-APPLIED',
    },
  ]);

  const saved = session.save();
  const reopenedSession = new HwpxApiSession(saved.bytes);
  const reopenedTable = reopenedSession.readJson().tables.find((item) => item.id === table.id);
  const targetIds = reopenedSession.paragraphStyleIds({ tableId: table.id, cell: { number: 3 } });
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 3).text, 'STYLE-APPLIED');
  assert.equal(targetIds.paraPrIDRef, sourceIds.paraPrIDRef);
  assert.equal(targetIds.charPrIDRef, sourceIds.charPrIDRef);
});

test('HWPX API table.applyCellStyle can clone outer cell style through save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);
  const sourceStyle = session.cellOuterStyle({ tableId: table.id, cell: { number: 0 } });

  session.apply([
    {
      commandId: 'clone-cell-outer-style',
      op: 'table.applyCellStyle',
      location: { tableId: table.id, cell: { number: 3 } },
      styleSource: { tableId: table.id, cell: { number: 0 } },
    },
  ]);

  const saved = session.save();
  const reopenedSession = new HwpxApiSession(saved.bytes);
  const targetStyle = reopenedSession.cellOuterStyle({ tableId: table.id, cell: { number: 3 } });
  assert.equal(targetStyle.borderFillIDRef, sourceStyle.borderFillIDRef);
  assert.equal(targetStyle.vertAlign, sourceStyle.vertAlign);
  assert.equal(targetStyle.margin.left, sourceStyle.margin.left);
});

test('HWPX API list.applyNumbering writes numbered items with preserved cell style', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);
  const sourceIds = session.paragraphStyleIds({ tableId: table.id, cell: { number: 12 } });

  session.apply([
    {
      commandId: 'numbered-list',
      op: 'list.applyNumbering',
      location: { tableId: table.id, cell: { number: 12 } },
      styleSource: { tableId: table.id, cell: { number: 12 } },
      startAt: 3,
      suffix: ')',
      items: ['alpha', 'beta'],
    },
  ]);

  const saved = session.save();
  const reopenedSession = new HwpxApiSession(saved.bytes);
  const reopenedTable = reopenedSession.readJson().tables.find((item) => item.id === table.id);
  const targetIds = reopenedSession.paragraphStyleIds({ tableId: table.id, cell: { number: 12 } });
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 12).text, '3) alpha\n4) beta');
  assert.equal(targetIds.paraPrIDRef, sourceIds.paraPrIDRef);
});

test('HWPX API paragraph.applyStyle can clone top-level paragraph style ids', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const paragraphs = session.readJson().sections[0].paragraphs.filter((paragraph) => paragraph.text.trim().length > 0);
  assert.ok(paragraphs.length >= 2);
  const source = { paragraph: { section: 0, number: paragraphs[0].para } };
  const target = { paragraph: { section: 0, number: paragraphs[1].para } };
  const sourceIds = session.paragraphStyleIds(source);
  const targetText = session.inspectTarget(target).currentText;

  session.apply([
    {
      commandId: 'paragraph-style',
      op: 'paragraph.applyStyle',
      location: target,
      styleSource: source,
    },
  ]);

  const saved = session.save();
  const reopenedSession = new HwpxApiSession(saved.bytes);
  const targetIds = reopenedSession.paragraphStyleIds(target);
  assert.equal(reopenedSession.inspectTarget(target).currentText, targetText);
  assert.equal(targetIds.paraPrIDRef, sourceIds.paraPrIDRef);
  assert.equal(targetIds.charPrIDRef, sourceIds.charPrIDRef);
});

test('HWPX API text.insertAfterParagraph preserves package and reopens inserted paragraphs', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const firstParagraph = before.sections[0].paragraphs[0];

  session.apply([
    {
      commandId: 'insert-after-paragraph',
      op: 'text.insertAfterParagraph',
      location: { paragraph: { section: 0, number: firstParagraph.para } },
      text: 'INSERTED SUMMARY\nINSERTED DETAIL',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const texts = reopened.sections[0].paragraphs.map((paragraph) => paragraph.text);
  assert.ok(reopened.sections[0].paragraphCount >= before.sections[0].paragraphCount + 2);
  assert.ok(texts.includes('INSERTED SUMMARY'));
  assert.ok(texts.includes('INSERTED DETAIL'));
});

test('HWPX API top-level paragraph replacement preserves public briefing pagination', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const beforeFinalCard = before.tables.find((item) => item.id === 'tbl_12')?.layout?.bbox;

  session.apply([
    {
      commandId: 'business-overview',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 4 } },
      text: '□ 사업개요: AI 기반 안전관리 플랫폼 구축',
    },
    {
      commandId: 'business-actions',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 5 } },
      text: '□ 추진내용: 위험 알림·예측정비·고객안내 개선',
    },
    {
      commandId: 'business-budget',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 6 } },
      text: '□ 사업비 / 물량 : 3,850백만원 / 시범역 12개소',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const finalCard = reopened.tables.find((item) => item.id === 'tbl_12')?.layout?.bbox;

  assert.equal(before.pageCount, 11);
  assert.equal(reopened.pageCount, before.pageCount);
  assert.equal(finalCard?.pageIndex, beforeFinalCard?.pageIndex);
  assert.equal(finalCard?.y, beforeFinalCard?.y);
});

test('HWPX API paragraph replacement does not push table controls sideways', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const beforeTable = before.tables.find((item) => item.id === 'tbl_3')?.layout?.bbox;

  session.apply([
    {
      commandId: 'table-paragraph-safe',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 4 } },
      text: '□ 추진 일정: 조사, 현장 적용, 효과검증 단계로 관리',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const table = reopened.tables.find((item) => item.id === 'tbl_3')?.layout?.bbox;

  assert.equal(reopened.pageCount, before.pageCount);
  assert.equal(table?.pageIndex, beforeTable?.pageIndex);
  assert.equal(table?.x, beforeTable?.x);
  assert.equal(table?.y, beforeTable?.y);
});

test('HWPX API table.writeCell preserves pictures in image cells', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const beforePictures = session.objectInventory().pictures.length;

  session.apply([
    {
      commandId: 'image-cell-caption',
      op: 'table.writeCell',
      location: { tableId: 'tbl_3', cell: { number: 9 } },
      text: '< 현장 혼잡도 증빙 >',
    },
  ]);

  const saved = session.save();
  const reopenedSession = new HwpxApiSession(saved.bytes);
  const reopened = reopenedSession.readJson();
  const table = reopened.tables.find((item) => item.id === 'tbl_3');

  assert.equal(reopened.pageCount, before.pageCount);
  assert.equal(reopenedSession.objectInventory().pictures.length, beforePictures);
  assert.equal(table.cells.find((cell) => cell.cellIndex === 9).text, '< 현장 혼잡도 증빙 >');
});

test('HWPX API object inventory discovers embedded pictures in report templates', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const inventory = session.objectInventory();
  const quality = session.qualityCheck();
  assert.ok(inventory.images.length >= 1);
  assert.ok(inventory.pictures.length >= 1);
  assert.ok(quality.objectSummary.pictureCount >= 1);
  assert.ok(quality.targetSummary.cellTargets >= 1);
});

test('HWPX API image.replace can update an embedded package image and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const firstImage = session.objectInventory().images[0];
  assert.ok(firstImage?.name);
  const imageBytes = readZip(input).get(firstImage.name);

  session.apply([
    {
      commandId: 'replace-image-with-same-bytes',
      op: 'image.replace',
      imageName: firstImage.name,
      bytes: imageBytes,
    },
  ]);

  const saved = session.save();
  const reopenedSession = new HwpxApiSession(saved.bytes);
  assert.equal(reopenedSession.readJson().pageCount, 11);
  assert.ok(reopenedSession.objectInventory().images.some((image) => image.name === firstImage.name && image.byteLength === firstImage.byteLength));
});

test('HWPX API image.generateAndReplace creates a PNG package replacement and reopens', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const firstImage = session.objectInventory().images.find((image) => /\.png$/i.test(image.name));
  assert.ok(firstImage?.name);

  session.apply([
    {
      commandId: 'generated-chart',
      op: 'image.generateAndReplace',
      imageName: firstImage.name,
      generator: {
        width: 320,
        height: 180,
        background: '#ffffff',
        accent: '#2f5fbd',
        values: [{ value: 4 }, { value: 9 }, { value: 6 }],
      },
    },
  ]);

  const saved = session.save();
  const entries = readZip(saved.bytes);
  const imageBytes = entries.get(firstImage.name);
  const reopenedSession = new HwpxApiSession(saved.bytes);
  assert.equal(reopenedSession.readJson().pageCount, 11);
  assert.deepEqual([...imageBytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.notEqual(imageBytes.length, firstImage.byteLength);
});

test('HWPX API accepts intuitive table/list command names and parameters', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);

  session.apply([
    {
      commandId: 'receipt',
      group: 'table',
      action: 'writeCell',
      location: { tableId: table.id, cell: { number: 1 } },
      text: 'ESG-NEW-001',
    },
    {
      commandId: 'department-batch',
      op: 'table.writeCells',
      location: { tableId: table.id },
      cells: [
        { cell: { number: 3 }, text: 'AI office' },
        { cell: { number: 5 }, text: 'owner' },
      ],
    },
    {
      commandId: 'bullets',
      op: 'list.writeBullets',
      location: { tableId: table.id, cell: { number: 12 } },
      marker: '-',
      items: ['first point', 'second point'],
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const reopenedTable = reopened.tables.find((item) => item.id === table.id);
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 1).text, 'ESG-NEW-001');
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 3).text, 'AI office');
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 5).text, 'owner');
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 12).text, '- first point\n- second point');
});

test('HWPX API preserve save keeps XML valid when the same cell is written twice', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);

  session.apply([
    {
      commandId: 'receipt-first',
      op: 'table.writeCell',
      location: { tableId: table.id, cell: { number: 1 } },
      text: 'SHOULD-BE-OVERWRITTEN',
    },
    {
      commandId: 'receipt-second',
      op: 'table.writeCell',
      location: { tableId: table.id, cell: { number: 1 } },
      text: 'ESG-TEST-002',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const reopenedTable = reopened.tables.find((item) => item.id === table.id);
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 1).text, 'ESG-TEST-002');
  assert.equal(reopened.pageCount, 2);
  assert.equal(reopened.tables.length, 4);
});

test('HWPX API style.applyText applies paragraph style inside a drawing-control cell', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const source = { tableId: 'tbl_12', cell: { number: 59 } };
  const target = { tableId: 'tbl_3', cell: { number: 9 } };
  const sourceIds = session.paragraphStyleIds(source);
  const beforePictures = session.objectInventory().pictures.length;

  session.apply([{
    commandId: 'drawing-cell-style',
    op: 'style.applyText',
    target,
    styleSource: source,
    text: '근거 일치',
  }]);

  const reopened = new HwpxApiSession(session.save().bytes);
  const targetIds = reopened.paragraphStyleIds(target);
  assert.equal(reopened.inspectTarget(target).currentText, '근거 일치');
  assert.equal(targetIds.paraPrIDRef, sourceIds.paraPrIDRef);
  assert.equal(targetIds.charPrIDRef, sourceIds.charPrIDRef);
  assert.equal(reopened.objectInventory().pictures.length, beforePictures);
});

test('HWPX API command batches are atomic when a later target is invalid', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);
  const before = session.inspectTarget({ tableId: table.id, cell: { number: 1 } }).currentText;
  const beforeRevision = session.revision;

  assert.throws(() => session.apply([
    {
      op: 'table.writeCell',
      location: { tableId: table.id, cell: { number: 1 } },
      text: 'MUST-NOT-COMMIT',
    },
    {
      op: 'table.writeCell',
      location: { tableId: table.id, cell: { number: 9999 } },
      text: 'INVALID',
    },
  ]), /cell not found/);

  assert.equal(session.revision, beforeRevision);
  assert.equal(session.inspectTarget({ tableId: table.id, cell: { number: 1 } }).currentText, before);
  assert.equal(Buffer.compare(session.save().bytes, input), 0);
});

test('HWPX API structural batches roll back every prior mutation when a later target fails', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  const beforeRevision = session.revision;
  const beforeBytes = session.save().bytes;
  const beforeText = session.inspectTarget({
    paragraph: { section: 0, number: 0 },
  }).currentText;

  assert.throws(() => session.commandsBatch([
    {
      op: 'insertText',
      target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
      text: 'MUST-NOT-COMMIT',
    },
    {
      op: 'insertFootnote',
      target: { native: { section: 99, para: 0, offset: 0, length: 0 } },
      text: 'invalid target',
    },
  ]));

  assert.equal(session.revision, beforeRevision);
  assert.equal(
    session.inspectTarget({ paragraph: { section: 0, number: 0 } }).currentText,
    beforeText,
  );
  assert.equal(Buffer.compare(session.save().bytes, beforeBytes), 0);
});

test('HWPX API structural batches qualify, reopen, and commit exactly once', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  const beforeRevision = session.revision;
  const marker = 'STRUCTURAL-ATOMIC-2026';

  const result = session.commandsBatch([
    {
      commandId: 'canonicalized-insert',
      op: 'text.insert',
      target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
      text: marker,
    },
    {
      op: 'setPageSetup',
      sectionIndex: 0,
      width: 59_528,
      height: 84_189,
      orientation: 'portrait',
      margins: { top: 5_669, right: 5_669, bottom: 5_669, left: 5_669 },
    },
  ]);

  assert.equal(result.revision, beforeRevision + 1);
  assert.equal(session.revision, beforeRevision + 1);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].opId, 'canonicalized-insert');
  assert.equal(result.results[0].op, 'insertText');
  assert.equal(result.qualification.ok, true);
  assert.ok(result.validation.pageCount >= 1);

  const saved = session.save();
  assert.equal(saved.revision, session.revision);
  const reopened = new HwpxApiSession(saved.bytes);
  assert.ok(
    reopened.inspectTarget({ paragraph: { section: 0, number: 0 } }).currentText
      .includes(marker),
  );
  assert.equal(JSON.parse(reopened.doc.getPageDef(0)).height, 84_189);
});

test('HWPX API mixed batches preserve command order across patch and structural stages', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);

  const result = session.commandsBatch([
    {
      op: 'text.insertAfterParagraph',
      location: { paragraph: { section: 0, number: 0 } },
      text: 'legacy-inserted',
    },
    {
      op: 'insertText',
      target: { native: { section: 0, para: 1, offset: 0, length: 0 } },
      text: 'native-',
    },
    {
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 0 } },
      text: 'patch-safe-root',
    },
    {
      op: 'defineStyle',
      name: 'Mixed Stage Order',
      kind: 'paragraph',
      properties: { bold: true },
    },
  ]);

  assert.equal(result.results.length, 4);
  assert.ok(result.qualification.stages.length >= 2);
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(
    reopened.inspectTarget({ paragraph: { section: 0, number: 0 } }).currentText,
    'patch-safe-root',
  );
  assert.equal(
    reopened.inspectTarget({ paragraph: { section: 0, number: 1 } }).currentText,
    'native-legacy-inserted',
  );
  assert.ok(
    JSON.parse(reopened.doc.getStyleList())
      .some(style => style.name === 'Mixed Stage Order'),
  );
});

test('HWPX API structural table creation survives qualification and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  const result = session.commandsBatch([
    {
      commandId: 'actual-table',
      op: 'table.create',
      target: { paragraph: { section: 0, number: 0 } },
      rows: 2,
      columns: 2,
      width: 12_000,
      height: 6_000,
      cellTexts: ['A', 'B', 'C', 'D'],
    },
    {
      commandId: 'actual-cell-style',
      op: 'applyStyle',
      target: {
        sectionIndex: 0,
        paragraphIndex: 1,
        controlIndex: 0,
        cellIndex: 0,
        cellParagraphIndex: 0,
      },
      styleId: 0,
    },
  ]);

  assert.equal(result.qualification.ok, true);
  assert.equal(result.results[0].target.kind, 'table');
  assert.equal(result.results[1].target.kind, 'cell');
  const reopened = new HwpxApiSession(session.save().bytes);
  const table = reopened.readJson().tables.find(item =>
    item.dims.rowCount === 2 && item.dims.colCount === 2);
  assert.ok(table);
  assert.deepEqual(table.cells.map(cell => cell.text), ['A', 'B', 'C', 'D']);
});

test('HWPX API table.insertCaption survives source-built save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  session.commandsBatch([{
    op: 'table.create',
    target: { paragraph: { section: 0, number: 0 } },
    rows: 1,
    columns: 1,
    cellTexts: ['A'],
  }]);
  const table = session.readJson().tables[0];
  const result = session.commandsBatch([{
    op: 'table.insertCaption',
    target: table.cells[0].location,
    text: '표 1. 재개방 캡션',
  }]);
  assert.equal(result.results[0].target.kind, 'tableCaption');
  const reopened = new HwpxApiSession(session.save().bytes);
  const properties = JSON.parse(reopened.doc.getTableProperties(0, 1, 0));
  assert.equal(properties.hasCaption, true);
  const captionLength = reopened.doc.getCellParagraphLength(0, 1, 0, 65534, 0);
  assert.equal(
    reopened.doc.getTextInCell(0, 1, 0, 65534, 0, 0, captionLength),
    result.results[0].expectedCaptionText,
  );
});

test('HWPX API table.create caption survives source-built save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);

  const result = session.commandsBatch([{
    op: 'table.create',
    target: { paragraph: { section: 0, number: 0 } },
    rows: 1,
    columns: 1,
    caption: 'CAP',
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const properties = JSON.parse(reopened.doc.getTableProperties(0, 1, 0));
  assert.equal(properties.hasCaption, true);
  const captionLength = reopened.doc.getCellParagraphLength(0, 1, 0, 65534, 0);
  assert.equal(reopened.doc.getTextInCell(0, 1, 0, 65534, 0, 0, captionLength), 'CAP');
  assert.equal(result.results[0].expectedCaptionText, 'CAP');
});

test('HWPX API setRunStyle survives source-built save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  session.commandsBatch([{
    op: 'insertText',
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
    text: 'ABCDE',
  }]);
  const result = session.commandsBatch([{
    op: 'setRunStyle',
    target: { native: { section: 0, para: 0, offset: 0, length: 2 } },
    style: { bold: true, italic: true, fontSizePt: 13 },
  }]);
  assert.equal(result.results[0].target.kind, 'paragraph');
  const reopened = new HwpxApiSession(session.save().bytes);
  const style = JSON.parse(reopened.doc.getCharPropertiesAt(0, 0, 1));
  assert.equal(style.bold, true);
  assert.equal(style.italic, true);
  assert.equal(style.fontSize, 1300);
});

test('HWPX API setDocumentMetadata survives source-built save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  session.commandsBatch([{
    op: 'setDocumentMetadata',
    title: '공공기관 성과보고서',
    author: '기획조정실',
    keywords: '성과,검수',
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const metadata = JSON.parse(reopened.doc.getDocumentMetadata());
  assert.equal(metadata.title, '공공기관 성과보고서');
  assert.equal(metadata.author, '기획조정실');
  assert.equal(metadata.keywords, '성과,검수');
});

test('HWPX API setHeaderFooter survives source-built save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  const result = session.commandsBatch([{
    op: 'setHeaderFooter',
    target: { sectionIndex: 0 },
    type: 'header',
    applyTo: 'both',
    align: 'center',
    text: '공공기관 내부검토용',
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const header = JSON.parse(reopened.doc.getHeaderFooter(0, true, 0));
  assert.equal(header.exists, true);
  assert.equal(header.text, result.results[0].expectedHeaderFooterText);
  const paragraph = JSON.parse(reopened.doc.getParaPropertiesInHf(0, true, 0, 0));
  assert.equal(paragraph.alignment, result.results[0].expectedHeaderFooterAlign);
});

test('HWPX API insertFootnote survives source-built save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  session.commandsBatch([{
    op: 'insertText',
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
    text: '기준일',
  }]);
  const result = session.commandsBatch([{
    op: 'insertFootnote',
    target: { native: { section: 0, para: 0, offset: 3, length: 0 } },
    text: '통계 작성 기준일은 2026년 6월 30일이다.',
  }]);
  const target = result.results[0].target;
  assert.equal(target.kind, 'footnote');
  const reopened = new HwpxApiSession(session.save().bytes);
  const footnote = JSON.parse(reopened.doc.getFootnoteInfo(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
  ));
  assert.equal(footnote.texts[0].slice(2), result.results[0].expectedFootnoteText);
});

test('setRunStyle verifier checks both paragraph range boundaries after reopen', () => {
  const calls = [];
  const session = {
    doc: {
      getSectionCount: () => 1,
      getParagraphCount: () => 1,
      getCharPropertiesAt: (...args) => {
        calls.push(args);
        return JSON.stringify({ bold: args[2] === 1 });
      },
    },
  };

  assert.throws(
    () => hwpxApiUtils.verifyStructuralTarget(
      session,
      { kind: 'paragraph', sectionIndex: 0, paragraphIndex: 0 },
      {
        expectedRunStyle: { bold: true },
        expectedRunRange: { start: 1, end: 4 },
      },
    ),
    error => error?.code === 'HWPX_CREATED_TARGET_MISMATCH'
      && error.details?.offset === 3,
  );
  assert.deepEqual(calls, [[0, 0, 1], [0, 0, 3]]);
});

test('setRunStyle verifier checks both inspected table-cell range boundaries after reopen', () => {
  const calls = [];
  const session = {
    doc: {
      getCellParagraphCount: () => 1,
      getCellCharPropertiesAt: (...args) => {
        calls.push(args);
        return JSON.stringify({ italic: args[5] === 2 });
      },
    },
  };

  assert.throws(
    () => hwpxApiUtils.verifyStructuralTarget(
      session,
      {
        kind: 'cell',
        sectionIndex: 0,
        paragraphIndex: 2,
        controlIndex: 1,
        cellIndex: 3,
        cellParagraphIndex: 0,
      },
      {
        expectedRunStyle: { italic: true },
        expectedRunRange: { start: 2, end: 6 },
      },
    ),
    error => error?.code === 'HWPX_CREATED_TARGET_MISMATCH'
      && error.details?.offset === 5,
  );
  assert.deepEqual(calls, [
    [0, 2, 1, 3, 0, 2],
    [0, 2, 1, 3, 0, 5],
  ]);
});

test('HWPX API appendParagraph clones inspected style and text through qualification and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const sourceStyleIds = session.paragraphStyleIds({
    paragraph: { section: 0, number: 11 },
  });
  const result = session.commandsBatch([{
    op: 'appendParagraph',
    target: { paragraph: { section: 0, number: 4 } },
    styleSource: { paragraph: { section: 0, number: 11 } },
    text: '복제 서식 신규 문단',
  }]);

  assert.equal(result.qualification.ok, true);
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(
    reopened.inspectTarget({ paragraph: { section: 0, number: 5 } }).currentText,
    '복제 서식 신규 문단',
  );
  assert.deepEqual(
    reopened.paragraphStyleIds({ paragraph: { section: 0, number: 5 } }),
    sourceStyleIds,
  );
});

test('HWPX API appendParagraph clones inspected table-cell style IDs through qualification and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const sourceCell = session.readJson().tables
    .flatMap(table => table.cells)
    .find(cell => cell.paragraphs.length > 0);
  assert.ok(sourceCell);
  const sourceStyleIds = session.paragraphStyleIds(sourceCell.location);

  const result = session.commandsBatch([{
    op: 'appendParagraph',
    target: { paragraph: { section: 0, number: 4 } },
    styleSource: sourceCell.location,
    text: '표 셀 서식 복제 문단',
  }]);

  assert.equal(result.qualification.ok, true);
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(
    reopened.inspectTarget({ paragraph: { section: 0, number: 5 } }).currentText,
    '표 셀 서식 복제 문단',
  );
  assert.deepEqual(
    reopened.paragraphStyleIds({ paragraph: { section: 0, number: 5 } }),
    sourceStyleIds,
  );
});

test('HWPX API reopens and verifies every non-text structural target kind', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const commands = [
    {
      op: 'setPageSetup',
      sectionIndex: 0,
      width: 59_528,
      height: 84_189,
      orientation: 'portrait',
      margins: { top: 5_669, right: 5_669, bottom: 5_669, left: 5_669 },
    },
    {
      op: 'defineStyle',
      name: 'Atomic Style',
      kind: 'paragraph',
      properties: { bold: true, align: 'center' },
    },
  ];

  for (const command of commands) {
    const session = new HwpxApiSession(input);
    const result = session.commandsBatch([command]);
    assert.equal(result.qualification.ok, true, command.op);
    assert.equal(result.results.length, 1, command.op);
  }
});

test('HWPX API public-sector structural export preserves objects or rolls back atomically', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const beforeRevision = session.revision;
  const before = session.objectInventory();

  try {
    session.commandsBatch([{
      op: 'setPageSetup',
      sectionIndex: 0,
      width: 59_528,
      height: 84_189,
      orientation: 'portrait',
    }]);
    const reopened = new HwpxApiSession(session.save().bytes);
    const after = reopened.objectInventory();
    assert.equal(after.pictures.length, before.pictures.length);
    assert.equal(after.binaryFiles.length, before.binaryFiles.length);
  } catch (error) {
    assert.equal(error.code, 'HWPX_PACKAGE_OBJECT_REFERENCE_LOSS');
    assert.equal(session.revision, beforeRevision);
    assert.equal(Buffer.compare(session.save().bytes, input), 0);
  }
});

test('HWPX API text.replace survives preserve-package save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/test-image.hwpx');
  const session = new HwpxApiSession(input);
  const paragraph = session.readJson().sections[0].paragraphs.find((item) => item.text.length >= 4);
  assert.ok(paragraph);
  const replacement = '검증';
  const expected = `${paragraph.text.slice(0, 1)}${replacement}${paragraph.text.slice(3)}`;

  session.apply([{
    op: 'text.replace',
    target: {
      native: {
        section: 0,
        para: paragraph.para,
        offset: 1,
        length: 2,
      },
    },
    text: replacement,
  }]);

  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(
    reopened.inspectTarget({ paragraph: { section: 0, number: paragraph.para } }).currentText,
    expected,
  );
});

test('HWPX API text.replaceTracked emits native Hancom revision markup and reopens', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/test-image.hwpx');
  const source = new HwpxApiSession(input);
  const candidates = source.readJson().sections[0].paragraphs
    .filter(item => item.text.length >= 2);
  let committed = null;
  for (const paragraph of candidates) {
    const trial = new HwpxApiSession(input);
    try {
      const result = trial.apply([{
        op: 'text.replaceTracked',
        target: {
          native: {
            section: 0,
            para: paragraph.para,
            offset: 0,
            length: 2,
          },
        },
        text: '추적수정',
        author: '공공기관 검수자',
        date: '2026-07-27T09:49:00Z',
      }]);
      committed = { result, bytes: trial.save().bytes };
      break;
    } catch (error) {
      if (error.code !== 'HWPX_TRACKED_CHANGE_RANGE_UNSUPPORTED') throw error;
    }
  }
  assert.ok(committed, 'fixture must expose at least one single-run tracked-change target');
  assert.equal(committed.result.results[0].action, 'text.replaceTracked');
  const entries = readZip(committed.bytes);
  assert.match(entries.get('Contents/header.xml').toString('utf8'), /<hh:trackChange type="Insert"/);
  assert.match(entries.get('Contents/header.xml').toString('utf8'), /<hh:trackChange type="Delete"/);
  assert.match(entries.get('Contents/section0.xml').toString('utf8'), /<hp:deleteBegin\b/);
  assert.match(entries.get('Contents/section0.xml').toString('utf8'), /<hp:insertBegin\b/);
  assert.doesNotThrow(() => new HwpxApiSession(committed.bytes));
});

test('HWPX tracked-change mixed batches roll back when a later command fails', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/test-image.hwpx');
  const session = new HwpxApiSession(input);
  const paragraph = session.readJson().sections[0].paragraphs.find(item => item.text.length >= 2);
  const beforeRevision = session.revision;

  assert.throws(() => session.apply([
    {
      op: 'text.replaceTracked',
      target: { native: { section: 0, para: paragraph.para, offset: 0, length: 1 } },
      text: '추적',
      author: '검수자',
    },
    {
      op: 'text.replace',
      target: { native: { section: 999, para: 0, offset: 0, length: 1 } },
      text: '실패',
    },
  ]));
  assert.equal(session.revision, beforeRevision);
  assert.equal(Buffer.compare(session.save().bytes, input), 0);
});

test('HWPX API paragraph replacement does not erase table cells in the same body paragraph', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);

  session.apply([
    {
      commandId: 'safe-paragraph-replace',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 4 } },
      text: '1. 기부통계',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const table = reopened.tables.find((item) => item.id === 'tbl_3');
  assert.equal(table.cells.length, 35);
  assert.equal(reopened.pageCount, 11);
  assert.equal(reopened.tables.length, 14);
});
