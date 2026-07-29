import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import fontkit from '@pdf-lib/fontkit';
import {
  fill,
  PDFDict,
  degrees,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setFillingRgbColor,
} from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { P12Signer, PDF as LibPDF } from '@libpdf/core';

import { validatePdfCommands } from './pdf-command-catalog.mjs';
import {
  applyPdfObjectCommands,
  inspectPdfObjects,
  listPdfFonts,
  resolvePdfFont,
} from './pdfium-object-editor.mjs';
import { buildOcrTextCommands } from './pdf-ocr.mjs';

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

function colorChannels(value, fallback) {
  const hex = normalizeHexColor(value, fallback).slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function selectedPageNumbers(command, pageCount) {
  const pages = command.pages || Array.from({ length: pageCount }, (_, index) => index + 1);
  for (const page of pages) {
    if (page < 1 || page > pageCount) throw new Error(`${command.op} targets missing PDF page ${page}.`);
  }
  return pages;
}

function expandPageTokens(value, page, pageCount) {
  return String(value || '').replaceAll('{page}', String(page)).replaceAll('{pages}', String(pageCount));
}

async function embedApprovedFont(pdfDoc, family) {
  pdfDoc.registerFontkit(fontkit);
  const font = await resolvePdfFont(family || 'Noto Sans KR');
  const embedded = await pdfDoc.embedFont(await readFile(font.filePath), { subset: true });
  return { embedded, font };
}

async function applyEmbeddedText(pdfDoc, commands) {
  const intermediate = Buffer.from(await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  }));
  const edited = await applyPdfObjectCommands(intermediate, commands);
  return PDFDocument.load(edited.bytes, { ignoreEncryption: false, updateMetadata: false });
}

function estimatedTextWidth(text, fontSize) {
  return Array.from(String(text)).reduce((width, character) => (
    width + (character.codePointAt(0) > 0xff ? fontSize : fontSize * 0.56)
  ), 0);
}

function prependBackground(pdfDoc, page, color) {
  const [r, g, b] = colorChannels(color, '#ffffff');
  const stream = pdfDoc.context.contentStream([
    pushGraphicsState(),
    setFillingRgbColor(r, g, b),
    rectangle(0, 0, page.getWidth(), page.getHeight()),
    fill(),
    popGraphicsState(),
  ]);
  const streamRef = pdfDoc.context.register(stream);
  const contents = page.node.normalizedEntries().Contents;
  contents.insert(0, streamRef);
}

function addExternalLink(pdfDoc, page, command) {
  const y = page.getHeight() - command.y - command.height;
  const annotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [command.x, y, command.x + command.width, y + command.height],
    Border: [0, 0, 0],
    A: {
      Type: 'Action',
      S: 'URI',
      URI: PDFHexString.fromText(command.url),
    },
  });
  page.node.addAnnot(pdfDoc.context.register(annotation));
}

function addTextNote(pdfDoc, page, command) {
  const y = page.getHeight() - command.y - command.height;
  const annotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [command.x, y, command.x + command.width, y + command.height],
    Contents: PDFHexString.fromText(command.text),
    T: PDFHexString.fromText(command.author),
    Name: PDFName.of(command.icon),
    C: colorChannels(command.color, '#ffd166'),
    Open: command.open,
    F: 4,
  });
  page.node.addAnnot(pdfDoc.context.register(annotation));
}

function addTextMarkup(pdfDoc, page, command) {
  const bottom = page.getHeight() - command.y - command.height;
  const top = bottom + command.height;
  const subtype = {
    highlight: 'Highlight',
    underline: 'Underline',
    squiggly: 'Squiggly',
    strikeout: 'StrikeOut',
  }[command.style];
  const annotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: subtype,
    Rect: [command.x, bottom, command.x + command.width, top],
    QuadPoints: [
      command.x, top,
      command.x + command.width, top,
      command.x, bottom,
      command.x + command.width, bottom,
    ],
    C: colorChannels(command.color, command.style === 'highlight' ? '#ffe066' : '#f04438'),
    Contents: PDFHexString.fromText(command.text || ''),
    F: 4,
  });
  page.node.addAnnot(pdfDoc.context.register(annotation));
}

function setPageLabels(pdfDoc, command) {
  const styles = {
    decimal: 'D',
    'roman-upper': 'R',
    'roman-lower': 'r',
    'letters-upper': 'A',
    'letters-lower': 'a',
  };
  const nums = [];
  for (const segment of command.segments) {
    if (segment.page > pdfDoc.getPageCount()) throw new Error(`page.setLabels targets missing PDF page ${segment.page}.`);
    const label = {
      P: PDFHexString.fromText(segment.prefix),
      St: segment.start,
    };
    if (segment.style !== 'prefix-only') label.S = PDFName.of(styles[segment.style]);
    nums.push(segment.page - 1, pdfDoc.context.obj(label));
  }
  pdfDoc.catalog.set(PDFName.of('PageLabels'), pdfDoc.context.obj({ Nums: nums }));
}

function setInitialView(pdfDoc, command) {
  const pageModes = {
    none: 'UseNone',
    outlines: 'UseOutlines',
    thumbnails: 'UseThumbs',
    fullscreen: 'FullScreen',
    attachments: 'UseAttachments',
  };
  pdfDoc.catalog.set(PDFName.of('PageMode'), PDFName.of(pageModes[command.pageMode]));
  pdfDoc.catalog.set(PDFName.of('ViewerPreferences'), pdfDoc.context.obj({
    HideToolbar: command.hideToolbar,
    HideMenubar: command.hideMenubar,
    HideWindowUI: command.hideWindowUI,
    FitWindow: command.fitWindow,
    CenterWindow: command.centerWindow,
    DisplayDocTitle: command.displayDocTitle,
    Direction: PDFName.of(command.readingDirection === 'right-to-left' ? 'R2L' : 'L2R'),
    PrintScaling: PDFName.of(command.printScaling === 'none' ? 'None' : 'AppDefault'),
  }));
}

function addTopLevelBookmark(pdfDoc, title, page) {
  const outlinesName = PDFName.of('Outlines');
  let outlinesRef = pdfDoc.catalog.get(outlinesName);
  let outlines = outlinesRef ? pdfDoc.context.lookup(outlinesRef, PDFDict) : null;
  if (!outlines) {
    outlines = pdfDoc.context.obj({});
    outlinesRef = pdfDoc.context.register(outlines);
    pdfDoc.catalog.set(outlinesName, outlinesRef);
  }
  const previousLastRef = outlines.get(PDFName.of('Last'));
  const item = pdfDoc.context.obj({
    Title: PDFHexString.fromText(title),
    Parent: outlinesRef,
    Dest: [page.ref, PDFName.of('Fit')],
  });
  const itemRef = pdfDoc.context.register(item);
  if (previousLastRef) {
    const previousLast = pdfDoc.context.lookup(previousLastRef, PDFDict);
    previousLast.set(PDFName.of('Next'), itemRef);
    item.set(PDFName.of('Prev'), previousLastRef);
  } else {
    outlines.set(PDFName.of('First'), itemRef);
  }
  outlines.set(PDFName.of('Last'), itemRef);
  const currentCount = outlines.get(PDFName.of('Count'));
  outlines.set(PDFName.of('Count'), PDFNumber.of((currentCount?.asNumber?.() || 0) + 1));
  pdfDoc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

function sanitizePdfDocument(pdfDoc) {
  for (const key of ['Names', 'OpenAction', 'AA', 'AcroForm', 'Collection', 'Perms']) {
    pdfDoc.catalog.delete(PDFName.of(key));
  }
  for (const page of pdfDoc.getPages()) {
    page.node.delete(PDFName.of('AA'));
    page.node.delete(PDFName.of('Annots'));
  }
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setCreator('');
  pdfDoc.setProducer('Academic PDF Editor');
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

class PdfApiSession {
  static async create(sourceBytes) {
    const bytes = ensurePdfBytes(sourceBytes);
    const [pdfDoc, inspection, objectInspection, fonts] = await Promise.all([
      PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false }),
      inspectPdfBytes(bytes),
      inspectPdfObjects(bytes),
      listPdfFonts(),
    ]);
    return new PdfApiSession(bytes, pdfDoc, inspection, objectInspection, fonts);
  }

  constructor(sourceBytes, pdfDoc, inspection, objectInspection, fonts) {
    this.sourceBytes = Buffer.from(sourceBytes);
    this.pdfDoc = pdfDoc;
    this.inspection = inspection;
    this.objectInspection = objectInspection;
    this.fonts = fonts;
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
        textObjects: this.objectInspection.textObjects,
        pageObjects: this.objectInspection.objects,
      },
      fonts: this.fonts.map(({ filePath, ...font }) => font),
      warnings: this.sourceBytes.includes(Buffer.from('/Type /Sig')) ? [{
        code: 'existing_digital_signature',
        severity: 'warning',
        message: 'The source contains a digital signature. Saving edits may invalidate or qualify that signature.',
      }] : [],
    };
  }

  targetMap() {
    return {
      paragraphs: this.objectInspection.textObjects.map((object) => ({
        id: object.id,
        kind: 'paragraph',
        location: { page: object.page, objectId: object.id, objectIndex: object.objectIndex },
        textLength: object.text.length,
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        bounds: object.editorBounds,
      })),
      cells: [],
    };
  }

  inspectTarget(location = {}) {
    if (location.objectId || location.objectIndex !== undefined) {
      const object = location.objectId
        ? this.objectInspection.objects.find((candidate) => candidate.id === String(location.objectId))
        : this.objectInspection.objects.find((candidate) => candidate.page === Number(location.page) && candidate.objectIndex === Number(location.objectIndex));
      if (!object) throw new Error(`PDF object target ${location.objectId || `${location.page}:${location.objectIndex}`} does not exist.`);
      return {
        revision: this.revision,
        location: { page: object.page, objectId: object.id, objectIndex: object.objectIndex },
        id: object.id,
        ...object,
      };
    }
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
    const matches = this.objectInspection.textObjects.filter((object) => object.text.includes(String(query)));
    if (matches.length !== 1) throw new Error(`PDF target query matched ${matches.length} text objects; provide a unique query.`);
    const object = matches[0];
    return { id: object.id, location: { page: object.page, objectId: object.id, objectIndex: object.objectIndex } };
  }

  objectInventory() {
    const graph = this.readJson().objectGraph;
    return {
      pages: this.inspection.pages,
      images: graph.images,
      annotations: graph.annotations,
      pageObjects: graph.pageObjects,
      textObjects: graph.textObjects,
      imageObjects: this.objectInspection.imageObjects,
      fonts: this.fonts.map(({ filePath, ...font }) => font),
      imageCount: graph.images.length,
      textObjectCount: graph.textObjects.length,
      pageObjectCount: graph.pageObjects.length,
    };
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
      const coordinateOp = [
        'text.add', 'highlight.add', 'ink.add', 'image.add', 'signature.addAppearance', 'page.crop',
        'redaction.apply', 'link.add', 'form.addTextField', 'form.addCheckBox', 'form.addDropdown',
        'comment.add', 'textMarkup.add',
      ].includes(command.op);
      if (coordinateOp && Number(page.getRotation()?.angle || 0) % 360 !== 0) {
        throw new Error(`${command.op} is blocked on rotated PDF page ${command.page} until rotation-aware object coordinates are available.`);
      }
      const pageHeight = page?.getHeight();
      if (command.op === 'text.replaceAll') {
        const intermediate = Buffer.from(await candidate.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }));
        const inspected = await inspectPdfObjects(intermediate);
        const selectedPages = new Set(command.pages || Array.from({ length: candidate.getPageCount() }, (_value, index) => index + 1));
        const needle = command.caseSensitive ? command.find : command.find.toLocaleLowerCase();
        const replacements = inspected.textObjects.flatMap((object) => {
          if (!selectedPages.has(object.page)) return [];
          const haystack = command.caseSensitive ? object.text : object.text.toLocaleLowerCase();
          if (!haystack.includes(needle)) return [];
          let text;
          if (command.caseSensitive) {
            text = object.text.replaceAll(command.find, command.replace);
          } else {
            let cursor = 0;
            const parts = [];
            while (true) {
              const index = haystack.indexOf(needle, cursor);
              if (index === -1) break;
              parts.push(object.text.slice(cursor, index), command.replace);
              cursor = index + command.find.length;
            }
            parts.push(object.text.slice(cursor));
            text = parts.join('');
          }
          return [{
            op: 'text.replaceObject',
            page: object.page,
            objectIndex: object.objectIndex,
            objectId: object.id,
            expectedText: object.text,
            text,
            ...(command.fontFamily ? { fontFamily: command.fontFamily } : {}),
          }];
        });
        if (!replacements.length) throw new Error(`text.replaceAll could not find "${command.find}" in the selected pages.`);
        const edited = await applyPdfObjectCommands(intermediate, replacements);
        candidate = await PDFDocument.load(edited.bytes, { ignoreEncryption: false, updateMetadata: false });
        command.result = { objectsReplaced: replacements.length };
      } else if (['text.add', 'text.replaceObject', 'image.replaceObject', 'object.transform', 'object.delete', 'redaction.apply'].includes(command.op)) {
        const intermediate = Buffer.from(await candidate.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }));
        const edited = await applyPdfObjectCommands(intermediate, [command]);
        candidate = await PDFDocument.load(edited.bytes, { ignoreEncryption: false, updateMetadata: false });
        if (command.op === 'redaction.apply') {
          const redactedPage = candidate.getPage(command.page - 1);
          redactedPage.node.delete(PDFName.of('Annots'));
          const redactionColor = pdfColor(command.color, '#000000');
          for (const region of command.regions) {
            redactedPage.drawRectangle({
              x: region.x,
              y: redactedPage.getHeight() - region.y - region.height,
              width: region.width,
              height: region.height,
              color: redactionColor,
              borderWidth: 0,
              opacity: 1,
            });
          }
          if (command.overlayText) {
            const textCommands = command.regions.map((region) => {
              const size = Math.max(4, Math.min(10, region.height * 0.45));
              return {
                op: 'text.add',
                page: command.page,
                x: region.x + Math.max(2, (region.width - estimatedTextWidth(command.overlayText, size)) / 2),
                y: region.y + Math.max(2, (region.height - size) / 2),
                text: command.overlayText,
                fontFamily: 'Noto Sans KR',
                fontSize: size,
                color: '#ffffff',
              };
            });
            candidate = await applyEmbeddedText(candidate, textCommands);
          }
        }
      } else if (command.op === 'ocr.recognize') {
        const intermediate = Buffer.from(await candidate.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false }));
        const selectedPages = selectedPageNumbers(command, candidate.getPageCount());
        const existingObjects = await inspectPdfObjects(intermediate);
        const existingCharacters = new Map();
        for (const textObject of existingObjects.textObjects || []) {
          existingCharacters.set(
            textObject.page,
            (existingCharacters.get(textObject.page) || 0) + String(textObject.text || '').trim().length,
          );
        }
        const pages = command.force
          ? selectedPages
          : selectedPages.filter((pageNumber) => (existingCharacters.get(pageNumber) || 0) < command.minimumExistingTextCharacters);
        if (pages.length) {
          const recognized = await buildOcrTextCommands(intermediate, { ...command, pages });
          if (recognized.commands.length) candidate = await applyEmbeddedText(candidate, recognized.commands);
          command.result = {
            pagesRequested: selectedPages.length,
            pagesRecognized: recognized.recognizedPages.length,
            pagesSkippedWithText: selectedPages.length - pages.length,
            wordsAdded: recognized.commands.length,
            languages: recognized.languages,
            dpi: recognized.dpi,
          };
        } else {
          command.result = {
            pagesRequested: selectedPages.length,
            pagesRecognized: 0,
            pagesSkippedWithText: selectedPages.length,
            wordsAdded: 0,
            languages: command.languages,
            dpi: command.dpi,
          };
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
      } else if (command.op === 'comment.add') {
        addTextNote(candidate, page, command);
      } else if (command.op === 'textMarkup.add') {
        addTextMarkup(candidate, page, command);
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
      } else if (command.op === 'page.resize') {
        const originalWidth = page.getWidth();
        const originalHeight = page.getHeight();
        if (command.scaleContent) {
          let scaleX = command.width / originalWidth;
          let scaleY = command.height / originalHeight;
          if (command.preserveAspectRatio) scaleX = scaleY = Math.min(scaleX, scaleY);
          page.scaleContent(scaleX, scaleY);
          page.scaleAnnotations(scaleX, scaleY);
          if (command.centerContent) {
            page.translateContent(
              Math.max(0, (command.width - originalWidth * scaleX) / 2),
              Math.max(0, (command.height - originalHeight * scaleY) / 2),
            );
          }
        }
        page.setSize(command.width, command.height);
      } else if (command.op === 'page.setLabels') {
        setPageLabels(candidate, command);
      } else if (command.op === 'page.extract') {
        const requestedPages = command.pages.map((pageNumber) => {
          if (pageNumber > candidate.getPageCount()) throw new Error(`page.extract targets missing PDF page ${pageNumber}.`);
          return pageNumber - 1;
        });
        const extracted = await PDFDocument.create();
        const copied = await extracted.copyPages(candidate, requestedPages);
        for (const copiedPage of copied) extracted.addPage(copiedPage);
        candidate = extracted;
      } else if (command.op === 'page.replace') {
        const source = await PDFDocument.load(ensurePdfBytes(Buffer.from(command.sourceBytesBase64, 'base64')), { ignoreEncryption: false, updateMetadata: false });
        if (command.sourcePage > source.getPageCount()) throw new Error(`page.replace source page ${command.sourcePage} does not exist.`);
        const [replacement] = await candidate.copyPages(source, [command.sourcePage - 1]);
        candidate.removePage(command.page - 1);
        candidate.insertPage(command.page - 1, replacement);
      } else if (command.op === 'page.setBoxes') {
        const setters = { media: 'setMediaBox', crop: 'setCropBox', bleed: 'setBleedBox', trim: 'setTrimBox', art: 'setArtBox' };
        for (const [boxName, box] of Object.entries(command.boxes)) {
          page[setters[boxName]](box.x, box.y, box.width, box.height);
        }
      } else if (command.op === 'document.merge') {
        const source = await PDFDocument.load(ensurePdfBytes(Buffer.from(command.sourceBytesBase64, 'base64')), { ignoreEncryption: false, updateMetadata: false });
        const copied = await candidate.copyPages(source, source.getPageIndices());
        let index = Math.min(command.insertAt - 1, candidate.getPageCount());
        for (const copiedPage of copied) candidate.insertPage(index++, copiedPage);
      } else if (command.op === 'document.setInitialView') {
        setInitialView(candidate, command);
      } else if (command.op === 'watermark.add') {
        const textCommands = selectedPageNumbers(command, candidate.getPageCount()).map((pageNumber) => {
          const targetPage = candidate.getPage(pageNumber - 1);
          return {
            op: 'text.add',
            page: pageNumber,
            x: Math.max(0, (targetPage.getWidth() - estimatedTextWidth(command.text, command.fontSize)) / 2),
            y: Math.max(0, (targetPage.getHeight() - command.fontSize) / 2),
            text: command.text,
            fontFamily: command.fontFamily,
            fontSize: command.fontSize,
            color: command.color,
            opacity: command.opacity,
            rotation: command.rotation,
          };
        });
        candidate = await applyEmbeddedText(candidate, textCommands);
      } else if (command.op === 'background.set') {
        for (const pageNumber of selectedPageNumbers(command, candidate.getPageCount())) {
          prependBackground(candidate, candidate.getPage(pageNumber - 1), command.color);
        }
      } else if (command.op === 'headerFooter.add') {
        const pageCount = candidate.getPageCount();
        const textCommands = [];
        for (const pageNumber of selectedPageNumbers(command, pageCount)) {
          const targetPage = candidate.getPage(pageNumber - 1);
          for (const [key, position] of [
            ['headerLeft', 'top-left'], ['headerCenter', 'top-center'], ['headerRight', 'top-right'],
            ['footerLeft', 'bottom-left'], ['footerCenter', 'bottom-center'], ['footerRight', 'bottom-right'],
          ]) {
            const text = expandPageTokens(command[key], pageNumber, pageCount);
            if (!text) continue;
            const textWidth = estimatedTextWidth(text, command.fontSize);
            const x = position.endsWith('left')
              ? command.margin
              : position.endsWith('center')
                ? (targetPage.getWidth() - textWidth) / 2
                : targetPage.getWidth() - command.margin - textWidth;
            const y = position.startsWith('top') ? command.margin : targetPage.getHeight() - command.margin - command.fontSize;
            textCommands.push({
              op: 'text.add', page: pageNumber, x: Math.max(0, x), y: Math.max(0, y), text,
              fontFamily: command.fontFamily, fontSize: command.fontSize, color: command.color,
            });
          }
        }
        candidate = await applyEmbeddedText(candidate, textCommands);
      } else if (command.op === 'bates.add') {
        const pagesToNumber = selectedPageNumbers(command, candidate.getPageCount());
        const textCommands = pagesToNumber.map((pageNumber, index) => {
          const targetPage = candidate.getPage(pageNumber - 1);
          const number = String(command.start + index).padStart(command.digits, '0');
          const text = `${command.prefix}${number}${command.suffix}`;
          const textWidth = estimatedTextWidth(text, command.fontSize);
          const x = command.position.endsWith('left')
            ? command.margin
            : command.position.endsWith('center')
              ? (targetPage.getWidth() - textWidth) / 2
              : targetPage.getWidth() - command.margin - textWidth;
          const y = command.position.startsWith('top') ? command.margin : targetPage.getHeight() - command.margin - command.fontSize;
          return {
            op: 'text.add', page: pageNumber, x: Math.max(0, x), y: Math.max(0, y), text,
            fontFamily: command.fontFamily, fontSize: command.fontSize, color: command.color,
          };
        });
        candidate = await applyEmbeddedText(candidate, textCommands);
      } else if (command.op === 'link.add') {
        addExternalLink(candidate, page, command);
      } else if (command.op === 'bookmark.add') {
        addTopLevelBookmark(candidate, command.title, page);
      } else if (['form.addTextField', 'form.addCheckBox', 'form.addDropdown'].includes(command.op)) {
        const form = candidate.getForm();
        const y = pageHeight - command.y - command.height;
        const appearance = {
          x: command.x,
          y,
          width: command.width,
          height: command.height,
          borderWidth: 1,
          borderColor: rgb(0.55, 0.58, 0.65),
          backgroundColor: rgb(1, 1, 1),
          textColor: rgb(0.09, 0.13, 0.2),
        };
        if (command.op === 'form.addTextField') {
          const { embedded } = await embedApprovedFont(candidate, command.fontFamily);
          const field = form.createTextField(command.name);
          if (command.multiline) field.enableMultiline();
          if (command.required) field.enableRequired();
          if (command.value) field.setText(command.value);
          field.addToPage(page, { ...appearance, font: embedded });
          field.setFontSize(command.fontSize);
        } else if (command.op === 'form.addCheckBox') {
          const field = form.createCheckBox(command.name);
          field.addToPage(page, appearance);
          if (command.checked) field.check();
        } else {
          const { embedded } = await embedApprovedFont(candidate, command.fontFamily);
          const field = form.createDropdown(command.name);
          field.addOptions(command.options);
          if (command.selected) field.select(command.selected);
          field.addToPage(page, { ...appearance, font: embedded });
          field.setFontSize(command.fontSize);
        }
      } else if (command.op === 'form.remove') {
        const form = candidate.getForm();
        const field = form.getFieldMaybe(command.name);
        if (!field) throw new Error(`form.remove could not find ${command.name}.`);
        form.removeField(field);
      } else if (command.op === 'metadata.set') {
        const setters = {
          title: 'setTitle', author: 'setAuthor', subject: 'setSubject', keywords: 'setKeywords',
          creator: 'setCreator', producer: 'setProducer', language: 'setLanguage',
        };
        for (const [key, value] of Object.entries(command.metadata)) candidate[setters[key]](value);
      } else if (command.op === 'document.sanitize') {
        sanitizePdfDocument(candidate);
      } else if (command.op === 'document.optimize') {
        // Serialization below performs the lossless object-stream rewrite.
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
    const [candidateInspection, candidateObjectInspection] = await Promise.all([
      inspectPdfBytes(candidateBytes),
      inspectPdfObjects(candidateBytes),
    ]);
    this.pdfDoc = candidate;
    this.inspection = candidateInspection;
    this.objectInspection = candidateObjectInspection;
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
    const title = String(this.pdfDoc.getTitle() || '').trim();
    const languageValue = this.pdfDoc.catalog.get(PDFName.of('Lang'));
    const language = String(languageValue?.decodeText?.() || '').trim();
    const tagged = Boolean(this.pdfDoc.catalog.get(PDFName.of('StructTreeRoot')));
    const imageOnlyPages = this.inspection.pages
      .filter((page) => page.textLength === 0 && this.inspection.images.some((image) => image.page === page.page))
      .map((page) => page.page);
    const unembeddedFontObjects = this.objectInspection.textObjects
      .filter((object) => object.renderMode !== 3 && object.embeddedFont === false)
      .map((object) => ({ page: object.page, objectIndex: object.objectIndex, fontFamily: object.fontFamily }));
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
    if (!title) issues.push({ code: 'accessibility_missing_title', severity: 'warning', message: 'The PDF does not have a document title.' });
    if (!language) issues.push({ code: 'accessibility_missing_language', severity: 'warning', message: 'The PDF does not declare a document language.' });
    if (!tagged) issues.push({ code: 'accessibility_untagged', severity: 'warning', message: 'The PDF does not contain a tagged structure tree.' });
    if (imageOnlyPages.length) {
      issues.push({
        code: 'accessibility_image_only_pages',
        severity: 'warning',
        message: `Image-only pages need OCR for search and assistive technology: ${imageOnlyPages.join(', ')}.`,
        pages: imageOnlyPages,
      });
    }
    if (unembeddedFontObjects.length) {
      issues.push({
        code: 'preflight_unembedded_fonts',
        severity: 'warning',
        message: `${unembeddedFontObjects.length} visible text object(s) use fonts that are not embedded.`,
        objects: unembeddedFontObjects.slice(0, 100),
      });
    }
    const savedBytes = saved?.bytes || Buffer.alloc(0);
    const activeContentMarkers = ['/JavaScript', '/OpenAction', '/AA']
      .filter((marker) => savedBytes.includes(Buffer.from(marker)));
    if (activeContentMarkers.length) {
      issues.push({
        code: 'preflight_active_content',
        severity: 'warning',
        message: `The PDF contains active-content markers: ${activeContentMarkers.join(', ')}.`,
      });
    }
    return {
      ok: issues.every((issue) => issue.severity !== 'error'),
      revision: this.revision,
      pageCount: this.pdfDoc.getPageCount(),
      changeCount: this.changes.length,
      issues,
      preflight: {
        title,
        language,
        tagged,
        imageOnlyPages,
        unembeddedFontObjects,
        activeContentMarkers,
      },
      sha256: saved ? sha256(saved.bytes) : null,
    };
  }
}

export { inspectPdfBytes, PdfApiSession };
