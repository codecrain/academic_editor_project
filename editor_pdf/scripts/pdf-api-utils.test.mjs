import assert from 'node:assert/strict';
import test from 'node:test';

import { createCanvas } from '@napi-rs/canvas';
import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { PDF as LibPDF } from '@libpdf/core';

import { PdfApiSession } from './pdf-api-utils.mjs';
import { getPdfCommandCatalog, validatePdfCommands } from './pdf-command-catalog.mjs';
import { renderPdfPages } from './pdf-renderer.mjs';

async function samplePdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([420, 594]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('Academic PDF editor acceptance sample', { x: 48, y: 530, size: 16, font });
  page.drawText('Original content remains intact.', { x: 48, y: 500, size: 11, font });
  return Buffer.from(await document.save());
}

function samplePngBase64() {
  const canvas = createCanvas(40, 20);
  const context = canvas.getContext('2d');
  context.fillStyle = '#2762e9';
  context.fillRect(0, 0, 40, 20);
  return canvas.toBuffer('image/png').toString('base64');
}

async function imageOnlyPdf() {
  const canvas = createCanvas(1200, 400);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 1200, 400);
  context.fillStyle = '#000000';
  context.font = 'bold 72px Arial';
  context.fillText('SEARCHABLE OCR TEST 2026', 60, 230);
  const document = await PDFDocument.create();
  const page = document.addPage([600, 200]);
  const image = await document.embedPng(canvas.toBuffer('image/png'));
  page.drawImage(image, { x: 0, y: 0, width: 600, height: 200 });
  return Buffer.from(await document.save());
}

test('PDF command catalog exposes implemented additive and advanced operations', () => {
  const catalog = getPdfCommandCatalog();
  assert.deepEqual(catalog.commands.map((entry) => entry.op), [
    'text.add',
    'ocr.recognize',
    'text.replaceObject',
    'text.replaceAll',
    'highlight.add',
    'ink.add',
    'comment.add',
    'textMarkup.add',
    'image.add',
    'image.replaceObject',
    'object.transform',
    'object.delete',
    'signature.addAppearance',
    'signature.addDigital',
    'page.rotate',
    'page.add',
    'page.delete',
    'page.duplicate',
    'page.move',
    'page.crop',
    'page.resize',
    'page.setLabels',
    'page.extract',
    'page.replace',
    'page.setBoxes',
    'document.merge',
    'document.setInitialView',
    'redaction.apply',
    'watermark.add',
    'background.set',
    'headerFooter.add',
    'bates.add',
    'link.add',
    'bookmark.add',
    'form.addTextField',
    'form.addCheckBox',
    'form.addDropdown',
    'form.remove',
    'metadata.set',
    'document.flattenAll',
    'document.sanitize',
    'document.optimize',
    'attachment.add',
    'attachment.remove',
    'security.encrypt',
    'security.remove',
  ]);
  assert.throws(() => validatePdfCommands([{ op: 'text.replaceObject', page: 1 }]), /objectIndex is required/);
});

test('PDF OCR adds a local invisible searchable layer without changing rendered pixels', async () => {
  const source = await imageOnlyPdf();
  const before = await renderPdfPages(source, { pages: [1], dpi: 120 });
  const session = await PdfApiSession.create(source);
  assert.equal(session.objectInventory().textObjectCount, 0);

  await session.apply([{
    op: 'ocr.recognize',
    pages: [1],
    languages: ['eng'],
    dpi: 180,
    minimumConfidence: 30,
  }]);

  const searchableText = session.objectInventory().textObjects.map((object) => object.text).join(' ');
  assert.match(searchableText, /SEARCHABLE/);
  assert.match(searchableText, /OCR/);
  const saved = await session.save();
  const after = await renderPdfPages(saved.bytes, { pages: [1], dpi: 120 });
  assert.equal(after.pages[0].sha256, before.pages[0].sha256);
  assert.equal((await session.qualityCheck()).ok, true);
});

test('PDF session supports global text replacement, comments, markup, page labels, resize, and initial view', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  await session.apply([
    { op: 'text.replaceAll', find: 'Original', replace: 'Revised', caseSensitive: true },
    { op: 'comment.add', page: 1, x: 72, y: 150, text: 'Review this paragraph.', author: 'Reviewer' },
    { op: 'textMarkup.add', page: 1, x: 48, y: 78, width: 220, height: 20, style: 'underline' },
    { op: 'page.setLabels', segments: [{ page: 1, style: 'decimal', prefix: 'A-', start: 7 }] },
    { op: 'document.setInitialView', pageMode: 'outlines', displayDocTitle: true, fitWindow: true },
    { op: 'page.resize', page: 1, width: 500, height: 700, scaleContent: true, preserveAspectRatio: true, centerContent: true },
  ]);

  assert.match(session.objectInventory().textObjects.map((object) => object.text).join(' '), /Revised content/);
  const saved = await session.save();
  const reopened = await PDFDocument.load(saved.bytes);
  assert.equal(Math.round(reopened.getPage(0).getWidth()), 500);
  assert.equal(Math.round(reopened.getPage(0).getHeight()), 700);
  const annotations = reopened.getPage(0).node.Annots();
  assert.equal(annotations?.size(), 2);
  assert.deepEqual(
    annotations.asArray().map((reference) => reopened.context.lookup(reference, PDFDict).get(PDFName.of('Subtype')).asString()).sort(),
    ['/Text', '/Underline'],
  );
  assert.ok(reopened.catalog.get(PDFName.of('PageLabels')));
  assert.ok(reopened.catalog.get(PDFName.of('ViewerPreferences')));
  assert.equal(reopened.catalog.get(PDFName.of('PageMode'))?.asString(), '/UseOutlines');
  assert.equal((await session.qualityCheck()).ok, true);
});

test('PDF session replaces existing text with an embedded Korean open font', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  const target = session.objectInventory().textObjects.find((object) => object.text === 'Original content remains intact.');
  assert.ok(target, 'expected an editable PDF text object');
  const notoVariants = session.objectInventory().fonts.filter((font) => font.label === 'Noto Sans KR' && font.license === 'OFL-1.1');
  assert.ok(notoVariants.length >= 7, `expected bundled Korean font weights, found ${notoVariants.length}`);
  assert.ok(notoVariants.some((font) => font.style === 'Regular' && font.weight === 400));
  assert.ok(notoVariants.some((font) => font.style === 'Bold' && font.weight === 700));

  await session.apply([{
    op: 'text.replaceObject',
    page: target.page,
    objectIndex: target.objectIndex,
    objectId: target.id,
    expectedText: target.text,
    text: '한글 본문 교체 완료',
    fontFamily: 'Noto Sans KR',
    fontSize: 13,
    color: '#17336a',
  }]);

  const edited = session.objectInventory().textObjects.find((object) => object.text === '한글 본문 교체 완료');
  assert.equal(edited.fontFamily, 'Noto Sans KR');
  assert.equal(edited.embeddedFont, true);
  assert.equal(edited.fillColor.hex, '#17336a');
  const reopened = await PdfApiSession.create((await session.save()).bytes);
  assert.equal(reopened.objectInventory().textObjects.some((object) => object.text === '한글 본문 교체 완료'), true);
});

test('PDF session adds searchable Korean text as an embedded text object, not a raster image', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  const imageCountBefore = session.objectInventory().imageObjects.length;
  await session.apply([{
    op: 'text.add',
    page: 1,
    x: 48,
    y: 100,
    text: '새 한글 본문',
    fontFamily: 'noto-sans-kr-notosanskr-bold',
    fontSize: 15,
    color: '#172033',
  }]);
  const added = session.objectInventory().textObjects.find((object) => object.text === '새 한글 본문');
  assert.ok(added);
  assert.equal(added.fontFamily, 'Noto Sans KR');
  assert.equal(added.embeddedFont, true);
  assert.equal(session.objectInventory().imageObjects.length, imageCountBefore);
});

test('PDF session applies additive edits and survives save, independent reopen, and render', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  assert.equal(session.readJson().pageCount, 1);
  assert.match(session.readJson().blocks[0].text, /Original content remains intact/);

  const applied = await session.apply([
    { op: 'text.add', page: 1, x: 48, y: 94, text: '검토 완료', fontSize: 15, color: '#172033' },
    { op: 'highlight.add', page: 1, x: 44, y: 80, width: 190, height: 22, color: '#ffe066', opacity: .35 },
    { op: 'ink.add', page: 1, points: [{ x: 50, y: 145 }, { x: 90, y: 150 }, { x: 130, y: 142 }], color: '#2762e9', thickness: 2 },
    { op: 'image.add', page: 1, x: 48, y: 180, width: 80, height: 40, mimeType: 'image/png', bytesBase64: samplePngBase64() },
  ]);
  assert.equal(applied.revision, 2);
  const quality = await session.qualityCheck();
  assert.equal(quality.ok, true, JSON.stringify(quality));
  assert.equal(quality.changeCount, 4);

  const saved = await session.save();
  assert.equal(saved.bytes.subarray(0, 5).toString(), '%PDF-');
  const reopened = await PdfApiSession.create(saved.bytes);
  assert.equal(reopened.readJson().pageCount, 1);

  const rendered = await renderPdfPages(saved.bytes, { pages: [1], scale: 1 });
  assert.equal(rendered.pageCount, 1);
  assert.equal(rendered.pages.length, 1);
  assert.equal(rendered.pages[0].mimeType, 'image/png');
  assert.ok(rendered.pages[0].byteLength > 1000);
});

test('PDF session blocks coordinate edits on rotated pages', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  await session.apply([{ op: 'page.rotate', page: 1, degrees: 90 }]);
  await assert.rejects(
    session.apply([{ op: 'text.add', page: 1, x: 20, y: 20, text: 'blocked' }]),
    /blocked on rotated PDF page/,
  );
});

test('PDF session applies transactional page, crop, metadata, attachment, flatten, and encryption operations', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  await session.apply([
    { op: 'page.duplicate', page: 1, insertAt: 2 },
    { op: 'page.add', insertAt: 2, size: 'a4', orientation: 'landscape' },
    { op: 'page.move', page: 3, destinationPage: 1 },
    { op: 'page.crop', page: 1, x: 10, y: 10, width: 390, height: 560 },
    { op: 'metadata.set', metadata: { title: '고급 편집 검증', author: 'Academic Editor', language: 'ko-KR' } },
    { op: 'attachment.add', name: 'evidence.txt', mimeType: 'text/plain', bytesBase64: Buffer.from('verified').toString('base64') },
    { op: 'document.flattenAll' },
  ]);
  assert.equal(session.readJson().pageCount, 3);

  const unprotected = await session.save();
  const advanced = await LibPDF.load(unprotected.bytes);
  assert.equal(advanced.getPageCount(), 3);
  assert.equal(advanced.getMetadata().title, '고급 편집 검증');
  assert.equal(Buffer.from(advanced.getAttachment('evidence.txt')).toString(), 'verified');

  await session.apply([{ op: 'security.encrypt', userPassword: 'reader-pass', ownerPassword: 'owner-pass', permissions: { copy: false, print: true } }]);
  const protectedResult = await session.save();
  assert.equal(protectedResult.validation.encrypted, true);
  const protectedPdf = await LibPDF.load(protectedResult.bytes, { credentials: 'reader-pass' });
  assert.equal(protectedPdf.getSecurity().isEncrypted, true);
  assert.equal(protectedPdf.getSecurity().permissions.copy, false);
  assert.equal((await session.qualityCheck()).ok, true);
});

test('PDF session applies production decorations, navigation, forms, page replacement, and extraction', async () => {
  const source = await samplePdf();
  const session = await PdfApiSession.create(source);
  await session.apply([
    { op: 'page.duplicate', page: 1, insertAt: 2 },
    { op: 'background.set', pages: [1], color: '#fff9e6' },
    { op: 'watermark.add', text: '내부 검토', pages: [1, 2], fontFamily: 'Noto Sans KR', fontSize: 34, rotation: -30 },
    { op: 'headerFooter.add', headerCenter: '연구 문서', footerRight: '{page} / {pages}', fontFamily: 'Noto Sans KR' },
    { op: 'bates.add', prefix: 'CASE-', start: 7, digits: 4, pages: [1, 2] },
    { op: 'link.add', page: 1, x: 40, y: 180, width: 160, height: 20, url: 'https://example.org/review' },
    { op: 'bookmark.add', title: '검토 시작', page: 1 },
    { op: 'form.addTextField', name: 'reviewer.name', page: 1, x: 48, y: 220, width: 180, height: 24, value: '홍길동' },
    { op: 'form.addCheckBox', name: 'approved', page: 1, x: 48, y: 260, width: 18, height: 18, checked: true },
    { op: 'form.addDropdown', name: 'decision', page: 1, x: 48, y: 300, width: 140, height: 24, options: ['승인', '반려'], selected: '승인' },
    { op: 'page.setBoxes', page: 2, boxes: { crop: { x: 5, y: 5, width: 410, height: 584 } } },
  ]);

  const saved = await session.save();
  const reopened = await PDFDocument.load(saved.bytes);
  assert.equal(reopened.getPageCount(), 2);
  assert.deepEqual(reopened.getForm().getFields().map((field) => field.getName()).sort(), ['approved', 'decision', 'reviewer.name']);
  assert.ok(reopened.catalog.get(PDFName.of('Outlines')));
  assert.equal((await session.qualityCheck()).ok, true);

  await session.apply([{ op: 'page.replace', page: 2, sourcePage: 1, sourceBytesBase64: source.toString('base64') }]);
  await session.apply([{ op: 'page.extract', pages: [2, 1] }]);
  assert.equal(session.readJson().pageCount, 2);
  assert.equal((await session.qualityCheck()).ok, true);
});

test('PDF redaction removes intersecting source objects and sanitize removes interactive content', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  assert.ok(session.objectInventory().textObjects.length >= 2);
  await session.apply([{
    op: 'redaction.apply',
    page: 1,
    regions: [{ x: 35, y: 40, width: 360, height: 100 }],
    color: '#000000',
    overlayText: '삭제됨',
  }]);
  const remainingText = session.objectInventory().textObjects.map((object) => object.text).join(' ');
  assert.doesNotMatch(remainingText, /Academic PDF editor acceptance sample|Original content remains intact/);

  await session.apply([
    { op: 'link.add', page: 1, x: 40, y: 180, width: 100, height: 20, url: 'https://example.org' },
    { op: 'form.addCheckBox', name: 'temporary', page: 1, x: 40, y: 220, width: 18, height: 18 },
    { op: 'attachment.add', name: 'temporary.txt', bytesBase64: Buffer.from('remove me').toString('base64') },
    { op: 'document.sanitize' },
    { op: 'document.optimize' },
  ]);
  const sanitized = await PDFDocument.load((await session.save()).bytes);
  assert.equal(sanitized.getForm().getFields().length, 0);
  assert.equal((await session.qualityCheck()).ok, true);
});

test('PDF apply is atomic when a later structural command fails', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  await assert.rejects(session.apply([
    { op: 'page.add', size: 'a4' },
    { op: 'page.delete', page: 99 },
  ]), /missing PDF page 99/);
  assert.equal(session.readJson().pageCount, 1);
  assert.equal(session.readJson().revision, 1);
});
