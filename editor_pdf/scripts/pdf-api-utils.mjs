import { createHash } from 'node:crypto';

import { createCanvas } from '@napi-rs/canvas';
import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { P12Signer, PDF as LibPDF } from '@libpdf/core';

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
    this.protection = null;
    this.sealedBytes = null;
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
    if (this.sealedBytes) throw new Error('This session is sealed by a digital signature. Reopen the signed PDF to begin a new revision.');
    const entries = validatePdfCommands(commands);
    const digitalSignatureIndex = entries.findIndex(({ command }) => command.op === 'signature.addDigital');
    if (digitalSignatureIndex !== -1 && digitalSignatureIndex !== entries.length - 1) {
      throw new Error('signature.addDigital must be the final command because a digital signature seals the revision.');
    }
    let candidate = await PDFDocument.load(
      await this.pdfDoc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }),
      { ignoreEncryption: false, updateMetadata: false },
    );
    let candidateProtection = this.protection ? structuredClone(this.protection) : null;
    let candidateSealedBytes = null;
    const pendingChanges = [];
    for (const { command } of entries) {
      let pages = candidate.getPages();
      const page = command.page ? pages[command.page - 1] : null;
      if (command.page && !page) throw new Error(`${command.op} targets missing PDF page ${command.page}.`);
      const coordinateOp = ['text.add', 'highlight.add', 'ink.add', 'image.add', 'signature.addAppearance', 'page.crop'].includes(command.op);
      if (coordinateOp && Number(page.getRotation()?.angle || 0) % 360 !== 0) {
        throw new Error(`${command.op} is blocked on rotated PDF page ${command.page} until rotation-aware object coordinates are available.`);
      }
      const pageHeight = page?.getHeight();
      if (command.op === 'text.add') {
        const isLatin1 = /^[\x00-\xff]*$/.test(command.text);
        if (isLatin1) {
          const helvetica = await candidate.embedFont(StandardFonts.Helvetica);
          page.drawText(command.text, {
            x: command.x,
            y: pageHeight - command.y - command.fontSize,
            size: command.fontSize,
            font: helvetica,
            color: pdfColor(command.color, '#172033'),
            lineHeight: command.fontSize * 1.32,
          });
        } else {
          const rendered = renderTextPng(command.text, command.fontSize, command.color);
          const image = await candidate.embedPng(rendered.bytes);
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
          ? await candidate.embedPng(bytes)
          : await candidate.embedJpg(bytes);
        page.drawImage(image, {
          x: command.x,
          y: pageHeight - command.y - command.height,
          width: command.width,
          height: command.height,
        });
      } else if (command.op === 'page.rotate') {
        const current = Number(page.getRotation()?.angle || 0);
        page.setRotation(degrees(((current + command.degrees) % 360 + 360) % 360));
      } else if (command.op === 'page.add') {
        const presets = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008] };
        let dimensions = command.size === 'custom' ? [command.width, command.height] : presets[command.size];
        if (command.orientation === 'landscape') dimensions = [dimensions[1], dimensions[0]];
        candidate.insertPage(Math.min(command.insertAt - 1, candidate.getPageCount()), dimensions);
      } else if (command.op === 'page.delete') {
        if (candidate.getPageCount() === 1) throw new Error('page.delete cannot remove the final remaining page.');
        candidate.removePage(command.page - 1);
      } else if (command.op === 'page.duplicate') {
        const [copy] = await candidate.copyPages(candidate, [command.page - 1]);
        candidate.insertPage(Math.min(command.insertAt - 1, candidate.getPageCount()), copy);
      } else if (command.op === 'page.move') {
        if (command.destinationPage > candidate.getPageCount()) throw new Error(`page.move destination page ${command.destinationPage} does not exist.`);
        const [copy] = await candidate.copyPages(candidate, [command.page - 1]);
        candidate.removePage(command.page - 1);
        candidate.insertPage(command.destinationPage - 1, copy);
      } else if (command.op === 'page.crop') {
        if (command.x + command.width > page.getWidth() || command.y + command.height > page.getHeight()) {
          throw new Error('page.crop rectangle must stay inside the page bounds.');
        }
        page.setCropBox(command.x, pageHeight - command.y - command.height, command.width, command.height);
      } else if (command.op === 'document.merge') {
        const source = await PDFDocument.load(ensurePdfBytes(Buffer.from(command.sourceBytesBase64, 'base64')), { ignoreEncryption: false, updateMetadata: false });
        const copied = await candidate.copyPages(source, source.getPageIndices());
        let index = Math.min(command.insertAt - 1, candidate.getPageCount());
        for (const copiedPage of copied) candidate.insertPage(index++, copiedPage);
      } else if (command.op === 'metadata.set') {
        const setters = {
          title: 'setTitle', author: 'setAuthor', subject: 'setSubject', keywords: 'setKeywords',
          creator: 'setCreator', producer: 'setProducer', language: 'setLanguage',
        };
        for (const [key, value] of Object.entries(command.metadata)) candidate[setters[key]](value);
      } else if (command.op === 'document.flattenAll' || command.op.startsWith('attachment.')) {
        const intermediate = await candidate.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
        const advanced = await LibPDF.load(intermediate);
        if (command.op === 'document.flattenAll') advanced.flattenAll();
        if (command.op === 'attachment.add') advanced.addAttachment(command.name, Buffer.from(command.bytesBase64, 'base64'), { mimeType: command.mimeType, overwrite: true });
        if (command.op === 'attachment.remove' && !advanced.removeAttachment(command.name)) throw new Error(`attachment.remove could not find ${command.name}.`);
        candidate = await PDFDocument.load(await advanced.save({ compressStreams: true }), { ignoreEncryption: false, updateMetadata: false });
      } else if (command.op === 'security.encrypt') {
        candidateProtection = {
          userPassword: command.userPassword,
          ownerPassword: command.ownerPassword,
          permissions: command.permissions || {},
          algorithm: 'AES-256',
          encryptMetadata: true,
        };
      } else if (command.op === 'security.remove') {
        candidateProtection = null;
      } else if (command.op === 'signature.addDigital') {
        if (candidateProtection) throw new Error('Apply encryption and digital signing in separate final documents; signing an encrypted candidate is not supported.');
        const unsignedBytes = await candidate.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
        const signingPdf = await LibPDF.load(unsignedBytes);
        const signer = await P12Signer.create(Buffer.from(command.p12BytesBase64, 'base64'), command.password);
        const signed = await signingPdf.sign({
          signer,
          reason: command.reason,
          location: command.location,
          contactInfo: command.contactInfo,
          fieldName: command.fieldName,
          level: 'B-B',
          digestAlgorithm: 'SHA-256',
        });
        candidateSealedBytes = Buffer.from(signed.bytes);
      }
      pendingChanges.push({
        ...command,
        bytesBase64: command.bytesBase64 ? `[${command.bytesBase64.length} base64 chars]` : undefined,
        sourceBytesBase64: command.sourceBytesBase64 ? `[${command.sourceBytesBase64.length} base64 chars]` : undefined,
        userPassword: command.userPassword !== undefined ? '[redacted]' : undefined,
        ownerPassword: command.ownerPassword !== undefined ? '[redacted]' : undefined,
        p12BytesBase64: command.p12BytesBase64 ? `[${command.p12BytesBase64.length} base64 chars]` : undefined,
        password: command.password !== undefined ? '[redacted]' : undefined,
      });
    }
    const candidateBytes = Buffer.from(await candidate.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }));
    const candidateInspection = await inspectPdfBytes(candidateBytes);
    this.pdfDoc = candidate;
    this.inspection = candidateInspection;
    this.protection = candidateProtection;
    this.sealedBytes = candidateSealedBytes;
    this.helvetica = null;
    this.changes.push(...pendingChanges);
    this.revision += 1;
    return { ok: true, revision: this.revision, applied: entries.length };
  }

  async save() {
    const editableBytes = this.sealedBytes || Buffer.from(await this.pdfDoc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }));
    let bytes = editableBytes;
    if (this.protection) {
      const protectedPdf = await LibPDF.load(editableBytes);
      protectedPdf.setProtection(this.protection);
      bytes = Buffer.from(await protectedPdf.save({ compressStreams: true }));
    }
    return {
      bytes,
      revision: this.revision,
      validation: {
        ok: true,
        sourceFormat: 'pdf',
        pageCount: this.pdfDoc.getPageCount(),
        encrypted: Boolean(this.protection),
        encryptionAlgorithm: this.protection?.algorithm || null,
        digitallySigned: Boolean(this.sealedBytes),
        sha256: sha256(bytes),
      },
    };
  }

  async qualityCheck() {
    const issues = [];
    let saved;
    try {
      saved = await this.save();
      const reopened = await LibPDF.load(saved.bytes, this.protection ? { credentials: this.protection.ownerPassword } : undefined);
      if (reopened.getPageCount() !== this.pdfDoc.getPageCount()) {
        issues.push({ code: 'page_count_changed', severity: 'error', message: 'PDF page count changed during save/reopen.' });
      }
      if (!this.protection) {
        const inspection = await inspectPdfBytes(saved.bytes);
        if (inspection.pageCount !== this.pdfDoc.getPageCount()) {
          issues.push({ code: 'independent_reopen_failed', severity: 'error', message: 'PDF.js reported a different page count after save.' });
        }
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
