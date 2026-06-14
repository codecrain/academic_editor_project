import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { HwpxApiSession, initHwpxRuntime, readZip } from './hwpx-api-utils.mjs';

const ESG_FIXTURE_PATH = 'editor_hwpx/samples/api-fixtures/esg-original.hwpx';

test('HWPX API preserve save returns original bytes when no commands run', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const saved = session.save();
  assert.equal(Buffer.compare(input, saved.bytes), 0);
  assert.equal(saved.validation.pageCount, 2);
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

test('HWPX API paragraph.applyStyle can clone top-level paragraph style ids', { skip: !existsSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx') }, async () => {
  await initHwpxRuntime();
  const input = readFileSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx');
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

test('HWPX API top-level paragraph replacement preserves business template pagination', { skip: !existsSync('C:/CC/tlooto_onpremise_project/server2/generated/editor_agent_soft_feedback/business-source.hwpx') }, async () => {
  await initHwpxRuntime();
  const input = readFileSync('C:/CC/tlooto_onpremise_project/server2/generated/editor_agent_soft_feedback/business-source.hwpx');
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const beforeFinalCard = before.tables.find((item) => item.id === 'tbl_15')?.layout?.bbox;

  session.apply([
    {
      commandId: 'business-overview',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 14 } },
      text: '□ 사업개요: AI 기반 안전관리 플랫폼 구축',
    },
    {
      commandId: 'business-actions',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 15 } },
      text: '□ 추진내용: 위험 알림·예측정비·고객안내 개선',
    },
    {
      commandId: 'business-budget',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 25 } },
      text: '□ 사업비 / 물량 : 3,850백만원 / 시범역 12개소',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const finalCard = reopened.tables.find((item) => item.id === 'tbl_15')?.layout?.bbox;

  assert.equal(before.pageCount, 6);
  assert.equal(reopened.pageCount, before.pageCount);
  assert.equal(finalCard?.pageIndex, beforeFinalCard?.pageIndex);
  assert.equal(finalCard?.y, beforeFinalCard?.y);
});

test('HWPX API paragraph replacement does not push table controls sideways', { skip: !existsSync('C:/CC/tlooto_onpremise_project/server2/app/domains/project/default_templates/시의회 업무보고서 작성양식.hwpx') }, async () => {
  await initHwpxRuntime();
  const input = readFileSync('C:/CC/tlooto_onpremise_project/server2/app/domains/project/default_templates/시의회 업무보고서 작성양식.hwpx');
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const beforeTable = before.tables.find((item) => item.id === 'tbl_2')?.layout?.bbox;

  session.apply([
    {
      commandId: 'table-paragraph-safe',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 14 } },
      text: '□ 추진 일정: 조사, 현장 적용, 효과검증 단계로 관리',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const table = reopened.tables.find((item) => item.id === 'tbl_2')?.layout?.bbox;

  assert.equal(reopened.pageCount, before.pageCount);
  assert.equal(table?.pageIndex, beforeTable?.pageIndex);
  assert.equal(table?.x, beforeTable?.x);
  assert.equal(table?.y, beforeTable?.y);
});

test('HWPX API table.writeCell preserves pictures in image cells', { skip: !existsSync('C:/CC/tlooto_onpremise_project/server2/app/domains/project/default_templates/시의회 업무보고서 작성양식.hwpx') }, async () => {
  await initHwpxRuntime();
  const input = readFileSync('C:/CC/tlooto_onpremise_project/server2/app/domains/project/default_templates/시의회 업무보고서 작성양식.hwpx');
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const beforePictures = session.objectInventory().pictures.length;

  session.apply([
    {
      commandId: 'image-cell-caption',
      op: 'table.writeCell',
      location: { tableId: 'tbl_4', cell: { number: 3 } },
      text: '< 현장 혼잡도 증빙 >',
    },
  ]);

  const saved = session.save();
  const reopenedSession = new HwpxApiSession(saved.bytes);
  const reopened = reopenedSession.readJson();
  const table = reopened.tables.find((item) => item.id === 'tbl_4');

  assert.equal(reopened.pageCount, before.pageCount);
  assert.equal(reopenedSession.objectInventory().pictures.length, beforePictures);
  assert.equal(table.cells.find((cell) => cell.cellIndex === 3).text, '< 현장 혼잡도 증빙 >');
});

test('HWPX API object inventory discovers embedded pictures in report templates', { skip: !existsSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx') }, async () => {
  await initHwpxRuntime();
  const input = readFileSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx');
  const session = new HwpxApiSession(input);
  const inventory = session.objectInventory();
  const quality = session.qualityCheck();
  assert.ok(inventory.images.length >= 1);
  assert.ok(inventory.pictures.length >= 1);
  assert.ok(quality.objectSummary.pictureCount >= 1);
  assert.ok(quality.targetSummary.cellTargets >= 1);
});

test('HWPX API image.replace can update an embedded package image and reopen', { skip: !existsSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx') }, async () => {
  await initHwpxRuntime();
  const input = readFileSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx');
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
  assert.equal(reopenedSession.readJson().pageCount, 10);
  assert.ok(reopenedSession.objectInventory().images.some((image) => image.name === firstImage.name && image.byteLength === firstImage.byteLength));
});

test('HWPX API image.generateAndReplace creates a PNG package replacement and reopens', { skip: !existsSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx') }, async () => {
  await initHwpxRuntime();
  const input = readFileSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx');
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
  assert.equal(reopenedSession.readJson().pageCount, 10);
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

test('HWPX API paragraph replacement does not erase table cells in the same body paragraph', { skip: !existsSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx') }, async () => {
  await initHwpxRuntime();
  const input = readFileSync('C:/CC/tlooto_onpremise_project/server2/generated/document_editor_api_samples/sample-input.hwpx');
  const session = new HwpxApiSession(input);

  session.apply([
    {
      commandId: 'safe-paragraph-replace',
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 25 } },
      text: '1. 기부통계',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const table = reopened.tables.find((item) => item.id === 'tbl_2');
  assert.equal(table.cells.length, 9);
  assert.equal(reopened.pageCount, 10);
  assert.equal(reopened.tables.length, 15);
});
