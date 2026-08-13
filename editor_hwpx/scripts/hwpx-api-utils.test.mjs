import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as hwpxApiUtils from './hwpx-api-utils.mjs';
import { analyzeSvgCellClipping } from '../../editor_server/svg-render-evidence.mjs';

const {
  HwpxApiSession,
  initHwpxRuntime,
  readHwpxDocumentMetadata,
  readZip,
  replaceLeadingTabTemplateTextXml,
} = hwpxApiUtils;

const ESG_FIXTURE_PATH = 'editor_hwpx/samples/api-fixtures/esg-original.hwpx';
const PUBLIC_BRIEFING_FIXTURE_PATH = 'evaluation/hwpx-agent-final-20-v1/attachments/source/moe-2025-briefing.hwpx';

const NESTED_TABLE_FIXTURE_PATH = 'editor_hwpx/samples/2025년 기부·답례품 실적 지자체 보고서_양식.hwpx';

test('HWPX API preserve save returns original bytes when no commands run', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const saved = session.save();
  assert.equal(Buffer.compare(input, saved.bytes), 0);
  assert.equal(saved.validation.pageCount, 2);
});

test('HWP native asset reading preserves nested table cellPath coordinates', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/pic-in-table-01.hwp'));
  const inventory = session.objectInventory();
  const image = inventory.images.find((item) => {
    const candidate = inventory.pictures.find((picture) => picture.id === item.pictureId);
    return Array.isArray(candidate?.native?.cellPath);
  });
  const picture = inventory.pictures.find((item) => item.id === image?.pictureId);
  assert.ok(picture);
  assert.ok(image);
  const asset = session.readAsset(image.name);
  assert.equal(asset.byteLength, image.byteLength);
  assert.equal(asset.sha256, image.sha256);
  assert.ok(asset.bytes.length > 0);
});

test('HWP field values are parsed, updated atomically, and verified after reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/field-01-memo.hwp'));
  const fields = session.readJson().fields;
  assert.ok(Array.isArray(fields));
  assert.ok(fields.length > 0);
  const target = fields[0];

  const result = session.commandsBatch([{
    op: 'field.setValues',
    values: [{ fieldId: target.fieldId, value: 'FIELD-MCP-VERIFIED' }],
  }]);
  assert.equal(result.results[0].changed, 1);
  assert.equal(result.qualification.ok, true);

  const reopened = new HwpxApiSession(session.save().bytes).readJson();
  assert.equal(reopened.sourceFormat, 'hwp');
  assert.equal(
    reopened.fields.find((field) => field.fieldId === target.fieldId).value,
    'FIELD-MCP-VERIFIED',
  );
});

test('HWP source opens, edits, saves, and reopens without forced HWPX conversion', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/re-align-left-hancom.hwp');
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  assert.equal(before.sourceFormat, 'hwp');
  assert.ok(Object.hasOwn(before.sections[0].paragraphs[0].hierarchy, 'paraLevel'));
  assert.ok(Object.hasOwn(before.sections[0].paragraphs[0].hierarchy, 'leadingSpaces'));
  assert.equal(session.saveMode, 'hwp-export');
  assert.equal(Buffer.compare(session.save().bytes, input), 0);
  const paragraph = before.sections[0].paragraphs.find((item) => item.text.length > 0);
  const replacement = `X${paragraph.text.slice(1)}`;

  session.commandsBatch([{
    op: 'text.replaceParagraph',
    location: { paragraph: { section: paragraph.section, number: paragraph.para } },
    text: replacement,
  }]);
  const saved = session.save();
  assert.equal(saved.validation.sourceFormat, 'hwp');
  assert.equal(saved.validation.pageCount, before.pageCount);
  const reopened = new HwpxApiSession(saved.bytes);
  assert.equal(reopened.inspectTarget({ paragraph: { section: paragraph.section, number: paragraph.para } }).currentText, replacement);
});

test('HWP table.writeCell preserves each selected paragraph template after save and reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/biz_plan.hwp'));
  const table = session.readJson().tables.find((item) => item.id === 'tbl_2');
  const target = table.cells.find((cell) => cell.cellIndex === 7);
  assert.equal(target.paragraphs.length, 4);
  const before = target.paragraphs.map((paragraph) => ({
    paragraphFormat: paragraph.paragraphFormat,
    characterFormat: paragraph.characterFormat,
  }));
  const text = ['첫 문단', '둘째 문단', '셋째 문단', '넷째 문단'].join('\n');

  session.commandsBatch([{
    op: 'table.writeCell',
    location: target.location,
    text,
    paragraphTemplateIndices: [0, 1, 2, 3],
  }]);
  const reopened = new HwpxApiSession(session.save().bytes).readJson();
  const after = reopened.tables.find((item) => item.id === table.id).cells[target.cellIndex];

  assert.equal(after.text, text);
  assert.deepEqual(after.paragraphs.map((paragraph) => ({
    paragraphFormat: paragraph.paragraphFormat,
    characterFormat: paragraph.characterFormat,
  })), before);
});

test('paragraph formatting rejects an ambiguous multi-paragraph cell target', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/biz_plan.hwp'));
  const target = session.readJson().tables.find((item) => item.id === 'tbl_2').cells[7];

  assert.throws(() => session.commandsBatch([{
    op: 'format.apply',
    scope: 'paragraph',
    target: target.location,
    properties: { alignment: 'center' },
  }]), (error) => {
    assert.equal(error.code, 'HWPX_CELL_PARAGRAPH_INDEX_REQUIRED');
    assert.equal(error.details.paragraphCount, 4);
    return true;
  });
  assert.equal(session.revision, 1);

  assert.doesNotThrow(() => session.commandsBatch([{
    op: 'format.apply',
    scope: 'paragraph',
    target: { ...target.location, cellParagraphIndex: 1 },
    properties: { alignment: 'center' },
  }]));
});

test('HWPX quality reports page-count drift as an explicit review warning', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const quality = session.qualityCheck({
    baselineJson: { pageCount: session.readJson().pageCount + 1, tables: [] },
  });
  const issue = quality.issues.find(item => item.code === 'page-count-changed');
  assert.equal(issue.severity, 'warning');
  assert.equal(issue.delta, -1);
});

test('HWPX quality does not report table dimension drift against an identical baseline', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const quality = session.qualityCheck({ baselineJson: session.readJson() });
  assert.equal(quality.issues.some((issue) => issue.code === 'table-dimensions-changed'), false);
});

test('HWPX quality enforces baseline tables and embedded assets', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const json = session.readJson();
  const quality = session.qualityCheck({
    baselineJson: {
      pageCount: json.pageCount,
      tables: [{ id: 'missing-baseline-table', dims: { rows: 1, cols: 1 }, cells: [] }],
      objectGraph: {
        images: [{ name: 'BinData/missing-baseline.png', sha256: 'missing' }],
        pictures: [...(json.objectGraph.pictures || []), { id: 'missing-picture' }],
      },
    },
    templatePolicy: {
      requiredTableIds: ['missing-baseline-table'],
      requiredImageNames: ['BinData/missing-baseline.png'],
    },
  });
  assert.equal(quality.ok, false);
  assert.ok(quality.issues.some((issue) => issue.code === 'required-table-missing'));
  assert.ok(quality.issues.some((issue) => issue.code === 'required-image-missing'));
  assert.ok(quality.issues.some((issue) => issue.code === 'baseline-picture-count-decreased'));
});

test('HWPX analysis is cached per revision and invalidated after commit', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const first = session.readJson();
  assert.equal(session.readJson(), first);

  const cell = first.editableTargets.cells[0];
  assert.ok(cell);
  session.commandsBatch([{
    op: 'table.writeCell',
    location: cell.location,
    text: cell.currentText,
  }]);
  const after = session.readJson();
  assert.notEqual(after, first);
  assert.equal(after.revision, session.revision);
});

test('HWPX semantic control scans are isolated from ordinary cached reads', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  const ordinary = session.readJson();
  assert.equal(Object.hasOwn(ordinary.layoutGraph, 'pageDefinitions'), false);
  assert.equal(Object.hasOwn(ordinary.layoutGraph, 'headerFooters'), false);
  assert.equal(Object.hasOwn(ordinary.layoutGraph, 'footnotes'), false);
  assert.equal(session.readJson(), ordinary);

  const semantic = session.semanticSnapshot();
  assert.ok(Array.isArray(semantic.layoutGraph.pageDefinitions));
  assert.ok(Array.isArray(semantic.layoutGraph.headerFooters));
  assert.ok(Array.isArray(semantic.layoutGraph.footnotes));
  assert.equal(session.readJson(), ordinary);
});

test('HWP structural paragraph insertion stays HWP and survives qualification', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/re-align-left-hancom.hwp');
  const session = new HwpxApiSession(input);
  const result = session.commandsBatch([{
    op: 'appendParagraph',
    target: { paragraph: { section: 0, number: 0 } },
    text: 'Native HWP paragraph',
  }]);
  assert.equal(result.qualification.ok, true);
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(reopened.readJson().sourceFormat, 'hwp');
  assert.equal(reopened.inspectTarget({ paragraph: { section: 0, number: 1 } }).currentText, 'Native HWP paragraph');
});

test('HWP native image insertion stays HWP and is inventoried after reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/re-align-left-hancom.hwp'));
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC2sAAAAASUVORK5CYII=';
  const result = session.commandsBatch([{
    op: 'image.insertAfterParagraph',
    target: { paragraph: { section: 0, number: 0 } },
    bytesBase64: png,
    mimeType: 'image/png',
    width: 1000,
    height: 1000,
  }]);
  assert.equal(result.qualification.ok, true);
  const reopened = new HwpxApiSession(session.save().bytes);
  const json = reopened.readJson();
  assert.equal(json.sourceFormat, 'hwp');
  assert.equal(json.objectGraph.images.length, 1);
  assert.equal(json.objectGraph.pictures.length, 1);
  assert.equal(json.objectGraph.images[0].mimeType, 'image/png');
});

test('HWP native table resize and row insertion survive save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/table-001.hwp');
  const session = new HwpxApiSession(input);
  const table = session.readJson().tables[0];
  session.commandsBatch([{
    op: 'table.setSize',
    target: { tableId: table.id, cell: { number: 0 } },
    width: 40000,
    height: 28000,
  }]);
  session.commandsBatch([{
    op: 'table.insertRows',
    target: { tableId: table.id, cell: { number: 0 } },
    rowIndex: table.dims.rowCount,
    templateRow: table.dims.rowCount - 1,
    count: 1,
    clearText: true,
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const properties = JSON.parse(reopened.doc.getTableProperties(0, 1, 0));
  assert.equal(reopened.readJson().sourceFormat, 'hwp');
  assert.ok(Math.abs(properties.tableWidth - 40000) <= 2);
  assert.ok(properties.tableHeight >= 28000);
  assert.equal(reopened.readJson().tables[0].dims.rowCount, table.dims.rowCount + 1);
});

test('HWP package-only commands fail explicitly instead of reporting a no-op success', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/re-align-left-hancom.hwp'));
  assert.throws(
    () => session.commandsBatch([{
      op: 'image.replace',
      imageName: 'BinData/image1.png',
      bytesBase64: 'AA==',
    }]),
    error => error?.code === 'HWP_COMMAND_REQUIRES_HWPX_PACKAGE',
  );
});

test('HWPX Node runtime text measurement honors the WASM font-text callback signature', async () => {
  await initHwpxRuntime();
  assert.equal(globalThis.measureTextWidth('1000px serif', '가A '), 1900);
});

test('HWPX paragraph template replacement preserves matching leading tab controls', () => {
  const paragraph = '<hp:p paraPrIDRef="22" styleIDRef="17"><hp:run charPrIDRef="23"><hp:t><hp:tab width="4000" leader="0" type="1"/><hp:tab width="4000" leader="0" type="1"/> 책임자 : (인)</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="100" vertsize="1000" spacing="600"/></hp:linesegarray></hp:p>';
  const replaced = replaceLeadingTabTemplateTextXml(paragraph, '\t\t 연구책임자 : 신해용 (인)');
  assert.ok(replaced);
  assert.equal((replaced.match(/<hp:tab\b/g) ?? []).length, 2);
  assert.match(replaced, /<hp:t><hp:tab[\s\S]* 연구책임자 : 신해용 \(인\)<\/hp:t>/);
  assert.equal(replaceLeadingTabTemplateTextXml(paragraph, '\t 연구책임자 : 신해용 (인)'), null);
});

test('HWPX paragraph replacement preserves requested line-break and tab controls after reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/ref/ref_mixed.hwpx'));
  session.apply([
    {
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 1 } },
      text: '점검 대상: 본관\n점검 시간: 09:00~11:00',
    },
    {
      op: 'text.replaceParagraph',
      location: { paragraph: { section: 0, number: 2 } },
      text: '담당부서\t시설안전팀',
    },
  ]);
  const saved = session.save();
  const sectionXml = readZip(saved.bytes).get('Contents/section0.xml').toString('utf8');
  assert.match(sectionXml, /점검 대상: 본관<hp:lineBreak\/>점검 시간: 09:00~11:00/);
  const editedParagraph = sectionXml.slice(sectionXml.indexOf('점검 대상: 본관'));
  assert.match(editedParagraph, /<hp:lineseg\b[^>]*textpos="0"/);
  assert.match(editedParagraph, /<hp:lineseg\b[^>]*textpos="10"/);
  assert.match(sectionXml, /담당부서<hp:tab\b[^>]*\/>시설안전팀/);
  const reopened = new HwpxApiSession(saved.bytes);
  assert.equal(reopened.inspectTarget({ paragraph: { section: 0, number: 1 } }).currentText, '점검 대상: 본관\n점검 시간: 09:00~11:00');
  assert.equal(reopened.inspectTarget({ paragraph: { section: 0, number: 2 } }).currentText, '담당부서\t시설안전팀');
});

test('HWPX API reports encrypted public-sector packages with an actionable error code', async () => {
  await initHwpxRuntime();
  const input = readFileSync('evaluation/hwpx-agent-final-20-v1/attachments/source/moe-2025-work-plan.hwpx');
  assert.throws(
    () => new HwpxApiSession(input),
    (error) => error?.code === 'unsupported_encrypted_hwpx'
      && /배포용 또는 암호화된 HWPX/.test(error.message),
  );
});

test('HWPX API writes a canonical table cell command and verifies reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);

  session.commandsBatch([
    {
      opId: 'receipt',
      op: 'table.writeCell',
      location: { tableId: table.id, cell: { number: 1 } },
      text: 'ESG-TEST-001',
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const reopenedTable = reopened.tables.find((item) => item.id === table.id);
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 1).text, 'ESG-TEST-001');
  assert.equal(saved.validation.pageCount, 2);
});

test('HWPX API writes mixed paragraph style IDs inside one table cell and reopens', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const json = session.readJson();
  const table = json.tables.find((item) => item.cells.length >= 2);
  const target = table.cells[0];
  const source = table.cells.find((cell) => (
    cell.style?.paragraph?.paraShapeId !== target.style?.paragraph?.paraShapeId
  )) ?? table.cells[1];
  const firstStyle = session.paragraphStyleIds(target.location);
  const secondStyle = session.paragraphStyleIds(source.location);

  session.apply([{
    op: 'table.writeCell',
    location: target.location,
    text: '혼합첫째\n혼합둘째',
    paragraphStyleIds: [firstStyle, secondStyle],
  }]);
  const saved = session.save();
  const sectionXml = readZip(saved.bytes).get('Contents/section0.xml').toString('utf8');
  const paragraphTagBefore = (text) => {
    const textOffset = sectionXml.indexOf(`<hp:t>${text}</hp:t>`);
    assert.notEqual(textOffset, -1);
    const paragraphOffset = sectionXml.lastIndexOf('<hp:p ', textOffset);
    return sectionXml.slice(paragraphOffset, sectionXml.indexOf('>', paragraphOffset) + 1);
  };
  assert.match(paragraphTagBefore('혼합첫째'), new RegExp(`paraPrIDRef="${firstStyle.paraPrIDRef}"`));
  assert.match(paragraphTagBefore('혼합둘째'), new RegExp(`paraPrIDRef="${secondStyle.paraPrIDRef}"`));
  assert.doesNotThrow(() => new HwpxApiSession(saved.bytes));
});

test('HWPX API table.writeCell constrains generated line layout to the cell inner width', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const target = session.readJson().tables
    .find((table) => table.id === 'tbl_1')
    .cells.find((cell) => cell.cellIndex === 6);
  const text = 'alpha beta gamma delta epsilon';

  session.apply([{ op: 'table.writeCell', location: target.location, text }]);
  const saved = session.save();
  const sectionXml = readZip(saved.bytes).get('Contents/section0.xml').toString('utf8');
  const textOffset = sectionXml.indexOf(`<hp:t>${text}</hp:t>`);
  assert.notEqual(textOffset, -1);
  const cellStart = sectionXml.lastIndexOf('<hp:tc ', textOffset);
  const cellEnd = sectionXml.indexOf('</hp:tc>', textOffset) + '</hp:tc>'.length;
  const cellXml = sectionXml.slice(cellStart, cellEnd);
  const cellWidth = Number(cellXml.match(/<hp:cellSz\b[^>]*\bwidth="(\d+)"/)?.[1]);
  const leftMargin = Number(cellXml.match(/<hp:cellMargin\b[^>]*\bleft="(\d+)"/)?.[1] ?? 0);
  const rightMargin = Number(cellXml.match(/<hp:cellMargin\b[^>]*\bright="(\d+)"/)?.[1] ?? 0);
  const innerWidth = cellWidth - leftMargin - rightMargin;
  const lineWidths = [...cellXml.matchAll(/<hp:lineseg\b[^>]*\bhorzsize="(\d+)"/g)]
    .map((match) => Number(match[1]));

  assert.ok(lineWidths.length >= 2);
  assert.ok(lineWidths.every((width) => width <= innerWidth));
  assert.doesNotThrow(() => new HwpxApiSession(saved.bytes));
});

test('HWPX API reuses matching original cell paragraph templates without flattening them', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const table = session.readJson().tables.find((item) => item.id === 'tbl_1');
  const target = table.cells.find((cell) => cell.paragraphs.length === 2 && cell.text.includes('\n'));
  assert.ok(target);
  session.apply([{
    op: 'table.writeCell',
    location: target.location,
    text: target.text,
    paragraphTemplateIndices: [0, 1],
  }]);
  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const reopenedCell = reopened.tables.find((item) => item.id === table.id).cells[target.cellIndex];
  assert.equal(reopenedCell.text, target.text);
  assert.equal(reopenedCell.paragraphs.length, 2);
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
  const mappedCell = session.targetMap().cells[0];
  assert.equal(mappedCell.kind, 'cell');
  assert.equal(typeof mappedCell.currentText, 'string');
  assert.equal(Number.isInteger(mappedCell.cell.row), true);
  assert.equal(Number.isInteger(mappedCell.cell.col), true);
  assert.equal(Number.isInteger(mappedCell.cell.rowSpan), true);
  assert.equal(Number.isInteger(mappedCell.cell.colSpan), true);
  assert.ok(mappedCell.styleFingerprint?.hash);
  assert.equal(typeof mappedCell.table.id, 'string');
  assert.equal(Number.isInteger(mappedCell.flow.section), true);
  assert.equal(Number.isInteger(mappedCell.flow.paragraph), true);
  assert.equal(Number.isInteger(mappedCell.flow.order), true);
  const tableHostParagraphs = new Set(
    json.tables.map((item) => `${item.section}:${item.para}`),
  );
  assert.ok(json.editableTargets.paragraphs.every((item) =>
    !tableHostParagraphs.has(`${item.location.paragraph.section}:${item.location.paragraph.number}`),
  ));
  assert.ok(session.objectInventory().sections.length >= 1);

  const target = session.inspectTarget({ tableId: table.id, cell: { number: 1 } });
  assert.equal(target.kind, 'cell');
  assert.ok(target.styleFingerprint?.hash);
  assert.equal(target.location.cell.number, 1);
  assert.ok(target.style.cell);
  assert.ok(target.layout.capacity);
  const searchableCell = table.cells.find((cell) => cell.text.trim().length > 0);
  const resolvedCell = session.resolveText(searchableCell.text.trim().slice(0, 5));
  assert.equal(resolvedCell.kind, 'cell');
  assert.equal(resolvedCell.location.tableId, table.id);
  const resolvedCellWithKind = session.resolveText(searchableCell.text.trim().slice(0, 5), { kind: 'cell' });
  assert.equal(resolvedCellWithKind.kind, 'cell');
  assert.equal(resolvedCellWithKind.location.tableId, table.id);
  const resolvedCellExactly = session.resolveText(searchableCell.text.trim(), { kind: 'cell', exact: true });
  assert.equal(resolvedCellExactly.kind, 'cell');
  assert.equal(resolvedCellExactly.text.trim(), searchableCell.text.trim());

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

test('HWPX API text.deleteParagraphs removes inspected body blocks without reconstructing the package', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const tableParagraphs = new Set(before.tables.map((table) => table.para));
  const candidates = before.sections[0].paragraphs
    .filter((paragraph) => !tableParagraphs.has(paragraph.para))
    .filter((paragraph) => paragraph.para > 0)
    .slice(-2);
  assert.equal(candidates.length, 2);

  const applied = session.apply([{
    commandId: 'delete-unused-paragraphs',
    op: 'text.deleteParagraphs',
    locations: candidates.map((paragraph) => paragraph.location ?? {
      paragraph: { section: paragraph.section, number: paragraph.para },
    }),
  }]);
  assert.equal(applied.results[0].paragraphCount, 2);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  assert.equal(reopened.sections[0].paragraphCount, before.sections[0].paragraphCount - 2);
  assert.equal(reopened.tables.length, before.tables.length);
  assert.equal(reopened.objectGraph.images.length, before.objectGraph.images.length);
  assert.notEqual(Buffer.compare(input, saved.bytes), 0);
});

test('HWPX API table.insertRows clones row geometry, clears new text, and reopens with stable table structure', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const table = before.tables.find((item) => item.dims.rowCount >= 3);
  assert.ok(table);
  const templateRow = table.dims.rowCount - 1;
  const templateCells = table.cells.filter((cell) => cell.row === templateRow);
  assert.ok(templateCells.length > 0);

  const applied = session.apply([{
    commandId: 'insert-review-rows',
    op: 'table.insertRows',
    target: table.cells[0].location,
    rowIndex: table.dims.rowCount,
    count: 2,
    templateRow,
  }]);
  assert.equal(applied.results[0].resultingRowCount, table.dims.rowCount + 2);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const reopenedTable = reopened.tables.find((item) => item.id === table.id);
  assert.equal(reopenedTable.dims.rowCount, table.dims.rowCount + 2);
  assert.equal(reopenedTable.cells.length, table.cells.length + templateCells.length * 2);
  for (const row of [table.dims.rowCount, table.dims.rowCount + 1]) {
    const insertedCells = reopenedTable.cells.filter((cell) => cell.row === row);
    assert.equal(insertedCells.length, templateCells.length);
    assert.ok(insertedCells.every((cell) => cell.text === ''));
  }
  assert.equal(reopened.objectGraph.images.length, before.objectGraph.images.length);
});

test('HWPX API table.insertRows can extend merged cells ending at the insertion boundary', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH));
  const table = session.readJson().tables.find((item) => (
    item.dims.rowCount === 2 && item.cells.some((cell) => cell.row === 0 && cell.rowSpan === 2)
  ));
  assert.ok(table);
  const spanningCell = table.cells.find((cell) => cell.row === 0 && cell.rowSpan === 2);
  session.apply([{
    op: 'table.insertRows',
    target: table.cells[0].location,
    rowIndex: 2,
    count: 1,
    templateRow: 1,
    extendBoundarySpans: true,
  }]);
  const reopened = new HwpxApiSession(session.save().bytes).readJson();
  const reopenedTable = reopened.tables.find((item) => item.id === table.id);
  assert.equal(reopenedTable.dims.rowCount, 3);
  assert.equal(
    reopenedTable.cells.find((cell) => cell.cellIndex === spanningCell.cellIndex).rowSpan,
    3,
  );
});

test('HWPX API table.setSize updates package table geometry and reopens', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.readJson().tables[0];
  session.apply([{
    op: 'table.setSize',
    target: table.cells[0].location,
    height: 54321,
  }]);
  const saved = session.save();
  const sectionXml = readZip(saved.bytes).get('Contents/section0.xml').toString('utf8');
  assert.match(sectionXml, /<hp:tbl\b[\s\S]*?<hp:sz\b[^>]*height="54321"/);
  assert.doesNotThrow(() => new HwpxApiSession(saved.bytes));
});

test('HWPX API table.setCellSize updates only inspected cell geometry and reopens', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const table = session.readJson().tables[0];
  const target = table.cells[1];
  const originalText = target.text;
  session.apply([{
    op: 'table.setCellSize',
    target: target.location,
    width: 12345,
    height: 6789,
  }]);
  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const resized = reopened.tables[0].cells[1];
  assert.equal(resized.style.cell.width, 12345);
  assert.equal(resized.style.cell.height, 6789);
  assert.equal(resized.text, originalText);
});

test('HWPX API table.autoFit grows a written multi-paragraph row and verifies it after reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const table = session.readJson().tables.find((item) => item.dims.rowCount > 2);
  const target = table.cells.find((cell) => cell.row > 1 && Number(cell.style.cell.width) > 20_000);
  const originalHeight = Number(target.style.cell.height);
  const text = [
    'First evidence-backed statement for the completed report.',
    'Second paragraph with enough content to require another rendered line.',
    'Third paragraph verifies that the table row expands instead of clipping.',
  ].join('\n');

  const result = session.commandsBatch([
    { op: 'table.writeCell', location: target.location, text },
    { op: 'table.autoFit', target: target.location, extraPadding: 200 },
  ]);
  const autoFit = result.results[1];
  assert.ok(autoFit.expectedCellHeight > originalHeight);

  const reopened = new HwpxApiSession(session.save().bytes);
  const reopenedCell = reopened.readJson().tables.find((item) => item.id === table.id)
    .cells.find((cell) => cell.cellIndex === target.cellIndex);
  assert.equal(reopenedCell.text, text);
  assert.ok(Number(reopenedCell.style.cell.height) >= autoFit.expectedCellHeight);
  const capacityIssue = reopened.qualityCheck().issues.find((issue) => issue.code === 'cell-content-clipped'
    && issue.location?.cell?.number === target.cellIndex);
  if (capacityIssue) assert.equal(capacityIssue.severity, 'warning');
  for (let pageIndex = 0; pageIndex < reopened.doc.pageCount(); pageIndex += 1) {
    assert.equal(
      analyzeSvgCellClipping(reopened.doc.renderPageSvg(pageIndex)).issues.length,
      0,
      `page ${pageIndex + 1} must contain no rendered table-cell clipping`,
    );
  }
});

test('HWPX API table.autoFit rejects an atomic batch that exceeds its pagination budget', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(ESG_FIXTURE_PATH));
  const before = session.readJson();
  const target = before.tables.find((table) => table.dims.rowCount > 2).cells[0];

  assert.throws(() => session.commandsBatch([
    { op: 'table.setSize', target: target.location, height: 100_000 },
    {
      op: 'table.autoFit',
      target: target.location,
      maxPageGrowth: 0,
      maxBlankPageGrowth: 0,
      maxLowOccupancyGrowth: 99,
    },
  ]), (error) => {
    assert.equal(error.code, 'HWPX_AUTOFIT_PAGINATION_REGRESSION');
    assert.equal(error.details.delta.pageGrowth, 1);
    assert.equal(error.details.budget.maxPageGrowth, 0);
    return true;
  });
  assert.equal(session.revision, 1);
  assert.equal(session.readJson().pageCount, before.pageCount);
});

test('HWPX API deleteTable permits only the explicitly targeted table subtree and enforces template intent', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const baseline = session.readJson();
  const table = baseline.tables[0];

  const result = session.commandsBatch([{
    op: 'table.structure',
    target: table.cells[0].location,
    action: 'deleteTable',
  }]);
  assert.equal(session.revision, 2);
  assert.equal(session.readJson().tables.length, baseline.tables.length - 1);
  assert.equal(session.readJson().pageCount, baseline.pageCount);
  assert.ok(result.qualification.stages.some(stage =>
    stage.intentionalObjectReferenceLosses?.some(item => item.kind === 'tbl' && item.lost === 1)));

  const required = session.qualityCheck({
    baselineJson: baseline,
    templatePolicy: { requiredTableIds: [table.id] },
    deletedTableIds: [table.id],
  });
  assert.equal(required.ok, false);
  assert.ok(required.issues.some(issue =>
    issue.code === 'required-table-missing' && issue.tableId === table.id));

  const removable = session.qualityCheck({
    baselineJson: baseline,
    templatePolicy: { removableTableIds: [table.id] },
    deletedTableIds: [table.id],
  });
  assert.equal(removable.issues.some(issue =>
    ['required-table-missing', 'unclassified-table-missing'].includes(issue.code)
      && issue.tableId === table.id), false);

  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(reopened.readJson().tables.length, baseline.tables.length - 1);
  const deletedText = table.cells.map(cell => cell.text).join('\u241f');
  assert.equal(reopened.readJson().tables.some(item =>
    item.cells.map(cell => cell.text).join('\u241f') === deletedText), false);
  for (let pageIndex = 0; pageIndex < reopened.doc.pageCount(); pageIndex += 1) {
    assert.match(reopened.doc.renderPageSvg(pageIndex), /<svg\b/);
  }
});

test('HWPX API table.setSize composes outer and nested table edits in one batch', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(NESTED_TABLE_FIXTURE_PATH));
  const tables = session.readJson().tables;
  const nested = tables.find((table) => table.id.startsWith('xtbl_'));
  const outer = tables.find((table) => !table.id.startsWith('xtbl_') && table.para === nested?.para);
  assert.ok(nested, 'nested package table fixture is required');
  assert.ok(outer, 'outer table containing nested fixture is required');

  session.apply([
    { op: 'table.setSize', target: outer.cells[0].location, height: 54321 },
    { op: 'table.setSize', target: nested.cells[0].location, height: 65432 },
  ]);
  const saved = session.save();
  const sectionXml = readZip(saved.bytes).get('Contents/section0.xml').toString('utf8');
  assert.match(sectionXml, /<hp:sz\b[^>]*height="54321"/);
  assert.match(sectionXml, /<hp:sz\b[^>]*height="65432"/);
  assert.doesNotThrow(() => new HwpxApiSession(saved.bytes));
});

test('HWPX API location-changing commands reject mixed batches before mutation', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const before = session.readJson();
  const paragraph = before.sections[0].paragraphs[1];
  assert.throws(
    () => session.apply([
      {
        op: 'text.deleteParagraphs',
        locations: [{ paragraph: { section: 0, number: paragraph.para } }],
      },
      {
        op: 'text.replaceParagraph',
        location: { paragraph: { section: 0, number: 0 } },
        text: 'unchanged because the batch is rejected',
      },
    ]),
    (error) => error?.code === 'HWPX_LOCATION_CHANGING_BATCH_UNSUPPORTED',
  );
  assert.equal(Buffer.compare(input, session.save().bytes), 0);
});

test('HWPX API table.writeCell can clone source cell text style through save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);
  const sourceStyle = session.styleFingerprint({ tableId: table.id, cell: { number: 1 } }).basis.text;

  session.apply([
    {
      commandId: 'rich-cell',
      op: 'table.writeCell',
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
      target: { tableId: table.id, cell: { number: 3 } },
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
      target: { tableId: table.id, cell: { number: 3 } },
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

test('HWPX API style.applyText can clone top-level paragraph style ids without replacing text', async () => {
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
      op: 'style.applyText',
      target,
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

test('HWPX API image.insertAfterParagraph uses the package-preserving path and retains source objects', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const before = session.objectInventory();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  session.commandsBatch([{
    op: 'image.insertAfterParagraph',
    target: { paragraph: { section: 0, number: 0 } },
    bytesBase64: png.toString('base64'),
    mimeType: 'image/png',
    caption: '그림 1. 검증 이미지',
  }]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes);
  const after = reopened.objectInventory();
  assert.ok(after.images.length >= before.images.length + 1);
  assert.ok(after.pictures.length >= before.pictures.length + 1);
  assert.ok(reopened.readJson().sections[0].paragraphs.some(paragraph => (
    paragraph.text.includes('그림 1. 검증 이미지')
  )));
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
  assert.ok(Math.abs(finalCard?.y - beforeFinalCard?.y) <= 0.11);
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

test('HWPX API image.cloneToCell clones an inventoried picture into an inspected cell', async () => {
  await initHwpxRuntime();
  const input = readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const beforePictures = session.objectInventory().pictures;
  const target = session.readJson().tables[0].cells[0];
  const beforeText = target.text;
  session.apply([{
    op: 'image.cloneToCell',
    target: target.location,
    sourcePictureId: beforePictures[0].id,
    targetParagraphIndex: 0,
    width: 2400,
    height: 2400,
    vertOffset: 100,
    horzOffset: 200,
  }]);
  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes);
  assert.equal(reopened.objectInventory().pictures.length, beforePictures.length + 1);
  assert.equal(reopened.inspectTarget(target.location).currentText, beforeText);
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
      bytesBase64: imageBytes.toString('base64'),
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

test('HWPX API accepts exact canonical table commands and parameters', async () => {
  await initHwpxRuntime();
  const input = readFileSync(ESG_FIXTURE_PATH);
  const session = new HwpxApiSession(input);
  const table = session.findTable((item) => item.dims.rowCount === 9 && item.dims.colCount === 5);

  session.apply([
    {
      commandId: 'receipt',
      op: 'table.writeCell',
      location: { tableId: table.id, cell: { number: 1 } },
      text: 'ESG-NEW-001',
    },
    {
      commandId: 'department-batch',
      op: 'table.writeCells',
      tableId: table.id,
      cells: [
        { cell: { number: 3 }, text: 'AI office' },
        { cell: { number: 5 }, text: 'owner' },
      ],
    },
  ]);

  const saved = session.save();
  const reopened = new HwpxApiSession(saved.bytes).readJson();
  const reopenedTable = reopened.tables.find((item) => item.id === table.id);
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 1).text, 'ESG-NEW-001');
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 3).text, 'AI office');
  assert.equal(reopenedTable.cells.find((cell) => cell.cellIndex === 5).text, 'owner');
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
      commandId: 'canonical-insert',
      op: 'insertText',
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
  assert.equal(result.results[0].opId, 'canonical-insert');
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
  const created = session.commandsBatch([
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
  ]);
  const tableTarget = created.results[0].target;
  const result = session.commandsBatch([
    {
      commandId: 'actual-cell-style',
      op: 'applyStyle',
      target: {
        ...tableTarget,
        cellIndex: 0,
        cellParagraphIndex: 0,
      },
      styleId: 0,
    },
  ]);

  assert.equal(result.qualification.ok, true);
  assert.equal(created.results[0].target.kind, 'table');
  assert.equal(result.results[0].target.kind, 'cell');
  const reopened = new HwpxApiSession(session.save().bytes);
  const table = reopened.readJson().tables.find(item =>
    item.dims.rowCount === 2 && item.dims.colCount === 2);
  assert.ok(table);
  assert.deepEqual(table.cells.map(cell => cell.text), ['A', 'B', 'C', 'D']);
});

test('HWPX API table.structure splits and reattaches a table through native UI-equivalent methods', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  const table = session.commandsBatch([{
    op: 'table.create', target: { paragraph: { section: 0, number: 0 } },
    rows: 4, columns: 2, cellTexts: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  }]).results[0].target;
  const tableTarget = { tableId: session.readJson().tables[0].id, cell: { number: 0 } };
  const split = session.commandsBatch([{
    op: 'table.structure', target: tableTarget, action: 'splitTable', atRow: 2,
  }]).results[0];
  assert.equal(split.expectedTableDimensions.rowCount, 2);
  assert.equal(split.expectedCreatedTableDimensions.rowCount, 2);
  const splitReopened = new HwpxApiSession(session.save().bytes);
  assert.equal(splitReopened.readJson().tables.length, 2);
  const attachTarget = { tableId: splitReopened.readJson().tables[0].id, cell: { number: 0 } };
  session.commandsBatch([{
    op: 'table.structure', target: attachTarget, action: 'attachNextTable',
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const restored = reopened.readJson().tables;
  assert.equal(restored.length, 1);
  assert.equal(restored[0].dims.rowCount, 4);
  assert.deepEqual(restored[0].cells.map(cell => cell.text), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
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
  const captionTarget = result.results[0].target;
  const properties = JSON.parse(reopened.doc.getTableProperties(
    captionTarget.sectionIndex,
    captionTarget.paragraphIndex,
    captionTarget.controlIndex,
  ));
  assert.equal(properties.hasCaption, true);
  const captionLength = reopened.doc.getCellParagraphLength(
    captionTarget.sectionIndex,
    captionTarget.paragraphIndex,
    captionTarget.controlIndex,
    65534,
    0,
  );
  assert.equal(
    reopened.doc.getTextInCell(
      captionTarget.sectionIndex,
      captionTarget.paragraphIndex,
      captionTarget.controlIndex,
      65534,
      0,
      0,
      captionLength,
    ),
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
  const captionTarget = result.results[0].createdTargets.find(target => target.kind === 'tableCaption');
  assert.ok(captionTarget);
  const properties = JSON.parse(reopened.doc.getTableProperties(
    captionTarget.sectionIndex,
    captionTarget.paragraphIndex,
    captionTarget.controlIndex,
  ));
  assert.equal(properties.hasCaption, true);
  const captionLength = reopened.doc.getCellParagraphLength(
    captionTarget.sectionIndex,
    captionTarget.paragraphIndex,
    captionTarget.controlIndex,
    65534,
    0,
  );
  assert.equal(reopened.doc.getTextInCell(
    captionTarget.sectionIndex,
    captionTarget.paragraphIndex,
    captionTarget.controlIndex,
    65534,
    0,
    0,
    captionLength,
  ), 'CAP');
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
  const metadata = readHwpxDocumentMetadata(reopened.inputBytes);
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

test('HWPX header/footer page and total-page fields survive source-built save and reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  const result = session.commandsBatch([{
    op: 'setHeaderFooter',
    target: { sectionIndex: 0 },
    type: 'footer',
    applyTo: 'both',
    align: 'center',
    text: 'Page  of ',
    fields: [
      { type: 'pageNumber', charOffset: 5 },
      { type: 'totalPages', charOffset: 9 },
    ],
  }]);

  const before = JSON.parse(session.doc.getHeaderFooter(0, false, 0));
  assert.deepEqual(before.dynamicFields.map(field => field.type), ['pageNumber', 'totalPages']);
  const reopened = new HwpxApiSession(session.save().bytes);
  const after = JSON.parse(reopened.doc.getHeaderFooter(0, false, 0));
  assert.deepEqual(after.dynamicFields.map(field => field.type), ['pageNumber', 'totalPages']);
  assert.match(after.text, /^Page\s+of\s+$/);
  assert.equal(result.results[0].expectedHeaderFooterText, undefined);
});

test('HWPX header/footer file-name fields and native templates survive source-built save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');

  const fileNameSession = new HwpxApiSession(input);
  fileNameSession.commandsBatch([{
    op: 'setHeaderFooter',
    target: { sectionIndex: 0 },
    type: 'header',
    text: 'File: ',
    fields: [{ type: 'fileName', charOffset: 6 }],
  }]);
  const fileNameHeader = JSON.parse(fileNameSession.doc.getHeaderFooter(0, true, 0));
  assert.deepEqual(fileNameHeader.dynamicFields, [{ type: 'fileName', paraIndex: 0, charOffset: 6 }]);

  for (const templateId of [1, 4, 5, 10]) {
    const session = new HwpxApiSession(input);
    const result = session.commandsBatch([{
      op: 'setHeaderFooter',
      target: { sectionIndex: 0 },
      type: 'header',
      templateId,
    }]);
    const expected = result.results[0].expectedHeaderFooterFields.map(({ type }) => type);
    const header = JSON.parse(session.doc.getHeaderFooter(0, true, 0));
    assert.deepEqual(header.dynamicFields.map(({ type }) => type), expected);
  }
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

test('HWPX API note.manage replaces multiline note text and formats a note paragraph through native controls', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  session.commandsBatch([{
    op: 'insertText', target: { native: { section: 0, para: 0, offset: 0, length: 0 } }, text: 'Evidence',
  }]);
  const note = session.commandsBatch([{
    op: 'note.insert', target: { native: { section: 0, para: 0, offset: 3, length: 0 } }, kind: 'footnote', text: 'Initial body',
  }]).results[0].target;
  const replacement = 'Revised evidence body\nSecond evidence paragraph';
  const replace = session.commandsBatch([{
    op: 'note.manage', action: 'replaceText', target: { native: { section: note.sectionIndex, para: note.paragraphIndex, control: note.controlIndex } }, text: replacement,
  }]).results[0];
  assert.equal(replace.expectedNoteText, replacement);
  const formatted = session.commandsBatch([{
    op: 'note.manage', action: 'formatParagraph', target: { native: { section: note.sectionIndex, para: note.paragraphIndex, control: note.controlIndex } }, paragraphIndex: 1, properties: { alignment: 'center' },
  }]).results[0];
  assert.equal(formatted.expectedFormat.properties.alignment, 'center');
  const reopened = new HwpxApiSession(session.save().bytes);
  const info = JSON.parse(reopened.doc.getFootnoteInfo(note.sectionIndex, note.paragraphIndex, note.controlIndex));
  assert.deepEqual([info.texts[0].slice(2), info.texts[1]], replacement.split('\n'));
  const notePara = JSON.parse(reopened.doc.getParaPropertiesInFootnote(note.sectionIndex, note.paragraphIndex, note.controlIndex, 1));
  assert.equal(notePara.alignment, 'center');
});

test('HWPX API field.insert and endnote insertion survive source-built save and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx');
  const session = new HwpxApiSession(input);
  const field = session.commandsBatch([{
    op: 'field.insert',
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
    guide: 'Applicant name', name: 'applicant_name', editable: true,
  }]).results[0];
  const fields = JSON.parse(session.doc.getFieldList());
  assert.equal(fields.find(item => item.fieldId === field.target.fieldId)?.name, 'applicant_name');
  const updated = session.commandsBatch([{
    op: 'field.manage', action: 'update', fieldId: field.target.fieldId,
    guide: 'Applicant legal name', memo: 'Use the registered company name', name: 'legal_applicant_name', editable: false,
  }]).results[0];
  assert.equal(updated.expectedField.name, 'legal_applicant_name');
  const reopenedAfterUpdate = new HwpxApiSession(session.save().bytes);
  const persistedField = JSON.parse(reopenedAfterUpdate.doc.getFieldList())
    .find(item => item.fieldId === field.target.fieldId);
  assert.deepEqual({
    name: persistedField?.name,
    guide: persistedField?.guide,
    memo: persistedField?.memo,
    editableInForm: persistedField?.editableInForm,
  }, {
    name: 'legal_applicant_name',
    guide: 'Applicant legal name',
    memo: 'Use the registered company name',
    editableInForm: false,
  });
  const guideOnlyUpdate = session.commandsBatch([{
    op: 'field.manage', action: 'update', fieldId: field.target.fieldId,
    guide: 'Applicant legal name (revised)',
  }]).results[0];
  assert.equal(guideOnlyUpdate.expectedField.memo, 'Use the registered company name');
  const deletedField = session.commandsBatch([{
    op: 'field.manage', action: 'delete', fieldId: field.target.fieldId,
  }]).results[0];
  assert.equal(deletedField.target.kind, 'deletedField');
  const endnote = session.commandsBatch([{
    op: 'note.insert',
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
    kind: 'endnote', text: 'Endnote evidence body',
  }]).results[0];
  assert.equal(endnote.target.kind, 'note');
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(JSON.parse(reopened.doc.getFieldList()).some(item => item.fieldId === field.target.fieldId), false);
  const note = JSON.parse(reopened.doc.getFootnoteInfo(
    endnote.target.sectionIndex, endnote.target.paragraphIndex, endnote.target.controlIndex,
  ));
  assert.equal(note.texts[0].slice(2), endnote.expectedNoteText);
});

test('HWPX API field.manage updates nested table-cell ClickHere fields without erasing memo', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  session.commandsBatch([{
    op: 'table.create', target: { paragraph: { section: 0, number: 0 } },
    rows: 1, columns: 1, cellTexts: ['Cell'],
  }]);
  const table = session.readJson().tables[0];
  const field = session.commandsBatch([{
    op: 'field.insert',
    target: { tableId: table.id, cell: { number: 0 }, cellParagraphIndex: 0, offset: 0 },
    guide: 'Cell guide', memo: 'Cell memo', name: 'cell_name', editable: true,
  }]).results[0];
  const updated = session.commandsBatch([{
    op: 'field.manage', action: 'update', fieldId: field.target.fieldId,
    guide: 'Cell guide revised',
  }]).results[0];
  assert.equal(updated.expectedField.memo, 'Cell memo');
  const reopened = new HwpxApiSession(session.save().bytes);
  const persisted = JSON.parse(reopened.doc.getFieldList()).find(item => item.fieldId === field.target.fieldId);
  assert.deepEqual({ guide: persisted?.guide, memo: persisted?.memo, name: persisted?.name }, {
    guide: 'Cell guide revised', memo: 'Cell memo', name: 'cell_name',
  });
});

test('HWPX API bookmark create, rename, and delete qualify each saved revision', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  session.commandsBatch([{
    op: 'bookmark.manage', action: 'create', name: 'audit_start',
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
  }]);
  let bookmark = JSON.parse(session.doc.getBookmarks())[0];
  assert.equal(bookmark.name, 'audit_start');
  session.commandsBatch([{
    op: 'bookmark.manage', action: 'rename', newName: 'audit_renamed',
    target: { native: { section: 0, para: 0, control: bookmark.ctrlIdx } },
  }]);
  bookmark = JSON.parse(session.doc.getBookmarks())[0];
  assert.equal(bookmark.name, 'audit_renamed');
  const deleted = session.commandsBatch([{
    op: 'bookmark.manage', action: 'delete',
    target: { native: { section: 0, para: 0, control: bookmark.ctrlIdx } },
  }]).results[0];
  assert.equal(deleted.target.kind, 'deletedBookmark');
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.deepEqual(JSON.parse(reopened.doc.getBookmarks()), []);
});

test('HWPX API section.configure applies UI-equivalent border, columns, definitions, page hide, and page numbering', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  session.commandsBatch([{ op: 'section.configure', sectionIndex: 0, action: 'pageBorder', properties: { spacingLeft: 100, spacingRight: 200, spacingTop: 300, spacingBottom: 400 } }]);
  session.commandsBatch([{ op: 'section.configure', sectionIndex: 0, action: 'columns', properties: { count: 2, type: 'normal', sameWidth: true, spacing: 2268 } }]);
  session.commandsBatch([{ op: 'section.configure', sectionIndex: 0, action: 'properties', properties: { hideHeader: true, columnSpacing: 200 } }]);
  session.commandsBatch([{ op: 'section.configure', sectionIndex: 0, action: 'endnoteShape', properties: { startNumber: 4, suffixChar: ']', separatorEnabled: false, placement: 'sectionEnd' } }]);
  session.commandsBatch([{ op: 'section.configure', sectionIndex: 0, action: 'pageHide', paragraphIndex: 0, properties: { hideHeader: true, hideFooter: false, hideMasterPage: false, hideBorder: false, hideFill: false, hidePageNum: false } }]);
  const pageNumber = session.commandsBatch([{ op: 'section.configure', sectionIndex: 0, action: 'pageNumberStart', paragraphIndex: 0, offset: 0, startNumber: 3 }]).results[0];
  assert.equal(pageNumber.target.kind, 'newNumber');
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(JSON.parse(reopened.doc.getColumnDef(0)).columnCount, 2);
  assert.equal(JSON.parse(reopened.doc.getPageBorderFill(0)).spacingBottom, 400);
  assert.deepEqual(Object.fromEntries(['startNumber', 'suffixChar', 'separatorEnabled', 'placement'].map(field => [field, JSON.parse(reopened.doc.getEndnoteShape(0))[field]])), {
    startNumber: 4, suffixChar: ']', separatorEnabled: false, placement: 'sectionEnd',
  });
  assert.equal(JSON.parse(reopened.doc.getPageHide(0, 0)).hideHeader, true);
  assert.ok(JSON.parse(reopened.doc.getControls()).some(item => item.ctrlId === 'nwno'));
});

test('HWPX API object creation, exact text-box editing, equation formatting, arrangement, and deletion qualify', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  const textBox = session.commandsBatch([{
    op: 'object.create', kind: 'textBox', width: 18000, height: 9000, text: 'first',
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
  }]).results[0].target;
  session.commandsBatch([{
    op: 'object.manage', action: 'setText', kind: 'textBox', text: 'second\nthird',
    target: { native: { section: textBox.sectionIndex, para: textBox.paragraphIndex, control: textBox.controlIndex } },
  }]);
  const shape = session.commandsBatch([{
    op: 'object.create', kind: 'shape', shapeType: 'rectangle', width: 18000, height: 9000,
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
  }]).results[0].target;
  session.commandsBatch([{
    op: 'object.manage', action: 'arrange', kind: 'textBox', order: 'front',
    target: { native: { section: textBox.sectionIndex, para: textBox.paragraphIndex, control: textBox.controlIndex } },
  }]);
  const equation = session.commandsBatch([{
    op: 'object.create', kind: 'equation', script: 'x^2', fontSize: 1000, color: 0,
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
  }]).results[0].target;
  session.commandsBatch([{
    op: 'object.format', scope: 'equation', properties: { script: 'y^3', fontSize: 1200, color: 255 },
    target: { native: { section: equation.sectionIndex, para: equation.paragraphIndex, control: equation.controlIndex } },
  }]);
  const deleted = session.commandsBatch([{
    op: 'object.manage', action: 'delete', kind: 'equation',
    target: { native: { section: equation.sectionIndex, para: equation.paragraphIndex, control: equation.controlIndex } },
  }]).results[0];
  assert.equal(deleted.target.kind, 'deletedObject');
  const reopened = new HwpxApiSession(session.save().bytes);
  const objects = JSON.parse(reopened.doc.getObjects());
  assert.equal(objects.filter(item => item.kind === 'equation').length, 0);
  assert.equal(objects.filter(item => item.kind === 'shape').length, 2);
});

test('HWPX API groups and ungroups inspected shapes through the same native path as the editor UI', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  const first = session.commandsBatch([{
    op: 'object.create', kind: 'shape', shapeType: 'rectangle', width: 18000, height: 9000,
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
  }]).results[0].target;
  const second = session.commandsBatch([{
    op: 'object.create', kind: 'shape', shapeType: 'ellipse', width: 14000, height: 7000,
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
  }]).results[0].target;
  const group = session.commandsBatch([{
    op: 'object.manage', action: 'group', kind: 'object', targets: [
      { native: { section: first.sectionIndex, para: first.paragraphIndex, control: first.controlIndex } },
      { native: { section: second.sectionIndex, para: second.paragraphIndex, control: second.controlIndex } },
    ],
  }]).results[0];
  assert.equal(group.expectedObjectGroup.childCount, 2);
  assert.equal(JSON.parse(session.doc.getShapeProperties(
    group.target.sectionIndex, group.target.paragraphIndex, group.target.controlIndex,
  )).objectType, 'group');
  const ungroup = session.commandsBatch([{
    op: 'object.manage', action: 'ungroup', kind: 'object',
    target: { native: { section: group.target.sectionIndex, para: group.target.paragraphIndex, control: group.target.controlIndex } },
  }]).results[0];
  assert.equal(ungroup.expectedUngroupedChildCount, 2);
  const reopened = new HwpxApiSession(session.save().bytes);
  const objects = JSON.parse(reopened.doc.getObjects());
  assert.ok(objects.filter(item => item.para === 0).length >= 2);
});

test('HWPX API groups an inspected picture and shape through the native mixed-object path', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/test-image.hwpx'));
  const shape = session.commandsBatch([{
    op: 'object.create', kind: 'shape', shapeType: 'rectangle', width: 12000, height: 6000,
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
  }]).results[0].target;
  const group = session.commandsBatch([{
    op: 'object.manage', action: 'group', kind: 'object', targets: [
      { native: { section: 0, para: 0, control: 2 } },
      { native: { section: shape.sectionIndex, para: shape.paragraphIndex, control: shape.controlIndex } },
    ],
  }]).results[0].target;
  const grouped = JSON.parse(session.doc.getShapeProperties(group.sectionIndex, group.paragraphIndex, group.controlIndex));
  assert.deepEqual({ objectType: grouped.objectType, childCount: grouped.childCount }, { objectType: 'group', childCount: 2 });
  session.commandsBatch([{
    op: 'object.manage', action: 'ungroup', kind: 'object',
    target: { native: { section: group.sectionIndex, para: group.paragraphIndex, control: group.controlIndex } },
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.ok(JSON.parse(reopened.doc.getObjects()).some(item => item.kind === 'picture'));
});

test('HWPX API table.transform transpose, calculation, and equalization survive qualification and reopen', async () => {
  await initHwpxRuntime();
  const input = readFileSync('editor_hwpx/samples/hwpx/basic-table-01.hwpx');
  for (const command of [
    { action: 'transpose' },
    { action: 'calculate', row: 0, column: 0, formula: '=1+2', writeResult: true },
    { action: 'equalizeRowHeight' },
    { action: 'equalizeColumnWidth' },
  ]) {
    const session = new HwpxApiSession(input);
    const table = session.readJson().tables[0];
    const result = session.commandsBatch([{
      op: 'table.transform', target: { tableId: table.id, native: table.native }, ...command,
    }]).results[0];
    const reopened = new HwpxApiSession(session.save().bytes);
    assert.equal(reopened.qualityCheck().ok, true, command.action);
    if (command.action === 'calculate') assert.equal(result.expectedCellText, '3');
    if (command.action === 'transpose') {
      assert.equal(JSON.parse(reopened.doc.getTableDimensions(
        result.target.sectionIndex, result.target.paragraphIndex, result.target.controlIndex,
      )).rowCount, result.expectedTableDimensions.rowCount);
    }
  }
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

test('setRunStyle verifier treats equivalent hex color casing as exact', () => {
  const session = {
    doc: {
      getSectionCount: () => 1,
      getParagraphCount: () => 1,
      getCharPropertiesAt: () => JSON.stringify({ textColor: '#0000ff' }),
    },
  };

  assert.doesNotThrow(() => hwpxApiUtils.verifyStructuralTarget(
    session,
    { kind: 'paragraph', sectionIndex: 0, paragraphIndex: 0 },
    {
      expectedRunStyle: { textColor: '#0000FF' },
      expectedRunRange: { start: 0, end: 2 },
    },
  ));
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

test('format.apply character and paragraph properties survive HWPX save and reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  session.commandsBatch([{
    op: 'insertText',
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
    text: 'FORMAT',
  }]);
  session.commandsBatch([{
    op: 'format.apply',
    scope: 'character',
    target: { native: { section: 0, para: 0, offset: 0, length: 6 } },
    properties: {
      bold: true, italic: true, fontSizePt: 12.5, color: '#123456',
      ratios: [100, 100, 100, 100, 100, 100, 100],
    },
  }]);
  session.commandsBatch([{
    op: 'format.apply',
    scope: 'paragraph',
    target: { paragraph: { section: 0, number: 0 } },
    properties: {
      alignment: 'center', lineSpacingType: 'Percent', lineSpacing: 175,
      indent: 500, marginLeft: 700, spacingBefore: 225, spacingAfter: 300,
    },
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const character = JSON.parse(reopened.doc.getCharPropertiesAt(0, 0, 2));
  const paragraph = JSON.parse(reopened.doc.getParaPropertiesAt(0, 0));
  assert.equal(character.bold, true);
  assert.equal(character.italic, true);
  assert.equal(character.fontSize, 1250);
  assert.deepEqual(character.ratios, [100, 100, 100, 100, 100, 100, 100]);
  assert.equal(paragraph.alignment, 'center');
  assert.equal(paragraph.lineSpacing, 175);
});

test('format.apply source-gates paragraph flags that HWPX cannot preserve', async () => {
  await initHwpxRuntime();
  const hwpx = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  assert.throws(
    () => hwpx.commandsBatch([{
      op: 'format.apply', scope: 'paragraph',
      target: { paragraph: { section: 0, number: 0 } },
      properties: { keepWithNext: true, keepLines: true },
    }]),
    error => error?.code === 'HWPX_FORMAT_PROPERTY_REQUIRES_HWP_SOURCE',
  );
  const hwp = new HwpxApiSession(readFileSync('editor_hwpx/samples/re-align-left-hancom.hwp'));
  const paragraph = hwp.readJson().sections[0].paragraphs.find(item => item.text.length > 0);
  hwp.commandsBatch([{
    op: 'format.apply', scope: 'paragraph',
    target: { paragraph: { section: 0, number: paragraph.para } },
    properties: { keepWithNext: true, keepLines: true, pageBreakBefore: true },
  }]);
  const reopened = new HwpxApiSession(hwp.save().bytes);
  const properties = JSON.parse(reopened.doc.getParaPropertiesAt(0, paragraph.para));
  assert.equal(properties.keepWithNext, true);
  assert.equal(properties.keepLines, true);
  assert.equal(properties.pageBreakBefore, true);
});

test('format.apply table and cell properties survive binary HWP save and reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/table-001.hwp'));
  const table = session.readJson().tables[0];
  const native = table.native;
  const tableTarget = { tableId: table.id, native };
  const cellTarget = { tableId: table.id, cell: { number: 0 }, native: table.cells[0].native };
  session.commandsBatch([{
    op: 'format.apply', scope: 'table', target: tableTarget,
    properties: { cellSpacing: 120, paddingLeft: 140, paddingRight: 160, repeatHeader: true },
  }]);
  session.commandsBatch([{
    op: 'format.apply', scope: 'cell', target: cellTarget,
    properties: { paddingLeft: 210, paddingRight: 220, paddingTop: 230, paddingBottom: 240, verticalAlign: 'center', isHeader: true },
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const tableProps = JSON.parse(reopened.doc.getTableProperties(native.section, native.paragraph, native.control));
  const cellProps = JSON.parse(reopened.doc.getCellProperties(native.section, native.paragraph, native.control, 0));
  assert.equal(tableProps.cellSpacing, 120);
  assert.equal(tableProps.repeatHeader, true);
  assert.equal(cellProps.paddingLeft, 210);
  assert.equal(cellProps.verticalAlign, 1);
  assert.equal(cellProps.isHeader, true);
});

test('object.format image positioning and padding survive HWPX reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/test-image.hwpx'));
  session.commandsBatch([{
    op: 'object.format', scope: 'image',
    target: { native: { section: 0, para: 0, control: 2 } },
    properties: { treatAsChar: true, width: 15000, height: 12000, paddingBottom: 300 },
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  const properties = JSON.parse(reopened.doc.getPictureProperties(0, 0, 2));
  assert.equal(properties.treatAsChar, true);
  assert.equal(properties.width, 15000);
  assert.equal(properties.height, 12000);
  assert.equal(properties.paddingBottom, 300);
});

test('image.cloneToCell survives reopen in the exact destination cell', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync(PUBLIC_BRIEFING_FIXTURE_PATH));
  const before = session.readJson();
  const sourcePictureId = before.objectGraph.pictures[0].id;
  const destination = before.tables.flatMap((table) => table.cells)
    .find((cell) => Number(cell.pictureCount || 0) === 0);
  assert.ok(sourcePictureId);
  assert.ok(destination);
  const applied = session.commandsBatch([{
    commandId: 'clone-picture-reopen-proof',
    op: 'image.cloneToCell',
    target: destination.location,
    sourcePictureId,
    targetParagraphIndex: 0,
  }]);
  assert.equal(applied.results[0].expectedPictureCount, 1);
  const reopened = new HwpxApiSession(session.save().bytes).readJson();
  const reopenedCell = reopened.tables.flatMap((table) => table.cells)
    .find((cell) => cell.id === destination.id);
  assert.equal(reopenedCell.pictureCount, 1);
  assert.ok(reopenedCell.allowedActions.includes('image.replaceInCell'));
});

test('table.structure inserts and deletes a native HWP column with reopen proof', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/table-001.hwp'));
  const table = session.readJson().tables[0];
  const target = { tableId: table.id, native: table.native };
  const before = JSON.parse(session.doc.getTableDimensions(table.native.section, table.native.paragraph, table.native.control));
  session.commandsBatch([{ op: 'table.structure', target, action: 'insertColumn', column: 0, side: 'after' }]);
  const inserted = new HwpxApiSession(session.save().bytes);
  const afterInsert = JSON.parse(inserted.doc.getTableDimensions(table.native.section, table.native.paragraph, table.native.control));
  assert.equal(afterInsert.colCount, before.colCount + 1);
  inserted.commandsBatch([{ op: 'table.structure', target, action: 'deleteColumn', column: 1 }]);
  const reopened = new HwpxApiSession(inserted.save().bytes);
  const afterDelete = JSON.parse(reopened.doc.getTableDimensions(table.native.section, table.native.paragraph, table.native.control));
  assert.equal(afterDelete.colCount, before.colCount);
});

test('paragraph.structure survives HWPX reopen', async () => {
  await initHwpxRuntime();
  const session = new HwpxApiSession(readFileSync('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'));
  session.commandsBatch([{
    op: 'insertText', target: { native: { section: 0, para: 0, offset: 0, length: 0 } }, text: 'ABCDEF',
  }]);
  session.commandsBatch([{
    op: 'paragraph.structure', action: 'split',
    target: { native: { section: 0, para: 0, offset: 3, length: 0 } }, offset: 3,
  }]);
  const reopened = new HwpxApiSession(session.save().bytes);
  assert.equal(reopened.doc.getParagraphCount(0), 2);
  assert.equal(reopened.inspectTarget({ paragraph: { section: 0, number: 0 } }).currentText, 'ABC');
  assert.equal(reopened.inspectTarget({ paragraph: { section: 0, number: 1 } }).currentText, 'DEF');
});
