import assert from 'node:assert/strict';
import test from 'node:test';

import { createZip } from './hwpx-zip.mjs';
import { analyzeTrackedChangeProbe } from './hwpx-tracked-change-probe.mjs';

const TRACKED_TEXT = '변경추적_원문_2026';

function packageFixture({
  text = '',
  tracked = false,
  author = '공공기관 검수자',
  trackId = 1,
  markerTrackId = trackId,
} = {}) {
  const headerRevision = tracked
    ? `<hh:trackChanges itemCnt="1"><hh:trackChange type="Insert" date="2026-07-27T09:33:00Z" authorID="1" hide="0" id="${trackId}"/></hh:trackChanges><hh:trackChangeAuthors itemCnt="1"><hh:trackChangeAuthor name="${author}" mark="1" id="1"/></hh:trackChangeAuthors>`
    : '';
  const sectionText = tracked
    ? `<hp:insertBegin Id="2" TcId="${markerTrackId}"/>${text}<hp:insertEnd Id="2" TcId="${markerTrackId}" paraend="0"/>`
    : text;

  return createZip([
    ['mimetype', Buffer.from('application/hwp+zip')],
    ['Contents/content.hpf', Buffer.from(
      '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:manifest>'
      + '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>'
      + '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>'
      + '</opf:manifest></opf:package>',
    )],
    ['Contents/header.xml', Buffer.from(
      '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">'
      + `<hh:refList>${headerRevision}</hh:refList>`
      + '<hh:trackchageConfig flags="57"/>'
      + '</hh:head>',
    )],
    ['Contents/section0.xml', Buffer.from(
      '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
      + 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">'
      + `<hp:p><hp:run><hp:t>${sectionText}</hp:t></hp:run></hp:p>`
      + '</hs:sec>',
    )],
    ['Preview/PrvText.txt', Buffer.from(`${text}\r\n`)],
  ]);
}

function replacementPackageFixture({
  text,
  tracked = false,
  original = '교체전_원문_2026',
  replacement = '교체후_수정문_2026',
} = {}) {
  const headerRevision = tracked
    ? '<hh:trackChanges itemCnt="2">'
      + '<hh:trackChange type="Insert" date="2026-07-27T09:49:00Z" authorID="1" hide="0" id="1"/>'
      + '<hh:trackChange type="Delete" date="2026-07-27T09:49:00Z" authorID="1" hide="0" id="2"/>'
      + '</hh:trackChanges>'
      + '<hh:trackChangeAuthors itemCnt="1"><hh:trackChangeAuthor name="공공기관 검수자" mark="1" id="1"/></hh:trackChangeAuthors>'
    : '';
  const sectionText = tracked
    ? `<hp:deleteBegin Id="2" TcId="2"/>${original}<hp:deleteEnd Id="2" TcId="2" paraend="0"/>`
      + `<hp:insertBegin Id="3" TcId="1"/>${replacement}<hp:insertEnd Id="3" TcId="1" paraend="0"/>`
    : text ?? original;

  return createZip([
    ['mimetype', Buffer.from('application/hwp+zip')],
    ['Contents/header.xml', Buffer.from(
      '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head">'
      + `<hh:refList>${headerRevision}</hh:refList>`
      + '<hh:trackchageConfig flags="57"/>'
      + '</hh:head>',
    )],
    ['Contents/section0.xml', Buffer.from(
      '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
      + 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">'
      + `<hp:p><hp:run><hp:t>${sectionText}</hp:t></hp:run></hp:p>`
      + '</hs:sec>',
    )],
  ]);
}

test('reports hwpx-xml only when native revision markup survives reopen and accept/reject agree', () => {
  const result = analyzeTrackedChangeProbe({
    baseline: packageFixture(),
    tracked: packageFixture({ text: TRACKED_TEXT, tracked: true }),
    reopened: packageFixture({ text: TRACKED_TEXT, tracked: true }),
    accepted: packageFixture({ text: TRACKED_TEXT }),
    rejected: packageFixture(),
  });

  assert.equal(result.representation, 'hwpx-xml');
  assert.equal(result.supported, true);
  assert.equal(result.revision.type, 'Insert');
  assert.equal(result.revision.author, '공공기관 검수자');
  assert.equal(result.revision.text, TRACKED_TEXT);
  assert.equal(result.checks.reopenedPreservesRevision, true);
  assert.equal(result.checks.acceptedKeepsTextWithoutRevision, true);
  assert.equal(result.checks.rejectedRemovesTextAndRevision, true);
  assert.equal(result.evidence.length, 5);
  assert.ok(result.evidence.every(item => /^[a-f0-9]{64}$/.test(item.sha256)));
  assert.ok(result.evidence.every(item => Array.isArray(item.changedEntries)));
});

test('does not mistake a plain text replacement for tracked changes', () => {
  const result = analyzeTrackedChangeProbe({
    baseline: packageFixture(),
    tracked: packageFixture({ text: TRACKED_TEXT }),
    reopened: packageFixture({ text: TRACKED_TEXT }),
    accepted: packageFixture({ text: TRACKED_TEXT }),
    rejected: packageFixture(),
  });

  assert.equal(result.representation, 'external-or-unsupported');
  assert.equal(result.supported, false);
  assert.equal(result.checks.trackedHasNativeRevision, false);
  assert.match(result.reason, /native revision markup/i);
});

test('rejects a representation that disappears when Hancom reopens the package', () => {
  const result = analyzeTrackedChangeProbe({
    baseline: packageFixture(),
    tracked: packageFixture({ text: TRACKED_TEXT, tracked: true }),
    reopened: packageFixture({ text: TRACKED_TEXT }),
    accepted: packageFixture({ text: TRACKED_TEXT }),
    rejected: packageFixture(),
  });

  assert.equal(result.representation, 'external-or-unsupported');
  assert.equal(result.supported, false);
  assert.equal(result.checks.trackedHasNativeRevision, true);
  assert.equal(result.checks.reopenedPreservesRevision, false);
  assert.match(result.reason, /reopen/i);
});

test('requires the section markers to reference a declared header change', () => {
  const result = analyzeTrackedChangeProbe({
    baseline: packageFixture(),
    tracked: packageFixture({
      text: TRACKED_TEXT,
      tracked: true,
      trackId: 7,
      markerTrackId: 8,
    }),
    reopened: packageFixture({ text: TRACKED_TEXT, tracked: true }),
    accepted: packageFixture({ text: TRACKED_TEXT }),
    rejected: packageFixture(),
  });

  assert.equal(result.representation, 'external-or-unsupported');
  assert.equal(result.supported, false);
  assert.equal(result.checks.trackedHasNativeRevision, false);
});

test('recognizes Hancom replacement as a linked Delete plus Insert pair', () => {
  const result = analyzeTrackedChangeProbe({
    baseline: replacementPackageFixture(),
    tracked: replacementPackageFixture({ tracked: true }),
    reopened: replacementPackageFixture({ tracked: true }),
    accepted: replacementPackageFixture({ text: '교체후_수정문_2026' }),
    rejected: replacementPackageFixture({ text: '교체전_원문_2026' }),
  });

  assert.equal(result.supported, true);
  assert.equal(result.representation, 'hwpx-xml');
  assert.equal(result.revision.type, 'Replace');
  assert.equal(result.revision.deletedText, '교체전_원문_2026');
  assert.equal(result.revision.text, '교체후_수정문_2026');
  assert.deepEqual(
    result.revision.changes.map(change => change.type),
    ['Delete', 'Insert'],
  );
});
