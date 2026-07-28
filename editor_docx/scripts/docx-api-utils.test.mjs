import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  DocxApiSession,
  applyDocxCommand,
  createDocxBytes,
  createZip,
  generatePngBytes,
  getDocumentXml,
  getDocumentVisibleText,
  getZipText,
  readZip,
  resolveDocxTextTarget,
} from './docx-api-utils.mjs';

function createMixedOrientationDocx() {
  const entries = readZip(createDocxBytes({ paragraphs: ['placeholder'] }));
  entries.set('word/document.xml', Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`
    + `<w:p><w:pPr><w:sectPr w:rsidR="00000001"><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr><w:r><w:t>Portrait section</w:t></w:r></w:p>`
    + `<w:p><w:pPr><w:sectPr w:rsidR="00000002"><w:type w:val="nextPage"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="900" w:right="800" w:bottom="900" w:left="800" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:pPr><w:r><w:t>Landscape section</w:t></w:r></w:p>`
    + `<w:p><w:r><w:t>Final portrait section</w:t></w:r></w:p>`
    + `<w:sectPr w:rsidR="00000003"><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr>`
    + `</w:body></w:document>`,
    'utf8',
  ));
  return createZip(entries);
}

const customSectionRatioFixture = path.resolve(
  import.meta.dirname,
  '..',
  'engine',
  'sw',
  'qa',
  'extras',
  'ooxmlexport',
  'data',
  'tdf149313.docx',
);

const mixedPageStyleFixture = path.resolve(
  import.meta.dirname,
  '..',
  'engine',
  'sw',
  'qa',
  'extras',
  'ooxmlexport',
  'data',
  'tdf95033.docx',
);

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

function createCapacityRiskDocx(text, width = 800) {
  return createDocxBytes({
    paragraphs: ['Capacity risk fixture'],
    tables: [{
      rows: [[{ text, cellStyle: { width } }]],
    }],
  });
}

function createMixedRunParagraphDocx() {
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['placeholder'] }));
  const mixedParagraph = '<w:p><w:pPr><w:jc w:val="left"/></w:pPr>'
    + '<w:r><w:rPr><w:b/></w:rPr><w:t>Bold lead sentence.</w:t></w:r>'
    + '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve"> Normal remainder.</w:t></w:r></w:p>';
  session.documentXml = session.documentXml.replace(/<w:p>[\s\S]*?<\/w:p>/, mixedParagraph);
  session.dirtyDocument = true;
  return session.save().bytes;
}

function createUniformMultiRunParagraphDocx() {
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['placeholder'] }));
  const uniformParagraph = '<w:p><w:pPr><w:jc w:val="left"/></w:pPr>'
    + '<w:r><w:rPr/><w:t>Template text split </w:t></w:r>'
    + '<w:r><w:rPr><w:rFonts w:hint="eastAsia"/></w:rPr><w:t>across runs.</w:t></w:r></w:p>';
  session.documentXml = session.documentXml.replace(/<w:p>[\s\S]*?<\/w:p>/, uniformParagraph);
  session.dirtyDocument = true;
  return session.save().bytes;
}

function createBookmarkedParagraphDocx() {
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['Bookmarked title'] }));
  session.documentXml = session.documentXml.replace(
    /(<w:p>)([\s\S]*?)(<\/w:p>)/,
    '$1<w:bookmarkStart w:id="7" w:name="_ContractBookmark"/>$2<w:bookmarkEnd w:id="7"/>$3',
  );
  session.dirtyDocument = true;
  return session.save().bytes;
}

test('DOCX API preserve save returns original bytes when no commands run', () => {
  const input = readFileSync('editor_docx/test/data/template.docx');
  const session = new DocxApiSession(input);
  const saved = session.save();
  assert.equal(Buffer.compare(input, saved.bytes), 0);
  assert.equal(saved.validation.sourceFormat, 'docx');
});

test('DOCX API serializes empty authored paragraphs without corrupting following visible text', () => {
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['Start'] }));
  session.apply([
    { op: 'appendParagraph', text: '' },
    { op: 'appendParagraph', text: 'After empty paragraph' },
  ]);

  const reopened = new DocxApiSession(session.save().bytes);
  assert.deepEqual(
    reopened.readJson().blocks.map((block) => block.text),
    ['Start', '', 'After empty paragraph'],
  );
  assert.equal(getDocumentVisibleText(session.save().bytes), 'StartAfter empty paragraph');
});

test('DOCX API read/target/object APIs expose editable guidance', () => {
  const session = new DocxApiSession(createStyledDocx());
  const json = session.readJson();
  const table = json.tables[0];
  assert.equal(json.pageCount, json.pageCountEstimate);
  assert.equal(json.pageCountSource, 'paragraph-heuristic');
  assert.equal(json.pageCountIsEstimate, true);
  assert.equal(json.layoutGraph.pageCountIsEstimate, true);
  assert.ok(json.editableTargets.paragraphs.length >= 2);
  assert.equal(table.dims.cellCount, 4);
  assert.ok(session.targetMap().cells.length >= 4);
  assert.equal(session.inspectTarget({ tableId: table.id, cell: { number: 0 } }).kind, 'cell');
  assert.equal(session.objectInventory().images[0].name, 'word/media/image1.png');
  assert.equal(session.objectInventory().pictures[0].relationshipId, 'rIdImage1');
  assert.ok(session.qualityCheck().ok);
});

test('DOCX references keep a stable occurrence through insert, save, reopen, nearby edit, and exact removal', () => {
  const occurrenceId = '01K123456789ABCDEFGHJKMNPQ';
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['Evidence supports the claim.'] }));
  session.apply([{
    op: 'reference.insert',
    target: { range: { start: { nodeId: 'p_0', offset: 27 } } },
    occurrenceId,
    displayText: '[1]',
    tooltip: 'Lee (2026). Stable citations.',
  }]);

  const inserted = session.readJson();
  assert.equal(inserted.references.length, 1);
  assert.equal(inserted.references[0].occurrenceId, occurrenceId);
  assert.equal(inserted.references[0].displayText, '[1]');
  assert.equal(inserted.references[0].tooltip, 'Lee (2026). Stable citations.');
  assert.equal(inserted.blocks[0].text, 'Evidence supports the claim[1].');

  const reopened = new DocxApiSession(session.save().bytes);
  assert.equal(reopened.readJson().references[0].tag, `tlooto-ref:${occurrenceId}`);
  reopened.apply([{
    op: 'text.insert',
    target: { range: { start: { nodeId: 'p_0', offset: 0 } } },
    text: 'Strong ',
  }]);
  assert.equal(reopened.readJson().blocks[0].text, 'Strong Evidence supports the claim[1].');
  assert.equal(reopened.readJson().references[0].occurrenceId, occurrenceId);

  const savedAgain = new DocxApiSession(reopened.save().bytes);
  const removalBaseline = savedAgain.readJson();
  savedAgain.apply([{ op: 'reference.remove', occurrenceId }]);
  assert.equal(savedAgain.readJson().references.length, 0);
  assert.equal(savedAgain.readJson().blocks[0].text, 'Strong Evidence supports the claim.');
  const removalQuality = savedAgain.qualityCheck({ baselineJson: removalBaseline });
  assert.equal(removalQuality.ok, true);
  assert.equal(
    removalQuality.issues.some((issue) => issue.code === 'structural-marker-loss'),
    false,
  );
});

test('DOCX reference insertion uses the end of a resolved non-collapsed text range', () => {
  const sentence = 'Evidence supports the claim.';
  const occurrenceId = '01K123456789ABCDEFGHJKMNPQ';
  const session = new DocxApiSession(createDocxBytes({ paragraphs: [sentence] }));

  session.apply([{
    op: 'reference.insert',
    target: session.resolveText(sentence),
    occurrenceId,
    displayText: '[1]',
    tooltip: 'Registered source',
  }]);

  assert.equal(session.readJson().blocks[0].text, `${sentence}[1]`);
  assert.equal(session.readJson().references[0].occurrenceId, occurrenceId);
});

test('DOCX reference commands reject duplicate ids, overlapping edits, and whole-paragraph rebuilds', () => {
  const occurrenceId = '01K123456789ABCDEFGHJKMNPQ';
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['Claim here.'] }));
  const insert = {
    op: 'reference.insert',
    target: { range: { start: { nodeId: 'p_0', offset: 5 } } },
    occurrenceId,
    displayText: '[7]',
    tooltip: 'Registered source',
  };
  session.apply([insert]);
  assert.throws(() => session.apply([insert]), /already exists/);
  assert.throws(() => session.apply([{
    op: 'text.delete',
    target: { range: { start: { nodeId: 'p_0', offset: 5 }, end: { nodeId: 'p_0', offset: 8 } } },
  }]), /overlaps a document reference/);
  assert.throws(() => session.apply([{
    op: 'text.replaceParagraph',
    location: { paragraph: { number: 0 } },
    text: 'Replacement',
  }]), /cannot rebuild a paragraph containing document references/);
  assert.equal(session.readJson().references[0].occurrenceId, occurrenceId);
});

test('DOCX API exposes every native section and preserves mixed page orientation', () => {
  const session = new DocxApiSession(createMixedOrientationDocx());
  const json = session.readJson();

  assert.equal(json.sections.length, 3);
  assert.deepEqual(json.sections.map((section) => section.pageSetup.orientation), [
    'portrait',
    'landscape',
    'portrait',
  ]);
  assert.deepEqual(json.sections.map((section) => section.pageSetup.width), [11906, 16838, 12240]);
  assert.deepEqual(json.blocks.map((block) => block.native.section), [0, 1, 2]);
  assert.deepEqual(json.layoutGraph.sections.map((section) => section.boundary.kind), [
    'paragraph',
    'paragraph',
    'body',
  ]);
});

test('setPageSetup targets one native section without flattening adjacent page ratios', () => {
  const session = new DocxApiSession(createMixedOrientationDocx());
  session.apply([{
    op: 'setPageSetup',
    section: 1,
    width: 18000,
    height: 12000,
    orientation: 'landscape',
    margins: { top: 700, right: 710, bottom: 720, left: 730, header: 400, footer: 410 },
  }]);

  const saved = session.save().bytes;
  const reopened = new DocxApiSession(saved);
  const sections = reopened.readJson().sections;
  assert.deepEqual(sections.map((section) => section.pageSetup.width), [11906, 18000, 12240]);
  assert.deepEqual(sections.map((section) => section.pageSetup.orientation), ['portrait', 'landscape', 'portrait']);
  assert.equal(sections[1].pageSetup.margins.left, 730);
  assert.match(getDocumentXml(saved), /<w:sectPr w:rsidR="00000002">[\s\S]*?<w:pgSz w:w="18000" w:h="12000" w:orient="landscape"\/>/);
  assert.match(getDocumentXml(saved), /<w:sectPr w:rsidR="00000001">/);
  assert.match(getDocumentXml(saved), /<w:sectPr w:rsidR="00000003">/);
});

test('setPageSetup changes every native section only when section is explicitly all', () => {
  const session = new DocxApiSession(createMixedOrientationDocx());
  session.apply([{
    op: 'setPageSetup',
    section: 'all',
    width: 15840,
    height: 12240,
    orientation: 'landscape',
    margins: { top: 800, right: 810, bottom: 820, left: 830 },
  }]);

  const reopened = new DocxApiSession(session.save().bytes);
  assert.deepEqual(reopened.readJson().sections.map((section) => section.pageSetup.width), [15840, 15840, 15840]);
  assert.deepEqual(reopened.readJson().sections.map((section) => section.pageSetup.orientation), ['landscape', 'landscape', 'landscape']);
});

test('DOCX composition primitives preserve rich runs, table geometry, page borders, and dynamic page fields', () => {
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['blank'] }));
  session.apply([
    {
      op: 'appendParagraph',
      text: 'Bold and plain',
      paragraphStyle: { align: 'center', pageBreakBefore: true, spacingAfter: 0 },
      segments: [
        { text: 'Bold', style: { bold: true, fontFamily: 'NanumBarunGothic', fontSize: 14 } },
        { text: ' and plain', style: { fontFamily: 'NanumBarunGothic', fontSize: 10 } },
      ],
    },
    {
      op: 'table.create',
      rows: 2,
      cols: 3,
      columnWidths: [1200, 2400, 3600],
      rowStyles: [{ height: 420, heightRule: 'exact', isHeader: true }, { cantSplit: true }],
      tableStyle: {
        width: 7200,
        widthType: 'dxa',
        align: 'center',
        layout: 'fixed',
        borders: { all: { value: 'single', color: '222222', size: 6 } },
        cellMargins: { top: 60, left: 80, bottom: 60, right: 80 },
      },
      cells: [
        [
          {
            cellStyle: { gridSpan: 2, fill: 'E7E6E6', verticalAlign: 'center' },
            paragraphs: [{ text: 'Merged header', segments: [{ text: 'Merged header', style: { bold: true } }] }],
          },
          { text: 'C' },
        ],
        [
          { cellStyle: { vMerge: 'restart' }, text: 'A' },
          { text: 'B' },
          { text: 'C' },
        ],
      ],
    },
    {
      op: 'setPageSetup',
      width: 11906,
      height: 16838,
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      pageBorders: { all: { value: 'single', color: '000000', size: 8, space: 24 }, offsetFrom: 'page' },
    },
    {
      op: 'setHeaderFooter',
      footer: {
        paragraphStyle: { align: 'center' },
        segments: [{ text: '– ' }, { field: 'PAGE' }, { text: ' –' }],
      },
    },
  ]);

  const documentXml = getDocumentXml(session.save().bytes);
  assert.match(documentXml, /<w:pageBreakBefore\/>/);
  assert.match(documentXml, /<w:gridCol w:w="1200"\/>/);
  assert.match(documentXml, /<w:gridSpan w:val="2"\/>/);
  assert.match(documentXml, /<w:trHeight w:val="420" w:hRule="exact"\/>/);
  assert.match(documentXml, /<w:tblBorders>/);
  assert.match(documentXml, /<w:tblCellMar>/);
  assert.match(documentXml, /<w:pgBorders w:offsetFrom="page"/);
  const footerXml = getZipText(session.save().bytes, 'word/footer1.xml');
  assert.match(footerXml, /<w:instrText xml:space="preserve"> PAGE <\/w:instrText>/);
  assert.match(footerXml, /– /);
});

test('DOCX API preserves real custom section page ratios during a content edit', () => {
  const input = readFileSync(customSectionRatioFixture);
  const session = new DocxApiSession(input);
  const baseline = session.readJson();
  const pageRatios = (document) => document.sections.map(({ pageSetup }) => [
    pageSetup.width,
    pageSetup.height,
    pageSetup.orientation,
  ]);
  const expectedPageRatios = [
    [5000, 5000, 'portrait'],
    [8000, 5000, 'landscape'],
  ];

  // This tracked LibreOffice regression fixture has a square first section and
  // a custom landscape second section. It catches code that silently replaces
  // native section dimensions with one default paper size while editing text.
  assert.deepEqual(pageRatios(baseline), expectedPageRatios);
  assert.deepEqual(baseline.blocks.map((block) => block.native.section), [0, 0, 1]);

  session.apply([{
    op: 'text.replaceParagraph',
    location: { paragraph: { number: 2 } },
    text: 'Edited Page 2',
  }]);

  const saved = session.save().bytes;
  const documentXml = getDocumentXml(saved);
  const reopened = new DocxApiSession(saved).readJson();
  assert.equal(reopened.blocks[2].text, 'Edited Page 2');
  assert.deepEqual(pageRatios(reopened), expectedPageRatios);
  assert.deepEqual(reopened.blocks.map((block) => block.native.section), [0, 0, 1]);
  assert.equal((documentXml.match(/<w:pgSz\b/g) || []).length, 2);
  assert.match(documentXml, /<w:pgSz w:w="5000" w:h="5000"\/>/);
  assert.match(documentXml, /<w:pgSz w:w="8000" w:h="5000"\/>/);
});

test('DOCX API preserves a complex real document with section-specific page styles', () => {
  const input = readFileSync(mixedPageStyleFixture);
  const session = new DocxApiSession(input);
  const baseline = session.readJson();
  const sectionSetup = (document) => document.sections.map(({ pageSetup }) => ({
    width: pageSetup.width,
    height: pageSetup.height,
    orientation: pageSetup.orientation,
    margins: pageSetup.margins,
  }));
  const expectedSectionSetup = sectionSetup(baseline);

  assert.deepEqual(expectedSectionSetup.map(({ width, height, orientation }) => [
    width,
    height,
    orientation,
  ]), [
    [16840, 11907, 'landscape'],
    [16840, 11907, 'landscape'],
    [11907, 16840, 'portrait'],
  ]);
  assert.notDeepEqual(expectedSectionSetup[0].margins, expectedSectionSetup[1].margins);
  assert.equal(baseline.blocks[2].native.section, 1);

  session.apply([{
    op: 'text.replaceParagraph',
    location: { paragraph: { number: 2 } },
    text: 'Edited mixed section',
  }]);

  const reopened = new DocxApiSession(session.save().bytes).readJson();
  assert.equal(reopened.blocks[2].text, 'Edited mixed section');
  assert.deepEqual(sectionSetup(reopened), expectedSectionSetup);
  assert.equal(reopened.tables.length, baseline.tables.length);
  assert.equal(reopened.blocks.length, baseline.blocks.length);
});

test('DOCX quality check fails closed when a section page ratio changes unexpectedly', () => {
  const session = new DocxApiSession(createMixedOrientationDocx());
  const baseline = session.readJson();

  session.apply([{
    op: 'setPageSetup',
    section: 1,
    width: 12240,
    height: 15840,
    orientation: 'portrait',
    margins: { top: 900, right: 800, bottom: 900, left: 800 },
  }]);

  const report = session.qualityCheck({ baselineJson: baseline });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === 'section-layout-changed'));
  assert.equal(
    session.qualityCheck({ baselineJson: baseline, allowSectionLayoutChanges: true }).ok,
    true,
  );
  assert.equal(
    session.qualityCheck({ baselineJson: baseline, allowedSectionLayoutChanges: [1] }).ok,
    true,
  );
});

test('DOCX quality check downgrades only non-regressing baseline table-capacity warnings', () => {
  const session = new DocxApiSession(createDocxBytes({
    paragraphs: ['Baseline warning fixture'],
    tables: [
      { rows: [] },
      { rows: [[{ text: '1234567890123456', cellStyle: { width: 800 } }]] },
      { rows: [[{ text: '1234567890\n1234567890\n1234567890\n1234567890\n1234567890', cellStyle: { width: 800 } }]] },
    ],
  }));
  const baselineJson = session.readJson();

  session.apply([
    {
      op: 'table.writeCell',
      location: { tableId: 'tbl_1', cell: { number: 0 } },
      text: '12345678901234',
    },
    {
      op: 'table.writeCell',
      location: { tableId: 'tbl_2', cell: { number: 0 } },
      text: '12345678\n12345678\n12345678\n12345678\n12345678',
    },
  ]);

  const report = session.qualityCheck({ baselineJson });
  for (const code of ['empty-table', 'cell-overflow-risk', 'cell-line-overflow-risk']) {
    const issue = report.issues.find((entry) => entry.code === code);
    assert.ok(issue, `${code} should remain visible in the quality report`);
    assert.equal(issue.severity, 'info');
    assert.equal(issue.preexisting, true);
    assert.equal(issue.baselineSeverity, 'warning');
    assert.ok(Number.isFinite(issue.riskRatio));
    assert.ok(issue.riskRatio <= issue.baselineRiskRatio + 1e-9);
    assert.match(issue.locationKey, /^table:/);
  }
});

test('DOCX quality check keeps worsened and newly introduced capacity warnings blocking', () => {
  const worsenedSession = new DocxApiSession(createCapacityRiskDocx('12345678901234'));
  const worsenedBaseline = worsenedSession.readJson();
  worsenedSession.apply([{
    op: 'table.writeCell',
    location: { tableId: 'tbl_0', cell: { number: 0 } },
    text: '12345678901234567890',
  }]);
  const worsened = worsenedSession.qualityCheck({ baselineJson: worsenedBaseline }).issues
    .find((issue) => issue.code === 'cell-line-overflow-risk');
  assert.equal(worsened.severity, 'warning');
  assert.equal(worsened.preexisting, undefined);

  const newRiskSession = new DocxApiSession(createCapacityRiskDocx('Short'));
  const newRiskBaseline = newRiskSession.readJson();
  newRiskSession.apply([{
    op: 'table.writeCell',
    location: { tableId: 'tbl_0', cell: { number: 0 } },
    text: '12345678901234567890',
  }]);
  const introduced = newRiskSession.qualityCheck({ baselineJson: newRiskBaseline }).issues
    .find((issue) => issue.code === 'cell-line-overflow-risk');
  assert.equal(introduced.severity, 'warning');
  assert.equal(introduced.preexisting, undefined);

  const emptyTableSession = new DocxApiSession(createDocxBytes({ tables: [{ rows: [] }] }));
  const emptyTableBaseline = { ...emptyTableSession.readJson(), tables: [] };
  const introducedEmptyTable = emptyTableSession.qualityCheck({ baselineJson: emptyTableBaseline }).issues
    .find((issue) => issue.code === 'empty-table');
  assert.equal(introducedEmptyTable.severity, 'warning');
  assert.equal(introducedEmptyTable.preexisting, undefined);
});

test('DOCX quality check never downgrades package errors even with a warning baseline', () => {
  const session = new DocxApiSession(createCapacityRiskDocx('12345678901234'));
  const baselineJson = session.readJson();
  session.entries.delete('[Content_Types].xml');
  const report = session.qualityCheck({ baselineJson });
  const packageError = report.issues.find((issue) => issue.code === 'missing-package-entry');
  assert.equal(packageError.severity, 'error');
  assert.equal(packageError.preexisting, undefined);
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

test('table.create returns the exact created table target and dimensions', () => {
  const session = new DocxApiSession(createDocxBytes({ tables: [{ rows: [['Existing A', 'Existing B']] }] }));

  const applied = session.apply([{ commandId: 'matrix', op: 'table.create', rows: 5, cols: 5 }]);

  assert.deepEqual(applied.results[0], {
    opId: 'matrix',
    ok: true,
    action: 'createTable',
    target: 'tbl_1',
    tableId: 'tbl_1',
    dimensions: { rowCount: 5, colCount: 5, cellCount: 25 },
  });
  assert.deepEqual(session.readJson().tables.at(-1).dims, {
    rowCount: 5,
    colCount: 5,
    cellCount: 25,
  });
  const savedXml = getDocumentXml(session.save().bytes);
  const createdTableXml = savedXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g).at(-1);
  assert.match(createdTableXml, /<w:tblGrid>(?:<w:gridCol w:w="1872"\/>){5}<\/w:tblGrid>/);
});

test('table.insertCaption inserts a styled paragraph immediately before the selected table', () => {
  const session = new DocxApiSession(createDocxBytes({
    paragraphs: ['Before tables'],
    tables: [
      { rows: [['First header', 'First value']] },
      { rows: [['Second header', 'Second value']] },
    ],
  }));

  const applied = session.apply([{
    commandId: 'caption-2',
    op: 'table.insertCaption',
    tableId: 'tbl_1',
    text: 'Table 2. Controlled evaluation matrix',
    paragraphStyle: { styleId: 'Caption' },
    runStyle: { bold: true },
  }]);

  assert.deepEqual(applied.results[0], {
    opId: 'caption-2',
    ok: true,
    action: 'table.insertCaption',
    target: 'tbl_1',
    tableId: 'tbl_1',
  });
  const savedXml = getDocumentXml(session.save().bytes);
  const captionIndex = savedXml.indexOf('Table 2. Controlled evaluation matrix');
  const secondTableIndex = savedXml.indexOf('Second header');
  assert.ok(captionIndex > 0 && captionIndex < secondTableIndex);
  assert.match(savedXml.slice(captionIndex - 500, captionIndex + 100), /w:pStyle w:val="Caption"/);
});

test('appendParagraph accepts a named paragraph style object defined in the same batch', () => {
  const session = new DocxApiSession(createDocxBytes());

  session.apply([
    { op: 'defineStyle', style: { styleId: 'E2EBody', name: 'E2E Body', runStyle: { fontSize: 10 } } },
    { op: 'appendParagraph', text: 'Named style paragraph', paragraphStyle: { styleId: 'E2EBody' } },
  ]);

  assert.match(getDocumentXml(session.save().bytes), /<w:pStyle w:val="E2EBody"\/>/);
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

test('DOCX API inserts a new image and caption after a target paragraph without a placeholder', () => {
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['Before image', 'After image'] }));
  const imageBytes = generatePngBytes({ width: 180, height: 90, values: [1, 4, 2] });

  const result = session.apply([{
    commandId: 'insert-image',
    op: 'image.insertAfterParagraph',
    location: { paragraph: { section: 0, number: 0 } },
    bytes: imageBytes,
    mimeType: 'image/png',
    widthEmu: 2743200,
    heightEmu: 1371600,
    altText: 'Generated framework diagram',
    caption: 'Figure 1. Generated framework diagram',
  }]);

  const saved = session.save().bytes;
  const reopened = new DocxApiSession(saved);
  const inventory = reopened.objectInventory();
  assert.equal(inventory.images.length, 1);
  assert.equal(Buffer.compare(readZip(saved).get(inventory.images[0].name), imageBytes), 0);
  const xml = getDocumentXml(saved);
  assert.ok(xml.indexOf('Before image') < xml.indexOf('<w:drawing>'));
  assert.ok(xml.indexOf('<w:drawing>') < xml.indexOf('Figure 1. Generated framework diagram'));
  assert.ok(xml.indexOf('Figure 1. Generated framework diagram') < xml.indexOf('After image'));
  assert.match(xml, /wp:docPr id="1"[^>]*descr="Generated framework diagram"/);
  assert.equal(result.results[0].action, 'image.insertAfterParagraph');
  assert.equal(reopened.qualityCheck().ok, true);
});

test('DOCX API rejects damaged or extension-mismatched media atomically and accepts JPEG signatures', () => {
  const session = new DocxApiSession(createStyledDocx());
  const image = session.objectInventory().images[0];
  const before = session.save().bytes;
  assert.throws(() => session.apply([
    { op: 'appendParagraph', text: 'must not survive invalid media' },
    { op: 'image.replace', imageName: image.name, bytes: Buffer.from([1, 2, 3]) },
  ]), /recognized, complete image signature/);
  assert.equal(session.revision, 1);
  assert.equal(Buffer.compare(session.save().bytes, before), 0);
  assert.throws(() => session.apply([{
    op: 'image.replace',
    imageName: image.name,
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }]), /recognized, complete image signature/);

  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  assert.throws(() => session.apply([{
    op: 'image.replace',
    imageName: image.name,
    bytes: jpegBytes,
    mimeType: 'image/jpeg',
  }]), /does not match package extension/);

  const jpegName = 'word/media/extra.jpg';
  session.entries.set(jpegName, Buffer.from(jpegBytes));
  assert.throws(() => session.apply([{
    op: 'image.generateAndReplace',
    imageName: jpegName,
    generator: { width: 40, height: 40, values: [1] },
  }]), /does not match package extension/);
  session.apply([{
    op: 'image.replace',
    imageName: jpegName,
    bytesBase64: jpegBytes.toString('base64'),
    mimeType: 'image/jpeg',
  }]);
  assert.equal(Buffer.compare(readZip(session.save().bytes).get(jpegName), jpegBytes), 0);
});

test('DOCX API rejects unknown named styles atomically and accepts a style defined in the same batch', () => {
  const rejected = new DocxApiSession(createStyledDocx());
  const before = rejected.save().bytes;
  assert.throws(() => rejected.apply([
    { op: 'appendParagraph', text: 'must roll back with unknown style' },
    { op: 'applyStyle', target: { nodeId: 'p_1' }, styleId: 'MissingStyle' },
  ]), /styleId does not exist/);
  assert.equal(rejected.revision, 1);
  assert.equal(Buffer.compare(rejected.save().bytes, before), 0);

  const accepted = new DocxApiSession(createStyledDocx());
  accepted.apply([
    { op: 'applyStyle', target: { nodeId: 'p_1' }, styleId: 'AtomicStyle' },
    { op: 'defineStyle', style: { styleId: 'AtomicStyle', name: 'Atomic Style', runStyle: { bold: true } } },
  ]);
  const saved = accepted.save().bytes;
  assert.match(getDocumentXml(saved), /w:pStyle w:val="AtomicStyle"/);
  assert.match(getZipText(saved, 'word/styles.xml'), /w:styleId="AtomicStyle"/);
});

test('DOCX API executes the previously uncovered text, table, list, and append commands', () => {
  const paragraphSession = new DocxApiSession(createStyledDocx());
  paragraphSession.apply([
    { op: 'text.replaceParagraph', location: { paragraph: { number: 1 } }, text: 'Replaced paragraph' },
    { op: 'appendParagraph', text: 'Appended paragraph' },
  ]);
  let reopened = new DocxApiSession(paragraphSession.save().bytes);
  assert.equal(reopened.inspectTarget({ paragraph: { number: 1 } }).currentText, 'Replaced paragraph');
  assert.match(getDocumentXml(reopened.save().bytes), /Appended paragraph/);

  const rangeSession = new DocxApiSession(createStyledDocx());
  rangeSession.apply([{
    op: 'text.replace',
    target: { native: { section: 0, para: 1, offset: 0, length: 5 } },
    expectedText: 'Plain',
    text: 'Updated',
  }]);
  reopened = new DocxApiSession(rangeSession.save().bytes);
  assert.equal(reopened.inspectTarget({ paragraph: { number: 1 } }).currentText, 'Updated target paragraph');

  const insertSession = new DocxApiSession(createStyledDocx());
  insertSession.apply([{ op: 'insertText', target: { range: { start: { nodeId: 'p_1', offset: 0 } } }, text: 'API ' }]);
  insertSession.apply([{ op: 'deleteRange', target: { range: { start: { nodeId: 'p_1', offset: 0 }, end: { nodeId: 'p_1', offset: 4 } } } }]);
  reopened = new DocxApiSession(insertSession.save().bytes);
  assert.equal(reopened.inspectTarget({ paragraph: { number: 1 } }).currentText, 'Plain target paragraph');

  const tableSession = new DocxApiSession(createStyledDocx());
  tableSession.apply([
    { op: 'table.writeCell', location: { tableId: 'tbl_0', cell: { number: 2 } }, text: 'Single' },
    { op: 'table.writeCells', tableId: 'tbl_0', cells: [{ cell: { number: 0 }, text: 'Batch A' }, { cell: { number: 1 }, text: 'Batch B' }] },
    { op: 'list.writeBullets', location: { tableId: 'tbl_0', cell: { number: 3 } }, items: ['one', 'two'] },
  ]);
  reopened = new DocxApiSession(tableSession.save().bytes);
  assert.equal(reopened.inspectTarget({ tableId: 'tbl_0', cell: { number: 0 } }).currentText, 'Batch A');
  assert.equal(reopened.inspectTarget({ tableId: 'tbl_0', cell: { number: 1 } }).currentText, 'Batch B');
  assert.equal(reopened.inspectTarget({ tableId: 'tbl_0', cell: { number: 2 } }).currentText, 'Single');
  assert.equal(reopened.inspectTarget({ tableId: 'tbl_0', cell: { number: 3 } }).currentText, '- one\n- two');
});

test('DOCX paragraph replacement collapses visually uniform runs without model-authored segments', () => {
  const session = new DocxApiSession(createUniformMultiRunParagraphDocx());
  const target = session.inspectTarget({ paragraph: { number: 0 } });
  assert.equal(target.runs.length, 2);

  session.apply([{
    op: 'text.replaceParagraph',
    location: target.location,
    text: 'A complete replacement abstract.',
  }]);

  const reopened = new DocxApiSession(session.save().bytes);
  const updated = reopened.inspectTarget({ paragraph: { number: 0 } });
  assert.equal(updated.currentText, 'A complete replacement abstract.');
  assert.equal(updated.runs.length, 1);
});

test('DOCX paragraph and range replacement preserve zero-width structural markers', () => {
  for (const command of [
    {
      op: 'text.replaceParagraph',
      location: { paragraph: { number: 0 } },
      text: 'Replaced bookmarked title',
    },
    {
      op: 'text.replace',
      target: { native: { para: 0, offset: 0, length: 'Bookmarked title'.length } },
      expectedText: 'Bookmarked title',
      text: 'Range-replaced bookmarked title',
    },
  ]) {
    const session = new DocxApiSession(createBookmarkedParagraphDocx());
    const baseline = session.readJson();
    session.apply([command]);
    const saved = session.save().bytes;
    const reopened = new DocxApiSession(saved);

    assert.match(reopened.documentXml, /<w:bookmarkStart w:id="7" w:name="_ContractBookmark"\/>/);
    assert.match(reopened.documentXml, /<w:bookmarkEnd w:id="7"\/>/);
    assert.equal(reopened.readJson().integrityGraph.bookmarkStarts, 1);
    assert.equal(reopened.readJson().integrityGraph.bookmarkEnds, 1);
    assert.equal(session.qualityCheck({ baselineJson: baseline }).ok, true);
  }
});

test('DOCX quality check fails closed when a structural marker disappears', () => {
  const session = new DocxApiSession(createBookmarkedParagraphDocx());
  const baseline = session.readJson();
  session.documentXml = session.documentXml.replace(
    /<w:bookmarkStart w:id="7" w:name="_ContractBookmark"\/>/,
    '',
  );
  session.dirtyDocument = true;

  const report = session.qualityCheck({ baselineJson: baseline });

  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === 'structural-marker-loss'));
  assert.ok(report.issues.some((issue) => issue.code === 'unbalanced-bookmarks'));
});

test('DOCX range replacement rejects stale expected text and whole-paragraph payloads atomically', () => {
  const source = createDocxBytes({ paragraphs: ['Prefix Student suffix remains stable.'] });
  const session = new DocxApiSession(source);
  const before = session.save().bytes;
  const target = { native: { para: 0, offset: 7, length: 7 } };

  assert.throws(
    () => session.apply([{
      op: 'text.replace',
      target,
      text: 'Learner',
    }]),
    /missing required field\(s\): expectedText|expectedText is required/,
  );
  assert.throws(
    () => session.apply([{
      op: 'text.replace',
      target,
      expectedText: 'Outdated',
      text: 'Learner',
    }]),
    /expectedText does not match/,
  );
  assert.throws(
    () => session.apply([{
      op: 'text.replace',
      target,
      expectedText: 'Student',
      text: 'Prefix Learner suffix remains stable.',
    }]),
    /complete paragraph text for a smaller selected range/,
  );

  assert.equal(session.revision, 1);
  assert.equal(Buffer.compare(before, session.save().bytes), 0);
});

test('DOCX paragraph replacement requires explicit segments and preserves every mixed-style run', () => {
  const session = new DocxApiSession(createMixedRunParagraphDocx());
  const target = session.inspectTarget({ paragraph: { number: 0 } });
  assert.deepEqual(target.runs.map((run) => ({ index: run.index, bold: run.style.bold, italic: run.style.italic })), [
    { index: 0, bold: true, italic: false },
    { index: 1, bold: false, italic: true },
  ]);
  assert.throws(
    () => session.apply([{ op: 'text.replaceParagraph', location: target.location, text: 'New lead. New remainder.' }]),
    /requires segments when a paragraph contains visibly distinct run formatting/,
  );
  assert.throws(
    () => session.apply([{
      op: 'text.replaceParagraph',
      location: target.location,
      text: 'New lead. New remainder.',
      segments: [{ sourceRun: 0, text: 'New lead. New remainder.' }],
    }]),
    /segments must preserve every inspected run exactly once/,
  );

  session.apply([{
    op: 'text.replaceParagraph',
    location: target.location,
    text: 'New lead. New remainder.',
    segments: [
      { sourceRun: 0, text: 'New lead.' },
      { sourceRun: 1, text: ' New remainder.' },
    ],
  }]);
  const reopened = new DocxApiSession(session.save().bytes);
  const updated = reopened.inspectTarget({ paragraph: { number: 0 } });
  assert.equal(updated.currentText, 'New lead. New remainder.');
  assert.deepEqual(updated.runs.map((run) => ({ text: run.text, bold: run.style.bold, italic: run.style.italic })), [
    { text: 'New lead.', bold: true, italic: false },
    { text: ' New remainder.', bold: false, italic: true },
  ]);
});

test('DOCX API executes named, direct, and cloned style commands through save/reopen', () => {
  const session = new DocxApiSession(createStyledDocx());
  session.apply([
    { op: 'defineStyle', style: { styleId: 'AgentHeading', name: 'Agent Heading', basedOn: 'Normal', runStyle: { bold: true } } },
    { op: 'applyStyle', target: { nodeId: 'p_1' }, styleId: 'AgentHeading' },
    { op: 'setRunStyle', target: { nodeId: 'p_1' }, style: { italic: true, textColor: '#AA0000' } },
    { op: 'setParagraphStyle', target: { nodeId: 'p_1' }, style: { align: 'right', spacingAfter: 180 } },
  ]);
  session.apply([{
    op: 'style.clone',
    source: { paragraph: { number: 0 } },
    target: { paragraph: { number: 1 } },
  }]);

  const saved = session.save().bytes;
  assert.match(getZipText(saved, 'word/styles.xml'), /w:styleId="AgentHeading"/);
  assert.match(getZipText(saved, 'word/styles.xml'), /w:basedOn w:val="Normal"/);
  const reopened = new DocxApiSession(saved);
  const source = reopened.styleFingerprint({ paragraph: { number: 0 } }).basis;
  const target = reopened.styleFingerprint({ paragraph: { number: 1 } }).basis;
  assert.equal(target.text.bold, source.text.bold);
  assert.equal(target.paragraph.align, source.paragraph.align);
});

test('DOCX API applyStyle persists on an appended paragraph located by canonical paragraph target', () => {
  const session = new DocxApiSession(createDocxBytes({ paragraphs: ['Original title', 'Original body'] }));
  const note = 'Appended validation note';
  const prepared = session.apply([
    {
      commandId: 'define-note-style',
      op: 'defineStyle',
      style: { styleId: 'AgentValidationNote', name: 'Agent Validation Note', type: 'paragraph', basedOn: 'Normal' },
    },
    { commandId: 'append-note', op: 'appendParagraph', text: note },
  ]);
  assert.equal(prepared.revision, 2);

  const found = session.resolveText(note, { caseSensitive: true });
  const target = { paragraph: { section: 0, number: found.native.paragraph } };
  assert.equal(session.inspectTarget(target).currentText, note);
  const applied = session.apply([{
    commandId: 'apply-note-style',
    op: 'applyStyle',
    target,
    styleId: 'AgentValidationNote',
  }]);
  assert.deepEqual(applied, {
    revision: 3,
    results: [{ opId: 'apply-note-style', ok: true, action: 'applyStyle' }],
  });

  const saved = session.save();
  assert.equal(saved.revision, 3);
  const reopened = new DocxApiSession(saved.bytes);
  assert.equal(reopened.inspectTarget(target).currentText, note);
  assert.equal(reopened.inspectTarget(target).styleFingerprint.basis.paragraph.styleId, 'AgentValidationNote');
  assert.match(reopened.paragraphFromLocation(target).xml, /<w:pStyle w:val="AgentValidationNote"\/>/);
  assert.notEqual(reopened.inspectTarget({ paragraph: { number: 0 } }).styleFingerprint.basis.paragraph.styleId, 'AgentValidationNote');
});

test('DOCX API layout.fitText is read-only and failed batches roll back atomically', () => {
  const fitSession = new DocxApiSession(createStyledDocx());
  const fitRevision = fitSession.revision;
  const fit = fitSession.apply([{
    op: 'layout.fitText',
    location: { tableId: 'tbl_0', cell: { number: 0 } },
    text: 'a long value that needs wrapping',
    options: { maxCharsPerLine: 8, maxLines: 4, truncate: false },
  }]);
  assert.equal(fit.revision, fitRevision);
  assert.ok(fit.results[0].fit.lineCount > 1);

  const rollbackSession = new DocxApiSession(createStyledDocx());
  const before = rollbackSession.save().bytes;
  assert.throws(() => rollbackSession.apply([
    { op: 'appendParagraph', text: 'must roll back' },
    { op: 'unsupported.operation' },
  ]), /unsupported DOCX API op/);
  assert.equal(rollbackSession.revision, 1);
  assert.equal(Buffer.compare(rollbackSession.save().bytes, before), 0);
});

test('DOCX API honors documented page, header/footer, metadata, and table-style fields', () => {
  const session = new DocxApiSession(createStyledDocx());
  session.apply([
    { op: 'setPageSetup', width: 11906, height: 16838, marginTop: 1000, marginRight: 1100, marginBottom: 1200, marginLeft: 1300 },
    { op: 'setHeaderFooter', header: 'Document header', footer: 'Document footer' },
    { op: 'setDocumentMetadata', title: 'Title', subject: 'Subject', creator: 'Creator', keywords: 'one,two', description: 'Description' },
    { op: 'table.applyCellStyle', target: { tableId: 'tbl_0', cell: { number: 3 } }, cellStyle: { fill: '#FFFF00', margins: { top: 90, right: 90, bottom: 90, left: 90 } } },
  ]);
  const saved = session.save().bytes;
  assert.match(getDocumentXml(saved), /w:top="1000" w:right="1100" w:bottom="1200" w:left="1300"/);
  assert.match(getZipText(saved, 'word/header1.xml'), /Document header/);
  assert.match(getZipText(saved, 'word/footer1.xml'), /Document footer/);
  assert.match(getZipText(saved, 'docProps/core.xml'), /<dc:creator>Creator<\/dc:creator>/);
  assert.match(getZipText(saved, 'docProps/core.xml'), /<cp:keywords>one,two<\/cp:keywords>/);
  assert.match(getDocumentXml(saved), /<w:tcMar>/);
});

test('DOCX API partial header/footer and metadata updates preserve unspecified values', () => {
  const session = new DocxApiSession(createStyledDocx());
  session.apply([
    { op: 'setHeaderFooter', header: 'Original header', footer: 'Original footer' },
    { op: 'setDocumentMetadata', title: 'Original title', subject: 'Original subject', creator: 'Original creator', keywords: 'original,keywords', description: 'Original description' },
  ]);

  const reopened = new DocxApiSession(session.save().bytes);
  reopened.apply([
    { op: 'setHeaderFooter', header: 'Updated header' },
    { op: 'setDocumentMetadata', title: 'Updated title' },
  ]);
  const saved = reopened.save().bytes;
  const documentXml = getDocumentXml(saved);
  const coreXml = getZipText(saved, 'docProps/core.xml');

  assert.match(getZipText(saved, 'word/header1.xml'), /Updated header/);
  assert.match(getZipText(saved, 'word/footer1.xml'), /Original footer/);
  assert.match(documentXml, /<w:headerReference\b/);
  assert.match(documentXml, /<w:footerReference\b/);
  assert.match(coreXml, /<dc:title>Updated title<\/dc:title>/);
  assert.match(coreXml, /<dc:subject>Original subject<\/dc:subject>/);
  assert.match(coreXml, /<dc:creator>Original creator<\/dc:creator>/);
  assert.match(coreXml, /<cp:keywords>original,keywords<\/cp:keywords>/);
  assert.match(coreXml, /<dc:description>Original description<\/dc:description>/);
});

test('DOCX text and table commands intentionally clear visible content without becoming no-ops', () => {
  const session = new DocxApiSession(createDocxBytes({
    paragraphs: ['Keep', 'Remove me'],
    tables: [{ rows: [['Clear me', 'Keep cell']] }],
  }));

  const applied = session.apply([
    { op: 'text.replaceParagraph', location: { paragraph: { number: 1 } }, text: '' },
    {
      op: 'table.writeCells',
      tableId: 'tbl_0',
      cells: [{ cell: { number: 0 }, text: '' }],
    },
  ]);

  assert.equal(applied.revision, 2);
  const json = session.readJson();
  assert.equal(json.blocks[1].text, '');
  assert.equal(json.tables[0].cells[0].text, '');
  assert.equal(json.tables[0].cells[1].text, 'Keep cell');
});

for (const fixture of [
  {
    name: 'actual Korean 19-page manuscript',
    filePath: path.resolve('..', 'codecrain-ai-solution', 'app_tlooto', 'research', 'paper_1_screen', 'paper_korean_reading_version.docx'),
    minimumTables: 20,
    minimumImages: 0,
  },
  {
    name: 'actual older English manuscript with figure',
    filePath: path.resolve('..', 'codecrain-ai-solution', 'handoff', 'icdm2026_literature_screening_20260605', 'manuscript', 'paper_v13_ieee_submission.docx'),
    minimumTables: 5,
    minimumImages: 1,
  },
]) {
  test(`DOCX API preserves ${fixture.name} under strict validation`, { skip: !existsSync(fixture.filePath) }, () => {
    const input = readFileSync(fixture.filePath);
    const session = new DocxApiSession(input);
    const baselineJson = session.readJson();
    const quality = session.qualityCheck({ baselineJson });
    assert.ok(baselineJson.tables.length >= fixture.minimumTables);
    assert.ok(baselineJson.objectGraph.images.length >= fixture.minimumImages);
    assert.equal(quality.issues.some((issue) => issue.severity === 'error'), false);
    assert.equal(quality.issues.some((issue) => issue.severity === 'warning'), false);
    assert.equal(Buffer.compare(session.save().bytes, input), 0);
  });
}
