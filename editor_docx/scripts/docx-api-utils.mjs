import assert from 'node:assert/strict';
import { deflateRawSync, deflateSync, inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

import {
  buildListText as coreBuildListText,
  commandId as coreCommandId,
  commandKey as coreCommandKey,
  commandLocation as coreCommandLocation,
  commandText as coreCommandText,
  fitTextToCapacity as coreFitTextToCapacity,
  hashString as coreHashString,
  normalizeCellReference as coreNormalizeCellReference,
  normalizeParagraphLocation as coreNormalizeParagraphLocation,
  stableStringify as coreStableStringify,
  wrapLine as coreWrapLine,
} from '../../editor_common/document-api-core.mjs';
import { resolveDocxCommand, validateDocxCommands } from './docx-command-catalog.mjs';

export const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const WORD_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
export const PICTURE_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
export const DOC_REL_NS = OFFICE_REL_NS;
export const PACKAGE_REL_NS = REL_NS;

function crc32(buffer) {
  const table = crc32.table ??= (() => {
    const values = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      values[i] = c >>> 0;
    }
    return values;
  })();

  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function parseColor(value, fallback = [255, 255, 255]) {
  if (Array.isArray(value) && value.length >= 3) {
    return value.slice(0, 3).map((item) => Math.max(0, Math.min(255, Number(item) || 0)));
  }
  const text = String(value ?? '').trim();
  const hex = text.startsWith('#') ? text.slice(1) : text;
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  return fallback;
}

function fillRect(pixels, width, height, rect, color) {
  const x0 = Math.max(0, Math.min(width, Math.round(rect.x)));
  const y0 = Math.max(0, Math.min(height, Math.round(rect.y)));
  const x1 = Math.max(x0, Math.min(width, Math.round(rect.x + rect.width)));
  const y1 = Math.max(y0, Math.min(height, Math.round(rect.y + rect.height)));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
}

export function generatePngBytes(options = {}) {
  const width = Math.max(16, Math.min(4096, Number(options.width) || 900));
  const height = Math.max(16, Math.min(4096, Number(options.height) || 520));
  const pixels = Buffer.alloc(width * height * 3);
  const background = parseColor(options.background ?? '#ffffff');
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = background[0];
    pixels[i + 1] = background[1];
    pixels[i + 2] = background[2];
  }

  const accent = parseColor(options.accent ?? '#2f5fbd', [47, 95, 189]);
  const grid = parseColor(options.grid ?? '#d7dce8', [215, 220, 232]);
  const margin = Math.round(Math.min(width, height) * 0.08);
  for (let i = 0; i < 5; i += 1) {
    const y = margin + Math.round((height - margin * 2) * (i / 4));
    fillRect(pixels, width, height, { x: margin, y, width: width - margin * 2, height: 1 }, grid);
  }

  const values = Array.isArray(options.values) && options.values.length
    ? options.values.map((item) => (typeof item === 'number' ? { value: item } : item))
    : [{ value: 3 }, { value: 7 }, { value: 5 }, { value: 9 }, { value: 6 }];
  const maxValue = Math.max(1, Number(options.maxValue) || Math.max(...values.map((item) => Number(item.value) || 0)));
  const gap = Math.max(4, Math.round((width - margin * 2) / (values.length * 5)));
  const barWidth = Math.max(4, Math.floor((width - margin * 2 - gap * (values.length - 1)) / values.length));
  values.forEach((item, index) => {
    const value = Math.max(0, Number(item.value) || 0);
    const ratio = Math.min(1, value / maxValue);
    const barHeight = Math.max(2, Math.round((height - margin * 2) * ratio));
    const x = margin + index * (barWidth + gap);
    const y = height - margin - barHeight;
    fillRect(pixels, width, height, { x, y, width: barWidth, height: barHeight }, parseColor(item.color, accent));
  });

  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 3 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND'),
  ]);
}

const IMAGE_FORMATS = Object.freeze({
  png: { mimeType: 'image/png', extensions: ['png'] },
  jpeg: { mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  gif: { mimeType: 'image/gif', extensions: ['gif'] },
  bmp: { mimeType: 'image/bmp', extensions: ['bmp'] },
  emf: { mimeType: 'image/emf', extensions: ['emf'] },
  wmf: { mimeType: 'image/wmf', extensions: ['wmf'] },
});
const IMAGE_FORMAT_BY_EXTENSION = new Map(Object.entries(IMAGE_FORMATS)
  .flatMap(([format, spec]) => spec.extensions.map((extension) => [extension, format])));

function detectImageFormat(bytes) {
  const buffer = Buffer.from(bytes ?? []);
  const pngTrailer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  if (buffer.length >= 33
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && buffer.subarray(-12).equals(pngTrailer)) {
    return 'png';
  }
  if (buffer.length >= 14 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
    && buffer[buffer.length - 1] === 0x3b) {
    return 'gif';
  }
  if (buffer.length >= 14 && buffer.subarray(0, 2).toString('ascii') === 'BM') {
    return 'bmp';
  }
  if (buffer.length >= 44 && buffer.subarray(40, 44).equals(Buffer.from([0x20, 0x45, 0x4d, 0x46]))) {
    return 'emf';
  }
  if (buffer.length >= 4 && (buffer.subarray(0, 4).equals(Buffer.from([0xd7, 0xcd, 0xc6, 0x9a]))
    || ((buffer.readUInt16LE(0) === 1 || buffer.readUInt16LE(0) === 2) && buffer.readUInt16LE(2) === 9))) {
    return 'wmf';
  }
  if (buffer.length >= 6 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) {
    return 'jpeg';
  }
  return '';
}

function validateImageBytesForPackage(imageName, bytes, declaredMimeType = '') {
  const extensionMatch = String(imageName ?? '').toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = extensionMatch?.[1] ?? '';
  const expectedFormat = IMAGE_FORMAT_BY_EXTENSION.get(extension);
  assert.ok(expectedFormat, `image.replace does not support package extension: .${extension || '<missing>'}`);
  const detectedFormat = detectImageFormat(bytes);
  assert.ok(detectedFormat, 'image.replace bytes do not contain a recognized, complete image signature');
  assert.equal(detectedFormat, expectedFormat, `image.replace signature ${detectedFormat} does not match package extension .${extension}`);
  const expectedMimeType = IMAGE_FORMATS[expectedFormat].mimeType;
  const normalizedMimeType = String(declaredMimeType || '').trim().toLowerCase().replace('image/jpg', 'image/jpeg');
  if (normalizedMimeType) {
    assert.equal(normalizedMimeType, expectedMimeType, `image.replace MIME ${normalizedMimeType} does not match ${expectedMimeType}`);
  }
  return { extension, format: expectedFormat, mimeType: expectedMimeType };
}

function imageBytesFromOperation(op) {
  if (op.bytes) {
    return Buffer.isBuffer(op.bytes) ? Buffer.from(op.bytes) : Buffer.from(op.bytes);
  }
  if (op.bytesBase64) {
    const encoded = String(op.bytesBase64).trim();
    assert.match(encoded, /^[A-Za-z0-9+/]+={0,2}$/, 'image.replace bytesBase64 is not valid base64');
    const bytes = Buffer.from(encoded, 'base64');
    assert.equal(bytes.toString('base64').replace(/=+$/, ''), encoded.replace(/=+$/, ''), 'image.replace bytesBase64 is not canonical base64');
    return bytes;
  }
  if (op.filePath) {
    return readFileSync(op.filePath);
  }
  return Buffer.alloc(0);
}

export function readZip(bufferLike) {
  const buffer = Buffer.from(bufferLike);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  assert.notEqual(eocdOffset, -1, 'zip end of central directory not found');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();

  for (let i = 0; i < entryCount; i += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, 'central directory header');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');

    assert.equal(buffer.readUInt32LE(localHeaderOffset), 0x04034b50, 'local file header');
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    entries.set(name, method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed));

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export function createZip(entriesLike) {
  const entries = entriesLike instanceof Map ? [...entriesLike.entries()] : entriesLike;
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const dosTime = 0;
  const dosDate = 0x0021;

  for (const [name, rawData] of entries) {
    const fileName = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(String(rawData), 'utf8');
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, fileName, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, fileName);

    localOffset += local.length + fileName.length + compressed.length;
  }

  const centralStart = localOffset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function escapeXmlText(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXmlAttr(text) {
  return escapeXmlText(text).replaceAll('"', '&quot;');
}

function unescapeXml(text) {
  return String(text ?? '')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function firstMatch(text, pattern, fallback = '') {
  const match = String(text ?? '').match(pattern);
  return match ? match[1] : fallback;
}

function elementBlocks(xml, tagName) {
  const pattern = new RegExp(`<w:${tagName}\\b[^>]*(?:/>|>)|<\\/w:${tagName}>`, 'g');
  const blocks = [];
  const stack = [];
  let match;
  while ((match = pattern.exec(xml))) {
    const token = match[0];
    if (token.startsWith(`</w:${tagName}`)) {
      const start = stack.pop();
      if (start && stack.length === 0) {
        blocks.push({
          start: start.index,
          end: pattern.lastIndex,
          xml: xml.slice(start.index, pattern.lastIndex),
          open: start.token,
        });
      }
    } else if (token.endsWith('/>')) {
      if (stack.length === 0) {
        blocks.push({
          start: match.index,
          end: pattern.lastIndex,
          xml: token,
          open: token,
        });
      }
    } else {
      stack.push({ index: match.index, token });
    }
  }
  return blocks;
}

function bodyRange(xml) {
  const match = xml.match(/<w:body\b[^>]*>/);
  const close = xml.lastIndexOf('</w:body>');
  assert.ok(match && close > match.index, 'word/document.xml body not found');
  return {
    openEnd: match.index + match[0].length,
    closeStart: close,
    inner: xml.slice(match.index + match[0].length, close),
  };
}

function extractText(xml) {
  const values = [];
  const tokenRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
  let match;
  while ((match = tokenRe.exec(xml))) {
    if (match[0].startsWith('<w:tab')) {
      values.push('\t');
    } else if (match[0].startsWith('<w:br')) {
      values.push('\n');
    } else {
      values.push(unescapeXml(match[1]));
    }
  }
  return values.join('');
}

function tagXml(xml, tagName) {
  const expanded = new RegExp(`<w:${tagName}\\b[\\s\\S]*?<\\/w:${tagName}>`).exec(xml);
  if (expanded) {
    return expanded[0];
  }
  const selfClosing = new RegExp(`<w:${tagName}\\b[^>]*/>`).exec(xml);
  return selfClosing ? selfClosing[0] : '';
}

function removeTagXml(xml, tagName) {
  return xml
    .replace(new RegExp(`<w:${tagName}\\b[\\s\\S]*?<\\/w:${tagName}>`, 'g'), '')
    .replace(new RegExp(`<w:${tagName}\\b[^>]*/>`, 'g'), '');
}

function replaceOrInsertChild(xml, parentOpenPattern, childTag, childXml) {
  const pattern = new RegExp(`<w:${childTag}\\b[\\s\\S]*?<\\/w:${childTag}>|<w:${childTag}\\b[^>]*/>`);
  if (pattern.test(xml)) {
    return xml.replace(pattern, childXml);
  }
  return xml.replace(parentOpenPattern, (match) => `${match}${childXml}`);
}

function replaceOrInsertXmlTextElement(xml, qualifiedName, value) {
  const escapedName = qualifiedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expanded = new RegExp(`(<${escapedName}\\b[^>]*>)[\\s\\S]*?(<\\/${escapedName}>)`);
  const selfClosing = new RegExp(`<${escapedName}\\b[^>]*/>`);
  const replacement = `<${qualifiedName}>${escapeXmlText(value ?? '')}</${qualifiedName}>`;
  if (expanded.test(xml)) {
    return xml.replace(expanded, (_match, open, close) => `${open}${escapeXmlText(value ?? '')}${close}`);
  }
  if (selfClosing.test(xml)) {
    return xml.replace(selfClosing, replacement);
  }
  return xml.replace('</cp:coreProperties>', `${replacement}</cp:coreProperties>`);
}

function runPropertiesXml(style = {}) {
  const parts = [];
  if (style.runStyleId) {
    parts.push(`<w:rStyle w:val="${escapeXmlAttr(style.runStyleId)}"/>`);
  }
  if (style.bold) {
    parts.push('<w:b/>');
  }
  if (style.italic) {
    parts.push('<w:i/>');
  }
  if (style.underline) {
    parts.push(`<w:u w:val="${escapeXmlAttr(style.underline === true ? 'single' : style.underline)}"/>`);
  }
  if (style.textColor) {
    parts.push(`<w:color w:val="${String(style.textColor).replace(/^#/, '').toUpperCase()}"/>`);
  }
  if (style.fontSize) {
    parts.push(`<w:sz w:val="${Math.round(Number(style.fontSize) * 2)}"/>`);
  }
  if (style.fontFamily) {
    const font = escapeXmlAttr(style.fontFamily);
    parts.push(`<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`);
  }
  return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
}

function paragraphPropertiesXml(style = {}) {
  const parts = [];
  if (style.styleId) {
    parts.push(`<w:pStyle w:val="${escapeXmlAttr(style.styleId)}"/>`);
  }
  if (style.align) {
    parts.push(`<w:jc w:val="${escapeXmlAttr(style.align)}"/>`);
  }
  if (style.spacingBefore || style.spacingAfter || style.lineSpacing) {
    parts.push(
      `<w:spacing${style.spacingBefore ? ` w:before="${style.spacingBefore}"` : ''}${style.spacingAfter ? ` w:after="${style.spacingAfter}"` : ''}${style.lineSpacing ? ` w:line="${style.lineSpacing}" w:lineRule="auto"` : ''}/>`,
    );
  }
  if (style.left || style.right || style.firstLine || style.hanging) {
    parts.push(
      `<w:ind${style.left ? ` w:left="${style.left}"` : ''}${style.right ? ` w:right="${style.right}"` : ''}${style.firstLine ? ` w:firstLine="${style.firstLine}"` : ''}${style.hanging ? ` w:hanging="${style.hanging}"` : ''}/>`,
    );
  }
  if (style.numId || style.ilvl !== undefined) {
    parts.push(`<w:numPr><w:ilvl w:val="${escapeXmlAttr(style.ilvl ?? 0)}"/><w:numId w:val="${escapeXmlAttr(style.numId ?? 1)}"/></w:numPr>`);
  }
  if (style.keepNext) {
    parts.push('<w:keepNext/>');
  }
  if (style.pageBreakBefore) {
    parts.push('<w:pageBreakBefore/>');
  }
  return parts.length ? `<w:pPr>${parts.join('')}</w:pPr>` : '';
}

function textRunXml(text, rPrXml = '') {
  const textValue = String(text ?? '');
  const preserve = /^\s|\s$/.test(textValue) ? ' xml:space="preserve"' : '';
  return `<w:r>${rPrXml}<w:t${preserve}>${escapeXmlText(textValue)}</w:t></w:r>`;
}

function paragraphXml(text, options = {}) {
  const pPr = options.pPrXml ?? paragraphPropertiesXml(options.paragraphStyle);
  const rPr = options.rPrXml ?? runPropertiesXml(options.runStyle);
  return `<w:p>${pPr}${textRunXml(text, rPr)}</w:p>`;
}

function paragraphsXmlFromText(text, options = {}) {
  const lines = String(text ?? '').split('\n');
  return (lines.length ? lines : ['']).map((line) => paragraphXml(line, options)).join('');
}

function tableCellXml(text = '', options = {}) {
  const tcPr = options.tcPrXml ?? cellStyleXml(options.cellStyle);
  return `<w:tc>${tcPr}${paragraphsXmlFromText(text, options)}</w:tc>`;
}

function tableXml(rows, cols, options = {}) {
  // A Word table requires a tblGrid to describe its logical columns.  Word and
  // Collabora can sometimes repair a missing grid while opening the package,
  // but strict OOXML consumers (including python-docx) reject such tables.
  // Keep the existing automatic layout behaviour while emitting an equal-width
  // advisory grid that renderers may subsequently resize to the page.
  const defaultTableWidth = 9360;
  const baseGridWidth = Math.floor(defaultTableWidth / cols);
  const gridXml = Array.from({ length: cols }, (_, index) => {
    const width = index === cols - 1
      ? defaultTableWidth - (baseGridWidth * (cols - 1))
      : baseGridWidth;
    return `<w:gridCol w:w="${width}"/>`;
  }).join('');
  const rowXml = Array.from({ length: rows }, () => {
    const cells = Array.from({ length: cols }, () => tableCellXml('', options)).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');
  return `<w:tbl>${options.tblPrXml ?? '<w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>'}<w:tblGrid>${gridXml}</w:tblGrid>${rowXml}</w:tbl>`;
}

function inlineImageParagraphXml({ relationshipId = 'rIdImage1', name = 'image1.png', widthEmu = 3200000, heightEmu = 1600000 } = {}) {
  return `<w:p><w:r><w:drawing><wp:inline xmlns:wp="${WORD_DRAWING_NS}" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="1" name="${escapeXmlAttr(name)}"/><a:graphic xmlns:a="${DRAWING_NS}"><a:graphicData uri="${PICTURE_NS}"><pic:pic xmlns:pic="${PICTURE_NS}"><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXmlAttr(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${escapeXmlAttr(relationshipId)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function cellStyleXml(style = {}) {
  if (style.tcPrXml) {
    return style.tcPrXml;
  }
  const parts = [];
  if (style.width) {
    parts.push(`<w:tcW w:w="${escapeXmlAttr(style.width)}" w:type="${escapeXmlAttr(style.widthType ?? 'dxa')}"/>`);
  }
  if (style.fill || style.shadingFill) {
    parts.push(`<w:shd w:fill="${String(style.fill ?? style.shadingFill).replace(/^#/, '').toUpperCase()}"/>`);
  }
  if (style.verticalAlign) {
    parts.push(`<w:vAlign w:val="${escapeXmlAttr(style.verticalAlign)}"/>`);
  }
  if (style.gridSpan) {
    parts.push(`<w:gridSpan w:val="${escapeXmlAttr(style.gridSpan)}"/>`);
  }
  if (style.margin || style.margins) {
    const margin = style.margin ?? style.margins;
    parts.push(`<w:tcMar>${['top', 'left', 'bottom', 'right'].map((side) => margin[side] ? `<w:${side} w:w="${escapeXmlAttr(margin[side])}" w:type="dxa"/>` : '').join('')}</w:tcMar>`);
  }
  if (style.borderColor || style.borderSize) {
    const color = String(style.borderColor ?? 'BFBFBF').replace(/^#/, '').toUpperCase();
    const size = style.borderSize ?? 4;
    parts.push(`<w:tcBorders>${['top', 'left', 'bottom', 'right'].map((side) => `<w:${side} w:val="single" w:sz="${size}" w:space="0" w:color="${color}"/>`).join('')}</w:tcBorders>`);
  }
  return parts.length ? `<w:tcPr>${parts.join('')}</w:tcPr>` : '<w:tcPr/>';
}

function stableStringify(value) {
  return coreStableStringify(value);
}

function hashString(text) {
  return coreHashString(text);
}

function styleFingerprint(style = {}) {
  const serialized = stableStringify(style);
  return {
    hash: hashString(serialized),
    basis: style,
  };
}

function pPrBasis(pPr = '') {
  return {
    styleId: firstMatch(pPr, /<w:pStyle\b[^>]*w:val="([^"]+)"/, null),
    align: firstMatch(pPr, /<w:jc\b[^>]*w:val="([^"]+)"/, null),
    spacingBefore: firstMatch(pPr, /<w:spacing\b[^>]*w:before="([^"]+)"/, null),
    spacingAfter: firstMatch(pPr, /<w:spacing\b[^>]*w:after="([^"]+)"/, null),
    lineSpacing: firstMatch(pPr, /<w:spacing\b[^>]*w:line="([^"]+)"/, null),
    numId: firstMatch(pPr, /<w:numId\b[^>]*w:val="([^"]+)"/, null),
    ilvl: firstMatch(pPr, /<w:ilvl\b[^>]*w:val="([^"]+)"/, null),
    hash: hashString(pPr),
  };
}

function rPrBasis(rPr = '') {
  return {
    runStyleId: firstMatch(rPr, /<w:rStyle\b[^>]*w:val="([^"]+)"/, null),
    bold: /<w:b\b/.test(rPr),
    italic: /<w:i\b/.test(rPr),
    underline: /<w:u\b/.test(rPr),
    textColor: firstMatch(rPr, /<w:color\b[^>]*w:val="([^"]+)"/, null),
    fontSizeHalfPoints: firstMatch(rPr, /<w:sz\b[^>]*w:val="([^"]+)"/, null),
    fontFamily: firstMatch(rPr, /<w:rFonts\b[^>]*(?:w:ascii|w:eastAsia)="([^"]+)"/, null),
    hash: hashString(rPr),
  };
}

function tcPrBasis(tcPr = '') {
  return {
    width: firstMatch(tcPr, /<w:tcW\b[^>]*w:w="([^"]+)"/, null),
    fill: firstMatch(tcPr, /<w:shd\b[^>]*w:fill="([^"]+)"/, null),
    verticalAlign: firstMatch(tcPr, /<w:vAlign\b[^>]*w:val="([^"]+)"/, null),
    gridSpan: firstMatch(tcPr, /<w:gridSpan\b[^>]*w:val="([^"]+)"/, null),
    hash: hashString(tcPr),
  };
}

function paragraphStyleFromXml(pXml) {
  const pPr = tagXml(pXml, 'pPr');
  const rPr = tagXml(pXml, 'rPr');
  return {
    paragraph: pPrBasis(pPr),
    text: rPrBasis(rPr),
    pPrXml: pPr,
    rPrXml: rPr,
  };
}

function paragraphRunsFromXml(pXml) {
  return elementBlocks(pXml, 'r').map((block, index) => {
    const rPrXml = tagXml(block.xml, 'rPr');
    const text = extractText(block.xml);
    return {
      index,
      text,
      textLength: text.length,
      rPrXml,
      style: rPrBasis(rPrXml),
    };
  });
}

function runHasEquivalentVisibleFormatting(left = {}, right = {}) {
  const { hash: _leftHash, ...leftVisible } = left;
  const { hash: _rightHash, ...rightVisible } = right;
  return JSON.stringify(leftVisible) === JSON.stringify(rightVisible);
}

function cellStyleFromXml(cellXml) {
  const firstParagraph = elementBlocks(cellXml, 'p')[0]?.xml ?? '<w:p/>';
  const tcPr = tagXml(cellXml, 'tcPr');
  return {
    cell: tcPrBasis(tcPr),
    paragraph: paragraphStyleFromXml(firstParagraph).paragraph,
    text: paragraphStyleFromXml(firstParagraph).text,
    tcPrXml: tcPr,
    pPrXml: tagXml(firstParagraph, 'pPr'),
    rPrXml: tagXml(firstParagraph, 'rPr'),
  };
}

function tableRowsFromXml(tblXml) {
  return elementBlocks(tblXml, 'tr').map((rowBlock, rowIndex) => {
    const cells = elementBlocks(rowBlock.xml, 'tc').map((cellBlock, colIndex) => ({
      rowIndex,
      colIndex,
      cellBlock: {
        ...cellBlock,
        start: rowBlock.start + cellBlock.start,
        end: rowBlock.start + cellBlock.end,
      },
      text: elementBlocks(cellBlock.xml, 'p').map((paragraph) => extractText(paragraph.xml)).join('\n'),
    }));
    return { rowIndex, rowBlock, cells };
  });
}

function discoverParagraphs(documentXml) {
  return elementBlocks(documentXml, 'p').map((block, index) => {
    const text = extractText(block.xml);
    const style = paragraphStyleFromXml(block.xml);
    return {
      id: `p_${index}`,
      index,
      section: 0,
      para: index,
      start: block.start,
      end: block.end,
      text,
      xml: block.xml,
      native: { section: 0, paragraph: index },
      style,
      styleFingerprint: styleFingerprint({ paragraph: style.paragraph, text: style.text }),
    };
  });
}

function estimateCellCapacity(style = {}) {
  const width = Number(style.cell?.width) || 4500;
  const fontSizeHalfPoints = Number(style.text?.fontSizeHalfPoints) || 20;
  const fontSize = Math.max(7, fontSizeHalfPoints / 2);
  const maxCharsPerLine = Math.max(8, Math.floor(width / Math.max(80, fontSize * 10)));
  const maxLines = 4;
  return {
    maxCharsPerLine,
    maxLines,
    recommendedChars: Math.floor(maxCharsPerLine * maxLines * 0.88),
    basis: { width, fontSize, unit: 'estimated-docx-dxa' },
  };
}

const BASELINE_COMPARABLE_TABLE_WARNING_CODES = new Set([
  'empty-table',
  'cell-overflow-risk',
  'cell-line-overflow-risk',
]);
const CAPACITY_RISK_EPSILON = 1e-9;

function stableTableLocationKey(table = {}) {
  const tableId = String(table.id ?? table.location?.tableId ?? '').trim();
  if (tableId) {
    return `table:${tableId}`;
  }
  const rawTableIndex = table.tableIndex ?? table.native?.tableIndex;
  const tableIndex = rawTableIndex === undefined || rawTableIndex === null || rawTableIndex === ''
    ? Number.NaN
    : Number(rawTableIndex);
  return Number.isInteger(tableIndex) && tableIndex >= 0 ? `table-index:${tableIndex}` : '';
}

function stableCellLocationKey(cell = {}) {
  const location = cell.location ?? {};
  const tableKey = stableTableLocationKey({
    id: location.tableId ?? location.table?.id,
    tableIndex: cell.native?.tableIndex,
  });
  const rawCellNumber = location.cell?.number ?? cell.cellIndex ?? cell.native?.cellIndex;
  const cellNumber = rawCellNumber === undefined || rawCellNumber === null || rawCellNumber === ''
    ? Number.NaN
    : Number(rawCellNumber);
  if (!tableKey || !Number.isInteger(cellNumber) || cellNumber < 0) {
    return '';
  }
  return `${tableKey}/cell:${cellNumber}`;
}

function tableCapacityRiskIssues(json = {}) {
  const issues = [];
  for (const table of json.tables ?? []) {
    const tableLocationKey = stableTableLocationKey(table);
    if (!table.dims?.cellCount) {
      issues.push({
        severity: 'warning',
        code: 'empty-table',
        message: 'A table has no cells',
        tableId: table.id,
        locationKey: tableLocationKey,
        riskRatio: 1,
        riskDimensions: { empty: 1 },
      });
    }
    for (const cell of table.cells ?? []) {
      const capacity = cell.layout?.capacity;
      const text = String(cell.text ?? '');
      const lines = text.split('\n');
      const longestLine = Math.max(0, ...lines.map((line) => line.length));
      const locationKey = stableCellLocationKey(cell);
      if (capacity?.recommendedChars && capacity?.maxLines) {
        const textRatio = text.length / (capacity.recommendedChars * 1.35);
        const lineCountRatio = lines.length / capacity.maxLines;
        if (textRatio > 1 && lineCountRatio > 1) {
          issues.push({
            severity: 'warning',
            code: 'cell-overflow-risk',
            message: 'Cell text may exceed estimated capacity.',
            location: cell.location,
            locationKey,
            textLength: text.length,
            recommendedChars: capacity.recommendedChars,
            lineCount: lines.length,
            maxLines: capacity.maxLines,
            riskRatio: Math.max(textRatio, lineCountRatio),
            riskDimensions: { text: textRatio, lines: lineCountRatio },
          });
        }
      }
      if (capacity?.maxCharsPerLine) {
        const lineRatio = longestLine / (capacity.maxCharsPerLine * 1.25);
        if (lineRatio > 1) {
          issues.push({
            severity: 'warning',
            code: 'cell-line-overflow-risk',
            message: 'A cell line may be too long for the estimated width.',
            location: cell.location,
            locationKey,
            longestLine,
            maxCharsPerLine: capacity.maxCharsPerLine,
            riskRatio: lineRatio,
            riskDimensions: { line: lineRatio },
          });
        }
      }
    }
  }
  return issues;
}

function riskDidNotWorsen(currentIssue, baselineIssue) {
  const currentDimensions = currentIssue.riskDimensions ?? {};
  const baselineDimensions = baselineIssue.riskDimensions ?? {};
  const dimensionNames = Object.keys(currentDimensions);
  if (dimensionNames.length) {
    return dimensionNames.every((name) => {
      const currentValue = Number(currentDimensions[name]);
      const baselineValue = Number(baselineDimensions[name]);
      return Number.isFinite(currentValue) && Number.isFinite(baselineValue)
        && currentValue <= baselineValue + CAPACITY_RISK_EPSILON;
    });
  }
  const currentRatio = Number(currentIssue.riskRatio);
  const baselineRatio = Number(baselineIssue.riskRatio);
  return Number.isFinite(currentRatio) && Number.isFinite(baselineRatio)
    && currentRatio <= baselineRatio + CAPACITY_RISK_EPSILON;
}

function markNonRegressingBaselineWarnings(issues, baselineJson) {
  if (!baselineJson) {
    return issues;
  }
  const baselineByKey = new Map(tableCapacityRiskIssues(baselineJson).map((issue) => [
    `${issue.code}|${issue.locationKey}`,
    issue,
  ]));
  return issues.map((issue) => {
    if (issue.severity !== 'warning' || !BASELINE_COMPARABLE_TABLE_WARNING_CODES.has(issue.code) || !issue.locationKey) {
      return issue;
    }
    const baselineIssue = baselineByKey.get(`${issue.code}|${issue.locationKey}`);
    if (!baselineIssue || !riskDidNotWorsen(issue, baselineIssue)) {
      return issue;
    }
    return {
      ...issue,
      severity: 'info',
      preexisting: true,
      baselineSeverity: 'warning',
      baselineRiskRatio: baselineIssue.riskRatio,
    };
  });
}

function discoverTables(documentXml) {
  const tableBlocks = elementBlocks(documentXml, 'tbl');
  return tableBlocks.map((tableBlock, tableIndex) => {
    const rows = tableRowsFromXml(tableBlock.xml);
    const cells = [];
    let cellIndex = 0;
    for (const row of rows) {
      for (const cell of row.cells) {
        const style = cellStyleFromXml(cell.cellBlock.xml);
        const fingerprint = styleFingerprint({
          cell: style.cell,
          paragraph: style.paragraph,
          text: style.text,
        });
        cells.push({
          id: `tbl_${tableIndex}_cell_${cellIndex}`,
          cellIndex,
          row: row.rowIndex,
          col: cell.colIndex,
          text: cell.text,
          paragraphs: elementBlocks(cell.cellBlock.xml, 'p').map((paragraph, paragraphIndex) => ({
            index: paragraphIndex,
            text: extractText(paragraph.xml),
            length: extractText(paragraph.xml).length,
          })),
          location: {
            tableId: `tbl_${tableIndex}`,
            cell: { number: cellIndex, row: row.rowIndex, column: cell.colIndex },
          },
          style,
          styleFingerprint: fingerprint,
          layout: { capacity: estimateCellCapacity(style) },
          allowedActions: [
            'table.writeCell',
            'table.writeRichCell',
            'table.writeCells',
            'table.applyCellStyle',
            'list.writeBullets',
            'list.applyNumbering',
            'style.clone',
            'style.applyText',
            'paragraph.applyStyle',
            'layout.fitText',
          ],
          native: { tableIndex, row: row.rowIndex, column: cell.colIndex, cellIndex },
        });
        cellIndex += 1;
      }
    }
    const colCount = Math.max(0, ...rows.map((row) => row.cells.length));
    return {
      id: `tbl_${tableIndex}`,
      tableIndex,
      start: tableBlock.start,
      end: tableBlock.end,
      native: { section: 0, tableIndex },
      dims: { rowCount: rows.length, colCount, cellCount: cells.length },
      cells,
    };
  });
}

function readStyleGraph(entries) {
  const xml = entries.get('word/styles.xml')?.toString('utf8') ?? '';
  const styles = [...xml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)].map((match) => ({
    styleId: firstMatch(match[0], /\bw:styleId="([^"]+)"/, null),
    type: firstMatch(match[0], /\bw:type="([^"]+)"/, null),
    name: firstMatch(match[0], /<w:name\b[^>]*w:val="([^"]+)"/, null),
    hash: hashString(match[0]),
  }));
  return { count: styles.length, styles };
}

function readObjectGraph(entries, documentXml) {
  const relsXml = entries.get('word/_rels/document.xml.rels')?.toString('utf8') ?? '';
  const relationships = [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((match) => ({
    id: firstMatch(match[0], /\bId="([^"]+)"/, null),
    type: firstMatch(match[0], /\bType="([^"]+)"/, null),
    target: firstMatch(match[0], /\bTarget="([^"]+)"/, null),
  }));
  return {
    images: [...entries.keys()]
      .filter((name) => /^word\/media\/.+\.(png|jpg|jpeg|gif|bmp|emf|wmf)$/i.test(name))
      .map((name) => ({ name, byteLength: entries.get(name)?.length ?? 0 })),
    pictures: [...documentXml.matchAll(/<w:drawing\b[\s\S]*?<\/w:drawing>/g)].map((match, index) => ({
      id: `pic_${index}`,
      byteOffset: match.index,
      relationshipId: firstMatch(match[0], /\br:embed="([^"]+)"/, null),
      name: firstMatch(match[0], /\bname="([^"]+)"/, null),
    })),
    charts: relationships
      .filter((rel) => /\/chart$/i.test(rel.type ?? ''))
      .map((rel, index) => ({ id: `chart_${index}`, relationshipId: rel.id, target: rel.target })),
    relationships,
    xmlFiles: [...entries.keys()].filter((name) => /\.xml$/i.test(name)),
    binaryFiles: [...entries.keys()].filter((name) => /^word\/media\//i.test(name)),
  };
}

function editableTargets(sections, tables) {
  return {
    paragraphs: sections.flatMap((section) => section.paragraphs.map((paragraph) => ({
      id: paragraph.id,
      location: { paragraph: { section: 0, number: paragraph.index } },
      textLength: paragraph.text.length,
      styleFingerprint: paragraph.styleFingerprint,
      runs: paragraphRunsFromXml(paragraph.xml).map(({ index, text, textLength, style }) => ({
        index,
        text,
        textLength,
        style,
      })),
      allowedActions: ['text.replaceParagraph', 'text.replace', 'style.applyText', 'paragraph.applyStyle', 'list.applyNumbering'],
    }))),
    cells: tables.flatMap((table) => table.cells.map((cell) => ({
      id: cell.id,
      location: cell.location,
      textLength: cell.text.length,
      capacity: cell.layout.capacity,
      styleFingerprint: cell.styleFingerprint,
      allowedActions: cell.allowedActions,
    }))),
  };
}

function normalizeParagraphLocation(location = {}) {
  return coreNormalizeParagraphLocation(location);
}

function normalizeCellReference(cell = {}) {
  return coreNormalizeCellReference(cell);
}

function commandKey(command = {}) {
  return coreCommandKey(command);
}

function commandId(command = {}, index = 0) {
  return coreCommandId(command, index);
}

function commandLocation(command = {}) {
  return coreCommandLocation(command);
}

function commandText(command = {}) {
  return coreCommandText(command);
}

function buildListText(items, options = {}) {
  return coreBuildListText(items, options);
}

function wrapLine(line, maxCharsPerLine) {
  return coreWrapLine(line, maxCharsPerLine);
}

function fitTextToCapacity(text, capacity, options = {}) {
  return coreFitTextToCapacity(text, capacity, options);
}

function defaultStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${WORD_NS}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
}

function defaultFootnotesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="${WORD_NS}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote></w:footnotes>`;
}

function docxStyleXml(style) {
  const type = style.type || 'paragraph';
  const pPr = type === 'paragraph' ? paragraphPropertiesXml(style.paragraphStyle) : '';
  const rPr = runPropertiesXml(style.runStyle);
  const basedOn = style.basedOn ? `<w:basedOn w:val="${escapeXmlAttr(style.basedOn)}"/>` : '';
  return `<w:style w:type="${escapeXmlAttr(type)}" w:styleId="${escapeXmlAttr(style.styleId)}"><w:name w:val="${escapeXmlAttr(style.name || style.styleId)}"/>${basedOn}${pPr}${rPr}</w:style>`;
}

function defaultContentTypesXml(includeImage = false) {
  return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${includeImage ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
}

function defaultPackageRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="word/document.xml"/></Relationships>`;
}

function defaultDocumentRelsXml(includeImage = false) {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}">${includeImage ? `<Relationship Id="rIdImage1" Type="${OFFICE_REL_NS}/image" Target="media/image1.png"/>` : ''}</Relationships>`;
}

function ensureDocumentRelationshipNamespace(xml) {
  if (xml.includes('xmlns:r=')) {
    return xml;
  }
  return xml.replace('<w:document ', `<w:document xmlns:r="${DOC_REL_NS}" `);
}

export function createDocxBytes(options = {}) {
  const paragraphs = options.paragraphs ?? ['Alpha Beta Gamma'];
  const blocks = paragraphs.map((item) => {
    if (typeof item === 'string') {
      return paragraphXml(item);
    }
    return paragraphXml(item.text, { paragraphStyle: item.paragraphStyle, runStyle: item.runStyle });
  });
  for (const table of options.tables ?? []) {
    const rows = table.rows ?? [];
    const rowXml = rows.map((row) => `<w:tr>${row.map((cell) => tableCellXml(typeof cell === 'string' ? cell : cell.text, cell.options ?? cell)).join('')}</w:tr>`).join('');
    blocks.push(`<w:tbl>${table.tblPrXml ?? '<w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>'}${rowXml}</w:tbl>`);
  }
  const includeImage = Boolean(options.includeImage);
  if (includeImage) {
    blocks.push(inlineImageParagraphXml());
  }
  blocks.push('<w:sectPr/>');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORD_NS}" xmlns:r="${DOC_REL_NS}"><w:body>${blocks.join('')}</w:body></w:document>`;
  const entries = [
    ['[Content_Types].xml', defaultContentTypesXml(includeImage)],
    ['_rels/.rels', defaultPackageRelsXml()],
    ['word/document.xml', documentXml],
    ['word/_rels/document.xml.rels', defaultDocumentRelsXml(includeImage)],
  ];
  if (includeImage) {
    entries.push(['word/media/image1.png', options.imageBytes ?? generatePngBytes({ width: 480, height: 220, values: [3, 6, 4, 8] })]);
  }
  return createZip(entries);
}

export function getDocumentXml(docxBytes) {
  const xml = readZip(Buffer.from(docxBytes)).get('word/document.xml');
  assert.ok(xml, 'word/document.xml must exist');
  return xml.toString('utf8');
}

export function getDocumentVisibleText(docxBytes) {
  const documentXml = getDocumentXml(docxBytes);
  const values = [];
  const pattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match;
  while ((match = pattern.exec(documentXml))) {
    values.push(unescapeXml(match[1] ?? ''));
  }
  return values.join('');
}

export function getZipText(docxBytes, name, fallback = '') {
  const entry = readZip(Buffer.from(docxBytes)).get(name);
  return entry ? entry.toString('utf8') : fallback;
}

export function exportDocxJson(docxBytes) {
  return new DocxApiSession(docxBytes).readJson();
}

export function resolveDocxTextTarget(docxBytes, query, options = {}) {
  return new DocxApiSession(docxBytes).resolveText(query, options);
}

export function applyDocxCommand(docxBytes, op) {
  const session = new DocxApiSession(docxBytes);
  session.apply([op]);
  return session.save().bytes;
}

export class DocxApiSession {
  constructor(inputBytes) {
    this.inputBytes = Buffer.from(inputBytes);
    this.entries = readZip(this.inputBytes);
    this.documentXml = this.entries.get('word/document.xml')?.toString('utf8') ?? '';
    assert.ok(this.documentXml, 'word/document.xml must exist');
    this.revision = 1;
    this.dirtyDocument = false;
    this.dirtyPackage = false;
  }

  readJson() {
    const paragraphs = discoverParagraphs(this.documentXml);
    const sections = [{ section: 0, paragraphCount: paragraphs.length, paragraphs }];
    const tables = discoverTables(this.documentXml);
    const objectGraph = readObjectGraph(this.entries, this.documentXml);
    return {
      revision: this.revision,
      sourceFormat: 'docx',
      pageCount: Math.max(1, Math.ceil(Math.max(1, paragraphs.length) / 34)),
      sections,
      blocks: paragraphs.map((paragraph) => ({
        id: paragraph.id,
        kind: 'paragraph',
        text: paragraph.text,
        native: { section: 0, paragraph: paragraph.index },
        styleFingerprint: paragraph.styleFingerprint,
      })),
      tables,
      styleGraph: readStyleGraph(this.entries),
      layoutGraph: {
        pageCount: Math.max(1, Math.ceil(Math.max(1, paragraphs.length) / 34)),
        tables: tables.map((table) => ({
          id: table.id,
          section: 0,
          tableIndex: table.tableIndex,
          cellCount: table.dims.cellCount,
        })),
      },
      objectGraph,
      editableTargets: editableTargets(sections, tables),
      warnings: [],
    };
  }

  analyze() {
    return this.readJson();
  }

  targetMap() {
    return this.readJson().editableTargets;
  }

  objectInventory() {
    return readObjectGraph(this.entries, this.documentXml);
  }

  findTable(predicate) {
    const table = this.readJson().tables.find(predicate);
    assert.ok(table, 'table not found');
    return table;
  }

  tableFromLocation(location = {}) {
    const tableId = location.tableId ?? location.table?.id;
    const tables = this.readJson().tables;
    if (tableId) {
      const table = tables.find((item) => item.id === tableId);
      assert.ok(table, `table not found: ${tableId}`);
      return table;
    }
    const tableIndex = location.native?.tableIndex ?? location.tableIndex;
    if (tableIndex === undefined && tables.length === 1) {
      return tables[0];
    }
    assert.ok(tableIndex !== undefined, `table location requires tableId or tableIndex: ${JSON.stringify(location)}`);
    const table = tables.find((item) => item.tableIndex === tableIndex);
    assert.ok(table, `table not found: ${tableIndex}`);
    return table;
  }

  cellFromLocation(table, location = {}) {
    const ref = normalizeCellReference(location.cell ?? location.tableCell ?? location.native ?? location);
    const cell = ref.number === undefined
      ? table.cells.find((item) => item.row === ref.row && item.col === ref.column)
      : table.cells.find((item) => item.cellIndex === ref.number);
    assert.ok(cell, `cell not found in ${table.id}: ${JSON.stringify(ref)}`);
    return cell;
  }

  paragraphFromLocation(location = {}) {
    const nodeId = location.range?.start?.nodeId ?? location.nodeId;
    const nodeMatch = String(nodeId ?? '').match(/^p_(\d+)$/);
    const { paragraph } = nodeMatch
      ? { paragraph: Number(nodeMatch[1]) }
      : normalizeParagraphLocation(location);
    assert.ok(paragraph !== undefined, `paragraph location is incomplete: ${JSON.stringify(location)}`);
    const item = discoverParagraphs(this.documentXml).find((entry) => entry.index === paragraph);
    assert.ok(item, `paragraph not found: ${paragraph}`);
    return item;
  }

  inspectTarget(location = {}) {
    if (location.tableId || location.table || location.cell || location.tableCell) {
      const table = this.tableFromLocation(location);
      const cell = this.cellFromLocation(table, location);
      return {
        kind: 'cell',
        id: cell.id,
        location: cell.location,
        currentText: cell.text,
        table: { id: table.id, dims: table.dims, native: table.native },
        cell,
        style: cell.style,
        layout: cell.layout,
        allowedActions: cell.allowedActions,
      };
    }
    const paragraph = this.paragraphFromLocation(location);
    return {
      kind: 'paragraph',
      id: paragraph.id,
      location: { paragraph: { section: 0, number: paragraph.index } },
      currentText: paragraph.text,
      textLength: paragraph.text.length,
      style: paragraph.style,
      styleFingerprint: paragraph.styleFingerprint,
      runs: paragraphRunsFromXml(paragraph.xml).map(({ index, text, textLength, style }) => ({
        index,
        text,
        textLength,
        style,
      })),
      allowedActions: ['text.replaceParagraph', 'text.replace', 'style.applyText', 'paragraph.applyStyle', 'list.applyNumbering'],
      native: { section: 0, paragraph: paragraph.index },
    };
  }

  resolveText(query, options = {}) {
    const caseSensitive = options.caseSensitive ?? false;
    const source = caseSensitive ? String(query) : String(query).toLowerCase();
    const blocks = this.readJson().blocks;
    const matches = [];
    for (const block of blocks) {
      const haystack = caseSensitive ? block.text : block.text.toLowerCase();
      const offset = haystack.indexOf(source);
      if (offset !== -1) {
        matches.push({ block, offset });
      }
    }
    const occurrence = options.occurrence ?? 1;
    const match = matches[occurrence - 1];
    assert.ok(match, `text target not found: ${query}`);
    return {
      range: {
        start: { nodeId: match.block.id, offset: match.offset },
        end: { nodeId: match.block.id, offset: match.offset + String(query).length },
      },
      native: { paragraph: match.block.native.paragraph, startOffset: match.offset, endOffset: match.offset + String(query).length },
    };
  }

  fitText(location, text, options = {}) {
    const target = this.inspectTarget(location);
    if (target.kind !== 'cell') {
      return { text: String(text ?? ''), changed: false, truncated: false, reason: 'layout.fitText currently applies to table cells only' };
    }
    return fitTextToCapacity(text, target.layout.capacity, options);
  }

  styleFingerprint(location) {
    const target = this.inspectTarget(location);
    return target.styleFingerprint ?? styleFingerprint(target.style ?? {});
  }

  paragraphTemplateXml(location) {
    const target = this.inspectTarget(location);
    if (target.kind === 'cell') {
      return elementBlocks(this.cellXml(target.location), 'p')[0]?.xml ?? '<w:p/>';
    }
    return this.paragraphFromLocation(location).xml;
  }

  cellOuterStyle(location) {
    return tagXml(this.cellXml(location), 'tcPr');
  }

  cellXml(location = {}) {
    const table = this.tableFromLocation(location);
    const cell = this.cellFromLocation(table, location);
    const tableBlock = elementBlocks(this.documentXml, 'tbl')[table.tableIndex];
    const rows = tableRowsFromXml(tableBlock.xml);
    const row = rows[cell.row];
    const cellBlock = row?.cells[cell.col]?.cellBlock;
    assert.ok(cellBlock, `cell xml not found: ${JSON.stringify(location)}`);
    return cellBlock.xml;
  }

  normalizeCommand(command, index = 0) {
    const key = commandKey(command);
    const commandSpec = resolveDocxCommand(key);
    const catalogOp = commandSpec?.op;
    const opId = commandId(command, index);
    const location = commandLocation(command);
    const tableId = command.tableId ?? location.tableId ?? location.table?.id;

    if (catalogOp === 'table.writeCell' || catalogOp === 'table.writeRichCell') {
      const legacyTableId = key === 'setcelltext' && !tableId ? 'tbl_0' : tableId;
      return [{
        ...command,
        opId,
        op: 'table.writeCell',
        location: {
          tableId: legacyTableId,
          native: location.native,
          cell: normalizeCellReference(command.cell ?? location.cell ?? command.tableCell ?? location.tableCell ?? command.target?.tableCell ?? command.target?.cell ?? {}),
        },
        text: commandText(command),
        styleSource: command.styleSource ?? command.cloneStyleFrom ?? command.sourceLocation,
      }];
    }

    if (catalogOp === 'table.writeCells') {
      return (command.cells ?? []).map((cellCommand, cellIndex) => ({
        ...cellCommand,
        opId: commandId(cellCommand, cellIndex) === `command-${cellIndex + 1}` ? `${opId}-${cellIndex + 1}` : commandId(cellCommand, cellIndex),
        op: 'table.writeCell',
        location: {
          tableId: cellCommand.tableId ?? cellCommand.location?.tableId ?? tableId,
          cell: normalizeCellReference(cellCommand.cell ?? cellCommand.location?.cell ?? cellCommand.tableCell ?? cellCommand),
        },
        text: commandText(cellCommand),
        fit: cellCommand.fit ?? command.fit,
        fitOptions: cellCommand.fitOptions ?? command.fitOptions,
        styleSource: cellCommand.styleSource ?? command.styleSource,
      }));
    }

    if (catalogOp === 'text.replaceParagraph') {
      return [{ ...command, opId, op: 'text.replaceParagraph', location, text: commandText(command) }];
    }

    if (catalogOp === 'text.replace') {
      return [{ ...command, opId, op: 'text.replace', target: command.target ?? command.range ?? location, text: commandText(command) }];
    }

    if (catalogOp === 'insertText') {
      return [{ ...command, opId, op: 'text.insert', target: command.target ?? location, text: commandText(command) }];
    }

    if (catalogOp === 'deleteRange') {
      return [{ ...command, opId, op: 'text.delete', target: command.target ?? location }];
    }

    if (catalogOp === 'appendParagraph') {
      return [{ ...command, opId, op: 'paragraph.append', text: commandText(command) }];
    }

    if (catalogOp === 'applyStyle') {
      return [{ ...command, opId, op: 'paragraph.applyNamedStyle', target: command.target ?? location, styleId: command.styleId }];
    }

    if (catalogOp === 'setRunStyle') {
      return [{ ...command, opId, op: 'style.setRunStyle', target: command.target ?? location, style: command.style ?? {} }];
    }

    if (catalogOp === 'setParagraphStyle') {
      return [{ ...command, opId, op: 'style.setParagraphStyle', target: command.target ?? location, style: command.style ?? {} }];
    }

    if (catalogOp === 'table.create') {
      return [{ ...command, opId, op: 'table.create' }];
    }

    if (catalogOp === 'table.insertCaption') {
      return [{ ...command, opId, op: 'table.insertCaption', tableId, text: commandText(command) }];
    }

    if (catalogOp === 'list.writeBullets' || catalogOp === 'list.applyNumbering') {
      const text = buildListText(command.items ?? command.content?.items ?? commandText(command), {
        ...command,
        numbered: command.numbered ?? catalogOp === 'list.applyNumbering',
      });
      return [{
        ...command,
        opId,
        op: tableId || location.cell || location.tableCell ? 'table.writeCell' : 'text.replaceParagraph',
        location,
        text,
        styleSource: command.styleSource ?? command.cloneStyleFrom ?? command.sourceLocation,
      }];
    }

    if (catalogOp === 'style.clone') {
      return [{
        ...command,
        opId,
        op: 'paragraph.applyStyle',
        target: command.target ?? command.to ?? location,
        styleSource: command.styleSource ?? command.source ?? command.from ?? command.sourceLocation,
      }];
    }

    if (catalogOp === 'style.applyText') {
      return [{
        ...command,
        opId,
        op: 'style.applyText',
        target: command.target ?? command.to ?? location,
        text: command.text ?? command.newText,
        styleSource: command.styleSource ?? command.source ?? command.from ?? command.sourceLocation,
      }];
    }

    if (catalogOp === 'paragraph.applyStyle') {
      return [{
        ...command,
        opId,
        op: 'paragraph.applyStyle',
        target: command.target ?? command.to ?? location,
        styleSource: command.styleSource ?? command.source ?? command.from ?? command.sourceLocation,
      }];
    }

    if (catalogOp === 'table.applyCellStyle') {
      return [{
        ...command,
        opId,
        op: 'table.applyCellStyle',
        target: command.target ?? command.to ?? location,
        styleSource: command.styleSource ?? command.source ?? command.from ?? command.sourceLocation,
        cellStyle: command.cellStyle ?? command.style ?? command.format,
      }];
    }

    if (catalogOp === 'layout.fitText') {
      return [{ ...command, opId, op: 'layout.fitText', location, text: commandText(command), options: command.options ?? command.fitOptions ?? {} }];
    }

    if (catalogOp === 'image.replace') {
      return [{
        ...command,
        opId,
        op: 'image.replace',
        imageName: command.imageName ?? command.target?.imageName ?? command.target?.name ?? location.imageName ?? location.name,
      }];
    }

    if (catalogOp === 'image.generateAndReplace') {
      return [{
        ...command,
        opId,
        op: 'image.generateAndReplace',
        imageName: command.imageName ?? command.target?.imageName ?? command.target?.name ?? location.imageName ?? location.name,
        generator: command.generator ?? command.image ?? command.chart ?? command.content ?? {},
      }];
    }

    if (commandSpec) {
      return [{ ...command, opId, op: commandSpec.normalizeAs }];
    }
    return [{ ...command, opId }];
  }

  validateCommandInputs(commands) {
    for (const command of commands) {
      const entry = resolveDocxCommand(commandKey(command));
      if (!entry) {
        continue;
      }
      if (command.op === entry.op) {
        validateDocxCommands([command]);
      }
      if (entry.op === 'table.create'
        && (!Number.isInteger(command.rows) || command.rows <= 0 || !Number.isInteger(command.cols) || command.cols <= 0)) {
        throw new Error('table.create rows and cols must be positive integers.');
      }
      if (entry.op === 'table.writeCells' && (!Array.isArray(command.cells) || command.cells.length === 0)) {
        throw new Error('table.writeCells requires a nonempty cells array.');
      }
      if (entry.op === 'text.replaceParagraph' && command.segments !== undefined) {
        if (!Array.isArray(command.segments) || command.segments.length === 0) {
          throw new Error('text.replaceParagraph segments must be a nonempty array.');
        }
        for (const [segmentIndex, segment] of command.segments.entries()) {
          if (!segment || typeof segment !== 'object' || Array.isArray(segment)
            || !Number.isInteger(segment.sourceRun) || segment.sourceRun < 0 || typeof segment.text !== 'string') {
            throw new Error(`text.replaceParagraph segments[${segmentIndex}] requires a nonnegative sourceRun and text string.`);
          }
        }
        if (command.segments.map((segment) => segment.text).join('') !== command.text) {
          throw new Error('text.replaceParagraph segment text must concatenate exactly to text.');
        }
      }
      if ((entry.op === 'list.writeBullets' || entry.op === 'list.applyNumbering')
        && (!Array.isArray(command.items) || command.items.length === 0
          || command.items.some((item) => typeof item !== 'string' || item.trim() === ''))) {
        throw new Error(`${entry.op} items must be a nonempty array of nonempty strings.`);
      }
      if (entry.op === 'defineStyle' && (typeof command.style?.styleId !== 'string' || command.style.styleId.trim() === '')) {
        throw new Error('defineStyle style.styleId must be a nonempty string.');
      }
    }
  }

  validateNormalizedOperations(operations) {
    const existingStyleIds = new Set(readStyleGraph(this.entries).styles
      .map((style) => style.styleId)
      .filter(Boolean));
    const batchStyleIds = new Set(operations
      .filter((operation) => operation.op === 'defineStyle')
      .map((operation) => String(operation.style?.styleId ?? '').trim())
      .filter(Boolean));
    const inspect = (target, label) => {
      try {
        return this.inspectTarget(target);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${label} does not identify an existing stable target: ${detail}`);
      }
    };

    for (const operation of operations) {
      if (operation.op === 'table.writeCell' || operation.op === 'text.replaceParagraph' || operation.op === 'layout.fitText') {
        inspect(operation.location, `${operation.op}.location`);
        if (operation.styleSource) {
          inspect(operation.styleSource, `${operation.op}.styleSource`);
        }
      } else if (operation.op === 'text.replace' || operation.op === 'text.insert' || operation.op === 'text.delete'
        || operation.op === 'style.setRunStyle' || operation.op === 'style.setParagraphStyle'
        || operation.op === 'insertFootnote') {
        const target = inspect(operation.target, `${operation.op}.target`);
        if (operation.op === 'text.replace' || operation.op === 'text.insert' || operation.op === 'text.delete') {
          const range = operation.target?.range;
          const native = operation.target?.native;
          const startOffset = Number(native?.offset ?? native?.startOffset ?? range?.start?.offset ?? 0);
          const nativeEnd = Number.isFinite(Number(native?.endOffset))
            ? Number(native.endOffset)
            : Number.isFinite(Number(native?.length))
              ? startOffset + Number(native.length)
              : Number.NaN;
          const endOffset = operation.op === 'text.insert'
            ? startOffset
            : Number.isFinite(nativeEnd) ? nativeEnd : Number(range?.end?.offset ?? target.currentText.length);
          assert.ok(Number.isInteger(startOffset) && Number.isInteger(endOffset)
            && startOffset >= 0 && endOffset >= startOffset && endOffset <= target.currentText.length,
          `${operation.op}.target range is outside the existing paragraph`);
        }
      } else if (operation.op === 'paragraph.applyNamedStyle') {
        inspect(operation.target, 'applyStyle.target');
        const styleId = String(operation.styleId ?? '').trim();
        if (!existingStyleIds.has(styleId) && !batchStyleIds.has(styleId)) {
          throw new Error(`applyStyle styleId does not exist in the document or this atomic batch: ${styleId || '<missing>'}`);
        }
      } else if (operation.op === 'style.applyText' || operation.op === 'paragraph.applyStyle') {
        inspect(operation.target, `${operation.op}.target`);
        if (operation.styleSource) {
          inspect(operation.styleSource, `${operation.op}.styleSource`);
        }
      } else if (operation.op === 'table.applyCellStyle') {
        const target = inspect(operation.target, 'table.applyCellStyle.target');
        assert.equal(target.kind, 'cell', 'table.applyCellStyle.target must identify a table cell');
        if (operation.styleSource) {
          const source = inspect(operation.styleSource, 'table.applyCellStyle.styleSource');
          assert.equal(source.kind, 'cell', 'table.applyCellStyle.styleSource must identify a table cell');
        }
      } else if (operation.op === 'table.create') {
        assert.ok(Number.isInteger(operation.rows) && operation.rows > 0 && Number.isInteger(operation.cols) && operation.cols > 0,
          'table.create rows and cols must be positive integers');
      } else if (operation.op === 'table.insertCaption') {
        this.tableFromLocation({ tableId: operation.tableId });
      } else if (operation.op === 'defineStyle') {
        assert.ok(String(operation.style?.styleId ?? '').trim(), 'defineStyle requires style.styleId');
      } else if (operation.op === 'image.replace') {
        assert.ok(this.entries.has(operation.imageName), `package entry not found: ${operation.imageName}`);
        const bytes = imageBytesFromOperation(operation);
        assert.ok(bytes.length > 0, 'image.replace requires bytes, bytesBase64, or filePath');
        validateImageBytesForPackage(operation.imageName, bytes, operation.mimeType);
      } else if (operation.op === 'image.generateAndReplace') {
        assert.ok(this.entries.has(operation.imageName), `package entry not found: ${operation.imageName}`);
        validateImageBytesForPackage(operation.imageName, generatePngBytes(operation.generator), 'image/png');
      }
    }
  }

  apply(commands) {
    return this.commandsBatch(commands);
  }

  commandsBatch(ops) {
    this.validateCommandInputs(ops);
    const normalizedOps = ops.flatMap((op, index) => this.normalizeCommand(op, index));
    this.validateNormalizedOperations(normalizedOps);
    const snapshot = {
      documentXml: this.documentXml,
      entries: new Map([...this.entries].map(([name, bytes]) => [name, Buffer.from(bytes)])),
      dirtyDocument: this.dirtyDocument,
      dirtyPackage: this.dirtyPackage,
      revision: this.revision,
    };
    const results = [];
    let mutated = false;
    try {
      for (const op of normalizedOps) {
      if (op.op === 'table.writeCell') {
        const target = this.inspectTarget(op.location);
        const shouldFit = op.fit === true || op.fitOptions;
        const fit = shouldFit ? this.fitText(op.location, op.text, op.fitOptions ?? {}) : null;
        const sourceTemplate = op.styleSource ? this.paragraphTemplateXml(op.styleSource) : this.paragraphTemplateXml(op.location);
        this.replaceCellXml(op.location, fit?.text ?? op.text, { templateParagraphXml: sourceTemplate });
        results.push({ opId: op.opId, ok: true, target: target.id, action: 'table.writeCell', fit });
        mutated = true;
      } else if (op.op === 'text.replaceParagraph') {
        const template = op.styleSource ? this.paragraphTemplateXml(op.styleSource) : this.paragraphTemplateXml(op.location);
        const target = this.inspectTarget(op.location);
        this.replaceParagraphXml(op.location, op.text, { templateParagraphXml: template, segments: op.segments });
        results.push({ opId: op.opId, ok: true, target: target.id, action: 'text.replaceParagraph' });
        mutated = true;
      } else if (op.op === 'text.replace' || op.op === 'text.insert' || op.op === 'text.delete') {
        this.replaceTextRange(op);
        results.push({ opId: op.opId, ok: true, action: op.op });
        mutated = true;
      } else if (op.op === 'paragraph.append') {
        this.insertBeforeSectPr(paragraphXml(op.text, { paragraphStyle: op.paragraphStyle, runStyle: op.runStyle }));
        results.push({ opId: op.opId, ok: true, action: 'paragraph.append' });
        mutated = true;
      } else if (op.op === 'paragraph.applyNamedStyle') {
        this.applyNamedStyle(op.target, op.styleId);
        results.push({ opId: op.opId, ok: true, action: 'applyStyle' });
        mutated = true;
      } else if (op.op === 'style.setRunStyle') {
        this.setRunStyle(op.target, op.style);
        results.push({ opId: op.opId, ok: true, action: 'setRunStyle' });
        mutated = true;
      } else if (op.op === 'style.setParagraphStyle') {
        this.setParagraphStyle(op.target, op.style);
        results.push({ opId: op.opId, ok: true, action: 'setParagraphStyle' });
        mutated = true;
      } else if (op.op === 'table.create') {
        this.insertBeforeSectPr(tableXml(op.rows, op.cols, {
          cellStyle: op.cellStyle,
          paragraphStyle: op.paragraphStyle,
          runStyle: op.runStyle,
          tblPrXml: op.tblPrXml,
        }));
        const createdTable = this.readJson().tables.at(-1);
        assert.ok(createdTable, 'table.create did not produce a discoverable table');
        results.push({
          opId: op.opId,
          ok: true,
          action: 'createTable',
          target: createdTable.id,
          tableId: createdTable.id,
          dimensions: createdTable.dims,
        });
        mutated = true;
      } else if (op.op === 'table.insertCaption') {
        const table = this.tableFromLocation({ tableId: op.tableId });
        this.insertTableCaption(op.tableId, op.text, {
          paragraphStyle: op.paragraphStyle,
          runStyle: op.runStyle,
        });
        results.push({ opId: op.opId, ok: true, action: 'table.insertCaption', target: table.id, tableId: table.id });
        mutated = true;
      } else if (op.op === 'style.applyText' || op.op === 'paragraph.applyStyle') {
        const target = this.inspectTarget(op.target);
        const nextText = op.op === 'style.applyText' && op.text !== undefined ? op.text : target.currentText;
        const templateParagraphXml = op.styleSource ? this.paragraphTemplateXml(op.styleSource) : this.paragraphTemplateXml(op.target);
        if (target.kind === 'cell') {
          this.replaceCellXml(op.target, nextText, { templateParagraphXml });
        } else {
          this.replaceParagraphXml(op.target, nextText, { templateParagraphXml });
        }
        results.push({ opId: op.opId, ok: true, target: target.id, action: op.op });
        mutated = true;
      } else if (op.op === 'table.applyCellStyle') {
        const target = this.inspectTarget(op.target);
        const sourceCellStyle = op.styleSource ? this.cellOuterStyle(op.styleSource) : null;
        const explicitCellStyle = op.cellStyle ? cellStyleXml(op.cellStyle) : null;
        this.applyCellOuterStyle(op.target, sourceCellStyle ?? explicitCellStyle);
        results.push({ opId: op.opId, ok: true, target: target.id, action: 'table.applyCellStyle' });
        mutated = true;
      } else if (op.op === 'layout.fitText') {
        results.push({ opId: op.opId, ok: true, action: 'layout.fitText', fit: this.fitText(op.location, op.text, op.options) });
      } else if (op.op === 'defineStyle') {
        this.defineStyle(op.style);
        results.push({ opId: op.opId, ok: true, action: 'defineStyle' });
        mutated = true;
      } else if (op.op === 'setPageSetup') {
        this.setPageSetup(op);
        results.push({ opId: op.opId, ok: true, action: 'setPageSetup' });
        mutated = true;
      } else if (op.op === 'setHeaderFooter') {
        this.setHeaderFooter(op);
        results.push({ opId: op.opId, ok: true, action: 'setHeaderFooter' });
        mutated = true;
      } else if (op.op === 'setDocumentMetadata') {
        this.setDocumentMetadata(op);
        results.push({ opId: op.opId, ok: true, action: 'setDocumentMetadata' });
        mutated = true;
      } else if (op.op === 'insertFootnote') {
        this.insertFootnote(op);
        results.push({ opId: op.opId, ok: true, action: 'insertFootnote' });
        mutated = true;
      } else if (op.op === 'image.replace') {
        this.replaceImage(op);
        results.push({ opId: op.opId, ok: true, action: 'image.replace', target: op.imageName });
        mutated = true;
      } else if (op.op === 'image.generateAndReplace') {
        this.replaceImage({ ...op, bytes: generatePngBytes(op.generator) });
        results.push({ opId: op.opId, ok: true, action: 'image.generateAndReplace', target: op.imageName });
        mutated = true;
      } else {
        throw new Error(`unsupported DOCX API op: ${op.op}`);
      }
      }
    } catch (error) {
      this.documentXml = snapshot.documentXml;
      this.entries = snapshot.entries;
      this.dirtyDocument = snapshot.dirtyDocument;
      this.dirtyPackage = snapshot.dirtyPackage;
      this.revision = snapshot.revision;
      throw error;
    }
    if (mutated) {
      this.revision += 1;
    }
    return { revision: this.revision, results };
  }

  replaceParagraphXml(location, text, options = {}) {
    const paragraph = this.paragraphFromLocation(location);
    const template = options.templateParagraphXml ?? paragraph.xml;
    const pPrXml = tagXml(template, 'pPr');
    const templateRuns = paragraphRunsFromXml(template);
    let replacement;
    if (options.segments) {
      assert.ok(!String(text ?? '').includes('\n'), 'Segmented paragraph replacement does not accept line breaks.');
      assert.equal(
        options.segments.length,
        templateRuns.length,
        'text.replaceParagraph segments must preserve every inspected run exactly once.',
      );
      const runsXml = options.segments.map((segment, segmentIndex) => {
        assert.equal(
          segment.sourceRun,
          segmentIndex,
          'text.replaceParagraph segments must preserve inspected run order.',
        );
        const sourceRun = templateRuns[segment.sourceRun];
        assert.ok(sourceRun, `text.replaceParagraph sourceRun does not exist: ${segment.sourceRun}`);
        return textRunXml(segment.text, sourceRun.rPrXml);
      }).join('');
      const paragraphOpen = template.match(/^<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
      replacement = `${paragraphOpen}${pPrXml}${runsXml}</w:p>`;
    } else {
      const textRuns = templateRuns.filter((run) => run.textLength > 0);
      const visibleTemplateRun = textRuns[0] ?? templateRuns[0];
      assert.ok(
        templateRuns.every((run) => runHasEquivalentVisibleFormatting(run.style, visibleTemplateRun?.style)),
        'text.replaceParagraph requires segments when a paragraph contains visibly distinct run formatting. Call target_inspect and preserve every run index in order.',
      );
      const rPrXml = visibleTemplateRun?.rPrXml ?? tagXml(template, 'rPr');
      replacement = paragraphsXmlFromText(text, { pPrXml, rPrXml });
    }
    this.documentXml = `${this.documentXml.slice(0, paragraph.start)}${replacement}${this.documentXml.slice(paragraph.end)}`;
    this.dirtyDocument = true;
  }

  replaceTextRange(op) {
    const target = op.target ?? {};
    const range = target.range ?? target;
    const native = target.native ?? range.native;
    const nodeId = range?.start?.nodeId ?? target.nodeId;
    const paragraphIndex = native
      ? Number(native.para ?? native.paragraph ?? native.number)
      : Number(String(nodeId).replace(/^p_/, ''));
    assert.ok(Number.isFinite(paragraphIndex), `${op.op} requires target.range.start.nodeId or target.native.para`);
    const paragraph = this.paragraphFromLocation({ paragraph: { number: paragraphIndex } });
    const startOffset = Number(native?.offset ?? range?.start?.offset ?? 0);
    const nativeEnd = Number.isFinite(Number(native?.length)) ? startOffset + Number(native.length) : undefined;
    const endOffset = op.op === 'text.insert' ? startOffset : (nativeEnd ?? range?.end?.offset ?? paragraph.text.length);
    const replacementText = op.op === 'text.delete'
      ? `${paragraph.text.slice(0, startOffset)}${paragraph.text.slice(endOffset)}`
      : `${paragraph.text.slice(0, startOffset)}${op.text}${paragraph.text.slice(endOffset)}`;
    this.replaceParagraphXml({ paragraph: { number: paragraphIndex } }, replacementText, { templateParagraphXml: paragraph.xml });
  }

  replaceCellXml(location, text, options = {}) {
    const table = this.tableFromLocation(location);
    const cell = this.cellFromLocation(table, location);
    const tableBlock = elementBlocks(this.documentXml, 'tbl')[table.tableIndex];
    const rows = tableRowsFromXml(tableBlock.xml);
    const cellBlock = rows[cell.row].cells[cell.col].cellBlock;
    const cellXmlSource = cellBlock.xml;
    const tcPrXml = tagXml(cellXmlSource, 'tcPr') || '<w:tcPr/>';
    const template = options.templateParagraphXml ?? elementBlocks(cellXmlSource, 'p')[0]?.xml ?? '<w:p/>';
    const replacement = `<w:tc>${tcPrXml}${paragraphsXmlFromText(text, {
      pPrXml: tagXml(template, 'pPr'),
      rPrXml: tagXml(template, 'rPr'),
    })}</w:tc>`;
    const relative = {
      start: cellBlock.start,
      end: cellBlock.end,
    };
    const nextTableXml = `${tableBlock.xml.slice(0, relative.start)}${replacement}${tableBlock.xml.slice(relative.end)}`;
    this.documentXml = `${this.documentXml.slice(0, tableBlock.start)}${nextTableXml}${this.documentXml.slice(tableBlock.end)}`;
    this.dirtyDocument = true;
  }

  applyCellOuterStyle(location, tcPrXml) {
    assert.ok(tcPrXml, 'table.applyCellStyle requires styleSource or cellStyle');
    const table = this.tableFromLocation(location);
    const cell = this.cellFromLocation(table, location);
    const tableBlock = elementBlocks(this.documentXml, 'tbl')[table.tableIndex];
    const rows = tableRowsFromXml(tableBlock.xml);
    const cellBlock = rows[cell.row].cells[cell.col].cellBlock;
    const current = cellBlock.xml;
    const replacement = tagXml(current, 'tcPr')
      ? current.replace(/<w:tcPr\b[\s\S]*?<\/w:tcPr>|<w:tcPr\b[^>]*\/>/, tcPrXml)
      : current.replace(/<w:tc\b[^>]*>/, (match) => `${match}${tcPrXml}`);
    const nextTableXml = `${tableBlock.xml.slice(0, cellBlock.start)}${replacement}${tableBlock.xml.slice(cellBlock.end)}`;
    this.documentXml = `${this.documentXml.slice(0, tableBlock.start)}${nextTableXml}${this.documentXml.slice(tableBlock.end)}`;
    this.dirtyDocument = true;
  }

  insertBeforeSectPr(fragmentXml) {
    const sectSelfClosing = this.documentXml.match(/<w:sectPr\b[^>]*\/>/);
    if (sectSelfClosing) {
      this.documentXml = `${this.documentXml.slice(0, sectSelfClosing.index)}${fragmentXml}${this.documentXml.slice(sectSelfClosing.index)}`;
    } else {
      const sect = this.documentXml.match(/<w:sectPr\b/);
      assert.ok(sect, 'sectPr must exist');
      this.documentXml = `${this.documentXml.slice(0, sect.index)}${fragmentXml}${this.documentXml.slice(sect.index)}`;
    }
    this.dirtyDocument = true;
  }

  insertTableCaption(tableId, text, options = {}) {
    const table = this.tableFromLocation({ tableId });
    const tableBlock = elementBlocks(this.documentXml, 'tbl')[table.tableIndex];
    assert.ok(tableBlock, `table XML not found: ${tableId}`);
    const captionXml = paragraphXml(text, {
      paragraphStyle: options.paragraphStyle,
      runStyle: options.runStyle,
    });
    this.documentXml = `${this.documentXml.slice(0, tableBlock.start)}${captionXml}${this.documentXml.slice(tableBlock.start)}`;
    this.dirtyDocument = true;
  }

  applyNamedStyle(target, styleId) {
    // paragraphFromLocation already handles nodeId, range, native, and canonical
    // { paragraph: { number } } locations. Coercing a missing nodeId with Number('')
    // resolves to paragraph 0 and silently styles the title instead of the inspected
    // target. Always preserve the exact caller location here.
    const paragraph = this.paragraphFromLocation(target);
    const escapedStyleId = escapeXmlAttr(styleId);
    let next = paragraph.xml;
    const pPr = tagXml(next, 'pPr');
    if (pPr) {
      const replacement = pPr.includes('<w:pStyle')
        ? pPr.replace(/<w:pStyle\b[^>]*\/>/, `<w:pStyle w:val="${escapedStyleId}"/>`)
        : pPr.replace('<w:pPr>', `<w:pPr><w:pStyle w:val="${escapedStyleId}"/>`);
      next = next.replace(pPr, replacement);
    } else {
      next = next.replace(/<w:p\b[^>]*>/, (match) => `${match}<w:pPr><w:pStyle w:val="${escapedStyleId}"/></w:pPr>`);
    }
    assert.ok(tagXml(next, 'pStyle').includes(`w:val="${escapedStyleId}"`),
      `applyStyle could not materialize paragraph style ${styleId}`);
    this.documentXml = `${this.documentXml.slice(0, paragraph.start)}${next}${this.documentXml.slice(paragraph.end)}`;
    this.dirtyDocument = true;
    assert.ok(tagXml(this.paragraphFromLocation(target).xml, 'pStyle').includes(`w:val="${escapedStyleId}"`),
      `applyStyle did not persist paragraph style ${styleId}`);
  }

  setRunStyle(target, style = {}) {
    const paragraph = this.paragraphFromLocation(target);
    let next = paragraph.xml;
    const rPr = runPropertiesXml(style);
    const firstRun = next.match(/<w:r\b[^>]*>/);
    assert.ok(firstRun, 'run not found');
    if (/<w:rPr\b/.test(next)) {
      next = next.replace(/<w:rPr\b[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/, rPr);
    } else {
      next = `${next.slice(0, firstRun.index + firstRun[0].length)}${rPr}${next.slice(firstRun.index + firstRun[0].length)}`;
    }
    this.documentXml = `${this.documentXml.slice(0, paragraph.start)}${next}${this.documentXml.slice(paragraph.end)}`;
    this.dirtyDocument = true;
  }

  setParagraphStyle(target, style = {}) {
    const paragraph = this.paragraphFromLocation(target);
    const pPr = paragraphPropertiesXml(style);
    let next = paragraph.xml;
    if (tagXml(next, 'pPr')) {
      next = next.replace(/<w:pPr\b[\s\S]*?<\/w:pPr>|<w:pPr\b[^>]*\/>/, pPr);
    } else {
      next = next.replace(/<w:p\b[^>]*>/, (match) => `${match}${pPr}`);
    }
    this.documentXml = `${this.documentXml.slice(0, paragraph.start)}${next}${this.documentXml.slice(paragraph.end)}`;
    this.dirtyDocument = true;
  }

  ensureContentTypeOverride(partName, contentType) {
    const xml = this.entries.get('[Content_Types].xml')?.toString('utf8') ?? defaultContentTypesXml();
    if (xml.includes(`PartName="${partName}"`)) {
      return;
    }
    this.entries.set('[Content_Types].xml', Buffer.from(xml.replace('</Types>', `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`), 'utf8'));
    this.dirtyPackage = true;
  }

  ensureContentTypeDefault(extension, contentType) {
    const xml = this.entries.get('[Content_Types].xml')?.toString('utf8') ?? defaultContentTypesXml();
    if (xml.includes(`Extension="${extension}"`)) {
      return;
    }
    this.entries.set('[Content_Types].xml', Buffer.from(xml.replace('</Types>', `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`), 'utf8'));
    this.dirtyPackage = true;
  }

  ensureDocumentRelationship(id, type, target) {
    const fallback = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"></Relationships>`;
    const rels = this.entries.get('word/_rels/document.xml.rels')?.toString('utf8') ?? fallback;
    if (rels.includes(`Id="${id}"`)) {
      return;
    }
    if (rels.includes(`Type="${type}" Target="${target}"`) || rels.includes(`Target="${target}" Type="${type}"`)) {
      return;
    }
    this.entries.set('word/_rels/document.xml.rels', Buffer.from(rels.replace('</Relationships>', `<Relationship Id="${escapeXmlAttr(id)}" Type="${escapeXmlAttr(type)}" Target="${escapeXmlAttr(target)}"/></Relationships>`), 'utf8'));
    this.dirtyPackage = true;
  }

  ensurePackageRelationship(id, type, target) {
    const rels = this.entries.get('_rels/.rels')?.toString('utf8') ?? defaultPackageRelsXml();
    if (rels.includes(`Id="${id}"`)) {
      return;
    }
    if (rels.includes(`Type="${type}" Target="${target}"`) || rels.includes(`Target="${target}" Type="${type}"`)) {
      return;
    }
    this.entries.set('_rels/.rels', Buffer.from(rels.replace('</Relationships>', `<Relationship Id="${escapeXmlAttr(id)}" Type="${escapeXmlAttr(type)}" Target="${escapeXmlAttr(target)}"/></Relationships>`), 'utf8'));
    this.dirtyPackage = true;
  }

  defineStyle(style) {
    assert.ok(style?.styleId, 'defineStyle requires style.styleId');
    this.ensureContentTypeOverride('/word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml');
    this.ensureDocumentRelationship('rIdStyles', `${OFFICE_REL_NS}/styles`, 'styles.xml');
    const current = this.entries.get('word/styles.xml')?.toString('utf8') ?? defaultStylesXml();
    const pattern = new RegExp(`<w:style\\b[^>]*w:styleId="${style.styleId}"[\\s\\S]*?<\\/w:style>`);
    const styleXml = docxStyleXml(style);
    const next = pattern.test(current)
      ? current.replace(pattern, styleXml)
      : current.replace('</w:styles>', `${styleXml}</w:styles>`);
    this.entries.set('word/styles.xml', Buffer.from(next, 'utf8'));
    this.dirtyPackage = true;
  }

  updateSectPr(updater) {
    const selfClosing = this.documentXml.match(/<w:sectPr\b[^>]*\/>/);
    if (selfClosing) {
      this.documentXml = `${this.documentXml.slice(0, selfClosing.index)}<w:sectPr>${updater('')}</w:sectPr>${this.documentXml.slice(selfClosing.index + selfClosing[0].length)}`;
      this.dirtyDocument = true;
      return;
    }
    const expanded = this.documentXml.match(/<w:sectPr\b[^>]*>([\s\S]*?)<\/w:sectPr>/);
    assert.ok(expanded, 'sectPr must exist');
    this.documentXml = `${this.documentXml.slice(0, expanded.index)}<w:sectPr>${updater(expanded[1])}</w:sectPr>${this.documentXml.slice(expanded.index + expanded[0].length)}`;
    this.dirtyDocument = true;
  }

  setPageSetup(setup) {
    const margins = setup.margins ?? {
      top: setup.marginTop,
      right: setup.marginRight,
      bottom: setup.marginBottom,
      left: setup.marginLeft,
      header: setup.marginHeader,
      footer: setup.marginFooter,
      gutter: setup.marginGutter,
    };
    for (const side of ['top', 'right', 'bottom', 'left']) {
      assert.ok(Number.isFinite(Number(margins[side])), `setPageSetup requires margins.${side}`);
    }
    this.updateSectPr((body) => {
      const pgSz = `<w:pgSz w:w="${setup.width}" w:h="${setup.height}"${setup.orientation === 'landscape' ? ' w:orient="landscape"' : ''}/>`;
      const pgMar = `<w:pgMar w:top="${margins.top}" w:right="${margins.right}" w:bottom="${margins.bottom}" w:left="${margins.left}" w:header="${margins.header || 720}" w:footer="${margins.footer || 720}" w:gutter="${margins.gutter || 0}"/>`;
      return replaceOrInsertChild(replaceOrInsertChild(body, /^/, 'pgSz', pgSz), /^/, 'pgMar', pgMar);
    });
  }

  setHeaderFooter(op) {
    this.documentXml = ensureDocumentRelationshipNamespace(this.documentXml);
    const header = op.header ?? op.text;
    const footer = op.footer;
    assert.ok(header !== undefined || footer !== undefined, 'setHeaderFooter requires header, footer, or text');
    let headerReferenceXml = '';
    let footerReferenceXml = '';
    if (header !== undefined) {
      this.ensureContentTypeOverride('/word/header1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
      this.ensureDocumentRelationship('rIdHeader1', `${OFFICE_REL_NS}/header`, 'header1.xml');
      this.entries.set('word/header1.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${WORD_NS}">${paragraphXml(header, { paragraphStyle: { align: op.align || 'center' } })}</w:hdr>`, 'utf8'));
      headerReferenceXml = '<w:headerReference w:type="default" r:id="rIdHeader1"/>';
    }
    if (footer !== undefined) {
      this.ensureContentTypeOverride('/word/footer1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml');
      this.ensureDocumentRelationship('rIdFooter1', `${OFFICE_REL_NS}/footer`, 'footer1.xml');
      this.entries.set('word/footer1.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${WORD_NS}">${paragraphXml(footer, { paragraphStyle: { align: op.align || 'center' } })}</w:ftr>`, 'utf8'));
      footerReferenceXml = '<w:footerReference w:type="default" r:id="rIdFooter1"/>';
    }
    this.updateSectPr((body) => {
      let next = body;
      if (header !== undefined) {
        next = `${headerReferenceXml}${next.replace(/<w:headerReference\b[^>]*\/>/g, '')}`;
      }
      if (footer !== undefined) {
        next = `${footerReferenceXml}${next.replace(/<w:footerReference\b[^>]*\/>/g, '')}`;
      }
      return next;
    });
    this.dirtyPackage = true;
  }

  setDocumentMetadata(op) {
    this.ensureContentTypeOverride('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml');
    this.ensurePackageRelationship('rIdCoreProps', `${PACKAGE_REL_NS}/metadata/core-properties`, 'docProps/core.xml');
    let coreXml = this.entries.get('docProps/core.xml')?.toString('utf8')
      ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"></cp:coreProperties>';
    for (const [field, qualifiedName] of [
      ['title', 'dc:title'],
      ['subject', 'dc:subject'],
      ['creator', 'dc:creator'],
      ['keywords', 'cp:keywords'],
      ['description', 'dc:description'],
    ]) {
      if (op[field] !== undefined) {
        coreXml = replaceOrInsertXmlTextElement(coreXml, qualifiedName, op[field]);
      }
    }
    this.entries.set('docProps/core.xml', Buffer.from(coreXml, 'utf8'));
    this.dirtyPackage = true;
  }

  insertFootnote(op) {
    this.ensureContentTypeOverride('/word/footnotes.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml');
    this.ensureDocumentRelationship('rIdFootnotes', `${OFFICE_REL_NS}/footnotes`, 'footnotes.xml');
    const current = this.entries.get('word/footnotes.xml')?.toString('utf8') ?? defaultFootnotesXml();
    const ids = [...current.matchAll(/w:id="(-?\d+)"/g)].map((match) => Number(match[1])).filter((id) => id > 0);
    const nextId = Math.max(0, ...ids) + 1;
    this.entries.set('word/footnotes.xml', Buffer.from(current.replace('</w:footnotes>', `<w:footnote w:id="${nextId}">${paragraphXml(op.text)}</w:footnote></w:footnotes>`), 'utf8'));
    const paragraph = this.paragraphFromLocation(op.target);
    const next = paragraph.xml.replace('</w:p>', `<w:r><w:footnoteReference w:id="${nextId}"/></w:r></w:p>`);
    this.documentXml = `${this.documentXml.slice(0, paragraph.start)}${next}${this.documentXml.slice(paragraph.end)}`;
    this.dirtyDocument = true;
    this.dirtyPackage = true;
  }

  replaceImage(op) {
    assert.ok(op.imageName, 'image.replace requires imageName');
    const bytes = imageBytesFromOperation(op);
    assert.ok(bytes && bytes.length > 0, 'image.replace requires bytes, bytesBase64, or filePath');
    assert.ok(this.entries.has(op.imageName), `package entry not found: ${op.imageName}`);
    const image = validateImageBytesForPackage(op.imageName, bytes, op.mimeType);
    this.entries.set(op.imageName, Buffer.from(bytes));
    this.ensureContentTypeDefault(image.extension, image.mimeType);
    this.dirtyPackage = true;
  }

  qualityCheck(options = {}) {
    const json = this.readJson();
    const issues = [];
    const requiredEntries = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
    for (const name of requiredEntries) {
      if (!this.entries.has(name)) {
        issues.push({ severity: 'error', code: 'missing-package-entry', message: `${name} is missing` });
      }
    }
    issues.push(...tableCapacityRiskIssues(json));
    if (options.baselineJson) {
      const currentCells = new Map(json.tables.flatMap((table) => table.cells.map((cell) => [cell.id, cell])));
      for (const baselineTable of options.baselineJson.tables ?? []) {
        for (const baselineCell of baselineTable.cells ?? []) {
          const currentCell = currentCells.get(baselineCell.id);
          if (currentCell && baselineCell.styleFingerprint?.hash && currentCell.styleFingerprint?.hash
            && baselineCell.styleFingerprint.hash !== currentCell.styleFingerprint.hash) {
            issues.push({
              severity: 'info',
              code: 'cell-style-fingerprint-changed',
              message: 'Cell style fingerprint changed from baseline.',
              location: currentCell.location,
              before: baselineCell.styleFingerprint.hash,
              after: currentCell.styleFingerprint.hash,
            });
          }
        }
      }
    }
    const reportedIssues = markNonRegressingBaselineWarnings(issues, options.baselineJson);
    return {
      ok: reportedIssues.every((issue) => issue.severity !== 'error'),
      revision: this.revision,
      pageCount: json.pageCount,
      tableCount: json.tables.length,
      paragraphCount: json.blocks.length,
      objectSummary: {
        imageCount: json.objectGraph.images.length,
        pictureCount: json.objectGraph.pictures.length,
        chartCount: json.objectGraph.charts.length,
      },
      targetSummary: {
        paragraphTargets: json.editableTargets.paragraphs.length,
        cellTargets: json.editableTargets.cells.length,
      },
      issues: reportedIssues,
      warnings: json.warnings,
    };
  }

  save() {
    if (!this.dirtyDocument && !this.dirtyPackage) {
      return {
        bytes: Buffer.from(this.inputBytes),
        revision: this.revision,
        validation: this.validationReport(),
      };
    }
    if (this.dirtyDocument) {
      this.entries.set('word/document.xml', Buffer.from(this.documentXml, 'utf8'));
    }
    const bytes = createZip(this.entries);
    return {
      bytes,
      revision: this.revision,
      validation: new DocxApiSession(bytes).validationReport(),
    };
  }

  validationReport() {
    const json = this.readJson();
    return {
      sourceFormat: 'docx',
      pageCount: json.pageCount,
      paragraphCount: json.blocks.length,
      tableCount: json.tables.length,
      tables: json.tables.map((table) => ({ id: table.id, dims: table.dims })),
      warnings: json.warnings,
    };
  }
}
