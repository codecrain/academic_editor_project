import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';

import {
  DocxApiSession,
  createDocxBytes,
} from './docx-api-utils.mjs';

const outputDir = path.resolve('output/docx-review');
mkdirSync(outputDir, { recursive: true });

function saveDocx(name, bytes) {
  const filePath = path.join(outputDir, name);
  writeFileSync(filePath, bytes);
  return filePath;
}

function nonEmptyParagraphs(session) {
  return session.readJson().blocks.filter((block) => block.text.trim().length > 0);
}

function firstTargetParagraph(session, fallback = 0) {
  const paragraph = nonEmptyParagraphs(session)[0];
  return { paragraph: { number: paragraph?.native?.paragraph ?? fallback } };
}

function commandSummary(label, session) {
  const quality = session.qualityCheck();
  return {
    label,
    revision: session.revision,
    pageCount: quality.pageCount,
    paragraphCount: quality.paragraphCount,
    tableCount: quality.tableCount,
    imageCount: quality.objectSummary.imageCount,
    ok: quality.ok,
    issues: quality.issues,
  };
}

function improveExistingTemplate() {
  const originalPath = path.resolve('editor_docx/test/data/template.docx');
  const originalOutput = path.join(outputDir, '01-template-original.docx');
  copyFileSync(originalPath, originalOutput);

  const session = new DocxApiSession(readFileSync(originalPath));
  const firstParagraphLocation = firstTargetParagraph(session);
  const firstTarget = session.inspectTarget(firstParagraphLocation);

  session.apply([
    { commandId: 'meta', op: 'setDocumentMetadata', title: 'DOCX API Filled Template', subject: 'API-only editing verification' },
    { commandId: 'page', op: 'setPageSetup', width: 11906, height: 16838, margins: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
    { commandId: 'style-title', op: 'defineStyle', style: { styleId: 'ApiTitle', name: 'API Title', paragraphStyle: { align: 'center', spacingAfter: 240 }, runStyle: { bold: true, fontSize: 18, textColor: '#1F4E79' } } },
    { commandId: 'style-body', op: 'defineStyle', style: { styleId: 'ApiBody', name: 'API Body', paragraphStyle: { align: 'both', lineSpacing: 360, spacingAfter: 120 }, runStyle: { fontSize: 10 } } },
    { commandId: 'header', op: 'setHeaderFooter', text: 'DOCX API-only template fill | generated locally' },
    {
      commandId: 'replace-title',
      op: 'text.replaceParagraph',
      location: firstParagraphLocation,
      text: 'API-Only DOCX Editing Verification Report',
      styleSource: firstParagraphLocation,
    },
    { commandId: 'title-style', op: 'applyStyle', target: { nodeId: firstTarget.id }, styleId: 'ApiTitle' },
    { commandId: 'summary-heading', op: 'appendParagraph', text: '1. Executive Summary', paragraphStyle: { styleId: 'ApiTitle' } },
    { commandId: 'summary-body', op: 'appendParagraph', text: 'This document was read, targeted, edited, saved, and reopened through the DOCX API utility without using browser clicks or editor UI automation.', paragraphStyle: { styleId: 'ApiBody' } },
    { commandId: 'process-heading', op: 'appendParagraph', text: '2. API Process Evidence', paragraphStyle: { styleId: 'ApiTitle' } },
    { commandId: 'process-list', op: 'appendParagraph', text: 'Target map, exact paragraph replacement, style definition, page setup, header insertion, table creation, cell writing, and footnote insertion were all executed as explicit API commands.', paragraphStyle: { styleId: 'ApiBody' } },
    { commandId: 'table', op: 'createTable', rows: 5, cols: 2, cellStyle: { borderColor: '#BFBFBF', width: 4200, verticalAlign: 'center', margin: { top: 90, left: 140, bottom: 90, right: 140 } } },
  ]);

  const afterTable = new DocxApiSession(session.save().bytes);
  const table = afterTable.readJson().tables.at(-1);
  afterTable.apply([
    {
      commandId: 'fill-table',
      op: 'table.writeCells',
      tableId: table.id,
      fit: true,
      fitOptions: { maxCharsPerLine: 32, truncate: false },
      cells: [
        { cell: { number: 0 }, text: 'Checkpoint' },
        { cell: { number: 1 }, text: 'Result' },
        { cell: { number: 2 }, text: 'Read JSON' },
        { cell: { number: 3 }, text: 'Targets found' },
        { cell: { number: 4 }, text: 'Write' },
        { cell: { number: 5 }, text: 'Paragraphs and cells updated' },
        { cell: { number: 6 }, text: 'Save/reopen' },
        { cell: { number: 7 }, text: 'Word export OK' },
        { cell: { number: 8 }, text: 'Regression' },
        { cell: { number: 9 }, text: 'DOCX API tests included' },
      ],
    },
  ]);

  const noteTarget = afterTable.resolveText('Target map');
  afterTable.apply([{ commandId: 'footnote', op: 'insertFootnote', target: noteTarget, text: 'Inserted by the DOCX API sample script.' }]);
  const improved = afterTable.save();
  const improvedOutput = saveDocx('02-template-api-improved.docx', improved.bytes);

  return {
    original: originalOutput,
    improved: improvedOutput,
    summary: commandSummary('template', new DocxApiSession(improved.bytes)),
  };
}

function createReportTemplate() {
  const bodyCell = (text, width = 3000) => ({
    text,
    cellStyle: { borderColor: '#BFBFBF', width, verticalAlign: 'center', margin: { top: 90, left: 140, bottom: 90, right: 140 } },
    paragraphStyle: { align: 'left' },
    runStyle: { fontSize: 10 },
  });
  const headerCell = (text, width = 3000) => ({
    text,
    cellStyle: { fill: '#D9EAF7', borderColor: '#BFBFBF', width, verticalAlign: 'center', margin: { top: 100, left: 140, bottom: 100, right: 140 } },
    paragraphStyle: { align: 'center' },
    runStyle: { bold: true, textColor: '#1F4E79', fontSize: 10 },
  });
  return createDocxBytes({
    paragraphs: [
      { text: 'Untitled API Report', paragraphStyle: { align: 'center', spacingAfter: 240 }, runStyle: { bold: true, fontSize: 18, textColor: '#1F4E79' } },
      { text: 'Prepared by: [fill]', paragraphStyle: { align: 'center', spacingAfter: 120 }, runStyle: { italic: true, fontSize: 10 } },
      { text: 'Abstract placeholder. Replace this paragraph with a concise executive abstract.', paragraphStyle: { align: 'both', lineSpacing: 360 }, runStyle: { fontSize: 10 } },
    ],
    tables: [{
      rows: [
        [
          headerCell('Area', 2600),
          headerCell('Baseline', 2600),
          headerCell('API Output', 3200),
        ],
        [bodyCell('Document read', 2600), bodyCell('[empty]', 2600), bodyCell('[empty]', 3200)],
        [bodyCell('Precise targeting', 2600), bodyCell('[empty]', 2600), bodyCell('[empty]', 3200)],
        [bodyCell('Style preservation', 2600), bodyCell('[empty]', 2600), bodyCell('[empty]', 3200)],
        [bodyCell('Save/reopen', 2600), bodyCell('[empty]', 2600), bodyCell('[empty]', 3200)],
      ],
    }],
    includeImage: true,
  });
}

function improveGeneratedReport() {
  const originalBytes = createReportTemplate();
  const originalOutput = saveDocx('03-report-original.docx', originalBytes);
  const session = new DocxApiSession(originalBytes);
  const title = { paragraph: { number: 0 } };
  const author = { paragraph: { number: 1 } };
  const abstract = { paragraph: { number: 2 } };
  const table = session.readJson().tables[0];

  session.apply([
    { commandId: 'meta', op: 'setDocumentMetadata', title: 'DOCX API Stress Report', subject: 'Full API-only authoring sample' },
    { commandId: 'page', op: 'setPageSetup', width: 11906, height: 16838, margins: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
    { commandId: 'style-h1', op: 'defineStyle', style: { styleId: 'ApiHeading1', name: 'API Heading 1', paragraphStyle: { spacingBefore: 240, spacingAfter: 80 }, runStyle: { bold: true, fontSize: 13, textColor: '#1F4E79' } } },
    { commandId: 'style-body', op: 'defineStyle', style: { styleId: 'ApiBody', name: 'API Body', paragraphStyle: { align: 'both', lineSpacing: 360, spacingAfter: 120 }, runStyle: { fontSize: 10 } } },
    { commandId: 'style-caption', op: 'defineStyle', style: { styleId: 'ApiCaption', name: 'API Caption', paragraphStyle: { align: 'center', spacingBefore: 80, spacingAfter: 120 }, runStyle: { italic: true, fontSize: 9 } } },
    { commandId: 'header', op: 'setHeaderFooter', text: 'DOCX API stress report | no editor UI actions' },
    { commandId: 'title', op: 'style.applyText', location: title, styleSource: title, text: 'DOCX API-Only Editing Stress Report' },
    { commandId: 'author', op: 'style.applyText', location: author, styleSource: author, text: 'Prepared by the local document automation API' },
    { commandId: 'abstract', op: 'style.applyText', location: abstract, styleSource: abstract, text: 'This report verifies that a DOCX document can be read, structurally mapped, edited by exact targets, styled, enriched with a table and image replacement, saved, and reopened using only API commands.' },
    {
      commandId: 'matrix-fill',
      op: 'table.writeCells',
      tableId: table.id,
      fit: true,
      fitOptions: { maxCharsPerLine: 26, truncate: false },
      cells: [
        { cell: { number: 4 }, text: 'Paragraph/table scan' },
        { cell: { number: 5 }, text: 'JSON targets ready' },
        { cell: { number: 7 }, text: 'Manual placeholders' },
        { cell: { number: 8 }, text: 'tableId + cell.number' },
        { cell: { number: 10 }, text: 'Mixed cell styles' },
        { cell: { number: 11 }, text: 'Run and cell style cloned' },
        { cell: { number: 13 }, text: 'Untouched package' },
        { cell: { number: 14 }, text: 'Word export OK' },
      ],
    },
    { commandId: 'workflow-placeholder', op: 'appendParagraph', text: 'API workflow placeholder', paragraphStyle: { styleId: 'ApiBody' } },
  ]);

  const workflowBlock = session.readJson().blocks.find((block) => block.text.includes('API workflow placeholder'));
  session.apply([{
    commandId: 'workflow-list',
    op: 'list.applyNumbering',
    location: { paragraph: { number: workflowBlock.native.paragraph } },
    styleSource: { paragraph: { number: workflowBlock.native.paragraph } },
    items: ['read-json', 'target-map', 'inspect-target', 'commands-apply', 'quality-check'],
  }]);

  for (let section = 1; section <= 8; section += 1) {
    session.apply([
      { commandId: `section-${section}-heading`, op: 'appendParagraph', text: `${section}. ${['Problem Definition', 'API Surface', 'Target Selection', 'Writing Strategy', 'Style Preservation', 'Object Handling', 'Validation', 'Remaining Work'][section - 1]}`, paragraphStyle: { styleId: 'ApiHeading1' } },
      { commandId: `section-${section}-body-a`, op: 'appendParagraph', text: `Section ${section} records the exact API-only editing behavior, the assumptions used to choose targets, and the verification evidence required before the output can be treated as user-visible automation.`, paragraphStyle: { styleId: 'ApiBody' } },
      { commandId: `section-${section}-body-b`, op: 'appendParagraph', text: `The important constraint is that every change is anchored to a paragraph, table cell, or package object discovered from read-json rather than inferred from screen position.`, paragraphStyle: { styleId: 'ApiBody' } },
    ]);
  }

  const image = session.objectInventory().images[0];
  if (image) {
    session.apply([{
      commandId: 'replace-chart',
      op: 'image.generateAndReplace',
      imageName: image.name,
      generator: { width: 640, height: 260, accent: '#1F4E79', values: [3, 6, 8, 7, 9] },
    }]);
  }
  const footnoteTarget = session.resolveText('exact API-only editing behavior');
  session.apply([{ commandId: 'footnote', op: 'insertFootnote', target: footnoteTarget, text: 'This footnote was inserted after target resolution from read-json text.' }]);

  const improved = session.save();
  const improvedOutput = saveDocx('04-report-api-improved.docx', improved.bytes);
  return {
    original: originalOutput,
    improved: improvedOutput,
    summary: commandSummary('report', new DocxApiSession(improved.bytes)),
  };
}

const results = [improveExistingTemplate(), improveGeneratedReport()];
writeFileSync(path.join(outputDir, 'docx-api-sample-results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(results, null, 2));
