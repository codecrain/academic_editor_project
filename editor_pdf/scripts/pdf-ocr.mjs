import { createRequire } from 'node:module';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PDFDocument } from 'pdf-lib';
import { createWorker } from 'tesseract.js';

import { renderPdfPages } from './pdf-renderer.mjs';

const require = createRequire(import.meta.url);
const TRAINED_DATA = Object.freeze({
  eng: require.resolve('@tesseract.js-data/eng/4.0.0/eng.traineddata.gz'),
  kor: require.resolve('@tesseract.js-data/kor/4.0.0/kor.traineddata.gz'),
});

function collectWords(blocks) {
  const words = [];
  for (const block of blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) words.push(...(line.words || []));
    }
  }
  return words;
}

async function prepareLanguageDirectory(languages) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'academic-editor-ocr-'));
  await Promise.all(languages.map((language) => copyFile(
    TRAINED_DATA[language],
    path.join(directory, `${language}.traineddata.gz`),
  )));
  return directory;
}

async function buildOcrTextCommands(sourceBytes, options = {}) {
  const bytes = Buffer.from(sourceBytes);
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  const pageCount = pdf.getPageCount();
  const pages = options.pages || Array.from({ length: pageCount }, (_value, index) => index + 1);
  const languages = options.languages || ['kor', 'eng'];
  const languageDirectory = await prepareLanguageDirectory(languages);
  let worker;
  try {
    const rendered = await renderPdfPages(bytes, { pages, dpi: options.dpi || 180 });
    worker = await createWorker(languages, 1, {
      langPath: languageDirectory,
      cacheMethod: 'none',
      gzip: true,
      logger: () => {},
    });
    const commands = [];
    const recognizedPages = [];
    for (const renderedPage of rendered.pages) {
      const page = pdf.getPage(renderedPage.page - 1);
      const result = await worker.recognize(renderedPage.bytes, {}, { text: true, blocks: true });
      const pageCommands = collectWords(result.data.blocks)
        .filter((word) => String(word.text || '').trim() && Number(word.confidence || 0) >= options.minimumConfidence)
        .map((word) => {
          const widthRatio = page.getWidth() / renderedPage.width;
          const heightRatio = page.getHeight() / renderedPage.height;
          const height = Math.max(4, (word.bbox.y1 - word.bbox.y0) * heightRatio);
          return {
            op: 'text.add',
            page: renderedPage.page,
            x: Math.max(0, word.bbox.x0 * widthRatio),
            y: Math.max(0, word.bbox.y0 * heightRatio),
            text: String(word.text).trim(),
            fontFamily: /[^\x00-\xff]/.test(word.text) ? 'Noto Sans KR' : 'Liberation Sans',
            fontSize: height,
            color: '#000000',
            opacity: 1,
            renderMode: 'invisible',
          };
        });
      commands.push(...pageCommands);
      recognizedPages.push({
        page: renderedPage.page,
        wordCount: pageCommands.length,
        text: String(result.data.text || '').trim(),
      });
    }
    return { commands, recognizedPages, languages, dpi: rendered.settings.dpi };
  } finally {
    if (worker) await worker.terminate();
    await rm(languageDirectory, { recursive: true, force: true });
  }
}

export { buildOcrTextCommands };
