import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeHwpxVisualEvidence, normalizeVisualPolicy } from './hwpx-visual-evidence.mjs';

const svg = `
<svg viewBox="0 0 800 1000">
  <defs><clipPath id="body-clip-0"><rect x="50" y="50" width="700" height="900"/></clipPath></defs>
  <g clip-path="url(#body-clip-0)">
    <text x="60" y="80" fill="#000000">body</text>
    <text x="60" y="100" fill="#0000ff">instruction</text>
    <image x="0" y="0" width="100" height="30"/>
  </g>
</svg>`;

test('visual policy treats colored text and out-of-body images as submission errors', () => {
  const result = analyzeHwpxVisualEvidence({
    profile: 'submission',
    renderedPages: [{ page: 1, svg, layout: { pageMetrics: { textCharacters: 30, verticalOccupancy: 0.5 } } }],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    'render-colored-text', 'render-image-outside-body',
  ]);
});

test('structural visual review remains advisory unless caller enables enforcement', () => {
  const result = analyzeHwpxVisualEvidence({
    profile: 'structural',
    renderedPages: [{ page: 1, svg, layout: { pageMetrics: { textCharacters: 30, verticalOccupancy: 0.5 } } }],
  });
  assert.equal(result.ok, true);
  assert.ok(result.issues.every((issue) => issue.severity === 'warning'));
});

test('heading policy catches chapter flow flags without guessing protected regions', () => {
  const result = analyzeHwpxVisualEvidence({
    profile: 'submission',
    visualPolicy: { requireChapterPageBreak: true, requireHeadingKeepWithNext: true },
    targetMap: {
      paragraphs: [{
        id: 's0_p1', pageHint: 2, text: '3. 기업의 사업화 추진 역량',
        hierarchy: { pageBreakBefore: false, keepWithNext: false },
      }],
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    'heading-page-break-missing', 'heading-keep-with-next-missing',
  ]);
});

test('visual policy normalizes safe defaults and rejects impossible occupancy', () => {
  const normalized = normalizeVisualPolicy({ allowedTextColors: ['000000', '#000000'] }, 'submission');
  assert.deepEqual(normalized.allowedTextColors, ['#000000']);
  assert.throws(() => normalizeVisualPolicy({ minVerticalOccupancy: 2 }), /between 0 and 1/);
});
