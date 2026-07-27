import assert from 'node:assert/strict';
import test from 'node:test';

import { createZip, readZip } from './hwpx-zip.mjs';
import { applyTrackedReplacement } from './hwpx-tracked-changes.mjs';

function fixture(text = '교체전_원문_2026') {
  return createZip([
    ['mimetype', Buffer.from('application/hwp+zip')],
    ['Contents/header.xml', Buffer.from(
      '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">'
      + '<hh:refList></hh:refList></hh:head>',
    )],
    ['Contents/section0.xml', Buffer.from(
      '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
      + 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">'
      + `<hp:p id="1"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run></hp:p>`
      + '</hs:sec>',
    )],
  ]);
}

test('writes the native Delete plus Insert representation observed in Hancom Office', () => {
  const result = applyTrackedReplacement(fixture(), {
    target: { native: { section: 0, para: 0, offset: 0, length: 11 } },
    text: '교체후_수정문_2026',
    author: '공공기관 검수자',
    date: '2026-07-27T09:49:00Z',
  });
  const entries = readZip(result.bytes);
  const header = entries.get('Contents/header.xml').toString('utf8');
  const section = entries.get('Contents/section0.xml').toString('utf8');

  assert.match(header, /<hh:trackChanges itemCnt="2">/);
  assert.match(header, /<hh:trackChange type="Insert"[^>]* id="1"\/>/);
  assert.match(header, /<hh:trackChange type="Delete"[^>]* id="2"\/>/);
  assert.match(header, /<hh:trackChangeAuthor name="공공기관 검수자" mark="1" id="1"\/>/);
  assert.match(section, /<hp:deleteBegin Id="2" TcId="2"\/>교체전_원문_2026<hp:deleteEnd Id="2" TcId="2" paraend="0"\/>/);
  assert.match(section, /<hp:insertBegin Id="3" TcId="1"\/>교체후_수정문_2026<hp:insertEnd Id="3" TcId="1" paraend="0"\/>/);
  assert.deepEqual(result.changeTypes, ['Delete', 'Insert']);
});

test('writes insertion-only and deletion-only changes without fake companion revisions', () => {
  const inserted = applyTrackedReplacement(fixture(''), {
    target: { native: { section: 0, para: 0, offset: 0, length: 0 } },
    text: '신규',
    author: '검수자',
    date: '2026-07-27T09:49:00Z',
  });
  const insertedEntries = readZip(inserted.bytes);
  assert.equal((insertedEntries.get('Contents/header.xml').toString('utf8').match(/<hh:trackChange\b/g) ?? []).length, 1);
  assert.match(insertedEntries.get('Contents/section0.xml').toString('utf8'), /insertBegin/);

  const deleted = applyTrackedReplacement(fixture('삭제'), {
    target: { native: { section: 0, para: 0, offset: 0, length: 2 } },
    text: '',
    author: '검수자',
    date: '2026-07-27T09:49:00Z',
  });
  const deletedEntries = readZip(deleted.bytes);
  assert.equal((deletedEntries.get('Contents/header.xml').toString('utf8').match(/<hh:trackChange\b/g) ?? []).length, 1);
  assert.doesNotMatch(deletedEntries.get('Contents/section0.xml').toString('utf8'), /insertBegin/);
});

test('rejects cross-run ranges without mutating the input package', () => {
  const source = fixture('가</hp:t></hp:run><hp:run><hp:t>나');
  assert.throws(() => applyTrackedReplacement(source, {
    target: { native: { section: 0, para: 0, offset: 0, length: 2 } },
    text: '교체',
    author: '검수자',
  }), error => error.code === 'HWPX_TRACKED_CHANGE_RANGE_UNSUPPORTED');
});
