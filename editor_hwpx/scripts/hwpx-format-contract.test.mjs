import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORMAT_SCOPES,
  assertFormatSourceSupport,
  normalizeFormatProperties,
  projectMeasuredFormatProperties,
} from './hwpx-format-contract.mjs';

const validCases = [
  ['character', { bold: true }],
  ['character', { fontSizePt: 10.5, color: '#112233' }],
  ['character', { fontFamily: '함초롬바탕' }],
  ['character', { ratios: [100, 100, 100, 100, 100, 100, 100] }],
  ['paragraph', { alignment: 'justify', lineSpacing: 160 }],
  ['paragraph', { indent: -1000, marginLeft: 2000, spacingAfter: 500 }],
  ['paragraph', { headType: 'Number', paraLevel: 2, numberingId: 1 }],
  ['paragraph', { margins: { left: 100, right: 200 } }],
  ['cell', { paddingLeft: 200, verticalAlign: 'center' }],
  ['cell', { borderLeft: { type: 1, width: 10, color: '#000000' } }],
  ['table', { cellSpacing: 100, repeatHeader: true, pageBreak: 'RowBreak' }],
  ['table', { treatAsChar: false, textWrap: 'TopAndBottom', horzAlign: 'Center' }],
  ['image', { treatAsChar: true, width: 10000, height: 8000 }],
  ['image', { cropLeft: 10, cropRight: 20, paddingBottom: 120 }],
  ['shape', { rotationAngle: 9000, horzFlip: true, fillType: 'solid' }],
  ['shape', { tbMarginLeft: 100, tbVerticalAlign: 'Center', roundRate: 20 }],
];

for (const [scope, properties] of validCases) {
  test(`format contract accepts ${scope}: ${Object.keys(properties).join(',')}`, () => {
    const normalized = normalizeFormatProperties(scope, properties, { resolveFontId: () => 7 });
    assert.ok(Object.keys(normalized).length > 0);
  });
}

const invalidCases = [
  ['missing scope', 'unknown', { bold: true }, 'HWPX_FORMAT_SCOPE_INVALID'],
  ['empty properties', 'character', {}, 'HWPX_FORMAT_PROPERTIES_REQUIRED'],
  ['unknown property', 'paragraph', { magicIndent: 3 }, 'HWPX_FORMAT_PROPERTY_UNSUPPORTED'],
  ['wrong boolean', 'character', { bold: 1 }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['negative font size', 'character', { fontSizePt: -1 }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['bad color', 'character', { color: 'red' }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['bad array length', 'character', { spacings: [1, 2] }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['paragraph level overflow', 'paragraph', { paraLevel: 7 }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['unknown margin', 'paragraph', { margins: { top: 1 } }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['zero cell width', 'cell', { width: 0 }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['bad cell vertical align', 'cell', { verticalAlign: 'middle' }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['bad wrap mode', 'table', { textWrap: 'around' }, 'HWPX_FORMAT_VALUE_INVALID'],
  ['unsupported image caption creation', 'image', { hasCaption: true }, 'HWPX_FORMAT_PROPERTY_UNSUPPORTED'],
  ['bad shape alpha', 'shape', { fillAlpha: 256 }, 'HWPX_FORMAT_VALUE_INVALID'],
];

for (const [name, scope, properties, code] of invalidCases) {
  test(`format contract rejects ${name}`, () => {
    assert.throws(
      () => normalizeFormatProperties(scope, properties, { resolveFontId: () => 7 }),
      error => error?.code === code,
    );
  });
}

test('format contract scopes expose no duplicate property names inside a scope', () => {
  for (const fields of Object.values(FORMAT_SCOPES)) {
    assert.equal(new Set(Object.keys(fields)).size, Object.keys(fields).length);
  }
});

test('format contract source-gates proven HWPX serializer gaps', () => {
  assert.throws(
    () => assertFormatSourceSupport('paragraph', { keepWithNext: true }, 'hwpx'),
    error => error?.code === 'HWPX_FORMAT_PROPERTY_REQUIRES_HWP_SOURCE',
  );
  assert.doesNotThrow(() => assertFormatSourceSupport('paragraph', { keepWithNext: true }, 'hwp'));
  assert.doesNotThrow(() => assertFormatSourceSupport('paragraph', { alignment: 'center' }, 'hwpx'));
});

test('measured style projection rounds native fractional units and omits invalid fields', () => {
  assert.deepEqual(projectMeasuredFormatProperties('paragraph', {
    alignment: 'justify',
    spacingBefore: 26.7,
    paraLevel: 99,
    unknownMeasuredField: 1,
  }, ['alignment', 'spacingBefore', 'paraLevel']), {
    properties: { alignment: 'justify', spacingBefore: 27 },
    omittedFields: ['paraLevel'],
  });
});
