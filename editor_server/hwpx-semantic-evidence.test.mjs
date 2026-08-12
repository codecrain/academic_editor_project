import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeHwpxSemanticEvidence, suggestHwpxTemplateRegions } from './hwpx-semantic-evidence.mjs';

function fixture() {
  return {
    editableTargets: {
      paragraphs: [
        { id: 'p0', kind: 'paragraph', text: '작성 요령은 제출하지 않습니다', location: { paragraph: { section: 0, number: 0 } }, pageHint: 1 },
        { id: 'p1', kind: 'paragraph', text: '', location: { paragraph: { section: 0, number: 1 } }, pageHint: 1 },
      ],
      cells: [
        { id: 'c0', kind: 'cell', text: '재확인 필요', location: { tableId: 'tbl_0', cell: { number: 0 } }, pageHint: 1 },
        { id: 'c1', kind: 'cell', text: '000000-0000000', location: { tableId: 'tbl_0', cell: { number: 1 } }, pageHint: 1 },
      ],
    },
    objectGraph: {
      pictures: [{ id: 'pic0', native: { section: 0, paragraph: 2, control: 0 }, properties: {
        treatAsChar: false, textWrap: 'Square', vertRelTo: 'Paper', horzRelTo: 'Paper', vertOffset: 0, horzOffset: 0,
      } }],
    },
  };
}

test('template suggestions remain advisory and expose reasons', () => {
  const suggestions = suggestHwpxTemplateRegions(fixture());
  assert.ok(suggestions.some(item => item.role === 'instruction' && item.confidence === 'high'));
  assert.ok(suggestions.some(item => item.role === 'fillable-unresolved'));
});

test('submission profile fails unresolved, dummy, required blank, explicit instruction, and floating image risks', () => {
  const result = analyzeHwpxSemanticEvidence(fixture(), {
    profile: 'submission',
    templatePolicy: {
      requiredLocations: [{ paragraph: { section: 0, number: 1 } }],
      instructionLocations: [{ paragraph: { section: 0, number: 0 } }],
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(new Set(result.issues.filter(issue => issue.severity === 'error').map(issue => issue.code)), new Set([
    'submission-author-instruction-remains',
    'submission-required-target-blank',
    'submission-unresolved-placeholder',
    'submission-dummy-identifier',
    'render-floating-image-flow-risk',
  ]));
});

test('structural profile reports semantic signals without rejecting them', () => {
  const result = analyzeHwpxSemanticEvidence(fixture(), { profile: 'structural' });
  assert.equal(result.ok, true);
  assert.equal(result.counts.unresolvedTargets, 1);
  assert.equal(result.counts.riskyFloatingImages, 1);
});
