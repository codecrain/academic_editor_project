import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('/pdf UI boots the pinned PDFium editor with advanced editing categories', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  ]);
  for (const expected of ['id="pdfViewer"', 'Academic PDF', 'PDFium', 'id="runtimeStatus"']) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(source, /import EmbedPDF from '\.\/vendor\/embedpdf\/embedpdf\.js'/);
  assert.match(source, /worker: true/);
  assert.match(source, /annotations:/);
  assert.match(source, /enforceDocumentPermissions: true/);
  assert.match(source, /window\.academicPdfEditor/);
  assert.doesNotMatch(source, /https?:\/\//);
});
