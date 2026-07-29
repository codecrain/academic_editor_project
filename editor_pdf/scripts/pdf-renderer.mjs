import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PDFDocument } from 'pdf-lib';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function selectedPageNumbers(pageCount, pages) {
  if (pages === 'all' || pages === undefined || pages === null) {
    return Array.from({ length: pageCount }, (_value, index) => index + 1);
  }
  if (pages === 'none') return [];
  const selected = [...new Set(pages.map(Number))];
  if (selected.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new Error(`PDF render pages must be between 1 and ${pageCount}.`);
  }
  return selected;
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.subarray(1, 4).toString('ascii') !== 'PNG') {
    throw new Error('Poppler did not produce a valid PNG page render.');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function runPdftoppm(args, options = {}) {
  let command = options.pdftoppmBin || process.env.PDFTOPPM_BIN || 'pdftoppm';
  if (process.platform === 'win32' && command === 'pdftoppm') {
    try {
      command = execFileSync('where.exe', ['pdftoppm.exe'], { encoding: 'utf8', windowsHide: true })
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find(Boolean) || command;
    } catch {
      throw new Error('pdftoppm.exe is required for independent PDF rendering. Install Poppler or set PDFTOPPM_BIN.');
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pdftoppm failed (code=${code}, signal=${signal || 'none'}): ${stderr.trim()}`));
    });
  });
}

async function renderPdfPages(sourceBytes, options = {}) {
  const bytes = Buffer.from(sourceBytes);
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  const pageCount = document.getPageCount();
  const selectedPages = selectedPageNumbers(pageCount, options.pages);
  const renderedPages = [];
  const tempDirectory = await mkdtemp(path.join(options.tempRoot || os.tmpdir(), 'academic-editor-pdf-'));
  const inputPath = path.join(tempDirectory, 'input.pdf');
  await writeFile(inputPath, bytes);
  try {
    const dpi = Math.max(72, Math.min(240, Number(options.dpi || 120)));
    for (const pageNumber of selectedPages) {
      const prefix = path.join(tempDirectory, `page-${pageNumber}`);
      await runPdftoppm([
        '-png',
        '-singlefile',
        '-r', String(dpi),
        '-f', String(pageNumber),
        '-l', String(pageNumber),
        inputPath,
        prefix,
      ], options);
      const pageBytes = await readFile(`${prefix}.png`);
      const { width, height } = pngDimensions(pageBytes);
      renderedPages.push({
        page: pageNumber,
        format: 'png',
        mimeType: 'image/png',
        width,
        height,
        quality: 100,
        sha256: sha256(pageBytes),
        byteLength: pageBytes.length,
        bytes: pageBytes,
      });
    }
    return {
      renderer: 'poppler-pdftoppm',
      pageCount,
      selectedPages,
      settings: { dpi },
      pages: renderedPages,
      pdf: { bytes, sha256: sha256(bytes), byteLength: bytes.length },
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export { renderPdfPages };
