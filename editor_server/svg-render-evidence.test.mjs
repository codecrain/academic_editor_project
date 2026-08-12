import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeSvgCellClipping, analyzeSvgPageMetrics, svgHasVisibleContent } from './svg-render-evidence.mjs';

function svgWithText({ y, textLength = 20 }) {
  const provenance = 'data-section="0" data-paragraph="7" data-control="2" data-cell-index="4" data-row="1" data-column="2"';
  return `<svg><defs><clipPath id="cell-clip-1" ${provenance}><rect x="10" y="10" width="100" height="30"/></clipPath></defs><g clip-path="url(#cell-clip-1)" ${provenance}><text x="12" y="${y}" font-size="10" textLength="${textLength}">가</text></g></svg>`;
}

test('SVG evidence distinguishes visible cell text from clipped source text', () => {
  const visible = svgWithText({ y: 25 });
  const clipped = svgWithText({ y: 48 });

  assert.equal(svgHasVisibleContent(visible), true);
  assert.deepEqual(analyzeSvgCellClipping(visible), {
    ok: true,
    clipCount: 1,
    issues: [],
  });
  const report = analyzeSvgCellClipping(clipped);
  assert.equal(report.ok, false);
  assert.equal(report.issues[0].clipId, 'cell-clip-1');
  assert.deepEqual(report.issues[0].provenance, {
    native: { section: 0, paragraph: 7, control: 2 },
    cell: { number: 4, row: 1, column: 2 },
  });
  assert.equal(report.issues[0].samples[0].verticalClip, true);
});

test('SVG evidence detects horizontal overflow when renderer supplies textLength', () => {
  const report = analyzeSvgCellClipping(svgWithText({ y: 25, textLength: 120 }));
  assert.equal(report.ok, false);
  assert.equal(report.issues[0].samples[0].horizontalClip, true);
});

test('SVG page metrics expose dimensions, line density, fonts, and images', () => {
  const svg = '<svg viewBox="0 0 600 800"><text x="10" y="20" font-size="8">alpha</text><text x="10" y="40" font-size="12">beta</text><image x="0" y="0" width="10" height="10"/></svg>';
  assert.deepEqual(analyzeSvgPageMetrics(svg), {
    page: { width: 600, height: 800 },
    textCount: 2,
    lineCount: 2,
    imageCount: 1,
    drawableCount: 3,
    minFontSize: 8,
    maxFontSize: 12,
    textCharacters: 9,
    contentBox: { left: 0, top: 0, right: 10, bottom: 43 },
    verticalOccupancy: 0.05375,
    sparseContent: false,
  });
});
