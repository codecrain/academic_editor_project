import assert from 'node:assert/strict';
import { deflateRawSync, deflateSync, inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import initHwpx, { HwpDocument } from '../pkg/rhwp.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

let hwpxReady = null;

export async function initHwpxRuntime() {
  globalThis.measureTextWidth ??= (text) => String(text ?? '').length * 560;
  hwpxReady ??= initHwpx({
    module_or_path: readFileSync(path.join(repoRoot, 'editor_hwpx', 'pkg', 'rhwp_bg.wasm')),
  });
  return hwpxReady;
}

function parseResult(value, label = 'api') {
  const parsed = typeof value === 'string' && value.trim().startsWith('{') ? JSON.parse(value) : value;
  if (parsed && typeof parsed === 'object' && parsed.ok === false) {
    throw new Error(`${label} failed: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function tryJson(fn) {
  try {
    return parseResult(fn());
  } catch {
    return null;
  }
}

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

function generatePngBytes(options = {}) {
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

export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [name, rawData] of entries) {
    const fileName = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
    const compressed = name === 'mimetype' ? data : deflateRawSync(data);
    const method = name === 'mimetype' ? 0 : 8;
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
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
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);
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

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  const text = String(value ?? '').trim();
  return text ? [text] : [];
}

function readBodyParagraphText(doc, section, para) {
  const len = doc.getParagraphLength(section, para);
  return doc.getTextRange(section, para, 0, len);
}

function readCellText(doc, table, cellIndex) {
  const paraCount = doc.getCellParagraphCount(table.section, table.para, table.control, cellIndex);
  const paragraphs = [];
  for (let cellPara = 0; cellPara < paraCount; cellPara += 1) {
    const len = doc.getCellParagraphLength(table.section, table.para, table.control, cellIndex, cellPara);
    paragraphs.push({
      index: cellPara,
      length: len,
      text: doc.getTextInCell(table.section, table.para, table.control, cellIndex, cellPara, 0, len),
    });
  }
  return paragraphs;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readTableLayout(doc, section, para, control) {
  const properties = tryJson(() => doc.getTableProperties(section, para, control));
  const bbox = tryJson(() => doc.getTableBBox(section, para, control, null))
    ?? tryJson(() => doc.getTableBBox(section, para, control));
  const rawCellBboxes = tryJson(() => doc.getTableCellBboxes(section, para, control, null))
    ?? tryJson(() => doc.getTableCellBboxes(section, para, control));
  const cellBboxes = Array.isArray(rawCellBboxes) ? rawCellBboxes : rawCellBboxes?.cells ?? [];
  return { properties, bbox, cellBboxes };
}

function readCellStyle(doc, table, cellIndex) {
  return {
    cell: tryJson(() => doc.getCellProperties(table.section, table.para, table.control, cellIndex)),
    namedStyle: tryJson(() => doc.getCellStyleAt(table.section, table.para, table.control, cellIndex)),
    paragraph: tryJson(() => doc.getCellParaPropertiesAt(table.section, table.para, table.control, cellIndex, 0, 0)),
    text: tryJson(() => doc.getCellCharPropertiesAt(table.section, table.para, table.control, cellIndex, 0, 0)),
  };
}

function findCellBBox(tableLayout, cellIndex) {
  return tableLayout.cellBboxes.find((bbox) => {
    const bboxCellIndex = bbox.cellIdx ?? bbox.cellIndex ?? bbox.index;
    return bboxCellIndex === cellIndex;
  }) ?? null;
}

function estimateTextCapacity(style, bbox) {
  const cell = style?.cell ?? {};
  const text = style?.text ?? {};
  const paragraph = style?.paragraph ?? {};
  const width = numberOrNull(cell.width) ?? numberOrNull(bbox?.width) ?? 0;
  const height = numberOrNull(cell.height) ?? numberOrNull(bbox?.height) ?? 0;
  const fontSize = numberOrNull(text.fontSize) ?? 1000;
  const lineSpacingRatio = Math.max(1, (numberOrNull(paragraph.lineSpacing) ?? 160) / 100);
  const leftMargin = numberOrNull(cell.leftMargin) ?? numberOrNull(cell.marginLeft) ?? 0;
  const rightMargin = numberOrNull(cell.rightMargin) ?? numberOrNull(cell.marginRight) ?? 0;
  const topMargin = numberOrNull(cell.topMargin) ?? numberOrNull(cell.marginTop) ?? 0;
  const bottomMargin = numberOrNull(cell.bottomMargin) ?? numberOrNull(cell.marginBottom) ?? 0;
  const innerWidth = Math.max(0, width - leftMargin - rightMargin);
  const innerHeight = Math.max(0, height - topMargin - bottomMargin);
  const charWidth = Math.max(360, fontSize * 0.52);
  const lineHeight = Math.max(900, fontSize * lineSpacingRatio);
  const maxCharsPerLine = innerWidth > 0 ? Math.max(4, Math.floor(innerWidth / charWidth)) : null;
  const maxLines = innerHeight > 0 ? Math.max(1, Math.floor(innerHeight / lineHeight)) : null;
  const recommendedChars = maxCharsPerLine && maxLines ? Math.max(4, Math.floor(maxCharsPerLine * maxLines * 0.86)) : null;
  return {
    maxCharsPerLine,
    maxLines,
    recommendedChars,
    basis: {
      width,
      height,
      fontSize,
      lineSpacingRatio,
      innerWidth,
      innerHeight,
      charWidth,
      lineHeight,
    },
  };
}

function wrapLine(line, maxCharsPerLine) {
  return coreWrapLine(line, maxCharsPerLine);
}

function fitTextToCapacity(text, capacity, options = {}) {
  return coreFitTextToCapacity(text, capacity, options);
}

function buildListText(items, options = {}) {
  return coreBuildListText(items, options);
}

function readTable(doc, section, para, control, tableIndex, tableOrderInParagraph, cellGlobalStart) {
  const dims = tryJson(() => doc.getTableDimensions(section, para, control));
  if (!dims) {
    return null;
  }
  const tableLayout = readTableLayout(doc, section, para, control);
  const tableNative = { section, paragraph: para, control, tableOrderInParagraph };
  const tableRef = { section, para, control };
  const cells = [];
  for (let cellIndex = 0; cellIndex < dims.cellCount; cellIndex += 1) {
    const info = parseResult(doc.getCellInfo(section, para, control, cellIndex), 'getCellInfo');
    const paragraphs = readCellText(doc, tableRef, cellIndex);
    const style = readCellStyle(doc, tableRef, cellIndex);
    const bbox = findCellBBox(tableLayout, cellIndex);
    const capacity = estimateTextCapacity(style, bbox);
    const fingerprint = styleFingerprint(style);
    cells.push({
      id: `tbl_${tableIndex}_cell_${cellIndex}`,
      cellIndex,
      row: info.row,
      col: info.col,
      rowSpan: info.rowSpan,
      colSpan: info.colSpan,
      text: paragraphs.map((item) => item.text).join('\n'),
      paragraphs,
      location: {
        tableId: `tbl_${tableIndex}`,
        cell: { number: cellIndex, row: info.row, column: info.col },
      },
      style,
      styleFingerprint: fingerprint,
      layout: { bbox, capacity },
      allowedActions: [
        'table.writeCell',
        'table.writeRichCell',
        'table.applyCellStyle',
        'list.writeBullets',
        'list.applyNumbering',
        'style.clone',
        'style.applyText',
        'paragraph.applyStyle',
        'layout.fitText',
      ],
      native: { section, paragraph: para, control, cellIndex },
    });
  }

  return {
    id: `tbl_${tableIndex}`,
    tableIndex,
    cellGlobalStart,
    section,
    para,
    control,
    tableOrderInParagraph,
    dims,
    layout: tableLayout,
    native: tableNative,
    cells,
  };
}

function discoverTables(doc) {
  const tables = [];
  let cellGlobalStart = 0;
  for (let section = 0; section < doc.getSectionCount(); section += 1) {
    const paragraphCount = doc.getParagraphCount(section);
    for (let para = 0; para < paragraphCount; para += 1) {
      let tableOrderInParagraph = 0;
      for (let control = 0; control < 32; control += 1) {
        const table = readTable(doc, section, para, control, tables.length, tableOrderInParagraph, cellGlobalStart);
        if (table) {
          tables.push(table);
          tableOrderInParagraph += 1;
          cellGlobalStart += table.dims.cellCount;
        }
      }
    }
  }
  return tables;
}

function readPackageObjects(inputBytes) {
  try {
    const entries = readZip(inputBytes);
    const names = [...entries.keys()];
    const sectionXml = names
      .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
      .map((name) => ({ name, xml: entries.get(name)?.toString('utf8') ?? '' }));
    const pictures = sectionXml.flatMap(({ name, xml }) => {
      const pics = [];
      const re = /<hp:pic\b[\s\S]*?<\/hp:pic>/g;
      let match;
      while ((match = re.exec(xml))) {
        pics.push({
          id: `pic_${pics.length}`,
          sectionFile: name,
          byteOffset: match.index,
          binItemIDRef: firstMatch(match[0], /\bbinItemIDRef="([^"]+)"/, null),
          zOrder: firstMatch(match[0], /\bzOrder="([^"]+)"/, null),
        });
      }
      return pics;
    });
    return {
      images: names.filter((name) => /^BinData\/.+\.(bmp|gif|jpg|jpeg|png|wmf|emf)$/i.test(name))
        .map((name) => ({ name, byteLength: entries.get(name)?.length ?? 0 })),
      pictures,
      charts: sectionXml.flatMap(({ name, xml }) => [...xml.matchAll(/<hp:chart\b[\s\S]*?<\/hp:chart>/g)]
        .map((match, index) => ({ id: `chart_${index}`, sectionFile: name, byteOffset: match.index }))),
      sections: names.filter((name) => /^Contents\/section\d+\.xml$/i.test(name)),
      xmlFiles: names.filter((name) => /\.xml$/i.test(name)),
      binaryFiles: names.filter((name) => /^BinData\//i.test(name)),
    };
  } catch {
    return { images: [], sections: [], xmlFiles: [], binaryFiles: [] };
  }
}

function stableStringify(value) {
  return coreStableStringify(value);
}

function hashString(text) {
  return coreHashString(text);
}

function styleFingerprint(style = {}) {
  const picked = {
    cell: {
      borderFillId: style.cell?.borderFillId ?? style.cell?.borderFillIDRef ?? style.cell?.borderFillID,
      fillColor: style.cell?.fillColor,
      verticalAlign: style.cell?.verticalAlign,
      margins: {
        left: style.cell?.leftMargin ?? style.cell?.marginLeft,
        right: style.cell?.rightMargin ?? style.cell?.marginRight,
        top: style.cell?.topMargin ?? style.cell?.marginTop,
        bottom: style.cell?.bottomMargin ?? style.cell?.marginBottom,
      },
    },
    paragraph: {
      align: style.paragraph?.align,
      lineSpacing: style.paragraph?.lineSpacing,
      indent: style.paragraph?.indent,
      leftMargin: style.paragraph?.leftMargin,
      rightMargin: style.paragraph?.rightMargin,
    },
    text: {
      fontFamily: style.text?.fontFamily,
      fontSize: style.text?.fontSize,
      bold: style.text?.bold,
      italic: style.text?.italic,
      underline: style.text?.underline,
      textColor: style.text?.textColor,
    },
    namedStyle: style.namedStyle,
  };
  const serialized = stableStringify(picked);
  return {
    hash: hashString(serialized),
    basis: picked,
  };
}

function readStyleGraph(doc) {
  const rawStyles = tryJson(() => doc.getStyleList()) ?? [];
  const styles = Array.isArray(rawStyles) ? rawStyles : rawStyles.styles ?? rawStyles.items ?? [];
  return {
    styles,
    count: Array.isArray(styles) ? styles.length : 0,
  };
}

function buildEditableTargets(sections, tables) {
  return {
    paragraphs: sections.flatMap((section) => section.paragraphs.map((paragraph) => ({
      id: paragraph.id,
      location: { paragraph: { section: paragraph.section, number: paragraph.para } },
      textLength: paragraph.text.length,
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

function commandKey(command) {
  return coreCommandKey(command);
}

function commandId(command, fallbackIndex = 0) {
  return coreCommandId(command, fallbackIndex);
}

function commandText(command) {
  return coreCommandText(command);
}

function commandLocation(command) {
  return coreCommandLocation(command);
}

function normalizeCellReference(cell = {}) {
  return coreNormalizeCellReference(cell);
}

function normalizeParagraphLocation(location = {}) {
  return coreNormalizeParagraphLocation(location);
}

function findBlocks(xml, tagName) {
  const blocks = [];
  const tag = tagName.replace(/^hp:/, '');
  const re = new RegExp(`<\\/?hp:${tag}\\b[^>]*\\/?>`, 'g');
  const stack = [];
  let match;
  while ((match = re.exec(xml))) {
    const raw = match[0];
    if (raw.startsWith('</')) {
      const start = stack.pop();
      if (start !== undefined && stack.length === 0) {
        blocks.push({
          start,
          end: re.lastIndex,
          xml: xml.slice(start, re.lastIndex),
        });
      }
    } else if (!raw.endsWith('/>')) {
      stack.push(match.index);
    }
  }
  return blocks;
}

function findTopLevelParagraphs(sectionXml) {
  return findBlocks(sectionXml.slice(sectionXml.indexOf('>') + 1, sectionXml.lastIndexOf('</hs:sec>')), 'p')
    .map((block) => {
      const offset = sectionXml.indexOf('>') + 1;
      return {
        start: offset + block.start,
        end: offset + block.end,
        xml: block.xml,
      };
    });
}

function extractSubList(cellXml) {
  const block = findBlocks(cellXml, 'subList')[0];
  if (!block) {
    throw new Error('cell subList not found');
  }
  const open = block.xml.match(/<hp:subList\b[^>]*>/)?.[0];
  const openEnd = block.start + open.length;
  const close = block.end - '</hp:subList>'.length;
  return {
    start: block.start,
    open,
    openEnd,
    innerStart: openEnd,
    innerEnd: close,
    end: block.end,
    inner: cellXml.slice(openEnd, close),
  };
}

function firstMatch(text, regex, fallback = null) {
  const match = text.match(regex);
  return match ? match[1] : fallback;
}

function setXmlAttribute(openTag, name, value) {
  if (value === null || value === undefined) {
    return openTag;
  }
  if (new RegExp(`\\b${name}="[^"]*"`).test(openTag)) {
    return openTag.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${value}"`);
  }
  return openTag.replace(/>$/, ` ${name}="${value}">`);
}

function normalizeStyleIds(styleIds = {}) {
  const source = styleIds?.styleIds ?? styleIds ?? {};
  return {
    paraPrIDRef: source.paraPrIDRef ?? source.paraPrId ?? source.paraShapeId ?? source.paragraphStyleId,
    styleIDRef: source.styleIDRef ?? source.styleId ?? source.namedStyleId,
    charPrIDRef: source.charPrIDRef ?? source.charPrId ?? source.charShapeId ?? source.textStyleId,
  };
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}

function paragraphStyleIdsFromXml(paragraphXml = '') {
  const pOpen = paragraphXml.match(/<hp:p\b[^>]*>/)?.[0] ?? '';
  return stripUndefined({
    paraPrIDRef: firstMatch(pOpen, /\bparaPrIDRef="([^"]+)"/, null),
    styleIDRef: firstMatch(pOpen, /\bstyleIDRef="([^"]+)"/, null),
    charPrIDRef: firstMatch(paragraphXml, /<hp:run\b[^>]*charPrIDRef="([^"]+)"/, null),
  });
}

function cellOuterStyleFromXml(cellXml = '') {
  const tcOpen = cellXml.match(/<hp:tc\b[^>]*>/)?.[0] ?? '';
  const subListOpen = cellXml.match(/<hp:subList\b[^>]*>/)?.[0] ?? '';
  const margin = cellXml.match(/<hp:cellMargin\b[^>]*\/>/)?.[0] ?? '';
  return stripUndefined({
    borderFillIDRef: firstMatch(tcOpen, /\bborderFillIDRef="([^"]+)"/, null),
    vertAlign: firstMatch(subListOpen, /\bvertAlign="([^"]+)"/, null),
    margin: margin ? stripUndefined({
      left: firstMatch(margin, /\bleft="([^"]+)"/, null),
      right: firstMatch(margin, /\bright="([^"]+)"/, null),
      top: firstMatch(margin, /\btop="([^"]+)"/, null),
      bottom: firstMatch(margin, /\bbottom="([^"]+)"/, null),
    }) : undefined,
  });
}

function normalizeCellStyle(cellStyle = {}) {
  const source = cellStyle?.cellStyle ?? cellStyle ?? {};
  const margin = source.margin ?? source.cellMargin ?? {};
  const verticalAlign = source.vertAlign ?? source.verticalAlign;
  const vertAlign = typeof verticalAlign === 'number'
    ? ({ 0: 'TOP', 1: 'CENTER', 2: 'BOTTOM' }[verticalAlign] ?? undefined)
    : verticalAlign;
  const normalizedMargin = stripUndefined({
    left: margin.left ?? source.marginLeft ?? source.paddingLeft,
    right: margin.right ?? source.marginRight ?? source.paddingRight,
    top: margin.top ?? source.marginTop ?? source.paddingTop,
    bottom: margin.bottom ?? source.marginBottom ?? source.paddingBottom,
  });
  return stripUndefined({
    borderFillIDRef: source.borderFillIDRef ?? source.borderFillId ?? source.borderFillID ?? source.borderFill,
    vertAlign,
    margin: Object.keys(normalizedMargin).length ? normalizedMargin : undefined,
  });
}

function mergeStyleIds(...items) {
  const merged = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(normalizeStyleIds(item))) {
      if (value !== undefined && value !== null) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function mergeCellStyles(...items) {
  const merged = {};
  for (const item of items) {
    const normalized = normalizeCellStyle(item);
    if (normalized.borderFillIDRef !== undefined) {
      merged.borderFillIDRef = normalized.borderFillIDRef;
    }
    if (normalized.vertAlign !== undefined) {
      merged.vertAlign = normalized.vertAlign;
    }
    if (normalized.margin && Object.keys(normalized.margin).length) {
      merged.margin = { ...(merged.margin ?? {}), ...normalized.margin };
    }
  }
  return merged;
}

function applyParagraphStyleIdsXml(paragraphXml, styleIds = {}) {
  const normalized = normalizeStyleIds(styleIds);
  let next = paragraphXml;
  if (normalized.paraPrIDRef !== undefined || normalized.styleIDRef !== undefined) {
    next = next.replace(/<hp:p\b[^>]*>/, (openTag) => {
      let tag = openTag;
      tag = setXmlAttribute(tag, 'paraPrIDRef', normalized.paraPrIDRef);
      tag = setXmlAttribute(tag, 'styleIDRef', normalized.styleIDRef);
      return tag;
    });
  }
  if (normalized.charPrIDRef !== undefined) {
    next = next.replace(/<hp:run\b[^>]*>/g, (openTag) => setXmlAttribute(openTag, 'charPrIDRef', normalized.charPrIDRef));
  }
  return next;
}

function applyCellOuterStyleXml(cellXml, cellStyle = {}) {
  const normalized = normalizeCellStyle(cellStyle);
  let next = cellXml;
  if (normalized.borderFillIDRef !== undefined) {
    next = next.replace(/<hp:tc\b[^>]*>/, (openTag) => setXmlAttribute(openTag, 'borderFillIDRef', normalized.borderFillIDRef));
  }
  if (normalized.vertAlign !== undefined) {
    next = next.replace(/<hp:subList\b[^>]*>/, (openTag) => setXmlAttribute(openTag, 'vertAlign', normalized.vertAlign));
  }
  const margin = normalized.margin ?? {};
  if (Object.keys(margin).length) {
    if (/<hp:cellMargin\b[^>]*\/>/.test(next)) {
      next = next.replace(/<hp:cellMargin\b[^>]*\/>/, (tag) => {
        let patched = tag;
        for (const [key, value] of Object.entries(margin)) {
          patched = setXmlAttribute(patched.replace(/\/>$/, '>'), key, value).replace(/>$/, '/>');
        }
        return patched;
      });
    } else {
      const attrs = Object.entries(margin).map(([key, value]) => `${key}="${value}"`).join(' ');
      next = next.replace('</hp:tc>', `<hp:cellMargin ${attrs}/></hp:tc>`);
    }
  }
  return next;
}

function paragraphTemplateFromXml(paragraphXml, fallbackParagraphXml = '', overrideStyleIds = {}) {
  const sourcePOpen = paragraphXml.match(/<hp:p\b[^>]*>/)?.[0] ?? null;
  const fallbackPOpen = fallbackParagraphXml.match(/<hp:p\b[^>]*>/)?.[0] ?? null;
  let pOpen = fallbackPOpen ?? sourcePOpen
    ?? '<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">';
  const normalizedOverrides = normalizeStyleIds(overrideStyleIds);
  for (const attr of ['paraPrIDRef', 'styleIDRef']) {
    const sourceValue = normalizedOverrides[attr] ?? (sourcePOpen ? firstMatch(sourcePOpen, new RegExp(`\\b${attr}="([^"]+)"`), null) : null);
    pOpen = setXmlAttribute(pOpen, attr, sourceValue);
  }
  const charPrIDRef = normalizedOverrides.charPrIDRef
    ?? firstMatch(paragraphXml, /<hp:run\b[^>]*charPrIDRef="([^"]+)"/, null)
    ?? firstMatch(fallbackParagraphXml, /<hp:run\b[^>]*charPrIDRef="([^"]+)"/, '0');
  const lineSeg = paragraphXml.match(/<hp:lineseg\b[^>]*\/>/)?.[0]
    ?? fallbackParagraphXml.match(/<hp:lineseg\b[^>]*\/>/)?.[0]
    ?? '<hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="660" horzpos="0" horzsize="32000" flags="393216"/>';
  const vertStep = Number(firstMatch(lineSeg, /vertsize="(\d+)"/, '1100')) + 660;
  return { pOpen, charPrIDRef, lineSeg, vertStep };
}

function buildLineSeg(template, index) {
  const vertpos = Math.max(0, index * template.vertStep);
  return template.lineSeg
    .replace(/\btextpos="[^"]*"/, 'textpos="0"')
    .replace(/\bvertpos="[^"]*"/, `vertpos="${vertpos}"`);
}

function buildParagraphXml(line, template, index) {
  const text = escapeXmlText(line);
  return `${template.pOpen}<hp:run charPrIDRef="${template.charPrIDRef}"><hp:t>${text}</hp:t></hp:run><hp:linesegarray>${buildLineSeg(template, index)}</hp:linesegarray></hp:p>`;
}

const CELL_DRAWING_CONTROL_PATTERN = /<hp:(?:pic|container)\b/;

function replaceCellTextXml(cellXml, text, options = {}) {
  if (CELL_DRAWING_CONTROL_PATTERN.test(cellXml)) {
    return applyCellOuterStyleXml(replaceFirstInlineTextXml(cellXml, text), options.cellStyle);
  }
  const subList = extractSubList(cellXml);
  const paragraphs = findBlocks(subList.inner, 'p');
  const template = paragraphTemplateFromXml(
    options.templateParagraphXml ?? paragraphs[0]?.xml ?? '',
    paragraphs[0]?.xml ?? '',
    options.styleIds,
  );
  const lines = String(text ?? '').split('\n');
  const nextParagraphs = (lines.length ? lines : ['']).map((line, index) => buildParagraphXml(line, template, index)).join('');
  const textPatched = `${cellXml.slice(0, subList.innerStart)}${nextParagraphs}${cellXml.slice(subList.innerEnd)}`;
  return applyCellOuterStyleXml(textPatched, options.cellStyle);
}

function replaceFirstInlineTextXml(xml, text) {
  const escaped = escapeXmlText(String(text ?? '').split(/\r?\n/).join(' '));
  let replaced = false;
  const withExistingTextRun = xml.replace(/<hp:t\b([^>]*)>([\s\S]*?)<\/hp:t>/, (match, attrs) => {
    replaced = true;
    return `<hp:t${attrs}>${escaped}</hp:t>`;
  });
  if (replaced) {
    return withExistingTextRun;
  }
  return xml.replace(/<hp:t\b([^>]*)\/>/, (match, attrs) => `<hp:t${attrs}>${escaped}</hp:t>`);
}

function replaceParagraphTextXml(paragraphXml, text, options = {}) {
  if (/<hp:tbl\b/.test(paragraphXml)) {
    return replaceParagraphTextPreservingControlsXml(paragraphXml, text);
  }
  const oneLineText = String(text ?? '').split(/\r?\n/).join(' ');
  return applyParagraphStyleIdsXml(
    replaceInlineParagraphTextXml(paragraphXml, oneLineText),
    options.styleIds,
  );
}

function insertParagraphTextAfterXml(paragraphXml, text, options = {}) {
  const template = paragraphTemplateFromXml(
    options.templateParagraphXml ?? paragraphXml,
    paragraphXml,
    options.styleIds,
  );
  const lines = String(text ?? '').split(/\r?\n/);
  const inserted = (lines.length ? lines : ['']).map((line, index) => buildParagraphXml(line, template, index)).join('');
  return `${paragraphXml}${inserted}`;
}

function replaceInlineParagraphTextXml(paragraphXml, text) {
  const escaped = escapeXmlText(text);
  let replaced = false;
  const withExistingTextRuns = paragraphXml.replace(/<hp:t\b([^>]*)>([\s\S]*?)<\/hp:t>/g, (match, attrs) => {
    if (!replaced) {
      replaced = true;
      return `<hp:t${attrs}>${escaped}</hp:t>`;
    }
    return `<hp:t${attrs}></hp:t>`;
  });
  if (replaced) {
    return withExistingTextRuns;
  }
  const withEmptyTextRun = paragraphXml.replace(/<hp:t\b([^>]*)\/>/, (match, attrs) => {
    replaced = true;
    return `<hp:t${attrs}>${escaped}</hp:t>`;
  });
  if (replaced) {
    return withEmptyTextRun;
  }
  return paragraphXml.replace(/(<hp:p\b[^>]*>)/, `$1<hp:run><hp:t>${escaped}</hp:t></hp:run>`);
}

function replaceParagraphTextPreservingControlsXml(paragraphXml, text) {
  const oneLineText = escapeXmlText(String(text ?? '').split(/\r?\n/).join(' '));
  const controlStart = paragraphXml.search(/<hp:tbl\b/);
  const head = controlStart >= 0 ? paragraphXml.slice(0, controlStart) : paragraphXml;
  const tail = controlStart >= 0 ? paragraphXml.slice(controlStart) : '';
  if (/<hp:t>[\s\S]*?<\/hp:t>/.test(head)) {
    return `${head.replace(/<hp:t>[\s\S]*?<\/hp:t>/, `<hp:t>${oneLineText}</hp:t>`)}${tail}`;
  }
  if (/<hp:t\b[^>]*\/>/.test(head)) {
    return `${head.replace(/<hp:t\b([^>]*)\/>/, `<hp:t$1>${oneLineText}</hp:t>`)}${tail}`;
  }
  if (controlStart >= 0) {
    return paragraphXml;
  }
  const run = `<hp:run><hp:t>${oneLineText}</hp:t></hp:run>`;
  return paragraphXml.replace(/(<hp:p\b[^>]*>)/, `$1${run}`);
}

function removeRectTextBoxesByText(sectionXml, texts) {
  const targets = normalizeTextList(texts);
  if (!targets.length) {
    return sectionXml;
  }
  let next = sectionXml;
  const rects = findBlocks(next, 'rect').filter((block) => targets.some((text) => block.xml.includes(escapeXmlText(text))));
  for (const rect of rects.sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, rect.start)}${next.slice(rect.end)}`;
  }
  return next;
}

function replaceRectTextBoxText(sectionXml, replacements) {
  const changes = Array.isArray(replacements) ? replacements : [];
  if (!changes.length) {
    return sectionXml;
  }
  let next = sectionXml;
  const rects = findBlocks(next, 'rect');
  const patches = [];
  for (const rect of rects) {
    let rectXml = rect.xml;
    let changed = false;
    for (const replacement of changes) {
      const find = String(replacement.find ?? replacement.text ?? '').trim();
      if (!find || !rectXml.includes(escapeXmlText(find))) {
        continue;
      }
      const replaceWith = escapeXmlText(replacement.replaceWith ?? replacement.value ?? replacement.newText ?? '');
      rectXml = rectXml.replaceAll(`>${escapeXmlText(find)}<`, `>${replaceWith}<`);
      changed = true;
    }
    if (changed) {
      patches.push({ start: rect.start, end: rect.end, xml: rectXml });
    }
  }
  for (const patch of patches.sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, patch.start)}${patch.xml}${next.slice(patch.end)}`;
  }
  return next;
}

function patchSectionXml(sectionXml, sectionIndex, cellPatches, paragraphPatches, paragraphInsertPatches = [], shapePatches = [], textBoxPatches = []) {
  let next = sectionXml;
  const sectionCellPatches = cellPatches.filter((patch) => patch.section === sectionIndex);
  const sectionParagraphPatches = paragraphPatches.filter((patch) => patch.section === sectionIndex);
  const sectionParagraphInsertPatches = paragraphInsertPatches.filter((patch) => patch.section === sectionIndex);
  const sectionShapePatches = shapePatches.filter((patch) => patch.section === sectionIndex);
  const sectionTextBoxPatches = textBoxPatches.filter((patch) => patch.section === sectionIndex);

  if (sectionCellPatches.length) {
    const uniqueCellPatches = [
      ...new Map(sectionCellPatches.map((patch) => [
        `${patch.section}:${patch.para}:${patch.tableOrderInParagraph}:${patch.cellIndex}`,
        patch,
      ])).values(),
    ];
    const paragraphs = findTopLevelParagraphs(next);
    const replacements = uniqueCellPatches.map((patch) => {
      const paragraph = paragraphs[patch.para];
      if (!paragraph) {
        throw new Error(`paragraph XML index not found for table patch: ${patch.para}`);
      }
      const tables = findBlocks(paragraph.xml, 'tbl');
      const table = tables[patch.tableOrderInParagraph];
      if (!table) {
        throw new Error(`table XML index not found: para ${patch.para}, tableOrder ${patch.tableOrderInParagraph}`);
      }
      const cells = findBlocks(table.xml, 'tc');
      const cell = cells[patch.cellIndex];
      if (!cell) {
        throw new Error(`cell XML index not found: para ${patch.para}, tableOrder ${patch.tableOrderInParagraph}, cell ${patch.cellIndex}`);
      }
      const start = paragraph.start + table.start + cell.start;
      const end = paragraph.start + table.start + cell.end;
      return {
        start,
        end,
        xml: replaceCellTextXml(cell.xml, patch.text, {
          templateParagraphXml: patch.templateParagraphXml,
          styleIds: patch.styleIds,
          cellStyle: patch.cellStyle,
        }),
      };
    });
    for (const patch of replacements.sort((a, b) => b.start - a.start)) {
      next = `${next.slice(0, patch.start)}${patch.xml}${next.slice(patch.end)}`;
    }
  }

  if (sectionParagraphPatches.length) {
    const uniqueParagraphPatches = [...new Map(sectionParagraphPatches.map((patch) => [`${patch.section}:${patch.para}`, patch])).values()];
    const bodyParagraphs = findTopLevelParagraphs(next);
    for (const patch of [...uniqueParagraphPatches].sort((a, b) => b.para - a.para)) {
      const paragraph = bodyParagraphs[patch.para];
      if (!paragraph) {
        throw new Error(`paragraph XML index not found: ${patch.para}`);
      }
      next = `${next.slice(0, paragraph.start)}${replaceParagraphTextXml(paragraph.xml, patch.text, { styleIds: patch.styleIds })}${next.slice(paragraph.end)}`;
    }
  }

  if (sectionParagraphInsertPatches.length) {
    const uniqueInsertPatches = [...new Map(sectionParagraphInsertPatches.map((patch) => [`${patch.section}:${patch.para}:${patch.opId}`, patch])).values()];
    const bodyParagraphs = findTopLevelParagraphs(next);
    for (const patch of [...uniqueInsertPatches].sort((a, b) => b.para - a.para)) {
      const paragraph = bodyParagraphs[patch.para];
      if (!paragraph) {
        throw new Error(`paragraph XML index not found for insert: ${patch.para}`);
      }
      next = `${next.slice(0, paragraph.start)}${insertParagraphTextAfterXml(paragraph.xml, patch.text, { styleIds: patch.styleIds })}${next.slice(paragraph.end)}`;
    }
  }

  for (const patch of sectionShapePatches) {
    next = removeRectTextBoxesByText(next, patch.texts);
  }

  for (const patch of sectionTextBoxPatches) {
    next = replaceRectTextBoxText(next, patch.replacements);
  }

  return next;
}

function extractCellXmlFromPackage(inputBytes, table, cellIndex) {
  const entries = readZip(inputBytes);
  const sectionName = `Contents/section${table.section}.xml`;
  const sectionXml = entries.get(sectionName)?.toString('utf8');
  assert.ok(sectionXml, `${sectionName} not found`);
  const paragraph = findTopLevelParagraphs(sectionXml)[table.para];
  assert.ok(paragraph, `paragraph XML index not found: ${table.para}`);
  const tableXml = findBlocks(paragraph.xml, 'tbl')[table.tableOrderInParagraph];
  assert.ok(tableXml, `table XML index not found: ${table.id}`);
  const cellXml = findBlocks(tableXml.xml, 'tc')[cellIndex];
  assert.ok(cellXml, `cell XML index not found: ${table.id} cell ${cellIndex}`);
  return cellXml.xml;
}

function extractParagraphXmlFromPackage(inputBytes, location) {
  const { section, paragraph } = normalizeParagraphLocation(location);
  assert.ok(paragraph !== undefined, `paragraph location is incomplete: ${JSON.stringify(location)}`);
  const entries = readZip(inputBytes);
  const sectionName = `Contents/section${section}.xml`;
  const sectionXml = entries.get(sectionName)?.toString('utf8');
  assert.ok(sectionXml, `${sectionName} not found`);
  const paragraphXml = findTopLevelParagraphs(sectionXml)[paragraph];
  assert.ok(paragraphXml, `paragraph XML index not found: ${paragraph}`);
  return paragraphXml.xml;
}

function firstCellParagraphXml(cellXml) {
  const subList = extractSubList(cellXml);
  return findBlocks(subList.inner, 'p')[0]?.xml ?? '';
}

function replaceTextInBody(doc, op) {
  const { section, para, offset = 0, length } = op.target.native;
  const count = length ?? doc.getParagraphLength(section, para);
  parseResult(doc.replaceText(section, para, offset, count, op.text), 'replaceText');
}

function clearCellWithApi(doc, table, cellIndex) {
  const paraCount = doc.getCellParagraphCount(table.section, table.para, table.control, cellIndex);
  for (let para = paraCount - 1; para >= 0; para -= 1) {
    const len = doc.getCellParagraphLength(table.section, table.para, table.control, cellIndex, para);
    if (len > 0) {
      parseResult(doc.deleteTextInCell(table.section, table.para, table.control, cellIndex, para, 0, len), 'deleteTextInCell');
    }
    if (para > 0) {
      parseResult(doc.mergeParagraphInCell(table.section, table.para, table.control, cellIndex, para), 'mergeParagraphInCell');
    }
  }
}

function setCellTextWithApi(doc, table, cellIndex, text) {
  clearCellWithApi(doc, table, cellIndex);
  const lines = String(text ?? '').split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      const previousLength = doc.getCellParagraphLength(table.section, table.para, table.control, cellIndex, index - 1);
      parseResult(doc.splitParagraphInCell(table.section, table.para, table.control, cellIndex, index - 1, previousLength), 'splitParagraphInCell');
    }
    if (line) {
      parseResult(doc.insertTextInCell(table.section, table.para, table.control, cellIndex, index, 0, line), 'insertTextInCell');
    }
  });
}

export class HwpxApiSession {
  constructor(inputBytes, options = {}) {
    this.inputBytes = Buffer.from(inputBytes);
    this.doc = new HwpDocument(new Uint8Array(this.inputBytes));
    this.revision = 1;
    this.saveMode = options.saveMode ?? 'preserve-package';
    this.cellPatches = [];
    this.paragraphPatches = [];
    this.paragraphInsertPatches = [];
    this.packagePatches = [];
    this.shapePatches = [];
    this.textBoxPatches = [];
  }

  exportJson() {
    const sections = [];
    const blocks = [];
    for (let section = 0; section < this.doc.getSectionCount(); section += 1) {
      const paragraphCount = this.doc.getParagraphCount(section);
      const paragraphs = [];
      for (let para = 0; para < paragraphCount; para += 1) {
        const text = readBodyParagraphText(this.doc, section, para);
        const id = `s${section}_p${para}`;
        paragraphs.push({ id, section, para, text, native: { section, para } });
        blocks.push({ id, kind: 'paragraph', text, native: { section, paragraph: para } });
      }
      sections.push({ section, paragraphCount, paragraphs });
    }

    const tables = discoverTables(this.doc);
    const styleGraph = readStyleGraph(this.doc);
    const objectGraph = readPackageObjects(this.inputBytes);
    const editableTargets = buildEditableTargets(sections, tables);
    return {
      revision: this.revision,
      sourceFormat: this.doc.getSourceFormat(),
      pageCount: this.doc.pageCount(),
      sections,
      blocks,
      tables,
      styleGraph,
      layoutGraph: {
        pageCount: this.doc.pageCount(),
        tables: tables.map((table) => ({
          id: table.id,
          section: table.section,
          paragraph: table.para,
          bbox: table.layout.bbox,
          cellCount: table.dims.cellCount,
        })),
      },
      objectGraph,
      editableTargets,
      fields: tryJson(() => this.doc.getFieldList()) ?? [],
      warnings: tryJson(() => this.doc.getValidationWarnings()) ?? null,
    };
  }

  readJson() {
    return this.exportJson();
  }

  analyze() {
    return this.exportJson();
  }

  targetMap() {
    return this.exportJson().editableTargets;
  }

  objectInventory() {
    return readPackageObjects(this.inputBytes);
  }

  findTable(predicate) {
    const tables = this.exportJson().tables;
    const table = tables.find(predicate);
    assert.ok(table, 'table not found');
    return table;
  }

  tableCell(table, { row, col, column, cellIndex, number, index }) {
    const resolvedCellIndex = cellIndex ?? number ?? index;
    const resolvedCol = col ?? column;
    const cell = resolvedCellIndex === undefined
      ? table.cells.find((item) => item.row === row && item.col === resolvedCol)
      : table.cells.find((item) => item.cellIndex === resolvedCellIndex);
    assert.ok(cell, `cell not found in ${table.id}: ${JSON.stringify({ row, col: resolvedCol, cellIndex: resolvedCellIndex })}`);
    return cell;
  }

  tableFromLocation(location = {}) {
    const tableId = location.tableId ?? location.table?.id;
    if (tableId) {
      const table = this.exportJson().tables.find((item) => item.id === tableId);
      assert.ok(table, `table target not found: ${tableId}`);
      return table;
    }
    const native = location.native ?? location.table?.native;
    assert.ok(native, `table location requires tableId or native table coordinates: ${JSON.stringify(location)}`);
    return this.findTable((item) => item.section === native.section
      && item.para === (native.paragraph ?? native.para)
      && item.control === native.control);
  }

  cellFromLocation(table, location = {}) {
    const cell = location.cell ?? location.tableCell ?? location.native ?? {};
    return this.tableCell(table, normalizeCellReference(cell));
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
        table: {
          id: table.id,
          dims: table.dims,
          native: table.native,
          layout: table.layout,
        },
        cell,
        style: cell.style,
        layout: cell.layout,
        allowedActions: cell.allowedActions,
      };
    }
    const { section, paragraph } = normalizeParagraphLocation(location);
    assert.ok(paragraph !== undefined, `paragraph location is incomplete: ${JSON.stringify(location)}`);
    const text = readBodyParagraphText(this.doc, section, paragraph);
    return {
      kind: 'paragraph',
      id: `s${section}_p${paragraph}`,
      location: { paragraph: { section, number: paragraph } },
      currentText: text,
      textLength: text.length,
      allowedActions: ['text.replaceParagraph', 'text.replace', 'style.applyText', 'paragraph.applyStyle', 'list.applyNumbering'],
      native: { section, paragraph },
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
    if (target.kind !== 'cell') {
      return { hash: hashString(target.currentText), basis: { kind: 'paragraph', textLength: target.currentText.length } };
    }
    return target.styleFingerprint ?? styleFingerprint(target.style);
  }

  cellTemplateParagraphXml(location) {
    const table = this.tableFromLocation(location);
    const cell = this.cellFromLocation(table, location);
    return firstCellParagraphXml(extractCellXmlFromPackage(this.inputBytes, table, cell.cellIndex));
  }

  paragraphStyleIds(location) {
    if (location?.tableId || location?.table || location?.cell || location?.tableCell) {
      return paragraphStyleIdsFromXml(this.cellTemplateParagraphXml(location));
    }
    return paragraphStyleIdsFromXml(extractParagraphXmlFromPackage(this.inputBytes, location));
  }

  cellOuterStyle(location) {
    const table = this.tableFromLocation(location);
    const cell = this.cellFromLocation(table, location);
    return cellOuterStyleFromXml(extractCellXmlFromPackage(this.inputBytes, table, cell.cellIndex));
  }

  resolveParagraphStyleIds(command = {}) {
    const explicit = normalizeStyleIds(command.styleIds ?? command.style ?? command.format);
    const sourceLocation = command.styleSource ?? command.source ?? command.from ?? command.cloneStyleFrom ?? command.sourceLocation;
    const source = sourceLocation ? this.paragraphStyleIds(sourceLocation) : {};
    return mergeStyleIds(source, explicit);
  }

  resolveCellStyle(command = {}) {
    const explicit = normalizeCellStyle(command.cellStyle ?? command.style ?? command.format);
    const sourceLocation = command.styleSource ?? command.source ?? command.from ?? command.cloneStyleFrom ?? command.sourceLocation;
    const source = sourceLocation ? this.cellOuterStyle(sourceLocation) : {};
    return mergeCellStyles(source, explicit);
  }

  resolveText(query, options = {}) {
    const rawQuery = String(query ?? '');
    assert.ok(rawQuery.length > 0, 'resolveText requires a non-empty query');
    const caseSensitive = options.caseSensitive ?? false;
    const hits = parseResult(this.doc.searchAllText(query, caseSensitive, options.includeCells ?? true), 'searchAllText');
    const matches = Array.isArray(hits) ? hits : hits.matches ?? [];
    const occurrence = options.occurrence ?? 1;
    const match = matches[occurrence - 1];
    if (match) {
      return match;
    }

    const source = caseSensitive ? rawQuery : rawQuery.toLowerCase();
    const jsonMatches = [];
    const json = this.exportJson();
    for (const block of json.blocks) {
      const haystack = caseSensitive ? block.text : block.text.toLowerCase();
      const offset = haystack.indexOf(source);
      if (offset !== -1) {
        jsonMatches.push({
          kind: 'paragraph',
          text: block.text,
          offset,
          range: {
            start: { nodeId: block.id, offset },
            end: { nodeId: block.id, offset: offset + String(query).length },
          },
          location: { paragraph: { section: block.native.section ?? 0, number: block.native.paragraph ?? block.native.para ?? 0 } },
          native: block.native,
        });
      }
    }
    for (const table of json.tables) {
      for (const cell of table.cells) {
        const haystack = caseSensitive ? cell.text : cell.text.toLowerCase();
        const offset = haystack.indexOf(source);
        if (offset !== -1) {
          jsonMatches.push({
            kind: 'cell',
            text: cell.text,
            offset,
            range: {
              start: { nodeId: cell.id, offset },
              end: { nodeId: cell.id, offset: offset + String(query).length },
            },
            location: cell.location,
            native: cell.native,
            tableId: table.id,
            cell: { number: cell.cellIndex, row: cell.row, column: cell.col },
          });
        }
      }
    }
    const jsonMatch = jsonMatches[occurrence - 1];
    assert.ok(jsonMatch, `text not found: ${query}`);
    return jsonMatch;
  }

  normalizeCommand(command, index = 0) {
    const key = commandKey(command);
    const opId = commandId(command, index);
    const location = commandLocation(command);
    const text = commandText(command);
    const tableId = command.tableId ?? location.tableId ?? location.table?.id;

    if (key === 'setcelltext' || key === 'tablewritecell' || key === 'tablewriterichcell') {
      return [{
        ...command,
        opId,
        op: 'setCellText',
        target: {
          tableId,
          native: location.native,
          tableCell: normalizeCellReference(command.cell ?? location.cell ?? location.tableCell ?? command.tableCell ?? location.native),
        },
        text,
        styleSource: command.styleSource ?? command.cloneStyleFrom ?? command.sourceLocation,
      }];
    }

    if (key === 'tablewritecells') {
      const cells = command.cells ?? command.content?.cells ?? [];
      assert.ok(Array.isArray(cells), 'table.writeCells requires cells array');
      return cells.map((cellCommand, cellIndex) => ({
        ...cellCommand,
        opId: commandId(cellCommand, cellIndex) === `command-${cellIndex + 1}`
          ? `${opId}-${cellIndex + 1}`
          : commandId(cellCommand, cellIndex),
        op: 'setCellText',
        target: {
          tableId: cellCommand.tableId ?? cellCommand.location?.tableId ?? tableId,
          native: cellCommand.location?.native ?? location.native,
          tableCell: normalizeCellReference(cellCommand.cell ?? cellCommand.location?.cell ?? cellCommand.tableCell ?? cellCommand),
        },
        text: commandText(cellCommand),
        fit: cellCommand.fit ?? command.fit,
        layout: cellCommand.layout ?? command.layout,
        fitOptions: cellCommand.fitOptions ?? command.fitOptions,
        styleSource: cellCommand.styleSource ?? cellCommand.cloneStyleFrom ?? command.styleSource ?? command.cloneStyleFrom,
      }));
    }

    if (key === 'replaceparagraphtext' || key === 'textreplaceparagraph') {
      const paragraph = normalizeParagraphLocation(location);
      return [{
        ...command,
        opId,
        op: 'replaceParagraphText',
        target: { native: paragraph },
        text,
      }];
    }

    if (key === 'insertparagraphafter' || key === 'textinsertparagraphafter' || key === 'textinsertafterparagraph') {
      const paragraph = normalizeParagraphLocation(location);
      return [{
        ...command,
        opId,
        op: 'insertParagraphAfter',
        target: { native: paragraph },
        text,
        styleSource: command.styleSource ?? command.cloneStyleFrom ?? command.sourceLocation,
      }];
    }

    if (key === 'replacetext' || key === 'textreplace') {
      return [{ ...command, opId, op: 'replaceText', text }];
    }

    if (key === 'listwritebullets' || key === 'listwrite' || key === 'listapplynumbering' || key === 'paragraphapplynumbering') {
      const listText = buildListText(command.items ?? command.content?.items ?? text, {
        ...command,
        numbered: command.numbered ?? key.includes('numbering'),
      });
      const hasCellTarget = tableId || location.cell || location.tableCell || command.cell || command.tableCell;
      if (hasCellTarget) {
        return [{
          ...command,
          opId,
          op: 'setCellText',
          target: {
            tableId,
            native: location.native,
            tableCell: normalizeCellReference(command.cell ?? location.cell ?? location.tableCell ?? command.tableCell ?? location.native),
          },
          text: listText,
          styleSource: command.styleSource ?? command.cloneStyleFrom ?? command.sourceLocation,
          styleIds: command.styleIds ?? command.style ?? command.format,
        }];
      }
      return [{
        ...command,
        opId,
        op: 'replaceParagraphText',
        target: { native: normalizeParagraphLocation(location) },
        text: listText,
        styleSource: command.styleSource ?? command.cloneStyleFrom ?? command.sourceLocation,
        styleIds: command.styleIds ?? command.style ?? command.format,
      }];
    }

    if (key === 'layoutfittext') {
      return [{ ...command, opId, op: 'layout.fitText', location, text, options: command.options ?? command.layout ?? command.fitOptions ?? {} }];
    }

    if (key === 'imagereplace' || key === 'objectreplaceimage' || key === 'chartreplaceimage') {
      return [{
        ...command,
        opId,
        op: 'image.replace',
        imageName: command.imageName ?? command.target?.imageName ?? command.target?.name ?? location.imageName ?? location.name,
        bytes: command.bytes,
        bytesBase64: command.bytesBase64,
        filePath: command.filePath,
      }];
    }

    if (key === 'imagegenerateandreplace' || key === 'objectgenerateandreplace' || key === 'chartgenerateandreplace') {
      return [{
        ...command,
        opId,
        op: 'image.generateAndReplace',
        imageName: command.imageName ?? command.target?.imageName ?? command.target?.name ?? location.imageName ?? location.name,
        generator: command.generator ?? command.image ?? command.chart ?? command.content ?? {},
      }];
    }

    if (key === 'objectdeletetextboxbytext' || key === 'objectdeletebytext' || key === 'shapedeletebytext') {
      const section = Number(command.section ?? command.target?.section ?? command.location?.section ?? 0);
      return [{
        ...command,
        opId,
        op: 'object.deleteTextBoxByText',
        section: Number.isFinite(section) ? section : 0,
        texts: normalizeTextList(command.texts ?? command.queries ?? command.text ?? command.query),
      }];
    }

    if (key === 'objectreplacetextboxtext' || key === 'shapereplacetext' || key === 'textboxreplacetext') {
      const section = Number(command.section ?? command.target?.section ?? command.location?.section ?? 0);
      return [{
        ...command,
        opId,
        op: 'object.replaceTextBoxText',
        section: Number.isFinite(section) ? section : 0,
        replacements: command.replacements ?? [{
          find: command.find ?? command.query ?? command.text,
          replaceWith: command.replaceWith ?? command.newText ?? command.value ?? '',
        }],
      }];
    }

    if (key === 'styleclone' || key === 'styleclonefromtarget') {
      return [{
        ...command,
        opId,
        op: 'style.cloneCellTextStyle',
        target: command.target ?? command.to ?? location,
        styleSource: command.styleSource ?? command.source ?? command.from ?? command.sourceLocation,
      }];
    }

    if (key === 'styleapplytext') {
      return [{
        ...command,
        opId,
        op: 'style.applyText',
        target: command.target ?? command.to ?? location,
        text: command.text ?? command.newText,
        styleSource: command.styleSource ?? command.source ?? command.from ?? command.sourceLocation,
        styleIds: command.styleIds ?? command.style ?? command.format,
      }];
    }

    if (key === 'paragraphapplystyle' || key === 'styleapplyparagraph') {
      return [{
        ...command,
        opId,
        op: 'paragraph.applyStyle',
        target: command.target ?? command.to ?? location,
        styleSource: command.styleSource ?? command.source ?? command.from ?? command.sourceLocation,
        styleIds: command.styleIds ?? command.style ?? command.format,
      }];
    }

    if (key === 'tableapplycellstyle' || key === 'cellapplystyle') {
      return [{
        ...command,
        opId,
        op: 'table.applyCellStyle',
        target: command.target ?? command.to ?? location,
        styleSource: command.styleSource ?? command.source ?? command.from ?? command.sourceLocation,
        cellStyle: command.cellStyle ?? command.style ?? command.format,
      }];
    }

    return [{ ...command, opId: command.opId ?? opId }];
  }

  apply(commands) {
    return this.commandsBatch(commands);
  }

  commandsBatch(ops) {
    const results = [];
    const normalizedOps = ops.flatMap((op, index) => this.normalizeCommand(op, index));
    for (const op of normalizedOps) {
      if (op.op === 'setCellText') {
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        const shouldFit = op.fit === true || op.layout?.fit === true || op.fitOptions;
        const fit = shouldFit ? this.fitText(op.target, op.text, op.fitOptions ?? op.layout ?? {}) : null;
        const text = fit?.text ?? op.text;
        const templateParagraphXml = op.styleSource ? this.cellTemplateParagraphXml(op.styleSource) : null;
        const styleIds = this.resolveParagraphStyleIds(op);
        setCellTextWithApi(this.doc, table, cell.cellIndex, text);
        this.cellPatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          cellIndex: cell.cellIndex,
          text,
          templateParagraphXml,
          styleIds,
          opId: op.opId,
        });
        results.push({ opId: op.opId, ok: true, target: cell.id, action: 'table.writeCell', fit });
      } else if (op.op === 'replaceParagraphText') {
        const { section, paragraph } = op.target.native;
        const length = this.doc.getParagraphLength(section, paragraph);
        const styleIds = this.resolveParagraphStyleIds(op);
        replaceTextInBody(this.doc, {
          target: { native: { section, para: paragraph, offset: 0, length } },
          text: op.text,
        });
        this.paragraphPatches.push({ section, para: paragraph, text: op.text, styleIds, opId: op.opId });
        results.push({ opId: op.opId, ok: true, target: `s${section}_p${paragraph}`, action: 'text.replaceParagraph' });
      } else if (op.op === 'insertParagraphAfter') {
        const { section, paragraph } = op.target.native;
        const styleIds = this.resolveParagraphStyleIds(op);
        this.paragraphInsertPatches.push({ section, para: paragraph, text: op.text, styleIds, opId: op.opId });
        results.push({ opId: op.opId, ok: true, target: `s${section}_p${paragraph}`, action: 'text.insertAfterParagraph' });
      } else if (op.op === 'replaceText') {
        replaceTextInBody(this.doc, op);
        results.push({ opId: op.opId, ok: true, action: 'text.replace' });
      } else if (op.op === 'layout.fitText') {
        const fit = this.fitText(op.location, op.text, op.options);
        results.push({ opId: op.opId, ok: true, changed: false, action: 'layout.fitText', fit });
      } else if (op.op === 'style.cloneCellTextStyle') {
        assert.ok(op.styleSource, 'style.clone requires source/styleSource location');
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        const target = this.inspectTarget(op.target);
        const templateParagraphXml = this.cellTemplateParagraphXml(op.styleSource);
        const styleIds = this.resolveParagraphStyleIds(op);
        setCellTextWithApi(this.doc, table, cell.cellIndex, target.currentText);
        this.cellPatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          cellIndex: cell.cellIndex,
          text: target.currentText,
          templateParagraphXml,
          styleIds,
          opId: op.opId,
        });
        results.push({ opId: op.opId, ok: true, target: cell.id, action: 'style.clone' });
      } else if (op.op === 'style.applyText' || op.op === 'paragraph.applyStyle') {
        const target = this.inspectTarget(op.target);
        const nextText = op.op === 'style.applyText' && op.text !== undefined ? op.text : target.currentText;
        const styleIds = this.resolveParagraphStyleIds(op);
        if (target.kind === 'cell') {
          const table = this.tableFromLocation(op.target);
          const cell = this.cellFromLocation(table, op.target);
          const templateParagraphXml = op.styleSource ? this.cellTemplateParagraphXml(op.styleSource) : null;
          setCellTextWithApi(this.doc, table, cell.cellIndex, nextText);
          this.cellPatches.push({
            section: table.section,
            para: table.para,
            tableOrderInParagraph: table.tableOrderInParagraph,
            cellIndex: cell.cellIndex,
            text: nextText,
            templateParagraphXml,
            styleIds,
            opId: op.opId,
          });
          results.push({ opId: op.opId, ok: true, target: cell.id, action: op.op });
        } else {
          const { section, paragraph } = target.native;
          const length = this.doc.getParagraphLength(section, paragraph);
          replaceTextInBody(this.doc, {
            target: { native: { section, para: paragraph, offset: 0, length } },
            text: nextText,
          });
          this.paragraphPatches.push({ section, para: paragraph, text: nextText, styleIds, opId: op.opId });
          results.push({ opId: op.opId, ok: true, target: target.id, action: op.op });
        }
      } else if (op.op === 'table.applyCellStyle') {
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        const target = this.inspectTarget(op.target);
        const cellStyle = this.resolveCellStyle(op);
        setCellTextWithApi(this.doc, table, cell.cellIndex, target.currentText);
        this.cellPatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          cellIndex: cell.cellIndex,
          text: target.currentText,
          cellStyle,
          opId: op.opId,
        });
        results.push({ opId: op.opId, ok: true, target: cell.id, action: 'table.applyCellStyle', cellStyle });
      } else if (op.op === 'image.replace') {
        assert.ok(op.imageName, 'image.replace requires imageName');
        let bytes = op.bytes;
        if (bytes && !Buffer.isBuffer(bytes)) {
          bytes = Buffer.from(bytes);
        } else if (!bytes && op.bytesBase64) {
          bytes = Buffer.from(op.bytesBase64, 'base64');
        } else if (!bytes && op.filePath) {
          bytes = readFileSync(op.filePath);
        }
        assert.ok(bytes && bytes.length > 0, 'image.replace requires bytes, bytesBase64, or filePath');
        this.packagePatches.push({ name: op.imageName, bytes: Buffer.from(bytes), opId: op.opId });
        results.push({ opId: op.opId, ok: true, target: op.imageName, action: 'image.replace', byteLength: bytes.length });
      } else if (op.op === 'image.generateAndReplace') {
        assert.ok(op.imageName, 'image.generateAndReplace requires imageName');
        assert.match(op.imageName, /\.png$/i, 'image.generateAndReplace currently requires a PNG package entry');
        const bytes = generatePngBytes(op.generator);
        this.packagePatches.push({ name: op.imageName, bytes, opId: op.opId });
        results.push({ opId: op.opId, ok: true, target: op.imageName, action: 'image.generateAndReplace', byteLength: bytes.length });
      } else if (op.op === 'object.deleteTextBoxByText') {
        assert.ok(op.texts?.length, 'object.deleteTextBoxByText requires texts.');
        this.shapePatches.push({ section: op.section ?? 0, texts: op.texts, opId: op.opId });
        results.push({ opId: op.opId, ok: true, action: 'object.deleteTextBoxByText', section: op.section ?? 0, textCount: op.texts.length });
      } else if (op.op === 'object.replaceTextBoxText') {
        assert.ok(op.replacements?.length, 'object.replaceTextBoxText requires replacements.');
        this.textBoxPatches.push({ section: op.section ?? 0, replacements: op.replacements, opId: op.opId });
        results.push({ opId: op.opId, ok: true, action: 'object.replaceTextBoxText', section: op.section ?? 0, replacementCount: op.replacements.length });
      } else {
        throw new Error(`unsupported HWPX API op: ${op.op}`);
      }
    }
    this.revision += 1;
    return { revision: this.revision, results };
  }

  qualityCheck(options = {}) {
    const json = this.exportJson();
    const issues = [];
    for (const table of json.tables) {
      for (const cell of table.cells) {
        const recommendedChars = cell.layout?.capacity?.recommendedChars;
        if (recommendedChars && cell.text.length > recommendedChars * 1.2) {
          issues.push({
            severity: 'warning',
            code: 'cell-overflow-risk',
            message: 'Cell text may exceed the available visual capacity.',
            location: cell.location,
            textLength: cell.text.length,
            recommendedChars,
          });
        }
        const maxCharsPerLine = cell.layout?.capacity?.maxCharsPerLine;
        if (maxCharsPerLine) {
          const longestLine = Math.max(0, ...String(cell.text ?? '').split('\n').map((line) => line.length));
          if (longestLine > maxCharsPerLine * 1.1) {
            issues.push({
              severity: 'warning',
              code: 'cell-line-overflow-risk',
              message: 'A cell line may be too long for the available width.',
              location: cell.location,
              longestLine,
              maxCharsPerLine,
            });
          }
        }
      }
    }
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
              message: 'Cell style fingerprint changed from the baseline.',
              location: currentCell.location,
              before: baselineCell.styleFingerprint.hash,
              after: currentCell.styleFingerprint.hash,
            });
          }
        }
      }
    }
    return {
      ok: issues.every((issue) => issue.severity !== 'error'),
      revision: this.revision,
      pageCount: json.pageCount,
      tableCount: json.tables.length,
      paragraphCount: json.sections.reduce((sum, section) => sum + section.paragraphCount, 0),
      objectSummary: {
        imageCount: json.objectGraph.images.length,
        pictureCount: json.objectGraph.pictures.length,
        chartCount: json.objectGraph.charts.length,
      },
      targetSummary: {
        paragraphTargets: json.editableTargets.paragraphs.length,
        cellTargets: json.editableTargets.cells.length,
      },
      issues,
      warnings: json.warnings,
    };
  }

  save() {
    if (this.saveMode === 'rhwp-export') {
      if (typeof this.doc.reflowLinesegs === 'function') {
        this.doc.reflowLinesegs();
      }
      const saved = Buffer.from(this.doc.exportHwpx());
      const reopened = new HwpDocument(new Uint8Array(saved));
      this.revision += 1;
      return { bytes: saved, revision: this.revision, validation: this.validationReport(reopened) };
    }

    if (!this.cellPatches.length && !this.paragraphPatches.length && !this.paragraphInsertPatches.length && !this.packagePatches.length && !this.shapePatches.length && !this.textBoxPatches.length) {
      return {
        bytes: Buffer.from(this.inputBytes),
        revision: this.revision,
        validation: this.validationReport(new HwpDocument(new Uint8Array(this.inputBytes))),
      };
    }

    const entries = readZip(this.inputBytes);
    const sectionIndexes = new Set([
      ...this.cellPatches.map((patch) => patch.section),
      ...this.paragraphPatches.map((patch) => patch.section),
      ...this.paragraphInsertPatches.map((patch) => patch.section),
      ...this.shapePatches.map((patch) => patch.section),
      ...this.textBoxPatches.map((patch) => patch.section),
    ]);
    for (const sectionIndex of sectionIndexes) {
      const sectionName = `Contents/section${sectionIndex}.xml`;
      const sectionXml = entries.get(sectionName)?.toString('utf8');
      assert.ok(sectionXml, `${sectionName} not found`);
      const nextSectionXml = patchSectionXml(
        sectionXml,
        sectionIndex,
        this.cellPatches,
        this.paragraphPatches,
        this.paragraphInsertPatches,
        this.shapePatches,
        this.textBoxPatches,
      );
      entries.set(sectionName, Buffer.from(nextSectionXml, 'utf8'));
    }
    for (const patch of this.packagePatches) {
      assert.ok(entries.has(patch.name), `package entry not found: ${patch.name}`);
      entries.set(patch.name, patch.bytes);
    }
    const saved = createZip([...entries.entries()]);
    const reopened = new HwpDocument(new Uint8Array(saved));
    this.revision += 1;
    return { bytes: saved, revision: this.revision, validation: this.validationReport(reopened) };
  }

  validationReport(doc = this.doc) {
    return {
      sourceFormat: doc.getSourceFormat(),
      pageCount: doc.pageCount(),
      sectionCount: doc.getSectionCount(),
      paragraphCount: doc.getParagraphCount(0),
      tables: discoverTables(doc).map((table) => ({
        id: table.id,
        section: table.section,
        para: table.para,
        control: table.control,
        dims: table.dims,
      })),
      warnings: tryJson(() => doc.getValidationWarnings()) ?? null,
    };
  }
}
