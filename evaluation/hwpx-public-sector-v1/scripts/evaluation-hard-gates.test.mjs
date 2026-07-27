import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findIntroducedDirectIdentifiers,
  visibleDocumentText,
} from './evaluation-hard-gates.mjs';

test('direct identifier gate allows identifiers already present in the source but rejects introduced values', () => {
  const baseline = '담당부서 대표전화 02-1234-5678';
  assert.deepEqual(findIntroducedDirectIdentifiers(baseline, `${baseline}\n전자우편 audit@example.go.kr`), [
    { kind: 'email', value: 'audit@example.go.kr' },
  ]);
  assert.deepEqual(findIntroducedDirectIdentifiers(baseline, baseline), []);
});

test('direct identifier gate detects Korean resident registration numbers with or without a hyphen', () => {
  assert.deepEqual(findIntroducedDirectIdentifiers('', '식별번호 900101-1234567'), [
    { kind: 'residentRegistrationNumber', value: '900101-1234567' },
  ]);
  assert.deepEqual(findIntroducedDirectIdentifiers('', '식별번호 9001012234567'), [
    { kind: 'residentRegistrationNumber', value: '9001012234567' },
  ]);
});

test('visible document text includes paragraphs and table cells without serializing package metadata', () => {
  const text = visibleDocumentText({
    sections: [{ paragraphs: [{ text: '본문 A' }, { text: '본문 B' }] }],
    tables: [{ rows: [{ cells: [{ text: '셀 C' }] }] }],
    packageEntries: [{ name: 'secret@example.com' }],
  });
  assert.match(text, /본문 A/);
  assert.match(text, /셀 C/);
  assert.doesNotMatch(text, /secret@example\.com/);
});
