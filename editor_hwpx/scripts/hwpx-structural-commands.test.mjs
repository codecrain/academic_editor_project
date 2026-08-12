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
  }, { before: {
    sections: [{ section: 0, paragraphs: [{ para: 2, text: '기존 문단' }] }],
  } });

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
    getParagraphLength: () => 8,
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

test('appendParagraph clones a paragraph style source before writing text', () => {
  const calls = [];
  const doc = {
    getStyleAt: (...args) => {
      calls.push(['getStyleAt', ...args]);
      return '{"id":7,"name":"보고서 본문"}';
    },
    getParaPropertiesAt: (...args) => {
      calls.push(['getParaPropertiesAt', ...args]);
      return '{"alignment":"left","paraShapeId":11}';
    },
    getCharPropertiesAt: (...args) => {
      calls.push(['getCharPropertiesAt', ...args]);
      return '{"fontSize":1000,"bold":false,"charShapeId":13}';
    },
    insertParagraph: (...args) => {
      calls.push(['insertParagraph', ...args]);
      return '{"ok":true,"paraIdx":3,"newParagraphCount":4}';
    },
    applyStyle: (...args) => {
      calls.push(['applyStyle', ...args]);
      return '{"ok":true}';
    },
    applyParaFormat: (...args) => {
      calls.push(['applyParaFormat', ...args.slice(0, 2), JSON.parse(args[2])]);
      return '{"ok":true}';
    },
    applyCharFormat: (...args) => {
      calls.push(['applyCharFormat', ...args.slice(0, 4), JSON.parse(args[4])]);
      return '{"ok":true}';
    },
    insertText: (...args) => {
      calls.push(['insertText', ...args]);
      return '{"ok":true,"charOffset":5}';
    },
  };

  const result = applyHwpxStructuralCommand(doc, {
    op: 'appendParagraph',
    target: { paragraph: { section: 0, number: 1 } },
    styleSource: { paragraph: { section: 0, number: 2 } },
    text: '신규 문단',
  });

  assert.deepEqual(calls, [
    ['getStyleAt', 0, 2],
    ['getParaPropertiesAt', 0, 2],
    ['getCharPropertiesAt', 0, 2, 0],
    ['insertParagraph', 0, 2],
    ['applyStyle', 0, 3, 7],
    ['applyParaFormat', 0, 3, { alignment: 'left' }],
    ['insertText', 0, 3, 0, '신규 문단'],
    ['applyCharFormat', 0, 3, 0, 5, { fontSize: 1000, bold: false }],
  ]);
  assert.equal(result.native.style.ok, true);
  assert.equal(result.native.style.source.kind, 'paragraph');
  assert.equal(result.native.style.styleId, 7);
  assert.equal(result.expectedText, '신규 문단');
  assert.equal(result.expectedStyleId, 7);
  assert.equal(result.expectedParaShapeId, 11);
  assert.equal(result.expectedCharShapeId, 13);
});

test('appendParagraph clones an inspected table-cell paragraph style source', () => {
  const calls = [];
  const doc = {
    getCellStyleAt: (...args) => {
      calls.push(['getCellStyleAt', ...args]);
      return '{"id":4,"name":"표 본문"}';
    },
    getCellParaPropertiesAt: (...args) => {
      calls.push(['getCellParaPropertiesAt', ...args]);
      return '{"alignment":"center","paraShapeId":21}';
    },
    getCellCharPropertiesAt: (...args) => {
      calls.push(['getCellCharPropertiesAt', ...args]);
      return '{"fontSize":900,"bold":true,"charShapeId":22}';
    },
    insertParagraph: () => '{"ok":true,"paraIdx":6,"newParagraphCount":7}',
    applyStyle: (...args) => {
      calls.push(['applyStyle', ...args]);
      return '{"ok":true}';
    },
    applyParaFormat: (...args) => {
      calls.push(['applyParaFormat', ...args.slice(0, 2), JSON.parse(args[2])]);
      return '{"ok":true}';
    },
    applyCharFormat: (...args) => {
      calls.push(['applyCharFormat', ...args.slice(0, 4), JSON.parse(args[4])]);
      return '{"ok":true}';
    },
    insertText: () => '{"ok":true,"charOffset":4}',
  };
  const context = {
    before: {
      tables: [{
        id: 'tbl_0',
        native: { section: 1, paragraph: 3, control: 0 },
        cells: [{
          native: {
            section: 1,
            paragraph: 3,
            control: 0,
            cellIndex: 2,
            cellParagraphIndex: 1,
          },
          location: { cell: { number: 2 } },
        }],
      }],
    },
  };

  const result = applyHwpxStructuralCommand(doc, {
    op: 'appendParagraph',
    target: { paragraph: { section: 1, number: 5 } },
    styleSource: { tableId: 'tbl_0', cell: { number: 2 }, cellParagraphIndex: 1 },
    text: '표 서식',
  }, context);

  assert.deepEqual(calls, [
    ['getCellStyleAt', 1, 3, 0, 2, 1],
    ['getCellParaPropertiesAt', 1, 3, 0, 2, 1],
    ['getCellCharPropertiesAt', 1, 3, 0, 2, 1, 0],
    ['applyStyle', 1, 6, 4],
    ['applyParaFormat', 1, 6, { alignment: 'center' }],
    ['applyCharFormat', 1, 6, 0, 4, { fontSize: 900, bold: true }],
  ]);
  assert.equal(result.expectedStyleId, 4);
});

test('appendParagraph rejects unresolved or ambiguous style sources before mutation', () => {
  const mutations = [];
  const doc = {
    getStyleAt: () => '{"name":"missing id"}',
    getParaPropertiesAt: () => '{"alignment":"left","paraShapeId":1}',
    getCharPropertiesAt: () => '{"fontSize":1000,"charShapeId":1}',
    insertParagraph: (...args) => mutations.push(['insertParagraph', ...args]),
    applyStyle: (...args) => mutations.push(['applyStyle', ...args]),
    applyParaFormat: (...args) => mutations.push(['applyParaFormat', ...args]),
    applyCharFormat: (...args) => mutations.push(['applyCharFormat', ...args]),
    insertText: (...args) => mutations.push(['insertText', ...args]),
  };

  assert.throws(() => applyHwpxStructuralCommand(doc, {
    op: 'appendParagraph',
    target: { paragraph: { section: 0, number: 1 } },
    styleSource: { paragraph: { section: 0, number: 2 } },
    text: '실패',
  }), error => error.code === 'HWPX_STYLE_SOURCE_UNRESOLVED');
  assert.deepEqual(mutations, []);
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

test('insertText rejects omitted offsets and values outside the RHWP u32 range', () => {
  const calls = [];
  const doc = { insertText: (...args) => calls.push(args) };
  const invalidTargets = [
    { sectionIndex: 0, paragraphIndex: 2 },
    { sectionIndex: 2 ** 32, paragraphIndex: 0, offset: 0 },
    { sectionIndex: 0, paragraphIndex: 2, offset: 2 ** 32 },
  ];

  for (const target of invalidTargets) {
    assert.throws(
      () => applyHwpxStructuralCommand(doc, {
        op: 'insertText',
        target,
        text: '금지',
      }),
      error => error.code === 'HWPX_TARGET_INVALID',
    );
  }
  assert.deepEqual(calls, []);
});

test('target aliases cannot hide invalid preferred fields or overflow derived indices', () => {
  const calls = [];
  const doc = {
    getParagraphLength: () => 1,
    insertText: (...args) => calls.push(['insertText', ...args]),
    insertParagraph: (...args) => calls.push(['insertParagraph', ...args]),
  };

  assert.throws(
    () => applyHwpxStructuralCommand(doc, {
      op: 'insertText',
      target: {
        sectionIndex: 2 ** 32,
        section: 0,
        paragraphIndex: 0,
        offset: 0,
      },
      text: '금지',
    }),
    error => error.code === 'HWPX_TARGET_INVALID',
  );
  assert.throws(
    () => applyHwpxStructuralCommand(doc, {
      op: 'appendParagraph',
      target: { sectionIndex: 0, paragraphIndex: 0xFFFF_FFFF },
      text: '금지',
    }),
    error => error.code === 'HWPX_TARGET_INVALID',
  );
  assert.deepEqual(calls, []);
});

test('deleteRange rejects offsets beyond the inspected paragraph before mutation', () => {
  const calls = [];
  const doc = { deleteRange: (...args) => calls.push(args) };
  assert.throws(() => applyHwpxStructuralCommand(doc, {
    op: 'deleteRange',
    target: {
      start: { sectionIndex: 0, paragraphIndex: 1, offset: 1 },
      end: { sectionIndex: 0, paragraphIndex: 1, offset: 99 },
    },
  }, {
    before: {
      sections: [{ section: 0, paragraphs: [{ para: 1, text: '세글자' }] }],
    },
  }), error => error.code === 'HWPX_INVALID_RANGE');
  assert.deepEqual(calls, []);
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
      }, command, {
        before: {
          sections: [{ section: 0, paragraphs: [{ para: 0, text: '' }] }],
        },
      }),
      error => error.code === 'HWPX_ENGINE_RESULT_INVALID',
    );
  }
});

test('native results must be successful objects with required u32 fields', () => {
  const command = {
    op: 'insertText',
    target: { sectionIndex: 0, paragraphIndex: 0, offset: 0 },
    text: '검증',
  };
  const context = {
    before: {
      sections: [{ section: 0, paragraphs: [{ para: 0, text: '' }] }],
    },
  };
  for (const invalidResult of [
    [],
    '{}',
    '{"ok":true}',
    '{"ok":true,"charOffset":-1}',
    '{"ok":true,"charOffset":"2"}',
  ]) {
    assert.throws(
      () => applyHwpxStructuralCommand({
        insertText: () => invalidResult,
      }, command, context),
      error => error.code === 'HWPX_ENGINE_RESULT_INVALID',
    );
  }

  const calls = [];
  assert.throws(
    () => applyHwpxStructuralCommand({
      insertParagraph: () => '{"ok":true}',
      insertText: (...args) => calls.push(args),
    }, {
      op: 'appendParagraph',
      target: { sectionIndex: 0, paragraphIndex: 0 },
      text: '후속 호출 금지',
    }),
    error => error.code === 'HWPX_ENGINE_RESULT_INVALID',
  );
  assert.deepEqual(calls, []);
});

test('table.create calls createTableEx at the inspected paragraph end and returns a native table target', () => {
  const calls = [];
  const doc = {
    getParagraphLength: () => 5,
    createTableEx: (json) => {
      calls.push(JSON.parse(json));
      return '{"ok":true,"paraIdx":2,"controlIdx":0}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'table.create',
    target: { sectionIndex: 0, paragraphIndex: 1 },
    rows: 3,
    columns: 4,
  });

  assert.deepEqual(calls, [{
    sectionIdx: 0,
    paraIdx: 1,
    charOffset: 5,
    rowCount: 3,
    colCount: 4,
    treatAsChar: false,
  }]);
  assert.deepEqual(result.target, {
    kind: 'table',
    sectionIndex: 0,
    paragraphIndex: 2,
    controlIndex: 0,
  });
  assert.deepEqual(result.createdTargets, [result.target]);
});

test('table.insertCaption creates a native caption and writes its text through the caption cell', () => {
  const calls = [];
  const doc = {
    setTableProperties: (...args) => {
      calls.push(['setTableProperties', ...args.slice(0, 3), JSON.parse(args[3])]);
      return '{"ok":true,"captionCharOffset":4}';
    },
    deleteTextInCell: (...args) => {
      calls.push(['deleteTextInCell', ...args]);
      return '{"ok":true}';
    },
    insertTextInCell: (...args) => {
      calls.push(['insertTextInCell', ...args]);
      return '{"ok":true,"charOffset":13}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'table.insertCaption',
    target: { tableId: 'tbl_0' },
    text: '평가 결과',
    position: 'before',
  }, {
    before: {
      tables: [{
        id: 'tbl_0',
        native: { section: 1, paragraph: 3, control: 2 },
      }],
    },
  });

  assert.deepEqual(calls, [
    ['setTableProperties', 1, 3, 2, {
      hasCaption: true,
      captionDirection: 2,
      captionAutoNumber: false,
    }],
    ['deleteTextInCell', 1, 3, 2, 65534, 0, 0, 4],
    ['insertTextInCell', 1, 3, 2, 65534, 0, 0, '평가 결과'],
  ]);
  assert.deepEqual(result.target, {
    kind: 'tableCaption',
    sectionIndex: 1,
    paragraphIndex: 3,
    controlIndex: 2,
  });
});

test('table.insertCaption rejects an existing native caption before mutation', () => {
  const calls = [];
  const doc = {
    getTableProperties: () => '{"hasCaption":true,"captionDirection":2}',
    setTableProperties: (...args) => calls.push(args),
    deleteTextInCell: (...args) => calls.push(args),
    insertTextInCell: (...args) => calls.push(args),
  };
  assert.throws(() => applyHwpxStructuralCommand(doc, {
    op: 'table.insertCaption',
    target: {
      native: { section: 0, paragraph: 1, control: 2 },
    },
    text: '중복 금지',
  }), error => error.code === 'HWPX_CAPTION_ALREADY_EXISTS');
  assert.deepEqual(calls, []);
});

test('table.autoFit measures rendered cell content and grows every cell in the row', () => {
  const calls = [];
  const heights = [1000, 1200, 900, 900];
  const rows = [0, 0, 1, 1];
  const doc = {
    getCellProperties: (_section, _paragraph, _control, cellIndex) => JSON.stringify({
      height: heights[cellIndex],
      paddingTop: 100,
      paddingBottom: 100,
    }),
    getCellParagraphCount: () => 2,
    getCellParagraphLength: () => 8,
    getCursorRectInCell: (_section, _paragraph, _control, _cell, paragraph, offset) => JSON.stringify(
      paragraph === 0 && offset === 0
        ? { pageIndex: 0, y: 10, height: 12 }
        : { pageIndex: 0, y: 50, height: 12 },
    ),
    getTableDimensions: () => JSON.stringify({ cellCount: 4 }),
    getCellInfo: (_section, _paragraph, _control, cellIndex) => JSON.stringify({ row: rows[cellIndex] }),
    resizeTableCells: (...args) => {
      calls.push([...args.slice(0, 3), JSON.parse(args[3])]);
      return '{"ok":true}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'table.autoFit',
    target: { tableId: 'tbl_0', cell: { number: 0 } },
    extraPadding: 100,
  }, {
    before: {
      tables: [{
        id: 'tbl_0',
        native: { section: 1, paragraph: 3, control: 2 },
        cells: [{
          native: {
            section: 1,
            paragraph: 3,
            control: 2,
            cellIndex: 0,
            cellParagraphIndex: 0,
          },
        }],
      }],
    },
  });

  assert.equal(result.measuredContentHeight, 3900);
  assert.equal(result.expectedCellHeight, 4200);
  assert.deepEqual(calls, [[1, 3, 2, [
    { cellIdx: 0, heightDelta: 3200 },
    { cellIdx: 1, heightDelta: 3000 },
  ]]]);
});

test('table.create lower-level adapter exercises width, height, cell text, and caption path', () => {
  const calls = [];
  const doc = {
    getParagraphLength: () => 2,
    createTableEx: (json) => {
      calls.push(['createTableEx', JSON.parse(json)]);
      return '{"ok":true,"paraIdx":2,"controlIdx":0}';
    },
    getCellProperties: (...args) => {
      calls.push(['getCellProperties', ...args]);
      return '{"width":1500,"height":282}';
    },
    resizeTableCells: (...args) => {
      calls.push(['resizeTableCells', ...args.slice(0, 3), JSON.parse(args[3])]);
      return '{"ok":true}';
    },
    insertTextInCell: (...args) => {
      calls.push(['insertTextInCell', ...args]);
      return '{"ok":true,"charOffset":1}';
    },
    getTableProperties: () => '{"hasCaption":false}',
    setTableProperties: (...args) => {
      calls.push(['setTableProperties', ...args.slice(0, 3), JSON.parse(args[3])]);
      return '{"ok":true,"captionCharOffset":4}';
    },
    deleteTextInCell: (...args) => {
      calls.push(['deleteTextInCell', ...args]);
      return '{"ok":true}';
    },
  };
  applyHwpxStructuralCommand(doc, {
    op: 'table.create',
    target: { sectionIndex: 0, paragraphIndex: 1 },
    rows: 2,
    columns: 2,
    width: 4000,
    height: 2000,
    cellTexts: ['가', '나', '', '라'],
    caption: '평가표',
  });

  assert.deepEqual(calls[0], ['createTableEx', {
    sectionIdx: 0,
    paraIdx: 1,
    charOffset: 2,
    rowCount: 2,
    colCount: 2,
    treatAsChar: false,
  }]);
  assert.deepEqual(calls.slice(1, 5), [
    ['getCellProperties', 0, 2, 0, 0],
    ['getCellProperties', 0, 2, 0, 1],
    ['getCellProperties', 0, 2, 0, 2],
    ['getCellProperties', 0, 2, 0, 3],
  ]);
  assert.deepEqual(calls[5], ['resizeTableCells', 0, 2, 0, [
    { cellIdx: 0, widthDelta: 500, heightDelta: 718 },
    { cellIdx: 1, widthDelta: 500, heightDelta: 718 },
    { cellIdx: 2, widthDelta: 500, heightDelta: 718 },
    { cellIdx: 3, widthDelta: 500, heightDelta: 718 },
  ]]);
  assert.deepEqual(calls.slice(6, 9), [
    ['insertTextInCell', 0, 2, 0, 0, 0, 0, '가'],
    ['insertTextInCell', 0, 2, 0, 1, 0, 0, '나'],
    ['insertTextInCell', 0, 2, 0, 3, 0, 0, '라'],
  ]);
  assert.deepEqual(calls.slice(9), [
    ['setTableProperties', 0, 2, 0, {
      hasCaption: true,
      captionDirection: 2,
      captionAutoNumber: false,
    }],
    ['deleteTextInCell', 0, 2, 0, 65534, 0, 0, 4],
    ['insertTextInCell', 0, 2, 0, 65534, 0, 0, '평가표'],
  ]);
});

test('image.insertAfterParagraph registers decoded bytes in a new paragraph', () => {
  const calls = [];
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const doc = {
    insertParagraph: (...args) => {
      calls.push(['insertParagraph', ...args]);
      return '{"ok":true,"paraIdx":4,"newParagraphCount":6}';
    },
    insertPicture: (...args) => {
      calls.push(['insertPicture', ...args]);
      return '{"ok":true,"paraIdx":4,"controlIdx":0}';
    },
    setPictureProperties: (...args) => {
      calls.push(['setPictureProperties', ...args.slice(0, 3), JSON.parse(args[3])]);
      return '{"ok":true}';
    },
    getPictureProperties: (...args) => {
      calls.push(['getPictureProperties', ...args]);
      return '{"treatAsChar":true,"vertRelTo":"Paper","horzRelTo":"Paper","textWrap":"Square","width":75,"height":75}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'image.insertAfterParagraph',
    target: { sectionIndex: 0, paragraphIndex: 2 },
    bytesBase64: png.toString('base64'),
    mimeType: 'image/png',
    altText: '기관 로고',
  });

  assert.deepEqual(calls[0], ['insertParagraph', 0, 3]);
  assert.equal(calls[1][0], 'insertPicture');
  assert.deepEqual(calls[1].slice(1, 5), [0, 4, 0, '']);
  assert.deepEqual(Buffer.from(calls[1][5]), png);
  assert.deepEqual(calls[1].slice(6), [75, 75, 1, 1, 'png', '기관 로고', null, null]);
  assert.deepEqual(calls[2], ['setPictureProperties', 0, 4, 0, {
    treatAsChar: true,
    textWrap: 'TopAndBottom',
    vertRelTo: 'Para',
    vertAlign: 'Top',
    horzRelTo: 'Para',
    horzAlign: 'Center',
    vertOffset: 0,
    horzOffset: 0,
    allowOverlap: false,
    restrictInPage: true,
    keepWithAnchor: true,
    width: 75,
    height: 75,
  }]);
  assert.deepEqual(calls[3], ['getPictureProperties', 0, 4, 0]);
  assert.equal(result.verifiedInlinePlacement, true);
  assert.equal(result.native.actualPlacement.treatAsChar, true);
  assert.deepEqual(result.target, {
    kind: 'image',
    sectionIndex: 0,
    paragraphIndex: 4,
    controlIndex: 0,
  });
});

test('image.insertAfterParagraph preserves aspect ratio and creates its advertised caption paragraph', () => {
  const calls = [];
  const pngHeader = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(pngHeader, 0);
  pngHeader.writeUInt32BE(2, 16);
  pngHeader.writeUInt32BE(1, 20);
  const doc = {
    insertParagraph: (...args) => {
      calls.push(['insertParagraph', ...args]);
      const paraIdx = args[1];
      return JSON.stringify({ ok: true, paraIdx, newParagraphCount: paraIdx + 2 });
    },
    insertPicture: (...args) => {
      calls.push(['insertPicture', ...args]);
      return '{"ok":true,"paraIdx":3,"controlIdx":1}';
    },
    setPictureProperties: (...args) => {
      calls.push(['setPictureProperties', ...args.slice(0, 3), JSON.parse(args[3])]);
      return '{"ok":true}';
    },
    getPictureProperties: (...args) => {
      calls.push(['getPictureProperties', ...args]);
      return '{"treatAsChar":true,"width":300,"height":150}';
    },
    insertText: (...args) => {
      calls.push(['insertText', ...args]);
      return '{"ok":true,"charOffset":5}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'image.insertAfterParagraph',
    target: { sectionIndex: 0, paragraphIndex: 2 },
    bytes: pngHeader,
    width: 300,
    caption: '그림 1',
  });

  assert.deepEqual(calls[0], ['insertParagraph', 0, 3]);
  assert.deepEqual(calls[1].slice(6, 10), [300, 150, 2, 1]);
  assert.equal(calls[2][0], 'setPictureProperties');
  assert.deepEqual(calls.slice(4), [
    ['insertParagraph', 0, 4],
    ['insertText', 0, 4, 0, '그림 1'],
  ]);
  assert.deepEqual(result.createdTargets, [
    {
      kind: 'image',
      sectionIndex: 0,
      paragraphIndex: 3,
      controlIndex: 1,
    },
    {
      kind: 'paragraph',
      sectionIndex: 0,
      paragraphIndex: 4,
    },
  ]);
});

test('image.insertInCell centers a bounded native picture on the exact inspected cell', () => {
  const calls = [];
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const doc = {
    insertPicture: (...args) => {
      calls.push(['insertPicture', ...args]);
      return '{"ok":true,"paraIdx":2,"controlIdx":7}';
    },
    setPictureProperties: (...args) => {
      calls.push(['setPictureProperties', ...args]);
      return '{"ok":true}';
    },
    getPictureProperties: (...args) => {
      calls.push(['getPictureProperties', ...args]);
      return '{"treatAsChar":false,"horzRelTo":"Paper","vertRelTo":"Paper","horzOffset":182500,"vertOffset":160000,"width":75,"height":75}';
    },
  };
  const context = {
    before: {
      tables: [{
        id: 'tbl_0',
        section: 0,
        para: 2,
        control: 3,
        tableOrderInParagraph: 0,
        cells: [{
          cellIndex: 4,
          paragraphs: [{ index: 0, text: '' }],
          style: { cell: { width: 5000, height: 3000, paddingLeft: 100, paddingRight: 100, paddingTop: 100, paddingBottom: 100 } },
          layout: { bbox: { x: 2400, y: 2100, w: 80, h: 60 } },
          native: { section: 0, paragraph: 2, control: 3, cellIndex: 4 },
        }],
      }],
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'image.insertInCell',
    target: { tableId: 'tbl_0', cell: { number: 4 } },
    bytesBase64: png.toString('base64'),
    mimeType: 'image/png',
    altText: '대표자 서명',
  }, context);

  const cellPath = JSON.stringify([{ controlIndex: 3, cellIndex: 4, cellParaIndex: 0 }]);
  assert.deepEqual(calls[0].slice(1, 5), [0, 2, 0, cellPath]);
  assert.deepEqual(Buffer.from(calls[0][5]), png);
  assert.equal(calls[1][0], 'setPictureProperties');
  const requestedPlacement = JSON.parse(calls[1][4]);
  assert.equal(requestedPlacement.horzOffset, 182963);
  assert.equal(requestedPlacement.vertOffset, 159713);
  assert.deepEqual(calls[2], ['getPictureProperties', 0, 2, 7]);
  assert.equal(result.target.controlIndex, 3);
  assert.equal(result.target.cellIndex, 4);
  assert.equal(result.createdTargets[0].controlIndex, 7);
  assert.equal(result.placementMode, 'cell-anchored-overlay');
  assert.equal(result.placement.treatAsChar, false);
});

test('image.insertAfterParagraph rejects a native engine that does not persist inline placement', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const doc = {
    insertParagraph: () => '{"ok":true,"paraIdx":1}',
    insertPicture: () => '{"ok":true,"paraIdx":1,"controlIdx":0}',
    setPictureProperties: () => '{"ok":true}',
    getPictureProperties: () => '{"treatAsChar":false,"vertRelTo":"Paper","horzRelTo":"Paper","textWrap":"Square"}',
  };
  assert.throws(() => applyHwpxStructuralCommand(doc, {
    op: 'image.insertAfterParagraph',
    target: { sectionIndex: 0, paragraphIndex: 0 },
    bytesBase64: png.toString('base64'),
    mimeType: 'image/png',
  }), error => error.code === 'HWPX_IMAGE_PLACEMENT_VERIFICATION_FAILED');
});

test('setPageSetup maps public fields to the RHWP PageDef payload', () => {
  const calls = [];
  const doc = {
    getSectionCount: () => 2,
    setPageDef: (section, json) => {
      calls.push([section, JSON.parse(json)]);
      return '{"ok":true,"pageCount":7}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'setPageSetup',
    sectionIndex: 1,
    width: 59528,
    height: 84189,
    orientation: 'landscape',
    margins: {
      top: 5669,
      right: 4252,
      bottom: 5669,
      left: 4252,
      header: 2835,
      footer: 2835,
      gutter: 0,
    },
  });

  assert.deepEqual(calls, [[1, {
    width: 59528,
    height: 84189,
    marginTop: 5669,
    marginRight: 4252,
    marginBottom: 5669,
    marginLeft: 4252,
    marginHeader: 2835,
    marginFooter: 2835,
    marginGutter: 0,
    landscape: true,
  }]]);
  assert.equal(result.native.pageCount, 7);
});

test('setHeaderFooter creates, writes, and aligns the requested native control', () => {
  const calls = [];
  const doc = {
    getSectionCount: () => 1,
    createHeaderFooter: (...args) => {
      calls.push(['createHeaderFooter', ...args]);
      return '{"ok":true,"kind":"footer","applyTo":2,"paraIndex":0,"controlIndex":3}';
    },
    insertTextInHeaderFooter: (...args) => {
      calls.push(['insertTextInHeaderFooter', ...args]);
      return '{"ok":true,"charOffset":9}';
    },
    applyParaFormatInHf: (...args) => {
      calls.push(['applyParaFormatInHf', ...args.slice(0, 4), JSON.parse(args[4])]);
      return '{"ok":true}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'setHeaderFooter',
    target: { sectionIndex: 0 },
    type: 'footer',
    applyTo: 'odd',
    text: '내부검토용',
    align: 'center',
  });

  assert.deepEqual(calls, [
    ['createHeaderFooter', 0, false, 2],
    ['insertTextInHeaderFooter', 0, false, 2, 0, 0, '내부검토용'],
    ['applyParaFormatInHf', 0, false, 2, 0, { alignment: 'center' }],
  ]);
  assert.deepEqual(result.target, {
    kind: 'headerFooter',
    sectionIndex: 0,
    paragraphIndex: 0,
    controlIndex: 3,
    type: 'footer',
    applyTo: 'odd',
  });
});

test('insertFootnote creates the reference and writes the native footnote body', () => {
  const calls = [];
  const doc = {
    getParagraphLength: () => 10,
    insertFootnote: (...args) => {
      calls.push(['insertFootnote', ...args]);
      return '{"ok":true,"paraIdx":2,"controlIdx":4,"footnoteNumber":1}';
    },
    insertTextInFootnote: (...args) => {
      calls.push(['insertTextInFootnote', ...args]);
      return '{"ok":true,"charOffset":8}';
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'insertFootnote',
    target: { sectionIndex: 0, paragraphIndex: 2, offset: 5 },
    text: '기준일 주석',
  });

  assert.deepEqual(calls, [
    ['insertFootnote', 0, 2, 5],
    ['insertTextInFootnote', 0, 2, 4, 0, 2, '기준일 주석'],
  ]);
  assert.deepEqual(result.target, {
    kind: 'footnote',
    sectionIndex: 0,
    paragraphIndex: 2,
    controlIndex: 4,
    footnoteNumber: 1,
  });
});

test('object and page adapters reject invalid inputs before any RHWP mutation', () => {
  const calls = [];
  const doc = new Proxy({
    getSectionCount: () => 1,
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args) => calls.push([property, ...args]);
    },
  });

  const invalidCommands = [
    {
      command: {
        op: 'table.create',
        target: { sectionIndex: 0, paragraphIndex: 0 },
        rows: 0,
        columns: 2,
      },
      code: 'HWPX_TABLE_DIMENSIONS_INVALID',
    },
    {
      command: {
        op: 'image.insertAfterParagraph',
        target: { sectionIndex: 0, paragraphIndex: 0 },
      },
      code: 'HWPX_IMAGE_REQUIRED',
    },
    {
      command: {
        op: 'setPageSetup',
        sectionIndex: 4,
        width: 10,
        height: 10,
      },
      code: 'HWPX_SECTION_INVALID',
    },
    {
      command: {
        op: 'setHeaderFooter',
        target: { sectionIndex: 0 },
        type: 'side-note',
        text: '금지',
      },
      code: 'HWPX_HEADER_FOOTER_TYPE_INVALID',
    },
    {
      command: {
        op: 'insertFootnote',
        target: { sectionIndex: 0, paragraphIndex: 0, offset: 0 },
        text: '   ',
      },
      code: 'HWPX_FOOTNOTE_TEXT_REQUIRED',
    },
  ];

  for (const { command, code } of invalidCommands) {
    assert.throws(
      () => applyHwpxStructuralCommand(doc, command),
      error => error.code === code,
    );
  }
  assert.deepEqual(calls, []);
});

test('multi-step adapters verify every required method and geometry before first mutation', () => {
  const captionCalls = [];
  assert.throws(() => applyHwpxStructuralCommand({
    setTableProperties: (...args) => captionCalls.push(args),
  }, {
    op: 'table.insertCaption',
    target: { native: { section: 0, paragraph: 1, control: 0 } },
    text: '금지',
  }), error => error.code === 'HWPX_ENGINE_METHOD_UNAVAILABLE');
  assert.deepEqual(captionCalls, []);

  const headerCalls = [];
  assert.throws(() => applyHwpxStructuralCommand({
    getSectionCount: () => 1,
    getHeaderFooter: () => '{"ok":true,"exists":true}',
    deleteHeaderFooter: (...args) => {
      headerCalls.push(args);
      return '{"ok":true}';
    },
  }, {
    op: 'setHeaderFooter',
    target: { sectionIndex: 0 },
    type: 'header',
    text: '금지',
  }), error => error.code === 'HWPX_ENGINE_METHOD_UNAVAILABLE');
  assert.deepEqual(headerCalls, []);

  const pageCalls = [];
  assert.throws(() => applyHwpxStructuralCommand({
    getSectionCount: () => 1,
    setPageDef: (...args) => pageCalls.push(args),
  }, {
    op: 'setPageSetup',
    sectionIndex: 0,
    width: 1000,
    height: 1000,
    margins: { left: 600, right: 500, top: 10, bottom: 10 },
  }), error => error.code === 'HWPX_PAGE_SETUP_INVALID');
  assert.deepEqual(pageCalls, []);

  const tableCalls = [];
  assert.throws(() => applyHwpxStructuralCommand({
    getParagraphLength: () => 1,
    createTableEx: (...args) => tableCalls.push(args),
  }, {
    op: 'table.create',
    target: { sectionIndex: 0, paragraphIndex: 0 },
    rows: 2,
    columns: 2,
    height: 399,
  }), error => error.code === 'HWPX_TABLE_DIMENSIONS_INVALID');
  assert.deepEqual(tableCalls, []);
});

test('image insertion rejects declared MIME that conflicts with the binary signature', () => {
  const calls = [];
  const pngHeader = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(pngHeader, 0);
  pngHeader.writeUInt32BE(1, 16);
  pngHeader.writeUInt32BE(1, 20);
  assert.throws(() => applyHwpxStructuralCommand({
    insertParagraph: (...args) => calls.push(args),
    insertPicture: (...args) => calls.push(args),
  }, {
    op: 'image.insertAfterParagraph',
    target: { sectionIndex: 0, paragraphIndex: 0 },
    bytes: pngHeader,
    mimeType: 'image/jpeg',
  }), error => error.code === 'HWPX_IMAGE_FORMAT_UNSUPPORTED');
  assert.deepEqual(calls, []);

  assert.throws(() => applyHwpxStructuralCommand({
    insertParagraph: (...args) => calls.push(args),
    insertPicture: (...args) => calls.push(args),
  }, {
    op: 'image.insertAfterParagraph',
    target: { sectionIndex: 0, paragraphIndex: 0 },
    bytes: pngHeader,
    mimeType: 'application/pdf',
  }), error => error.code === 'HWPX_IMAGE_FORMAT_UNSUPPORTED');
  assert.deepEqual(calls, []);
});

test('defineStyle creates a style and applies advertised character and paragraph properties', () => {
  const calls = [];
  const doc = {
    createStyle: (json) => {
      calls.push(['createStyle', JSON.parse(json)]);
      return 12;
    },
    updateStyleShapes: (styleId, charJson, paraJson) => {
      calls.push([
        'updateStyleShapes',
        styleId,
        JSON.parse(charJson),
        JSON.parse(paraJson),
      ]);
      return true;
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'defineStyle',
    name: '공공기관_강조',
    kind: 'paragraph',
    properties: {
      fontSizePt: 12,
      bold: true,
      align: 'center',
      spacingAfter: 300,
    },
  });

  assert.deepEqual(calls, [
    ['createStyle', {
      name: '공공기관_강조',
      englishName: '',
      type: 0,
      nextStyleId: 0,
    }],
    ['updateStyleShapes', 12, {
      fontSize: 1200,
      bold: true,
    }, {
      alignment: 'center',
      spacingAfter: 300,
    }],
  ]);
  assert.deepEqual(result.native, { styleId: 12, shapesUpdated: true });
  assert.deepEqual(result.target, { kind: 'style', styleId: 12 });
});

test('applyStyle, setRunStyle, and setParagraphStyle call the body RHWP format APIs', () => {
  const calls = [];
  const doc = {
    getParagraphLength: () => 10,
    applyStyle: (...args) => {
      calls.push(['applyStyle', ...args]);
      return '{"ok":true}';
    },
    applyCharFormat: (...args) => {
      calls.push(['applyCharFormat', ...args.slice(0, 4), JSON.parse(args[4])]);
      return '{"ok":true}';
    },
    applyParaFormat: (...args) => {
      calls.push(['applyParaFormat', ...args.slice(0, 2), JSON.parse(args[2])]);
      return '{"ok":true}';
    },
  };
  applyHwpxStructuralCommand(doc, {
    op: 'applyStyle',
    target: { sectionIndex: 0, paragraphIndex: 2 },
    styleId: 12,
  });
  applyHwpxStructuralCommand(doc, {
    op: 'setRunStyle',
    target: { sectionIndex: 0, paragraphIndex: 2, offset: 2, length: 4 },
    style: { bold: true, fontSizePt: 11, color: '#123456' },
  });
  applyHwpxStructuralCommand(doc, {
    op: 'setParagraphStyle',
    target: { sectionIndex: 0, paragraphIndex: 2 },
    style: {
      align: 'right',
      lineSpacing: 180,
      margins: { left: 300, right: 200 },
    },
  });

  assert.deepEqual(calls, [
    ['applyStyle', 0, 2, 12],
    ['applyCharFormat', 0, 2, 2, 6, {
      bold: true,
      fontSize: 1100,
      textColor: '#123456',
    }],
    ['applyParaFormat', 0, 2, {
      alignment: 'right',
      lineSpacing: 180,
      marginLeft: 300,
      marginRight: 200,
    }],
  ]);
});

test('style adapters resolve inspected table cells to the RHWP cell format APIs', () => {
  const calls = [];
  const doc = {
    getCellParagraphLength: () => 7,
    applyCellStyle: (...args) => {
      calls.push(['applyCellStyle', ...args]);
      return '{"ok":true}';
    },
    applyCharFormatInCell: (...args) => {
      calls.push(['applyCharFormatInCell', ...args.slice(0, 7), JSON.parse(args[7])]);
      return '{"ok":true}';
    },
    applyParaFormatInCell: (...args) => {
      calls.push(['applyParaFormatInCell', ...args.slice(0, 5), JSON.parse(args[5])]);
      return '{"ok":true}';
    },
  };
  const context = {
    before: {
      tables: [{
        id: 'tbl_0',
        native: { section: 1, paragraph: 3, control: 2 },
        cells: [{
          location: { tableId: 'tbl_0', cell: { number: 4 } },
          native: {
            section: 1,
            paragraph: 3,
            control: 2,
            cellIndex: 4,
          },
        }],
      }],
    },
  };
  const target = { tableId: 'tbl_0', cell: { number: 4 } };
  applyHwpxStructuralCommand(doc, {
    op: 'applyStyle',
    target,
    styleId: 9,
  }, context);
  applyHwpxStructuralCommand(doc, {
    op: 'setRunStyle',
    target,
    style: { italic: true },
  }, context);
  applyHwpxStructuralCommand(doc, {
    op: 'setParagraphStyle',
    target,
    style: { align: 'center' },
  }, context);

  assert.deepEqual(calls, [
    ['applyCellStyle', 1, 3, 2, 4, 0, 9],
    ['applyCharFormatInCell', 1, 3, 2, 4, 0, 0, 7, { italic: true }],
    ['applyParaFormatInCell', 1, 3, 2, 4, 0, { alignment: 'center' }],
  ]);
});

test('style adapters treat direct cellIndex targets as table cells', () => {
  const calls = [];
  const doc = {
    applyCellStyle: (...args) => {
      calls.push(['applyCellStyle', ...args]);
      return '{"ok":true}';
    },
  };
  applyHwpxStructuralCommand(doc, {
    op: 'applyStyle',
    target: {
      sectionIndex: 1,
      paragraphIndex: 3,
      controlIndex: 2,
      cellIndex: 4,
    },
    styleId: 9,
  });
  assert.deepEqual(calls, [
    ['applyCellStyle', 1, 3, 2, 4, 0, 9],
  ]);
});

test('cell paragraph formatting honors an explicit paragraph index over the inspected cell default', () => {
  const calls = [];
  const doc = {
    applyParaFormatInCell: (...args) => {
      calls.push([...args.slice(0, 5), JSON.parse(args[5])]);
      return '{"ok":true}';
    },
  };
  const context = {
    before: {
      tables: [{
        id: 'tbl_0',
        cells: [{
          cellIndex: 2,
          native: {
            sectionIndex: 0,
            paragraphIndex: 3,
            controlIndex: 1,
            cellIndex: 2,
            cellParagraphIndex: 0,
          },
        }],
      }],
    },
  };
  applyHwpxStructuralCommand(doc, {
    op: 'setParagraphStyle',
    target: { tableId: 'tbl_0', cell: { number: 2 }, cellParagraphIndex: 4 },
    style: { indent: -1907 },
  }, context);
  assert.deepEqual(calls, [[0, 3, 1, 2, 4, { indent: -1907 }]]);
});

test('direct cell targets keep one alias precedence and honor cell paragraph aliases', () => {
  const calls = [];
  const doc = {
    applyCellStyle: (...args) => {
      calls.push(args);
      return '{"ok":true}';
    },
  };
  applyHwpxStructuralCommand(doc, {
    op: 'applyStyle',
    target: {
      sectionIndex: 1,
      paragraphIndex: 3,
      controlIndex: 2,
      cellIndex: 4,
      cellParagraphIndex: 6,
      native: {
        sectionIndex: 10,
        paragraphIndex: 30,
        controlIndex: 20,
        cellIndex: 5,
        cellParagraphIndex: 7,
      },
    },
    styleId: 9,
  });
  assert.deepEqual(calls, [
    [1, 3, 2, 4, 6, 9],
  ]);
});

test('setRunStyle validates the range before registering a font family', () => {
  const calls = [];
  const doc = {
    getParagraphLength: () => 3,
    findOrCreateFontId: (...args) => {
      calls.push(['findOrCreateFontId', ...args]);
      return 4;
    },
    applyCharFormat: (...args) => {
      calls.push(['applyCharFormat', ...args]);
      return '{"ok":true}';
    },
  };
  assert.throws(() => applyHwpxStructuralCommand(doc, {
    op: 'setRunStyle',
    target: { sectionIndex: 0, paragraphIndex: 0, offset: 4 },
    style: { fontFamily: 'New Font' },
  }), error => error.code === 'HWPX_INVALID_RANGE');
  assert.deepEqual(calls, []);
});

test('style IDs outside the HWP u8 model are rejected', () => {
  assert.throws(() => applyHwpxStructuralCommand({
    applyStyle: () => {
      throw new Error('must not mutate');
    },
  }, {
    op: 'applyStyle',
    target: { sectionIndex: 0, paragraphIndex: 0 },
    styleId: 256,
  }), error => error.code === 'HWPX_STYLE_ID_INVALID');

  const calls = [];
  assert.throws(() => applyHwpxStructuralCommand({
    createStyle: (...args) => calls.push(['createStyle', ...args]),
    updateStyleShapes: (...args) => calls.push(['updateStyleShapes', ...args]),
  }, {
    op: 'defineStyle',
    name: 'Invalid next style',
    kind: 'paragraph',
    nextStyleId: 256,
    properties: { bold: true },
  }), error => error.code === 'HWPX_STYLE_ID_INVALID');
  assert.deepEqual(calls, []);
});

test('setDocumentMetadata passes all public fields to the native metadata API', () => {
  const calls = [];
  const metadata = {
    title: '2026년 경영평가 보고서',
    subject: '기관 경영실적',
    author: '기획조정실',
    keywords: '경영평가,공공기관',
    description: '대외 제출용 최종본',
  };
  const doc = {
    setDocumentMetadata: (json) => {
      calls.push(JSON.parse(json));
      return JSON.stringify({ ok: true, changed: 5, metadata });
    },
  };
  const result = applyHwpxStructuralCommand(doc, {
    op: 'setDocumentMetadata',
    ...metadata,
  });
  assert.deepEqual(calls, [metadata]);
  assert.equal(result.native.changed, 5);
  assert.deepEqual(result.target, { kind: 'documentMetadata' });
});
