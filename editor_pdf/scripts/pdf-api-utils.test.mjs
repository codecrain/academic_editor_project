import assert from 'node:assert/strict';
import test from 'node:test';

import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';

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

test('PDF command catalog exposes only implemented additive operations', () => {
  const catalog = getPdfCommandCatalog();
  assert.deepEqual(catalog.commands.map((entry) => entry.op), [
    'text.add',
    'highlight.add',
    'ink.add',
    'image.add',
    'signature.addAppearance',
    'page.rotate',
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
