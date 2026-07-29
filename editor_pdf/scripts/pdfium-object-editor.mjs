import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { init } from '@embedpdf/pdfium';

const OBJECT_TYPES = Object.freeze({ 1: 'text', 2: 'path', 3: 'image', 4: 'shading', 5: 'form' });

const OPEN_FONT_FAMILIES = Object.freeze([
  { id: 'noto-sans-kr', label: 'Noto Sans KR', license: 'OFL-1.1', patterns: [/^NotoSansKR-(?:[A-Za-z]+)\.(?:ttf|otf)$/i, /^NotoSansKR-VF\.ttf$/i, /^NotoSansCJKkr-[A-Za-z]+\.otf$/i], aliases: ['Noto Sans CJK KR', 'NotoSansKR', 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'HCR Dotum', '함초롬돋움', 'KoPubWorld Dotum'] },
  { id: 'noto-serif-kr', label: 'Noto Serif KR', license: 'OFL-1.1', patterns: [/^NotoSerifKR-(?:[A-Za-z]+)\.(?:ttf|otf)$/i, /^NotoSerifKR-VF\.ttf$/i, /^NotoSerifCJKkr-[A-Za-z]+\.otf$/i], aliases: ['Noto Serif CJK KR', 'NotoSerifKR', 'Batang', 'BatangChe', '바탕', '바탕체', 'HCR Batang', '함초롬바탕', 'KoPub바탕체 Medium', 'KoPubWorld Batang'] },
  { id: 'nanum-gothic', label: 'Nanum Gothic', license: 'OFL-1.1', patterns: [/^NanumGothic(?:Coding)?(?:Bold|ExtraBold)?\.(?:ttf|otf)$/i], aliases: ['NanumGothic', '나눔고딕', 'Gulim', 'GulimChe', '굴림', '굴림체', 'Dotum', 'DotumChe', '돋움', '돋움체'] },
  { id: 'nanum-myeongjo', label: 'Nanum Myeongjo', license: 'OFL-1.1', patterns: [/^NanumMyeongjo(?:Bold|ExtraBold)?\.(?:ttf|otf)$/i], aliases: ['NanumMyeongjo', '나눔명조'] },
  { id: 'pretendard', label: 'Pretendard', license: 'OFL-1.1', patterns: [/^Pretendard-(?:[A-Za-z]+)\.(?:ttf|otf)$/i, /^PretendardVariable\.ttf$/i], aliases: ['Pretendard Variable'] },
  { id: 'carlito', label: 'Carlito', license: 'OFL-1.1', patterns: [/^Carlito-(?:Regular|Bold|Italic|BoldItalic)\.ttf$/i], aliases: ['Calibri', 'Calibri Light', 'Aptos', 'Aptos Display'] },
  { id: 'caladea', label: 'Caladea', license: 'Apache-2.0', patterns: [/^Caladea-(?:Regular|Bold|Italic|BoldItalic)\.ttf$/i], aliases: ['Cambria'] },
  { id: 'liberation-sans', label: 'Liberation Sans', license: 'OFL-1.1', patterns: [/^LiberationSans-(?:Regular|Bold|Italic|BoldItalic)\.ttf$/i], aliases: ['Arial', 'Helvetica'] },
  { id: 'liberation-serif', label: 'Liberation Serif', license: 'OFL-1.1', patterns: [/^LiberationSerif-(?:Regular|Bold|Italic|BoldItalic)\.ttf$/i], aliases: ['Times New Roman', 'Times'] },
  { id: 'liberation-mono', label: 'Liberation Mono', license: 'OFL-1.1', patterns: [/^LiberationMono-(?:Regular|Bold|Italic|BoldItalic)\.ttf$/i], aliases: ['Courier New', 'Courier'] },
  { id: 'dejavu-sans', label: 'DejaVu Sans', license: 'Bitstream-Vera', patterns: [/^DejaVuSans(?:-Bold|-Oblique|-BoldOblique)?\.ttf$/i], aliases: [] },
]);

let pdfiumPromise;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
async function getPdfium() {
  if (!pdfiumPromise) {
    pdfiumPromise = init().then((pdfium) => {
      pdfium.PDFiumExt_Init();
      return pdfium;
    });
  }
  return pdfiumPromise;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function alloc(pdfium, size) {
  const pointer = pdfium.pdfium._malloc(size);
  if (!pointer) throw new Error(`PDFium could not allocate ${size} bytes.`);
  return pointer;
}

function allocated(pdfium, size, callback) {
  const pointer = alloc(pdfium, size);
  try {
    return callback(pointer);
  } finally {
    pdfium.pdfium._free(pointer);
  }
}

function getFloat(pdfium, pointer) {
  return pdfium.pdfium.getValue(pointer, 'float');
}

function getUInt(pdfium, pointer) {
  return pdfium.pdfium.getValue(pointer, 'i32') >>> 0;
}

function utf16(pdfium, value) {
  const size = (String(value).length + 1) * 2;
  const pointer = alloc(pdfium, size);
  pdfium.pdfium.stringToUTF16(String(value), pointer, size);
  return pointer;
}

function getMatrix(pdfium, objectPointer) {
  return allocated(pdfium, 24, (pointer) => {
    if (!pdfium.FPDFPageObj_GetMatrix(objectPointer, pointer)) return null;
    const values = [0, 4, 8, 12, 16, 20].map((offset) => getFloat(pdfium, pointer + offset));
    return Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((key, index) => [key, values[index]]));
  });
}

function setMatrix(pdfium, objectPointer, matrix) {
  return allocated(pdfium, 24, (pointer) => {
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach((key, index) => pdfium.pdfium.setValue(pointer + index * 4, Number(matrix[key]), 'float'));
    return pdfium.FPDFPageObj_SetMatrix(objectPointer, pointer);
  });
}

function getBounds(pdfium, objectPointer) {
  return allocated(pdfium, 16, (pointer) => {
    if (!pdfium.FPDFPageObj_GetBounds(objectPointer, pointer, pointer + 4, pointer + 8, pointer + 12)) return null;
    const [left, bottom, right, top] = [0, 4, 8, 12].map((offset) => getFloat(pdfium, pointer + offset));
    return { left, bottom, right, top };
  });
}

function getColor(pdfium, objectPointer, stroke = false) {
  const getter = stroke ? pdfium.FPDFPageObj_GetStrokeColor : pdfium.FPDFPageObj_GetFillColor;
  return allocated(pdfium, 16, (pointer) => {
    if (!getter(objectPointer, pointer, pointer + 4, pointer + 8, pointer + 12)) return null;
    const [r, g, b, a] = [0, 4, 8, 12].map((offset) => getUInt(pdfium, pointer + offset));
    return { r, g, b, a, hex: `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}` };
  });
}

function getText(pdfium, objectPointer, textPagePointer) {
  const length = pdfium.FPDFTextObj_GetText(objectPointer, textPagePointer, 0, 0);
  if (!length) return '';
  return allocated(pdfium, length * 2, (pointer) => {
    pdfium.FPDFTextObj_GetText(objectPointer, textPagePointer, pointer, length);
    return pdfium.pdfium.UTF16ToString(pointer, length - 1);
  });
}

function getFontFamily(pdfium, fontPointer) {
  if (!fontPointer) return '';
  const length = pdfium.FPDFFont_GetFamilyName(fontPointer, 0, 0);
  if (!length) return '';
  return allocated(pdfium, length, (pointer) => {
    pdfium.FPDFFont_GetFamilyName(fontPointer, pointer, length);
    return pdfium.pdfium.UTF8ToString(pointer, length - 1);
  });
}

function canonicalFontFamily(value) {
  const aliases = new Map([
    ['Noto Sans Korean', 'Noto Sans KR'],
    ['Noto Serif Korean', 'Noto Serif KR'],
  ]);
  return aliases.get(value) || value;
}

function getFontSize(pdfium, objectPointer) {
  return allocated(pdfium, 4, (pointer) => (pdfium.FPDFTextObj_GetFontSize(objectPointer, pointer) ? getFloat(pdfium, pointer) : null));
}

function describeObject(pdfium, pagePointer, textPagePointer, page, pageHeight, objectIndex) {
  const pointer = pdfium.FPDFPage_GetObject(pagePointer, objectIndex);
  if (!pointer) return null;
  const typeCode = pdfium.FPDFPageObj_GetType(pointer);
  const type = OBJECT_TYPES[typeCode] || `unknown-${typeCode}`;
  const bounds = getBounds(pdfium, pointer);
  const matrix = getMatrix(pdfium, pointer);
  const common = {
    page, objectIndex, type, typeCode, bounds, matrix,
    editorBounds: bounds ? { x: bounds.left, y: pageHeight - bounds.top, width: bounds.right - bounds.left, height: bounds.top - bounds.bottom } : null,
  };
  if (type !== 'text') {
    return { ...common, id: `pdf-object-${page}-${objectIndex}-${type}-${digest(`${type}|${JSON.stringify(bounds)}|${JSON.stringify(matrix)}`).slice(0, 12)}` };
  }
  const text = getText(pdfium, pointer, textPagePointer);
  const fontPointer = pdfium.FPDFTextObj_GetFont(pointer);
  const pdfFontFamily = getFontFamily(pdfium, fontPointer);
  const fontFamily = canonicalFontFamily(pdfFontFamily);
  return {
    ...common,
    id: `pdf-object-${page}-${objectIndex}-text-${digest(`${text}|${fontFamily}|${JSON.stringify(bounds)}`).slice(0, 12)}`,
    text,
    fontFamily,
    pdfFontFamily,
    fontSize: getFontSize(pdfium, pointer),
    fillColor: getColor(pdfium, pointer),
    strokeColor: getColor(pdfium, pointer, true),
    renderMode: pdfium.FPDFTextObj_GetTextRenderMode(pointer),
    embeddedFont: Boolean(fontPointer && pdfium.FPDFFont_GetIsEmbedded(fontPointer)),
  };
}

async function withDocument(bytes, callback) {
  const pdfium = await getPdfium();
  const source = Buffer.from(bytes);
  const sourcePointer = alloc(pdfium, source.length);
  pdfium.pdfium.HEAPU8.set(source, sourcePointer);
  const documentPointer = pdfium.FPDF_LoadMemDocument(sourcePointer, source.length, '');
  if (!documentPointer) {
    pdfium.pdfium._free(sourcePointer);
    throw new Error(`PDFium failed to open the PDF (error ${pdfium.FPDF_GetLastError()}).`);
  }
  try {
    return await callback(pdfium, documentPointer);
  } finally {
    pdfium.FPDF_CloseDocument(documentPointer);
    pdfium.pdfium._free(sourcePointer);
  }
}

function saveDocument(pdfium, documentPointer) {
  const writerPointer = pdfium.PDFiumExt_OpenFileWriter();
  if (!writerPointer) throw new Error('PDFium could not create a file writer.');
  try {
    if (!pdfium.PDFiumExt_SaveAsCopy(documentPointer, writerPointer)) throw new Error('PDFium failed to serialize the edited document.');
    const size = pdfium.PDFiumExt_GetFileWriterSize(writerPointer);
    return allocated(pdfium, size, (pointer) => {
      const copied = pdfium.PDFiumExt_GetFileWriterData(writerPointer, pointer, size);
      if (copied !== size) throw new Error(`PDFium serialized ${copied} of ${size} bytes.`);
      return Buffer.from(pdfium.pdfium.HEAPU8.slice(pointer, pointer + size));
    });
  } finally {
    pdfium.PDFiumExt_CloseFileWriter(writerPointer);
  }
}

async function inspectPdfObjects(bytes) {
  return withDocument(bytes, async (pdfium, documentPointer) => {
    const pageCount = pdfium.FPDF_GetPageCount(documentPointer);
    const pages = [];
    const objects = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pagePointer = pdfium.FPDF_LoadPage(documentPointer, pageIndex);
      if (!pagePointer) throw new Error(`PDFium could not load page ${pageIndex + 1}.`);
      const textPagePointer = pdfium.FPDFText_LoadPage(pagePointer);
      try {
        const height = pdfium.FPDF_GetPageHeightF(pagePointer);
        const width = pdfium.FPDF_GetPageWidthF(pagePointer);
        const count = pdfium.FPDFPage_CountObjects(pagePointer);
        const pageObjects = Array.from({ length: count }, (_, objectIndex) => describeObject(pdfium, pagePointer, textPagePointer, pageIndex + 1, height, objectIndex)).filter(Boolean);
        pages.push({ page: pageIndex + 1, width, height, objectCount: count, objects: pageObjects });
        objects.push(...pageObjects);
      } finally {
        if (textPagePointer) pdfium.FPDFText_ClosePage(textPagePointer);
        pdfium.FPDF_ClosePage(pagePointer);
      }
    }
    return { pageCount, pages, objects, textObjects: objects.filter((object) => object.type === 'text'), imageObjects: objects.filter((object) => object.type === 'image') };
  });
}

function fontRoots() {
  const configured = [process.env.EDITOR_PDF_FONTS_DIR, process.env.EDITOR_NATIVE_ACADEMIC_FONT_DIR, process.env.EDITOR_ACADEMIC_FONTS_DIR, process.env.EDITOR_DOCX_EXTRA_FONTS_DIR, process.env.EDITOR_EXTRA_FONTS_DIR].filter(Boolean);
  const defaults = process.platform === 'win32'
    ? [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts')]
    : ['/usr/local/share/fonts/tlooto-academic', '/usr/share/fonts/opentype', '/usr/share/fonts/truetype'];
  const bundled = [path.resolve(moduleDirectory, '..', 'node_modules', '@embedpdf', 'fonts-kr', 'fonts')];
  return [...new Set([...configured, ...bundled, ...defaults].map((root) => path.resolve(root)))];
}

async function collectFiles(root, depth = 0) {
  if (depth > 4) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath, depth + 1));
    else if (entry.isFile() && /\.(?:ttf|otf)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

async function listPdfFonts() {
  const files = (await Promise.all(fontRoots().map((root) => collectFiles(root)))).flat();
  const fonts = [];
  for (const family of OPEN_FONT_FAMILIES) {
    const matches = [...new Set(files.filter((candidate) => family.patterns.some((pattern) => pattern.test(path.basename(candidate)))))]
      .sort((left, right) => path.basename(left).localeCompare(path.basename(right), 'en'));
    for (const filePath of matches) {
      const details = await stat(filePath);
      const filename = path.basename(filePath, path.extname(filePath));
      const compact = filename.replaceAll(/[^A-Za-z0-9]/g, '');
      const weightName = ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'ExtraBold', 'Bold', 'Black']
        .find((name) => compact.toLowerCase().includes(name.toLowerCase())) || (compact.includes('Variable') || compact.endsWith('VF') ? 'Variable' : 'Regular');
      const weight = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900, Variable: 400 }[weightName];
      const italic = /italic|oblique/i.test(filename);
      const style = `${weightName}${italic ? ' Italic' : ''}`;
      if (fonts.some((font) => font.familyId === family.id && font.style === style)) continue;
      fonts.push({
        id: `${family.id}-${filename.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
        familyId: family.id,
        label: family.label,
        style,
        weight,
        italic,
        license: family.license,
        aliases: family.aliases,
        filePath,
        byteLength: details.size,
        embeddable: true,
      });
    }
  }
  return fonts;
}

async function resolvePdfFont(requestedFamily) {
  const requested = String(requestedFamily || 'Noto Sans KR').trim().toLocaleLowerCase('en');
  const available = await listPdfFonts();
  const exactVariant = available.find((font) => font.id.toLocaleLowerCase('en') === requested);
  if (exactVariant) return exactVariant;
  const family = OPEN_FONT_FAMILIES.find((entry) => entry.id.toLocaleLowerCase('en') === requested || entry.label.toLocaleLowerCase('en') === requested || entry.aliases.some((alias) => alias.toLocaleLowerCase('en') === requested));
  if (!family) throw new Error(`PDF font "${requestedFamily}" is not in the approved open-font registry.`);
  const familyFonts = available.filter((font) => font.familyId === family.id);
  const match = familyFonts.find((font) => font.style === 'Regular') || familyFonts.find((font) => font.style === 'Variable') || familyFonts[0];
  if (!match) throw new Error(`PDF font "${family.label}" is approved but not installed. Configure EDITOR_PDF_FONTS_DIR or install the Academic Editor font pack.`);
  return match;
}

function assertTarget(current, command) {
  if (!current) throw new Error(`PDF page ${command.page} object ${command.objectIndex} does not exist.`);
  if (command.objectId && current.id !== command.objectId) throw new Error(`PDF object precondition failed: expected ${command.objectId}, found ${current.id}. Re-inspect before editing.`);
  if (command.expectedText !== undefined && current.text !== command.expectedText) throw new Error(`PDF text precondition failed on ${current.id}: expected exact current text before editing.`);
}

function parseColor(command, current) {
  if (!/^#[0-9a-f]{6}$/i.test(String(command.color || ''))) return [current.r, current.g, current.b];
  return String(command.color).slice(1).match(/../g).map((part) => Number.parseInt(part, 16));
}

function replaceText(pdfium, documentPointer, pagePointer, current, command, fontBytes) {
  const oldPointer = pdfium.FPDFPage_GetObject(pagePointer, current.objectIndex);
  const lines = String(command.text).split(/\r?\n/u);
  if (lines.length === 1 && !fontBytes && command.fontFamily === undefined && command.fontSize === undefined && command.color === undefined && command.opacity === undefined) {
    const pointer = utf16(pdfium, command.text);
    try {
      if (!pdfium.FPDFText_SetText(oldPointer, pointer)) throw new Error('PDFium could not replace text in the existing object.');
      return;
    } finally {
      pdfium.pdfium._free(pointer);
    }
  }
  const fontPointer = fontBytes ? allocated(pdfium, fontBytes.length, (pointer) => {
    pdfium.pdfium.HEAPU8.set(fontBytes, pointer);
    return pdfium.FPDFText_LoadFont(documentPointer, pointer, fontBytes.length, 2, true);
  }) : pdfium.FPDFTextObj_GetFont(oldPointer);
  if (!fontPointer) throw new Error('PDFium could not embed the selected font.');
  const fontSize = Number(command.fontSize ?? current.fontSize);
  const lineHeight = Number(command.lineHeight ?? fontSize * 1.2);
  const replacements = [];
  try {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const replacement = pdfium.FPDFPageObj_CreateTextObj(documentPointer, fontPointer, fontSize);
      if (!replacement) throw new Error('PDFium could not create a replacement text object.');
      const textPointer = utf16(pdfium, lines[lineIndex]);
      try {
        if (!pdfium.FPDFText_SetText(replacement, textPointer)) throw new Error('PDFium could not write the replacement text.');
      } finally {
        pdfium.pdfium._free(textPointer);
      }
      if (current.matrix) {
        const matrix = {
          ...current.matrix,
          e: Number(current.matrix.e) - Number(current.matrix.c) * lineHeight * lineIndex,
          f: Number(current.matrix.f) - Number(current.matrix.d) * lineHeight * lineIndex,
        };
        if (!setMatrix(pdfium, replacement, matrix)) throw new Error('PDFium could not preserve the text transform.');
      }
      const [r, g, b] = parseColor(command, current.fillColor);
      const a = command.opacity === undefined ? current.fillColor.a : Math.round(Number(command.opacity) * 255);
      pdfium.FPDFPageObj_SetFillColor(replacement, r, g, b, a);
      pdfium.FPDFPageObj_SetStrokeColor(replacement, current.strokeColor.r, current.strokeColor.g, current.strokeColor.b, current.strokeColor.a);
      pdfium.FPDFTextObj_SetTextRenderMode(replacement, current.renderMode);
      replacements.push(replacement);
    }
    if (!pdfium.FPDFPage_RemoveObject(pagePointer, oldPointer)) throw new Error('PDFium could not remove the original text object.');
    replacements.forEach((replacement, lineIndex) => {
      pdfium.FPDFPage_InsertObjectAtIndex(pagePointer, replacement, current.objectIndex + lineIndex);
    });
    pdfium.FPDFPageObj_Destroy(oldPointer);
  } catch (error) {
    replacements.forEach((replacement) => pdfium.FPDFPageObj_Destroy(replacement));
    throw error;
  }
}

function replaceImage(pdfium, pagePointer, current, command) {
  const imagePointer = pdfium.FPDFPage_GetObject(pagePointer, current.objectIndex);
  const bytes = Buffer.from(command.bytesBase64, 'base64');
  allocated(pdfium, bytes.length, (pointer) => {
    pdfium.pdfium.HEAPU8.set(bytes, pointer);
    const setter = command.mimeType === 'image/png' ? pdfium.EPDFImageObj_SetPng : pdfium.EPDFImageObj_SetJpeg;
    if (!setter(pagePointer, 0, imagePointer, pointer, bytes.length)) throw new Error(`PDFium could not replace image data in ${current.id}.`);
  });
}

function addText(pdfium, documentPointer, pagePointer, pageHeight, command, fontPointer) {
  if (!fontPointer) throw new Error('PDFium could not embed the selected font.');
  const objectPointer = pdfium.FPDFPageObj_CreateTextObj(documentPointer, fontPointer, Number(command.fontSize));
  if (!objectPointer) throw new Error('PDFium could not create a text object.');
  const textPointer = utf16(pdfium, command.text);
  try {
    if (!pdfium.FPDFText_SetText(objectPointer, textPointer)) throw new Error('PDFium could not write the new text object.');
    const radians = Number(command.rotation || 0) * Math.PI / 180;
    if (!setMatrix(pdfium, objectPointer, {
      a: Math.cos(radians),
      b: Math.sin(radians),
      c: -Math.sin(radians),
      d: Math.cos(radians),
      e: Number(command.x),
      f: pageHeight - Number(command.y) - Number(command.fontSize),
    })) throw new Error('PDFium could not position the new text object.');
    const [r, g, b] = parseColor(command, { r: 23, g: 32, b: 51 });
    pdfium.FPDFPageObj_SetFillColor(objectPointer, r, g, b, Math.round(Number(command.opacity ?? 1) * 255));
    if (command.renderMode === 'invisible') pdfium.FPDFTextObj_SetTextRenderMode(objectPointer, 3);
    pdfium.FPDFPage_InsertObject(pagePointer, objectPointer);
  } catch (error) {
    pdfium.FPDFPageObj_Destroy(objectPointer);
    throw error;
  } finally {
    pdfium.pdfium._free(textPointer);
  }
}

async function applyPdfObjectCommands(bytes, commands) {
  if (!Array.isArray(commands) || !commands.length) throw new Error('At least one PDF object command is required.');
  const prepared = [];
  for (const command of commands) {
    const font = command.op === 'text.add'
      ? await resolvePdfFont(command.fontFamily || (/^[\x00-\xff]*$/.test(command.text) ? 'Liberation Sans' : 'Noto Sans KR'))
      : command.op === 'text.replaceObject' && command.fontFamily
        ? await resolvePdfFont(command.fontFamily)
        : null;
    prepared.push({ command, font, fontBytes: font ? await readFile(font.filePath) : null });
  }
  return withDocument(bytes, async (pdfium, documentPointer) => {
    const applied = [];
    const loadedFonts = new Map();
    for (const { command, font, fontBytes } of prepared) {
      const pagePointer = pdfium.FPDF_LoadPage(documentPointer, Number(command.page) - 1);
      if (!pagePointer) throw new Error(`PDF page ${command.page} does not exist.`);
      const textPagePointer = pdfium.FPDFText_LoadPage(pagePointer);
      try {
        const pageHeight = pdfium.FPDF_GetPageHeightF(pagePointer);
        if (command.op === 'text.add') {
          let fontPointer = loadedFonts.get(font.filePath);
          if (!fontPointer) {
            fontPointer = allocated(pdfium, fontBytes.length, (pointer) => {
              pdfium.pdfium.HEAPU8.set(fontBytes, pointer);
              return pdfium.FPDFText_LoadFont(documentPointer, pointer, fontBytes.length, 2, true);
            });
            if (!fontPointer) throw new Error('PDFium could not embed the selected font.');
            loadedFonts.set(font.filePath, fontPointer);
          }
          addText(pdfium, documentPointer, pagePointer, pageHeight, command, fontPointer);
          if (!pdfium.FPDFPage_GenerateContent(pagePointer)) throw new Error(`PDFium could not regenerate page ${command.page}.`);
          applied.push({ op: command.op, page: command.page, objectIndex: null, font: font?.label || null, style: font?.style || null });
          continue;
        }
        if (command.op === 'redaction.apply') {
          const objectCount = pdfium.FPDFPage_CountObjects(pagePointer);
          let removed = 0;
          for (let objectIndex = objectCount - 1; objectIndex >= 0; objectIndex -= 1) {
            const current = describeObject(pdfium, pagePointer, textPagePointer, command.page, pageHeight, objectIndex);
            const bounds = current?.editorBounds;
            const intersects = bounds && command.regions.some((region) => (
              bounds.x < region.x + region.width
              && bounds.x + bounds.width > region.x
              && bounds.y < region.y + region.height
              && bounds.y + bounds.height > region.y
            ));
            if (!intersects) continue;
            const pointer = pdfium.FPDFPage_GetObject(pagePointer, objectIndex);
            if (!pdfium.FPDFPage_RemoveObject(pagePointer, pointer)) {
              throw new Error(`PDFium could not remove redacted object ${command.page}:${objectIndex}.`);
            }
            pdfium.FPDFPageObj_Destroy(pointer);
            removed += 1;
          }
          if (!pdfium.FPDFPage_GenerateContent(pagePointer)) throw new Error(`PDFium could not regenerate redacted page ${command.page}.`);
          applied.push({ op: command.op, page: command.page, objectIndex: null, removed });
          continue;
        }
        const current = describeObject(pdfium, pagePointer, textPagePointer, command.page, pageHeight, Number(command.objectIndex));
        assertTarget(current, command);
        let removedContinuations = 0;
        if (command.op === 'text.replaceObject' && command.removeFollowingObjects?.length) {
          const continuations = command.removeFollowingObjects.map((target) => {
            const continuation = describeObject(
              pdfium,
              pagePointer,
              textPagePointer,
              command.page,
              pageHeight,
              Number(target.objectIndex),
            );
            if (!continuation || continuation.id !== target.objectId) {
              throw new Error(`PDF continuation precondition failed at ${command.page}:${target.objectIndex}. Re-inspect before editing.`);
            }
            if (continuation.type !== 'text') {
              throw new Error(`PDF continuation ${continuation.id} is not a text object.`);
            }
            return continuation;
          });
          for (const continuation of continuations) {
            const pointer = pdfium.FPDFPage_GetObject(pagePointer, continuation.objectIndex);
            if (!pdfium.FPDFPage_RemoveObject(pagePointer, pointer)) {
              throw new Error(`PDFium could not remove continuation ${continuation.id}.`);
            }
            pdfium.FPDFPageObj_Destroy(pointer);
            removedContinuations += 1;
          }
        }
        if (command.op === 'text.replaceObject') {
          if (current.type !== 'text') throw new Error(`${current.id} is not a text object.`);
          replaceText(pdfium, documentPointer, pagePointer, current, command, fontBytes);
        } else if (command.op === 'image.replaceObject') {
          if (current.type !== 'image') throw new Error(`${current.id} is not an image object.`);
          replaceImage(pdfium, pagePointer, current, command);
        } else if (command.op === 'object.delete') {
          const pointer = pdfium.FPDFPage_GetObject(pagePointer, current.objectIndex);
          if (!pdfium.FPDFPage_RemoveObject(pagePointer, pointer)) throw new Error(`PDFium could not remove ${current.id}.`);
          pdfium.FPDFPageObj_Destroy(pointer);
        } else if (command.op === 'object.transform') {
          const pointer = pdfium.FPDFPage_GetObject(pagePointer, current.objectIndex);
          if (!setMatrix(pdfium, pointer, { ...current.matrix, ...command.matrix })) throw new Error(`PDFium could not transform ${current.id}.`);
        } else {
          throw new Error(`Unsupported PDF object command: ${command.op}.`);
        }
        if (!pdfium.FPDFPage_GenerateContent(pagePointer)) throw new Error(`PDFium could not regenerate page ${command.page}.`);
        applied.push({
          op: command.op,
          page: command.page,
          objectIndex: command.objectIndex,
          font: font?.label || null,
          style: font?.style || null,
          removedContinuations,
        });
      } finally {
        if (textPagePointer) pdfium.FPDFText_ClosePage(textPagePointer);
        pdfium.FPDF_ClosePage(pagePointer);
      }
    }
    const output = saveDocument(pdfium, documentPointer);
    return { bytes: output, applied, sha256: digest(output) };
  });
}

export { OPEN_FONT_FAMILIES, applyPdfObjectCommands, inspectPdfObjects, listPdfFonts, resolvePdfFont };
