import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertQualityReportShape,
  buildListText,
  commandKey,
  firstEditableCellLocation,
  firstEditableParagraphLocation,
  fitTextToCapacity,
  inspectSessionSurface,
  normalizeCellReference,
  normalizeParagraphLocation,
  validateReadJsonShape,
  wrapLine,
} from './document-api-core.mjs';
import { createDocxBytes, DocxApiSession } from '../editor_docx/scripts/docx-api-utils.mjs';
import { HwpxApiSession, initHwpxRuntime } from '../editor_hwpx/scripts/hwpx-api-utils.mjs';

function assertCommonSessionContract(session) {
  const surface = inspectSessionSurface(session);
  assert.equal(surface.ok, true, `missing methods: ${surface.missingMethods.join(', ')}`);

  const json = session.readJson();
  const jsonShape = validateReadJsonShape(json);
  assert.equal(jsonShape.ok, true, `readJson shape issues: ${jsonShape.issues.join(', ')}`);

  const quality = session.qualityCheck();
  const qualityShape = assertQualityReportShape(quality);
  assert.equal(qualityShape.ok, true, `quality shape issues: ${qualityShape.issues.join(', ')}`);
  assert.equal(quality.ok, true);

  const targets = session.targetMap();
  assert.ok(Array.isArray(targets.paragraphs), 'targetMap.paragraphs must be an array');
  assert.ok(Array.isArray(targets.cells), 'targetMap.cells must be an array');

  const objects = session.objectInventory();
  assert.ok(Array.isArray(objects.images), 'objectInventory.images must be an array');

  const paragraphLocation = firstEditableParagraphLocation(json);
  assert.ok(paragraphLocation, 'at least one editable paragraph is required');
  const paragraphTarget = session.inspectTarget(paragraphLocation);
  assert.equal(paragraphTarget.kind, 'paragraph');
  assert.equal(typeof paragraphTarget.currentText, 'string');

  const cellLocation = firstEditableCellLocation(json);
  let cellTarget = null;
  if (cellLocation) {
    cellTarget = session.inspectTarget(cellLocation);
    assert.equal(cellTarget.kind, 'cell');
    const fit = session.fitText(cellLocation, 'alpha beta gamma delta epsilon', { maxCharsPerLine: 12, truncate: false });
    assert.equal(fit.truncated, false);
    assert.ok(fit.text.includes('\n'));
  }

  const searchableText =
    paragraphTarget.currentText.trim() ||
    cellTarget?.currentText?.trim() ||
    json.blocks.find((block) => block.text?.trim())?.text?.trim() ||
    json.tables.flatMap((table) => table.cells).find((cell) => cell.text?.trim())?.text?.trim();
  assert.ok(searchableText, 'a non-empty paragraph or cell text value is required to verify resolveText');
  const textMatch = session.resolveText(searchableText.slice(0, Math.min(5, searchableText.length)));
  assert.ok(textMatch, 'resolveText must return a target match');
}

test('common command helpers normalize equivalent LLM command inputs', () => {
  assert.equal(commandKey({ op: 'table.writeRichCell' }), 'tablewriterichcell');
  assert.equal(commandKey({ group: 'table', action: 'write-rich-cell' }), 'tablewriterichcell');
  assert.equal(buildListText(['alpha', 'beta'], { numbered: true, startAt: 3, suffix: ')' }), '3) alpha\n4) beta');
  assert.deepEqual(normalizeCellReference({ number: 5, column: 2 }), {
    number: 5,
    cellIndex: 5,
    row: undefined,
    column: 2,
    col: 2,
  });
  assert.deepEqual(normalizeParagraphLocation({ paragraph: { section: 1, number: 7 } }), {
    section: 1,
    paragraph: 7,
    para: 7,
    number: 7,
  });
  assert.deepEqual(
    firstEditableParagraphLocation({
      editableTargets: { paragraphs: [{ location: { paragraph: { section: 2, number: 9 } } }] },
      blocks: [{ native: { section: 0, paragraph: 1 } }],
    }),
    { paragraph: { section: 2, number: 9 } },
  );
  assert.deepEqual(
    firstEditableParagraphLocation({
      editableTargets: { paragraphs: [] },
      blocks: [{ native: { section: 3, para: 11 } }],
    }),
    { paragraph: { section: 3, number: 11 } },
  );
});

test('common fitText wraps on words before splitting long tokens', () => {
  assert.deepEqual(wrapLine('alpha beta gamma', 10), ['alpha beta', 'gamma']);
  const fit = fitTextToCapacity('alpha beta gamma', { maxCharsPerLine: 10, maxLines: 2 }, { truncate: false });
  assert.equal(fit.text, 'alpha beta\ngamma');
  assert.equal(fit.changed, true);
  assert.equal(fit.truncated, false);
});

test('DOCX session satisfies the shared document API contract', () => {
  const docxBytes = createDocxBytes({
    paragraphs: ['Title', 'Body paragraph'],
    tables: [{ rows: [['Header', 'Value'], ['Target', '']] }],
    includeImage: true,
  });
  assertCommonSessionContract(new DocxApiSession(docxBytes));
});

test('HWPX session satisfies the shared document API contract', { skip: !existsSync('output/hwpx-review/01-esg-original.hwpx') }, async () => {
  await initHwpxRuntime();
  assertCommonSessionContract(new HwpxApiSession(readFileSync('output/hwpx-review/01-esg-original.hwpx')));
});
