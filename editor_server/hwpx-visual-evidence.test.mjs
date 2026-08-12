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
        characterFormat: { fontSize: 1600, fontFamily: '휴먼명조' },
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

test('public proposal blocks low occupancy, small text, off-center content images, and weak font dominance', () => {
  const proposalSvg = `
  <svg viewBox="0 0 800 1000">
    <defs><clipPath id="body-clip-0"><rect x="50" y="50" width="700" height="900"/></clipPath></defs>
    <text x="60" y="100" font-size="6" fill="#000000">short body</text>
    <image x="60" y="120" width="300" height="100"/>
  </svg>`;
  const result = analyzeHwpxVisualEvidence({
    profile: 'public-proposal',
    renderedPages: [{ page: 1, svg: proposalSvg, layout: { pageMetrics: { minFontSize: 6, textCharacters: 300, verticalOccupancy: 0.2 } } }],
    json: {
      sections: [{ paragraphs: [
        { text: '충분히 긴 첫 번째 본문 문단입니다.', characterFormat: { fontFamily: 'A', fontSize: 1100 } },
        { text: '충분히 긴 두 번째 본문 문단입니다.', characterFormat: { fontFamily: 'B', fontSize: 1100 } },
      ] }],
    },
  });
  const codes = new Set(result.issues.map((issue) => issue.code));
  assert.ok(codes.has('render-sparse-page'));
  assert.ok(codes.has('render-font-size-below-policy'));
  assert.ok(codes.has('render-image-not-visually-centered'));
  assert.ok(codes.has('style-body-font-dominance-low'));
});

test('public proposal recognizes a table-cell chapter at the start of a rendered page', () => {
  const result = analyzeHwpxVisualEvidence({
    profile: 'public-proposal',
    targetMap: {
      paragraphs: [{ id: 'p0', pageHint: 1, text: '앞 절 본문', flow: { section: 0, paragraph: 1, order: 0 } }],
      cells: [
        { id: 'c0', pageHint: 2, text: '3. 기업의 사업화 추진 역량', characterFormat: { fontSize: 1600 }, flow: { section: 0, paragraph: 2, order: 1 } },
        { id: 'c1', pageHint: 2, text: '뒤따르는 본문 내용입니다.', flow: { section: 0, paragraph: 3, order: 1 } },
      ],
    },
  });
  assert.equal(result.headings.issueCount, 0);
});

test('public proposal does not mistake dates, questionnaire items, or multiline numbered prose for chapters', () => {
  const result = analyzeHwpxVisualEvidence({
    profile: 'public-proposal',
    targetMap: {
      paragraphs: [
        { id: 'date', pageHint: 1, text: '2025. 09. 15.', characterFormat: { fontSize: 1600 }, flow: { section: 0, paragraph: 1, order: 0 } },
        { id: 'question', pageHint: 1, text: '1. 현재 신청인은 체납 중인가요?', characterFormat: { fontSize: 1600 }, flow: { section: 0, paragraph: 2, order: 0 } },
        { id: 'prose', pageHint: 1, text: '1. 사업화 추진 배경\n상세한 본문 설명', characterFormat: { fontSize: 1600 }, flow: { section: 0, paragraph: 3, order: 0 } },
      ],
    },
  });
  assert.equal(result.headings.issueCount, 0);
});
