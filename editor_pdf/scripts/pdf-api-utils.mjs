import { createHash } from 'node:crypto';

import { createCanvas } from '@napi-rs/canvas';
import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { validatePdfCommands } from './pdf-command-catalog.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeHexColor(value, fallback = '#172033') {
  const text = String(value || fallback).trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function pdfColor(value, fallback) {
  const hex = normalizeHexColor(value, fallback).slice(1);
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function ensurePdfBytes(bytes) {
  const buffer = Buffer.from(bytes || []);
  if (buffer.length < 8 || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('Invalid PDF: the source does not start with a PDF header.');
  }
  if (buffer.length > 80 * 1024 * 1024) {
    throw new Error('Invalid PDF: files larger than 80 MiB are not accepted by this runtime.');
  }
  return buffer;
}

async function inspectPdfBytes(bytes) {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  try {
    const pages = [];
    const blocks = [];
    const images = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent({ disableNormalization: false });
      const pageText = textContent.items.map((item) => String(item.str || '')).join(' ').replace(/\s+/g, ' ').trim();
      const blockId = `pdf-page-${pageNumber}`;
      pages.push({
        page: pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
        textLength: pageText.length,
      });
      blocks.push({
        id: blockId,
        type: 'pageText',
        text: pageText,
        native: { section: pageNumber - 1, paragraph: 0, page: pageNumber },
        styleFingerprint: `pdf-page:${Math.round(viewport.width)}x${Math.round(viewport.height)}`,
      });
      const operatorList = await page.getOperatorList();
      let imageIndex = 0;
      for (const operator of operatorList.fnArray) {
        if ([OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintInlineImageXObject].includes(operator)) {
          imageIndex += 1;
          images.push({ id: `pdf-image-${pageNumber}-${imageIndex}`, page: pageNumber, kind: 'image' });
        }
      }
      page.cleanup();
    }
    return { pageCount: pdf.numPages, pages, blocks, images };
  } finally {
    await loadingTask.destroy();
  }
}

function renderTextPng(text, fontSize, color) {
  const scale = 2;
  const lines = String(text).split(/\r?\n/).slice(0, 100);
  const safeLines = lines.length ? lines : [' '];
  const lineHeight = fontSize * 1.32;
  const measureCanvas = createCanvas(8, 8);
  const measure = measureCanvas.getContext('2d');
  measure.font = `${fontSize * scale}px "Noto Sans KR", "Malgun Gothic", Arial, sans-serif`;
  const width = Math.max(1, ...safeLines.map((line) => measure.measureText(line || ' ').width));
  const canvas = createCanvas(Math.ceil(width + 4 * scale), Math.ceil(lineHeight * safeLines.length * scale + 2 * scale));
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `${fontSize * scale}px "Noto Sans KR", "Malgun Gothic", Arial, sans-serif`;
  context.textBaseline = 'top';
  context.fillStyle = normalizeHexColor(color, '#172033');
  safeLines.forEach((line, index) => context.fillText(line, 2 * scale, index * lineHeight * scale));
  return {
    bytes: canvas.toBuffer('image/png'),
    width: canvas.width / scale,
    height: canvas.height / scale,
  };
}

class PdfApiSession {
  static async create(sourceBytes) {
    const bytes = ensurePdfBytes(sourceBytes);
    const [pdfDoc, inspection] = await Promise.all([
      PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false }),
      inspectPdfBytes(bytes),
    ]);
    return new PdfApiSession(bytes, pdfDoc, inspection);
  }

  constructor(sourceBytes, pdfDoc, inspection) {
    this.sourceBytes = Buffer.from(sourceBytes);
    this.pdfDoc = pdfDoc;
    this.inspection = inspection;
    this.revision = 1;
    this.changes = [];
    this.helvetica = null;
  }

  readJson() {
    return {
      sourceFormat: 'pdf',
      revision: this.revision,
      pageCount: this.pdfDoc.getPageCount(),
      pageCountSource: 'pdf-page-tree',
      pageCountIsEstimate: false,
      pages: this.inspection.pages,
      sections: this.inspection.pages.map((page) => ({
        index: page.page - 1,
        paragraphs: [{ id: `pdf-page-${page.page}`, text: this.inspection.blocks[page.page - 1]?.text || '' }],
      })),
      blocks: this.inspection.blocks,
      tables: [],
      references: [],
      objectGraph: {
        images: [
          ...this.inspection.images,
          ...this.changes.filter((change) => ['image.add', 'signature.addAppearance'].includes(change.op)).map((change, index) => ({
            id: `pdf-added-image-${index + 1}`,
            page: change.page,
            kind: change.op === 'signature.addAppearance' ? 'signatureAppearance' : 'image',
          })),
        ],
        annotations: this.changes.filter((change) => ['highlight.add', 'ink.add'].includes(change.op)),
      },
      warnings: this.sourceBytes.includes(Buffer.from('/Type /Sig')) ? [{
        code: 'existing_digital_signature',
        severity: 'warning',
        message: 'The source contains a digital signature. Saving edits may invalidate or qualify that signature.',
      }] : [],
    };
  }

  targetMap() {
    return {
      paragraphs: this.inspection.blocks.map((block, index) => ({
        id: block.id,
        kind: 'paragraph',
        location: { page: index + 1, objectId: block.id, paragraph: { section: index, number: 0 } },
        textLength: block.text.length,
      })),
      cells: [],
    };
  }

  inspectTarget(location = {}) {
    const pageNumber = Number(location.page ?? Number(location.paragraph?.section) + 1);
    const block = this.inspection.blocks[pageNumber - 1];
    if (!block) throw new Error(`PDF target page ${pageNumber} does not exist.`);
    return {
      revision: this.revision,
      location: { page: pageNumber, objectId: block.id, paragraph: { section: pageNumber - 1, number: 0 } },
      id: block.id,
      text: block.text,
      page: this.inspection.pages[pageNumber - 1],
    };
  }

  resolveText(query) {
    const matches = this.inspection.blocks.filter((block) => block.text.includes(String(query)));
    if (matches.length !== 1) throw new Error(`PDF target query matched ${matches.length} pages; provide a unique query.`);
    const page = this.inspection.blocks.indexOf(matches[0]) + 1;
    return { id: matches[0].id, location: { page, objectId: matches[0].id, paragraph: { section: page - 1, number: 0 } } };
  }

  objectInventory() {
    const graph = this.readJson().objectGraph;
    return { images: graph.images, annotations: graph.annotations, imageCount: graph.images.length };
  }

  async apply(commands) {
    const entries = validatePdfCommands(commands);
    const pages = this.pdfDoc.getPages();
    for (const { command } of entries) {
      const page = pages[command.page - 1];
      if (!page) throw new Error(`${command.op} targets missing PDF page ${command.page}.`);
      if (command.op !== 'page.rotate' && Number(page.getRotation()?.angle || 0) % 360 !== 0) {
        throw new Error(`${command.op} is blocked on rotated PDF page ${command.page} until rotation-aware object coordinates are available.`);
      }
      const pageHeight = page.getHeight();
      if (command.op === 'text.add') {
        const isLatin1 = /^[\x00-\xff]*$/.test(command.text);
        if (isLatin1) {
          this.helvetica ??= await this.pdfDoc.embedFont(StandardFonts.Helvetica);
          page.drawText(command.text, {
            x: command.x,
            y: pageHeight - command.y - command.fontSize,
            size: command.fontSize,
            font: this.helvetica,
            color: pdfColor(command.color, '#172033'),
            lineHeight: command.fontSize * 1.32,
          });
        } else {
          const rendered = renderTextPng(command.text, command.fontSize, command.color);
          const image = await this.pdfDoc.embedPng(rendered.bytes);
          page.drawImage(image, {
            x: command.x,
            y: pageHeight - command.y - rendered.height,
            width: rendered.width,
            height: rendered.height,
          });
        }
      } else if (command.op === 'highlight.add') {
        page.drawRectangle({
          x: command.x,
          y: pageHeight - command.y - command.height,
          width: command.width,
          height: command.height,
          color: pdfColor(command.color, '#ffe066'),
          opacity: command.opacity,
          borderWidth: 0,
        });
      } else if (command.op === 'ink.add') {
        for (let index = 1; index < command.points.length; index += 1) {
          const from = command.points[index - 1];
          const to = command.points[index];
          page.drawLine({
            start: { x: from.x, y: pageHeight - from.y },
            end: { x: to.x, y: pageHeight - to.y },
            color: pdfColor(command.color, '#172033'),
            thickness: command.thickness,
            opacity: 1,
          });
        }
      } else if (command.op === 'image.add' || command.op === 'signature.addAppearance') {
        const bytes = Buffer.from(command.bytesBase64, 'base64');
        const image = String(command.mimeType).toLowerCase() === 'image/png'
          ? await this.pdfDoc.embedPng(bytes)
          : await this.pdfDoc.embedJpg(bytes);
        page.drawImage(image, {
          x: command.x,
          y: pageHeight - command.y - command.height,
          width: command.width,
          height: command.height,
        });
      } else if (command.op === 'page.rotate') {
        const current = Number(page.getRotation()?.angle || 0);
        page.setRotation(degrees(((current + command.degrees) % 360 + 360) % 360));
      }
      this.changes.push({ ...command, bytesBase64: command.bytesBase64 ? `[${command.bytesBase64.length} base64 chars]` : undefined });
    }
    this.revision += 1;
    return { ok: true, revision: this.revision, applied: entries.length };
  }

  async save() {
    const bytes = Buffer.from(await this.pdfDoc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }));
    return {
      bytes,
      revision: this.revision,
      validation: { ok: true, sourceFormat: 'pdf', pageCount: this.pdfDoc.getPageCount(), sha256: sha256(bytes) },
    };
  }

  async qualityCheck() {
    const issues = [];
    let saved;
    try {
      saved = await this.save();
      const reopened = await PDFDocument.load(saved.bytes, { ignoreEncryption: false, updateMetadata: false });
      if (reopened.getPageCount() !== this.pdfDoc.getPageCount()) {
        issues.push({ code: 'page_count_changed', severity: 'error', message: 'PDF page count changed during save/reopen.' });
      }
      const inspection = await inspectPdfBytes(saved.bytes);
      if (inspection.pageCount !== this.pdfDoc.getPageCount()) {
        issues.push({ code: 'independent_reopen_failed', severity: 'error', message: 'PDF.js reported a different page count after save.' });
      }
    } catch (error) {
      issues.push({ code: 'save_reopen_failed', severity: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    if (this.sourceBytes.includes(Buffer.from('/Type /Sig')) && this.changes.length) {
      issues.push({ code: 'existing_signature_may_be_invalidated', severity: 'warning', message: 'The edited source contains an existing digital signature.' });
    }
    return {
      ok: issues.every((issue) => issue.severity !== 'error'),
      revision: this.revision,
      pageCount: this.pdfDoc.getPageCount(),
      changeCount: this.changes.length,
      issues,
      sha256: saved ? sha256(saved.bytes) : null,
    };
  }
}

export { inspectPdfBytes, PdfApiSession };
