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

test('public proposal blocks unavailable data, unclassified instructions, and text-only signatures', () => {
  const value = fixture();
  value.editableTargets.cells.push(
    { id: 'c2', kind: 'cell', text: '자료 미제공', pictureCount: 0, location: { tableId: 'tbl_0', cell: { number: 2 } }, pageHint: 1 },
    { id: 'c3', kind: 'cell', text: '대표자: 신해용 (인)', pictureCount: 0, location: { tableId: 'tbl_0', cell: { number: 3 } }, pageHint: 1 },
  );
  const result = analyzeHwpxSemanticEvidence(value, { profile: 'public-proposal' });
  assert.equal(result.ok, false);
  assert.equal(result.counts.unresolvedTargets, 2);
  assert.equal(result.counts.missingExecutionObjectTargets, 1);
  assert.ok(result.issues.some((issue) => issue.code === 'submission-author-instruction-remains' && issue.severity === 'error'));
  assert.ok(result.issues.some((issue) => issue.code === 'submission-execution-object-missing'));
});

test('public proposal accepts an execution field with a persisted picture', () => {
  const value = fixture();
  value.editableTargets.paragraphs = [];
  value.editableTargets.cells = [{
    id: 'signed', kind: 'cell', text: '대표자: 신해용 (인)', pictureCount: 1,
    location: { tableId: 'tbl_0', cell: { number: 3 } }, pageHint: 1,
  }];
  value.objectGraph.pictures = [];
  const result = analyzeHwpxSemanticEvidence(value, { profile: 'public-proposal' });
  assert.equal(result.counts.missingExecutionObjectTargets, 0);
});

test('public proposal accepts a native HWP signature spatially anchored inside its target cell', () => {
  const value = fixture();
  value.editableTargets.paragraphs = [];
  value.editableTargets.cells = [{
    id: 'signed', kind: 'cell', text: '대표자: 신해용 (서명)', pictureCount: 0, pageHint: 2,
    layout: { bbox: { x: 100, y: 200, width: 300, height: 100 } },
    location: { tableId: 'tbl_0', cell: { number: 3 } },
  }];
  value.objectGraph.pictures = [{
    id: 'native-signature', pageHint: 2, bounds: { x: 220, y: 220, width: 80, height: 40 },
    properties: { treatAsChar: false, textWrap: 'Square', vertRelTo: 'Paper', horzRelTo: 'Paper' },
  }];
  const result = analyzeHwpxSemanticEvidence(value, { profile: 'public-proposal' });
  assert.equal(result.counts.missingExecutionObjectTargets, 0);
  assert.equal(result.counts.riskyFloatingImages, 0);
});

test('public proposal accepts a safe inline signature paragraph immediately after the labelled field', () => {
  const value = fixture();
  value.editableTargets.cells = [];
  value.editableTargets.paragraphs = [{
    id: 'seal-label', kind: 'paragraph', text: '법인명 : 코드크레인 유한회사 (인)',
    pageHint: 13, native: { section: 0, paragraph: 138 },
    location: { paragraph: { section: 0, number: 138 } },
  }];
  value.objectGraph.pictures = [{
    id: 'inline-seal', pageHint: 13, native: { section: 0, paragraph: 139, control: 0 },
    properties: { treatAsChar: true, textWrap: 'TopAndBottom', vertRelTo: 'Para', horzRelTo: 'Para' },
  }];
  const result = analyzeHwpxSemanticEvidence(value, { profile: 'public-proposal' });
  assert.equal(result.counts.missingExecutionObjectTargets, 0);
  assert.equal(result.counts.riskyFloatingImages, 0);
});

test('public proposal rejects a native picture that does not overlap the signature cell', () => {
  const value = fixture();
  value.editableTargets.paragraphs = [];
  value.editableTargets.cells = [{
    id: 'unsigned', kind: 'cell', text: '대표자: 신해용 (서명)', pictureCount: 0, pageHint: 2,
    layout: { bbox: { x: 100, y: 200, width: 300, height: 100 } },
    location: { tableId: 'tbl_0', cell: { number: 3 } },
  }];
  value.objectGraph.pictures = [{
    id: 'unrelated-picture', pageHint: 2, bounds: { x: 700, y: 900, width: 80, height: 40 },
    properties: { treatAsChar: false, textWrap: 'Square', vertRelTo: 'Paper', horzRelTo: 'Paper' },
  }];
  const result = analyzeHwpxSemanticEvidence(value, { profile: 'public-proposal' });
  assert.equal(result.counts.missingExecutionObjectTargets, 1);
  assert.equal(result.counts.riskyFloatingImages, 1);
});
