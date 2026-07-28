import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('/pdf UI keeps the required top toolbar and local save controls', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  ]);
  for (const expected of ['data-tool="text"', 'data-tool="highlight"', 'data-tool="draw"', 'id="signatureButton"', 'id="imageButton"', 'id="saveButton"']) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(source, /PDFDocument\.load/);
  assert.match(source, /getDocument/);
  assert.match(source, /저장·재열기 검증 완료/);
  assert.doesNotMatch(source, /https?:\/\//);
});
