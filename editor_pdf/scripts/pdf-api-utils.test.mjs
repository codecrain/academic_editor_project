import assert from 'node:assert/strict';
import test from 'node:test';

import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
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

test('PDF command catalog exposes implemented additive and advanced operations', () => {
  const catalog = getPdfCommandCatalog();
  assert.deepEqual(catalog.commands.map((entry) => entry.op), [
    'text.add',
    'highlight.add',
    'ink.add',
    'image.add',
    'signature.addAppearance',
    'signature.addDigital',
    'page.rotate',
    'page.add',
    'page.delete',
    'page.duplicate',
    'page.move',
    'page.crop',
    'document.merge',
    'metadata.set',
    'document.flattenAll',
    'attachment.add',
    'attachment.remove',
    'security.encrypt',
    'security.remove',
  ]);
  assert.throws(() => validatePdfCommands([{ op: 'text.replaceObject', page: 1 }]), /Unsupported PDF command/);
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

test('PDF apply is atomic when a later structural command fails', async () => {
  const session = await PdfApiSession.create(await samplePdf());
  await assert.rejects(session.apply([
    { op: 'page.add', size: 'a4' },
    { op: 'page.delete', page: 99 },
  ]), /missing PDF page 99/);
  assert.equal(session.readJson().pageCount, 1);
  assert.equal(session.readJson().revision, 1);
});
