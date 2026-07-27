import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyHwpxStructuralCommand,
  resolveHwpxTextTarget,
} from './hwpx-structural-commands.mjs';

test('insertText resolves a paragraph target and returns a stable target', () => {
  const calls = [];
  const doc = {
    insertText: (...args) => {
      calls.push(args);
      return '{"ok":true,"charOffset":7}';
    },
  };

  const result = applyHwpxStructuralCommand(doc, {
    op: 'insertText',
    target: { sectionIndex: 0, paragraphIndex: 2, offset: 4 },
    text: '확정',
  });

  assert.deepEqual(calls, [[0, 2, 4, '확정']]);
  assert.equal(result.changed, 1);
  assert.deepEqual(result.target, {
    kind: 'paragraph',
    sectionIndex: 0,
    paragraphIndex: 2,
    offset: 7,
  });
  assert.equal(result.native.charOffset, 7);
});

test('deleteRange calls the five-argument RHWP range API', () => {
  const calls = [];
  const doc = {
    deleteRange: (...args) => {
      calls.push(args);
      return '{"ok":true,"paraIdx":3,"charOffset":2}';
    },
  };

  const result = applyHwpxStructuralCommand(doc, {
    op: 'deleteRange',
    target: {
      start: { sectionIndex: 1, paragraphIndex: 3, offset: 2 },
      end: { sectionIndex: 1, paragraphIndex: 3, offset: 6 },
    },
  });

  assert.deepEqual(calls, [[1, 3, 2, 3, 6]]);
  assert.equal(result.changed, 1);
  assert.deepEqual(result.target, {
    kind: 'paragraph',
    sectionIndex: 1,
    paragraphIndex: 3,
    offset: 2,
  });
});

test('deleteRange rejects reversed and cross-paragraph ranges before mutation', () => {
  const calls = [];
  const doc = { deleteRange: (...args) => calls.push(args) };

  assert.throws(() => applyHwpxStructuralCommand(doc, {
    op: 'deleteRange',
    target: {
      start: { sectionIndex: 0, paragraphIndex: 1, offset: 8 },
      end: { sectionIndex: 0, paragraphIndex: 1, offset: 3 },
    },
  }), error => error.code === 'HWPX_INVALID_RANGE');

  assert.throws(() => applyHwpxStructuralCommand(doc, {
    op: 'deleteRange',
    target: {
      start: { sectionIndex: 0, paragraphIndex: 1, offset: 2 },
      end: { sectionIndex: 0, paragraphIndex: 2, offset: 3 },
    },
  }), error => error.code === 'HWPX_INVALID_RANGE');

  assert.deepEqual(calls, []);
});

test('appendParagraph inserts after the target and reports the created paragraph', () => {
  const calls = [];
  const doc = {
    insertParagraph: (...args) => {
      calls.push(['insertParagraph', ...args]);
      return '{"ok":true,"paraIdx":5,"newParagraphCount":8}';
    },
    insertText: (...args) => {
      calls.push(['insertText', ...args]);
      return '{"ok":true,"charOffset":6}';
    },
  };

  const result = applyHwpxStructuralCommand(doc, {
    op: 'appendParagraph',
    target: { paragraph: { section: 2, number: 4 } },
    text: '새 문단',
  });

  assert.deepEqual(calls, [
    ['insertParagraph', 2, 5],
    ['insertText', 2, 5, 0, '새 문단'],
  ]);
  assert.equal(result.changed, 1);
  assert.deepEqual(result.target, {
    kind: 'paragraph',
    sectionIndex: 2,
    paragraphIndex: 5,
    offset: 6,
  });
  assert.deepEqual(result.createdTargets, [{
    kind: 'paragraph',
    sectionIndex: 2,
    paragraphIndex: 5,
  }]);
  assert.equal(result.native.paragraph.paraIdx, 5);
  assert.equal(result.native.text.charOffset, 6);
});

test('resolveHwpxTextTarget accepts native range targets', () => {
  assert.deepEqual(resolveHwpxTextTarget({
    native: { section: 3, para: 7, offset: 9, length: 4 },
  }), {
    sectionIndex: 3,
    paragraphIndex: 7,
    offset: 9,
    length: 4,
  });
});

test('unsupported structural operations fail explicitly', () => {
  assert.throws(
    () => applyHwpxStructuralCommand({}, { op: 'unknown.structural' }),
    error => error.code === 'HWPX_STRUCTURAL_OP_UNSUPPORTED',
  );
});

test('native engine failures never become successful structural results', () => {
  const command = {
    op: 'insertText',
    target: { sectionIndex: 0, paragraphIndex: 0, offset: 0 },
    text: '실패',
  };

  for (const nativeFailure of [
    { ok: false, error: 'object failure' },
    '{"ok":false,"error":"string failure"}',
  ]) {
    assert.throws(
      () => applyHwpxStructuralCommand({
        insertText: () => nativeFailure,
      }, command),
      error => error.code === 'HWPX_ENGINE_RESULT_INVALID',
    );
  }
});
