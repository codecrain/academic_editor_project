import assert from 'node:assert/strict';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createDocxBytes } from './docx-api-utils.mjs';
import { normalizeSelectedPages, renderDocxWithUno, runOwnedProcess } from './docx-renderer.mjs';

const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF\n');
const WEBP_BYTES = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary');

function fakeRendererProcess(options = {}) {
  return async (_command, args) => {
    const sourcePath = args[1];
    const outputDir = args[2];
    const pagesValue = args[args.indexOf('--pages') + 1];
    const selectedPages = pagesValue === 'all' ? [1, 2, 3] : pagesValue === 'none' ? [] : pagesValue.split(',').map(Number);
    options.capture?.({ sourcePath, outputDir, args });
    const pdfPath = path.join(outputDir, 'document.pdf');
    await writeFile(pdfPath, PDF_BYTES);
    const pageEntries = [];
    for (const page of selectedPages) {
      const pagePath = path.join(outputDir, `page-${String(page).padStart(3, '0')}.webp`);
      await writeFile(pagePath, WEBP_BYTES);
      pageEntries.push({
        page,
        format: 'webp',
        path: pagePath,
        bytes: WEBP_BYTES.length,
        width: 1314,
        height: 1700,
        quality: 20,
      });
    }
    return {
      stdout: JSON.stringify({
        ok: true,
        renderer: 'test-uno-webp',
        pageCount: 3,
        selectedPages,
        pdf: { path: options.escapePath || pdfPath, bytes: PDF_BYTES.length },
        pages: pageEntries,
        settings: { format: 'webp', quality: 20, maxWidth: 1700, maxHeight: 1700, background: 'white', metadata: 'stripped' },
        cleanup: { profileRemoved: true, remainingOfficePids: 0, officeExitCode: 0 },
      }),
      stderr: '',
      code: 0,
    };
  };
}

test('DOCX UNO renderer validates selected pages, binary signatures, and isolated cleanup', async () => {
  let tempRoot = '';
  const rendered = await renderDocxWithUno(createDocxBytes(), {
    pages: [3, 1, 3],
    runProcess: fakeRendererProcess({ capture: ({ sourcePath }) => { tempRoot = path.dirname(sourcePath); } }),
  });
  assert.equal(rendered.renderer, 'test-uno-webp');
  assert.equal(rendered.pageCount, 3);
  assert.deepEqual(rendered.selectedPages, [1, 3]);
  assert.equal(rendered.pdf.bytes.subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(rendered.pages.map((page) => page.page), [1, 3]);
  await assert.rejects(access(tempRoot));
});

test('DOCX UNO renderer rejects output paths outside its isolated directory and still cleans up', async () => {
  let tempRoot = '';
  await assert.rejects(
    renderDocxWithUno(createDocxBytes(), {
      pages: [1],
      runProcess: fakeRendererProcess({
        escapePath: path.resolve('outside.pdf'),
        capture: ({ sourcePath }) => { tempRoot = path.dirname(sourcePath); },
      }),
    }),
    /outside its isolated output directory/,
  );
  await assert.rejects(access(tempRoot));
});

test('DOCX UNO renderer normalizes page selections and rejects invalid values', () => {
  assert.equal(normalizeSelectedPages('all'), null);
  assert.deepEqual(normalizeSelectedPages('none'), []);
  assert.deepEqual(normalizeSelectedPages([4, 1, 4]), [1, 4]);
  assert.throws(() => normalizeSelectedPages([]), /non-empty array/);
  assert.throws(() => normalizeSelectedPages([0]), /positive integers/);
});

test('owned renderer processes are killed when they exceed the timeout', async () => {
  await assert.rejects(
    runOwnedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 1_000 }),
    /timed out/,
  );
});
