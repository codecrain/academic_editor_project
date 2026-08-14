import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeHwpxVisualEvidence } from './hwpx-visual-evidence.mjs';

const svg = `
<svg viewBox="0 0 800 1000">
  <defs><clipPath id="body-clip-0"><rect x="50" y="50" width="700" height="900"/></clipPath></defs>
  <g clip-path="url(#body-clip-0)">
    <text x="60" y="80" fill="#000000">body</text>
    <text x="60" y="100" fill="#0000ff">colored</text>
    <image x="0" y="0" width="100" height="30"/>
    <image x="250" y="200" width="300" height="100"/>
  </g>
</svg>`;

test('visual evidence reports colors and measured image geometry without editorial issues', () => {
  const result = analyzeHwpxVisualEvidence({
    renderedPages: [{ page: 1, svg, layout: { pageMetrics: { textCharacters: 30, verticalOccupancy: 0.5 } } }],
  });
  assert.equal(result.interpretation, 'objective-only');
  assert.deepEqual(result.pages[0].colors, { '#000000': 1, '#0000ff': 1 });
  assert.equal(result.pages[0].images.length, 2);
  assert.equal(result.pages[0].images[0].insideBody, false);
  assert.equal(result.pages[0].images[1].insideBody, true);
  assert.equal(result.occupancy.medianVerticalOccupancy, 0.5);
  assert.equal(Object.hasOwn(result, 'issues'), false);
});

test('visual evidence reports exact style distribution and target flow facts', () => {
  const result = analyzeHwpxVisualEvidence({
    json: { sections: [{ paragraphs: [
      { text: 'first paragraph', characterFormat: { fontFamily: 'A', fontSize: 1100, textColor: '000000' } },
      { text: 'second paragraph', characterFormat: { fontFamily: 'B', fontSizePt: 11, textColor: '#0000ff' } },
      { text: 'third paragraph', characterFormat: { fontFamily: 'A', fontSizePt: 10 } },
    ] }] },
    targetMap: { paragraphs: [{ id: 'p1', kind: 'paragraph', pageHint: 2, text: '3. section', hierarchy: { outlineLevel: 0 } }] },
  });
  assert.deepEqual(result.styles.fontFamilies, { A: 2, B: 1 });
  assert.equal(result.styles.dominantFont, 'A');
  assert.equal(result.styles.dominantFontRatio, 2 / 3);
  assert.equal(result.targetFlow.targetCount, 1);
  assert.equal(result.targetFlow.examples[0].page, 2);
  assert.equal(result.targetFlow.examples[0].hierarchy.outlineLevel, 0);
});
