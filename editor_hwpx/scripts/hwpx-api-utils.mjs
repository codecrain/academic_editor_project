import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import initHwpx, { HwpDocument } from '@rhwp/core';
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
import {
  classifyHwpxCommands,
  overlayPreservedEntries,
  qualifyHwpxCandidate,
  restoreExportOmittedEmbeddedEntries,
} from './hwpx-package-policy.mjs';
import {
  resolveHwpxCommand,
  validateHwpxCommands,
} from './hwpx-command-catalog.mjs';
import { applyHwpxStructuralCommand } from './hwpx-structural-commands.mjs';
import { applyTrackedReplacement } from './hwpx-tracked-changes.mjs';
import { crc32, createZip, readZip } from './hwpx-zip.mjs';

export { createZip, readZip } from './hwpx-zip.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

let hwpxReady = null;

export async function initHwpxRuntime() {
  globalThis.measureTextWidth ??= (_font, text) => {
    let width = 0;
    for (const character of String(text ?? '')) {
      if (/\s/u.test(character)) width += 350;
      else if (/[\u0000-\u007f]/u.test(character)) width += 550;
      else width += 1000;
    }
    return width;
  };
  hwpxReady ??= initHwpx({
    module_or_path: readFileSync(path.join(
      repoRoot,
      'editor_hwpx',
      'node_modules',
      '@rhwp',
      'core',
      'rhwp_bg.wasm',
    )),
  });
  return hwpxReady;
}

export async function extractRhwpText(bytesLike, { maxTextChars = 200_000 } = {}) {
  if (!Number.isInteger(maxTextChars) || maxTextChars < 1) {
    throw new Error('maxTextChars must be a positive integer');
  }
  await initHwpxRuntime();
  const document = new HwpDocument(new Uint8Array(Buffer.from(bytesLike)));
  const lines = [];
  let collectedChars = 0;
  let paragraphCount = 0;
  let truncated = false;

  for (let section = 0; section < document.getSectionCount(); section += 1) {
    const sectionParagraphCount = document.getParagraphCount(section);
    paragraphCount += sectionParagraphCount;
    for (let paragraph = 0; paragraph < sectionParagraphCount; paragraph += 1) {
      let text = '';
      try {
        const length = document.getParagraphLength(section, paragraph);
        text = document.getTextRange(section, paragraph, 0, length);
      } catch {
        text = '';
      }
      if (!text) continue;
      const line = `s${section + 1}p${paragraph + 1}\t${text}`;
      const separatorLength = lines.length ? 1 : 0;
      const remaining = maxTextChars - collectedChars - separatorLength;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      lines.push(line.slice(0, remaining));
      collectedChars += separatorLength + Math.min(line.length, remaining);
      if (line.length > remaining) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  return {
    sectionCount: document.getSectionCount(),
    paragraphCount,
    text: lines.join('\n'),
    truncated,
  };
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

function decodeXmlText(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function xmlVisibleText(xml) {
  let withoutNestedTables = xml;
  const nestedTables = findAllBlocks(withoutNestedTables, 'tbl');
  for (const table of [...nestedTables].sort((a, b) => b.start - a.start)) {
    withoutNestedTables = `${withoutNestedTables.slice(0, table.start)}${withoutNestedTables.slice(table.end)}`;
  }
  return [...withoutNestedTables.matchAll(/<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>/g)]
    .map((match) => decodeXmlText(match[1].replace(/<[^>]+>/g, '')))
    .join('');
}

function readPackageCellStyle(cellXml) {
  const tc = cellXml.match(/<hp:tc\b[^>]*>/)?.[0] ?? '';
  const subList = cellXml.match(/<hp:subList\b[^>]*>/)?.[0] ?? '';
  const cellSize = cellXml.match(/<hp:cellSz\b[^>]*\/>/)?.[0] ?? '';
  const margin = cellXml.match(/<hp:cellMargin\b[^>]*\/>/)?.[0] ?? '';
  const paragraph = cellXml.match(/<hp:p\b[^>]*>/)?.[0] ?? '';
  const run = cellXml.match(/<hp:run\b[^>]*>/)?.[0] ?? '';
  return {
    cell: stripUndefined({
      borderFillId: integerAttribute(tc, 'borderFillIDRef'),
      verticalAlign: firstMatch(subList, /\bvertAlign="([^"]+)"/, null),
      width: integerAttribute(cellSize, 'width'),
      height: integerAttribute(cellSize, 'height'),
      leftMargin: integerAttribute(margin, 'left'),
      rightMargin: integerAttribute(margin, 'right'),
      topMargin: integerAttribute(margin, 'top'),
      bottomMargin: integerAttribute(margin, 'bottom'),
    }),
    paragraph: stripUndefined({
      paraPrIDRef: integerAttribute(paragraph, 'paraPrIDRef'),
    }),
    text: stripUndefined({
      charPrIDRef: integerAttribute(run, 'charPrIDRef'),
      fontSize: 1000,
    }),
    namedStyle: stripUndefined({
      id: integerAttribute(paragraph, 'styleIDRef'),
    }),
  };
}

function packageTableId(section, paragraph, tableXml, ordinal) {
  const nativeId = firstMatch(tableXml, /<hp:tbl\b[^>]*\bid="([^"]+)"/, null);
  return nativeId ? `xtbl_${nativeId}` : `xtbl_s${section}_p${paragraph}_${ordinal}`;
}

function discoverNestedPackageTables(inputBytes) {
  const entries = readZip(inputBytes);
  const tables = [];
  let cellGlobalStart = 0;
  const sections = [...entries.keys()]
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort();
  for (const sectionName of sections) {
    const section = Number(sectionName.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
    const sectionXml = entries.get(sectionName)?.toString('utf8') ?? '';
    const paragraphs = findTopLevelParagraphs(sectionXml);
    for (let para = 0; para < paragraphs.length; para += 1) {
      const allTables = findAllBlocks(paragraphs[para].xml, 'tbl').filter((table) => table.depth > 0);
      for (let ordinal = 0; ordinal < allTables.length; ordinal += 1) {
        const tableBlock = allTables[ordinal];
        const tableXml = tableBlock.xml;
        const id = packageTableId(section, para, tableXml, ordinal);
        const cellBlocks = findBlocks(tableXml, 'tc');
        const cells = cellBlocks.map((cellBlock, cellIndex) => {
          const cellXml = cellBlock.xml;
          const address = cellXml.match(/<hp:cellAddr\b[^>]*\/>/)?.[0] ?? '';
          const span = cellXml.match(/<hp:cellSpan\b[^>]*\/>/)?.[0] ?? '';
          const subList = extractSubList(cellXml);
          const paragraphsInCell = findBlocks(subList.inner, 'p').map((paragraphBlock, index) => ({
            index,
            length: xmlVisibleText(paragraphBlock.xml).length,
            text: xmlVisibleText(paragraphBlock.xml),
          }));
          const style = readPackageCellStyle(cellXml);
          const capacity = estimateTextCapacity(style, null);
          const row = integerAttribute(address, 'rowAddr', 0);
          const col = integerAttribute(address, 'colAddr', 0);
          return {
            id: `${id}_cell_${cellIndex}`,
            cellIndex,
            row,
            col,
            rowSpan: integerAttribute(span, 'rowSpan', 1),
            colSpan: integerAttribute(span, 'colSpan', 1),
            text: paragraphsInCell.map((item) => item.text).join('\n'),
            paragraphs: paragraphsInCell,
            location: { tableId: id, cell: { number: cellIndex, row, column: col } },
            style,
            styleFingerprint: styleFingerprint(style),
            layout: { bbox: null, capacity },
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
            native: {
              packageOnly: true,
              xmlTableId: id,
              section,
              paragraph: para,
              cellIndex,
            },
          };
        });
        tables.push({
          id,
          tableIndex: tables.length,
          cellGlobalStart,
          section,
          para,
          control: null,
          tableOrderInParagraph: null,
          packageOnly: true,
          xmlDepth: tableBlock.depth,
          dims: {
            rowCount: integerAttribute(tableXml.match(/<hp:tbl\b[^>]*>/)?.[0] ?? '', 'rowCnt', 0),
            colCount: integerAttribute(tableXml.match(/<hp:tbl\b[^>]*>/)?.[0] ?? '', 'colCnt', 0),
            cellCount: cells.length,
          },
          layout: { properties: null, bbox: null, cellBboxes: [] },
          native: { packageOnly: true, xmlTableId: id, section, paragraph: para },
          cells,
        });
        cellGlobalStart += cells.length;
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

function findAllBlocks(xml, tagName) {
  const blocks = [];
  const tag = tagName.replace(/^hp:/, '');
  const re = new RegExp(`<\\/?hp:${tag}\\b[^>]*\\/?>`, 'g');
  const stack = [];
  let match;
  while ((match = re.exec(xml))) {
    const raw = match[0];
    if (raw.startsWith('</')) {
      const opened = stack.pop();
      if (opened) {
        blocks.push({
          start: opened.start,
          end: re.lastIndex,
          depth: opened.depth,
          xml: xml.slice(opened.start, re.lastIndex),
        });
      }
    } else if (!raw.endsWith('/>')) {
      stack.push({ start: match.index, depth: stack.length });
    }
  }
  return blocks.sort((a, b) => a.start - b.start || b.end - a.end);
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

function integerAttribute(xml, name, fallback = null) {
  const value = firstMatch(xml, new RegExp(`\\b${name}="(\\d+)"`), null);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function setTagAttribute(tag, name, value) {
  const encoded = String(value);
  if (new RegExp(`\\b${name}="[^"]*"`).test(tag)) {
    return tag.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${encoded}"`);
  }
  const closing = tag.endsWith('/>') ? '/>' : '>';
  return `${tag.slice(0, -closing.length)} ${name}="${encoded}"${closing}`;
}

function patchCellRowGeometry(cellXml, {
  rowIndex,
  count,
  insertedHeight = 0,
  extendBoundarySpans = false,
}) {
  const address = cellXml.match(/<hp:cellAddr\b[^>]*\/>/)?.[0];
  if (!address) return cellXml;
  const rowAddr = integerAttribute(address, 'rowAddr');
  if (rowAddr === null) return cellXml;
  const span = cellXml.match(/<hp:cellSpan\b[^>]*\/>/)?.[0];
  const rowSpan = integerAttribute(span ?? '', 'rowSpan', 1);
  let next = cellXml;
  if (rowAddr >= rowIndex) {
    next = next.replace(address, setTagAttribute(address, 'rowAddr', rowAddr + count));
  } else if (
    rowAddr + rowSpan > rowIndex
    || (extendBoundarySpans && rowSpan > 1 && rowAddr + rowSpan === rowIndex)
  ) {
    if (span) {
      next = next.replace(span, setTagAttribute(span, 'rowSpan', rowSpan + count));
    }
    const size = next.match(/<hp:cellSz\b[^>]*\/>/)?.[0];
    const height = integerAttribute(size ?? '', 'height');
    if (size && height !== null && insertedHeight > 0) {
      next = next.replace(size, setTagAttribute(size, 'height', height + insertedHeight));
    }
  }
  return next;
}

function setRowAddress(rowXml, rowAddr) {
  return rowXml.replace(/<hp:cellAddr\b[^>]*\/>/g, (tag) => setTagAttribute(tag, 'rowAddr', rowAddr));
}

function clearRowText(rowXml) {
  let next = rowXml;
  const cells = findBlocks(next, 'tc');
  for (const cell of [...cells].sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, cell.start)}${replaceCellTextXml(cell.xml, '')}${next.slice(cell.end)}`;
  }
  return next;
}

function adjustCellZones(xml, rowIndex, count) {
  return xml.replace(/<hp:cellzone\b[^>]*\/>/g, (tag) => {
    const start = integerAttribute(tag, 'startRowAddr');
    const end = integerAttribute(tag, 'endRowAddr');
    let next = tag;
    if (start !== null && start >= rowIndex) {
      next = setTagAttribute(next, 'startRowAddr', start + count);
    }
    if (end !== null && end >= rowIndex) {
      next = setTagAttribute(next, 'endRowAddr', end + count);
    }
    return next;
  });
}

function insertTableRowsXml(tableXml, patch) {
  const rows = findBlocks(tableXml, 'tr');
  const rowIndex = Number(patch.rowIndex);
  const templateRow = Number(patch.templateRow);
  const count = Number(patch.count);
  assert.ok(Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex <= rows.length, `table.insertRows rowIndex out of range: ${rowIndex}`);
  assert.ok(Number.isInteger(templateRow) && templateRow >= 0 && templateRow < rows.length, `table.insertRows templateRow out of range: ${templateRow}`);
  assert.ok(Number.isInteger(count) && count >= 1 && count <= 20, `table.insertRows count out of range: ${count}`);

  const templateCells = findBlocks(rows[templateRow].xml, 'tc');
  const templateHeight = Math.max(0, ...templateCells.map((cell) => integerAttribute(cell.xml.match(/<hp:cellSz\b[^>]*\/>/)?.[0] ?? '', 'height', 0)));
  const insertedHeight = templateHeight * count;
  const adjustedRows = rows.map((row) => {
    let rowXml = row.xml;
    const cells = findBlocks(rowXml, 'tc');
    for (const cell of [...cells].sort((a, b) => b.start - a.start)) {
      rowXml = `${rowXml.slice(0, cell.start)}${patchCellRowGeometry(cell.xml, {
        rowIndex,
        count,
        insertedHeight,
        extendBoundarySpans: patch.extendBoundarySpans === true,
      })}${rowXml.slice(cell.end)}`;
    }
    return rowXml;
  });
  const insertedRows = Array.from({ length: count }, (_, offset) => {
    let rowXml = setRowAddress(rows[templateRow].xml, rowIndex + offset);
    if (patch.clearText !== false) rowXml = clearRowText(rowXml);
    return rowXml;
  });
  adjustedRows.splice(rowIndex, 0, ...insertedRows);

  let head = tableXml.slice(0, rows[0].start);
  const tail = tableXml.slice(rows.at(-1).end);
  head = head.replace(/<hp:tbl\b[^>]*>/, (tag) => setTagAttribute(tag, 'rowCnt', rows.length + count));
  if (insertedHeight > 0) {
    head = head.replace(/<hp:sz\b[^>]*\/>/, (tag) => {
      const height = integerAttribute(tag, 'height');
      return height === null ? tag : setTagAttribute(tag, 'height', height + insertedHeight);
    });
  }
  return adjustCellZones(`${head}${adjustedRows.join('')}${tail}`, rowIndex, count);
}

function setTableSizeXml(tableXml, patch) {
  return tableXml.replace(/<hp:sz\b[^>]*\/>/, (tag) => {
    let next = tag;
    if (patch.width !== undefined) next = setTagAttribute(next, 'width', patch.width);
    if (patch.height !== undefined) next = setTagAttribute(next, 'height', patch.height);
    return next;
  });
}

function setCellSizeXml(cellXml, patch) {
  return cellXml.replace(/<hp:cellSz\b[^>]*\/>/, (tag) => {
    let next = tag;
    if (patch.width !== undefined) next = setTagAttribute(next, 'width', patch.width);
    if (patch.height !== undefined) next = setTagAttribute(next, 'height', patch.height);
    return next;
  });
}

function replaceTableInOwningParagraph(paragraphXml, tableBlock, replacementTableXml, heightDelta = 0) {
  const owners = findAllBlocks(paragraphXml, 'p')
    .filter((block) => block.start <= tableBlock.start && block.end >= tableBlock.end)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start));
  const owner = owners[0];
  if (!owner) {
    return `${paragraphXml.slice(0, tableBlock.start)}${replacementTableXml}${paragraphXml.slice(tableBlock.end)}`;
  }

  const tableStart = tableBlock.start - owner.start;
  const tableEnd = tableBlock.end - owner.start;
  let ownerXml = `${owner.xml.slice(0, tableStart)}${replacementTableXml}${owner.xml.slice(tableEnd)}`;
  if (heightDelta !== 0) {
    const afterTable = tableStart + replacementTableXml.length;
    const tail = ownerXml.slice(afterTable);
    const lineSeg = tail.match(/<hp:lineseg\b[^>]*\/>/)?.[0];
    if (lineSeg) {
      const vertSize = integerAttribute(lineSeg, 'vertsize');
      const textHeight = integerAttribute(lineSeg, 'textheight');
      const baseline = integerAttribute(lineSeg, 'baseline');
      let resizedLineSeg = lineSeg;
      if (vertSize !== null) resizedLineSeg = setTagAttribute(resizedLineSeg, 'vertsize', vertSize + heightDelta);
      if (textHeight !== null) resizedLineSeg = setTagAttribute(resizedLineSeg, 'textheight', textHeight + heightDelta);
      if (baseline !== null && vertSize > 0) {
        resizedLineSeg = setTagAttribute(
          resizedLineSeg,
          'baseline',
          Math.round((vertSize + heightDelta) * (baseline / vertSize)),
        );
      }
      ownerXml = `${ownerXml.slice(0, afterTable)}${tail.replace(lineSeg, resizedLineSeg)}`;
    }
  }
  return `${paragraphXml.slice(0, owner.start)}${ownerXml}${paragraphXml.slice(owner.end)}`;
}

function resizeTableInOwningParagraph(paragraphXml, tableBlock, patch) {
  const sizeTag = tableBlock.xml.match(/<hp:sz\b[^>]*\/>/)?.[0] ?? '';
  const oldHeight = integerAttribute(sizeTag, 'height');
  const heightDelta = patch.height !== undefined && oldHeight !== null
    ? Number(patch.height) - oldHeight
    : 0;
  return replaceTableInOwningParagraph(
    paragraphXml,
    tableBlock,
    setTableSizeXml(tableBlock.xml, patch),
    heightDelta,
  );
}

function insertTableRowsInOwningParagraph(paragraphXml, tableBlock, patch) {
  const oldSizeTag = tableBlock.xml.match(/<hp:sz\b[^>]*\/>/)?.[0] ?? '';
  const oldHeight = integerAttribute(oldSizeTag, 'height', 0);
  const insertedTable = insertTableRowsXml(tableBlock.xml, patch);
  const newSizeTag = insertedTable.match(/<hp:sz\b[^>]*\/>/)?.[0] ?? '';
  const newHeight = integerAttribute(newSizeTag, 'height', oldHeight);
  const heightDelta = newHeight - oldHeight;
  return replaceTableInOwningParagraph(
    paragraphXml,
    tableBlock,
    insertedTable,
    heightDelta,
  );
}

function clonePictureXml(sourceXml, sectionXml, patch) {
  const pictureIds = [...sectionXml.matchAll(/<hp:pic\b[^>]*\bid="(\d+)"/g)].map((match) => Number(match[1]));
  const instanceIds = [...sectionXml.matchAll(/<hp:pic\b[^>]*\binstid="(\d+)"/g)].map((match) => Number(match[1]));
  const zOrders = [...sectionXml.matchAll(/<hp:pic\b[^>]*\bzOrder="(\d+)"/g)].map((match) => Number(match[1]));
  let next = sourceXml.replace(/<hp:pic\b[^>]*>/, (tag) => {
    let patched = setXmlAttribute(tag, 'id', Math.max(0, ...pictureIds) + 1);
    patched = setXmlAttribute(patched, 'instid', Math.max(0, ...instanceIds) + 1);
    patched = setXmlAttribute(patched, 'zOrder', patch.zOrder ?? (Math.max(-1, ...zOrders) + 1));
    return patched;
  });
  next = next.replace(/<hp:sz\b[^>]*\/>/, (tag) => {
    let patched = tag;
    if (patch.width !== undefined) patched = setTagAttribute(patched, 'width', patch.width);
    if (patch.height !== undefined) patched = setTagAttribute(patched, 'height', patch.height);
    return patched;
  });
  next = next.replace(/<hp:pos\b[^>]*\/>/, (tag) => {
    let patched = tag;
    if (patch.vertOffset !== undefined) patched = setTagAttribute(patched, 'vertOffset', patch.vertOffset);
    if (patch.horzOffset !== undefined) patched = setTagAttribute(patched, 'horzOffset', patch.horzOffset);
    return patched;
  });
  return next;
}

function insertPictureIntoCellXml(cellXml, sourcePictureXml, sectionXml, patch) {
  const subList = extractSubList(cellXml);
  const paragraphs = findBlocks(subList.inner, 'p');
  const paragraphIndex = patch.targetParagraphIndex ?? 0;
  const paragraph = paragraphs[paragraphIndex];
  assert.ok(paragraph, `image.cloneToCell targetParagraphIndex out of range: ${paragraphIndex}`);
  const pictureXml = clonePictureXml(sourcePictureXml, sectionXml, patch);
  let paragraphXml = paragraph.xml;
  if (/<hp:run\b[^>]*\/>/.test(paragraphXml)) {
    paragraphXml = paragraphXml.replace(/<hp:run\b([^>]*)\/>/, `<hp:run$1>${pictureXml}</hp:run>`);
  } else if (/<\/hp:run>/.test(paragraphXml)) {
    paragraphXml = paragraphXml.replace('</hp:run>', `${pictureXml}</hp:run>`);
  } else {
    paragraphXml = paragraphXml.replace(/(<hp:p\b[^>]*>)/, `$1<hp:run>${pictureXml}</hp:run>`);
  }
  const paragraphStart = subList.innerStart + paragraph.start;
  const paragraphEnd = subList.innerStart + paragraph.end;
  return `${cellXml.slice(0, paragraphStart)}${paragraphXml}${cellXml.slice(paragraphEnd)}`;
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
  let pOpen = sourcePOpen ?? fallbackPOpen
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
  const vertSize = Number(firstMatch(lineSeg, /vertsize="(\d+)"/, '1100'));
  const spacing = Number(firstMatch(lineSeg, /spacing="(\d+)"/, '660'));
  const startVertPos = Number(firstMatch(lineSeg, /vertpos="(\d+)"/, '0'));
  const horzSize = Number(firstMatch(lineSeg, /horzsize="(\d+)"/, '32000'));
  const vertStep = Math.max(1, vertSize + spacing);
  return {
    pOpen,
    charPrIDRef,
    lineSeg,
    vertSize,
    spacing,
    startVertPos,
    horzSize,
    vertStep,
  };
}

function buildLineSeg(template, textpos, vertpos) {
  return template.lineSeg
    .replace(/\btextpos="[^"]*"/, `textpos="${textpos}"`)
    .replace(/\bvertpos="[^"]*"/, `vertpos="${Math.max(0, Math.round(vertpos))}"`);
}

function visualTextUnits(text) {
  let units = 0;
  for (const character of String(text ?? '')) {
    if (/\s/u.test(character)) units += 0.35;
    else if (/[\u0000-\u007f]/u.test(character)) units += 0.55;
    else units += 1;
  }
  return units;
}

function wrappedLineStartOffsets(line, maxWidthUnits) {
  const source = String(line ?? '');
  if (!source || !maxWidthUnits || visualTextUnits(source) <= maxWidthUnits) {
    return [0];
  }
  const tokens = [...source.matchAll(/\S+\s*/g)];
  if (!tokens.length) return [0];
  const offsets = [tokens[0].index ?? 0];
  let lineWidth = visualTextUnits(tokens[0][0]);
  for (const token of tokens.slice(1)) {
    const tokenWidth = visualTextUnits(token[0]);
    if (lineWidth > 0 && lineWidth + tokenWidth > maxWidthUnits) {
      offsets.push(token.index ?? 0);
      lineWidth = tokenWidth;
    } else {
      lineWidth += tokenWidth;
    }
  }
  return offsets;
}

function buildParagraphXml(line, template, startVertPos = template.startVertPos) {
  // HWP units track glyph height closely. Full-width Korean/CJK characters use
  // roughly one height unit while Latin letters, digits, and spaces are narrower.
  // A weighted capacity avoids both Korean overflow and overly conservative
  // wrapping of mixed address/amount text.
  const maxWidthUnits = Math.max(4, (template.horzSize / Math.max(1, template.vertSize)) * 1.05);
  const offsets = wrappedLineStartOffsets(line, maxWidthUnits);
  const text = escapeXmlText(line);
  const lineSegs = offsets.map((textpos, index) => (
    buildLineSeg(template, textpos, startVertPos + (index * template.vertStep))
  )).join('');
  return {
    xml: `${template.pOpen}<hp:run charPrIDRef="${template.charPrIDRef}"><hp:t>${text}</hp:t></hp:run><hp:linesegarray>${lineSegs}</hp:linesegarray></hp:p>`,
    lineCount: offsets.length,
    nextVertPos: startVertPos + (offsets.length * template.vertStep),
    maxBottom: startVertPos + ((offsets.length - 1) * template.vertStep) + template.vertSize,
  };
}

function cloneParagraphTemplateXml(paragraphXml, styleIds, startVertPos) {
  const lineSegs = [...paragraphXml.matchAll(/<hp:lineseg\b[^>]*\/>/g)].map((match) => match[0]);
  if (!lineSegs.length) return null;
  const firstVertPos = Number(firstMatch(lineSegs[0], /\bvertpos="(\d+)"/, '0'));
  const delta = startVertPos - firstVertPos;
  const xml = applyParagraphStyleIdsXml(
    paragraphXml.replace(/<hp:lineseg\b[^>]*\/>/g, (tag) => {
      const vertPos = Number(firstMatch(tag, /\bvertpos="(\d+)"/, '0'));
      return tag.replace(/\bvertpos="[^"]*"/, `vertpos="${Math.max(0, vertPos + delta)}"`);
    }),
    styleIds,
  );
  const last = lineSegs.at(-1);
  const lastVertPos = Number(firstMatch(last, /\bvertpos="(\d+)"/, '0')) + delta;
  const vertSize = Number(firstMatch(last, /\bvertsize="(\d+)"/, '1100'));
  const spacing = Number(firstMatch(last, /\bspacing="(\d+)"/, '660'));
  return {
    xml,
    lineCount: lineSegs.length,
    nextVertPos: lastVertPos + vertSize + spacing,
    maxBottom: lastVertPos + vertSize,
  };
}

export function replaceLeadingTabTemplateTextXml(paragraphXml, line) {
  const desiredText = String(line ?? '');
  const leadingTabs = desiredText.match(/^\t+/u)?.[0].length ?? 0;
  const tabControls = [...paragraphXml.matchAll(/<hp:tab\b[^>]*\/>/g)].map((match) => match[0]);
  if (!tabControls.length || leadingTabs !== tabControls.length) return null;

  let replaced = false;
  const nextXml = paragraphXml.replace(
    /<hp:t\b([^>]*)>([\s\S]*?)<\/hp:t>/,
    (match, attrs, inner) => {
      if (!/<hp:tab\b[^>]*\/>/.test(inner)) return match;
      const unsupportedControls = inner
        .replace(/<hp:tab\b[^>]*\/>/g, '')
        .match(/<[^>]+>/);
      if (unsupportedControls) return match;
      replaced = true;
      return `<hp:t${attrs}>${tabControls.join('')}${escapeXmlText(desiredText.slice(leadingTabs))}</hp:t>`;
    },
  );
  return replaced ? nextXml : null;
}

function comparableParagraphText(value) {
  return String(value ?? '').replace(/\s+/gu, '');
}

const CELL_DRAWING_CONTROL_PATTERN = /<hp:(?:pic|container)\b/;

function replaceCellTextXml(cellXml, text, options = {}) {
  if (CELL_DRAWING_CONTROL_PATTERN.test(cellXml)) {
    const textPatched = replaceFirstInlineTextXml(cellXml, text);
    const stylePatched = applyParagraphStyleIdsXml(textPatched, options.styleIds);
    return applyCellOuterStyleXml(stylePatched, options.cellStyle);
  }
  const subList = extractSubList(cellXml);
  const paragraphs = findBlocks(subList.inner, 'p');
  const lines = String(text ?? '').split('\n');
  const logicalLines = lines.length ? lines : [''];
  let cursor = null;
  const nextParagraphs = logicalLines.map((line, index) => {
    const explicitTemplateIndex = options.paragraphTemplateIndices?.[index];
    const sourceXml = explicitTemplateIndex !== undefined && explicitTemplateIndex !== null
      ? paragraphs[Number(explicitTemplateIndex)]?.xml ?? ''
      : options.templateParagraphXml
      ?? paragraphs[index]?.xml
      ?? paragraphs.at(-1)?.xml
      ?? '';
    const fallbackXml = paragraphs[index]?.xml ?? paragraphs.at(-1)?.xml ?? '';
    const paragraphStyleIds = options.paragraphStyleIds?.[index] ?? options.styleIds;
    const template = paragraphTemplateFromXml(sourceXml, fallbackXml, paragraphStyleIds);
    if (cursor === null) cursor = template.startVertPos;
    if (explicitTemplateIndex !== undefined && explicitTemplateIndex !== null
      && comparableParagraphText(xmlVisibleText(sourceXml)) === comparableParagraphText(line)) {
      const cloned = cloneParagraphTemplateXml(sourceXml, paragraphStyleIds, cursor);
      if (cloned) {
        cursor = cloned.nextVertPos;
        return cloned.xml;
      }
    }
    if (explicitTemplateIndex !== undefined && explicitTemplateIndex !== null) {
      const tabPreservingXml = replaceLeadingTabTemplateTextXml(sourceXml, line);
      const cloned = tabPreservingXml
        ? cloneParagraphTemplateXml(tabPreservingXml, paragraphStyleIds, cursor)
        : null;
      if (cloned) {
        cursor = cloned.nextVertPos;
        return cloned.xml;
      }
    }
    const built = buildParagraphXml(line, template, cursor);
    cursor = built.nextVertPos;
    return built.xml;
  }).join('');
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
  const sourceLineSegs = [...paragraphXml.matchAll(/<hp:lineseg\b[^>]*\/>/g)]
    .map((match) => match[0]);
  const sourceLastLineSeg = sourceLineSegs.at(-1);
  const sourceLastVertPos = Number(firstMatch(
    sourceLastLineSeg ?? '',
    /\bvertpos="(\d+)"/,
    String(template.startVertPos),
  ));
  const sourceLastVertSize = Number(firstMatch(
    sourceLastLineSeg ?? '',
    /\bvertsize="(\d+)"/,
    String(template.vertSize),
  ));
  const sourceLastSpacing = Number(firstMatch(
    sourceLastLineSeg ?? '',
    /\bspacing="(\d+)"/,
    String(template.spacing),
  ));
  let cursor = options.startVertPos
    ?? (sourceLastVertPos + sourceLastVertSize + sourceLastSpacing);
  const inserted = (lines.length ? lines : ['']).map((line, index) => {
    let built = buildParagraphXml(line, template, cursor);
    if (
      (
        index === 0
        && options.ensureVisible === true
        && sourceLineSegs.length === 0
      )
      || (
        Number.isFinite(options.pageBodyHeight)
        && options.pageBodyHeight > 0
        && built.maxBottom > options.pageBodyHeight
      )
    ) {
      const pageBreakTemplate = {
        ...template,
        pOpen: setXmlAttribute(template.pOpen, 'pageBreak', 1),
      };
      built = buildParagraphXml(line, pageBreakTemplate, 0);
    }
    cursor = built.nextVertPos;
    return built.xml;
  }).join('');
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

function patchSectionXml(
  sectionXml,
  sectionIndex,
  cellPatches,
  paragraphPatches,
  paragraphInsertPatches = [],
  paragraphDeletePatches = [],
  tableRowInsertPatches = [],
  tableSizePatches = [],
  cellSizePatches = [],
  pictureClonePatches = [],
  shapePatches = [],
  textBoxPatches = [],
) {
  let next = sectionXml;
  const sectionCellPatches = cellPatches.filter((patch) => patch.section === sectionIndex);
  const sectionParagraphPatches = paragraphPatches.filter((patch) => patch.section === sectionIndex);
  const sectionParagraphInsertPatches = paragraphInsertPatches.filter((patch) => patch.section === sectionIndex);
  const sectionParagraphDeletePatches = paragraphDeletePatches.filter((patch) => patch.section === sectionIndex);
  const sectionTableRowInsertPatches = tableRowInsertPatches.filter((patch) => patch.section === sectionIndex);
  const sectionTableSizePatches = tableSizePatches.filter((patch) => patch.section === sectionIndex);
  const sectionCellSizePatches = cellSizePatches.filter((patch) => patch.section === sectionIndex);
  const sectionPictureClonePatches = pictureClonePatches.filter((patch) => patch.section === sectionIndex);
  const sectionShapePatches = shapePatches.filter((patch) => patch.section === sectionIndex);
  const sectionTextBoxPatches = textBoxPatches.filter((patch) => patch.section === sectionIndex);

  if (sectionTableRowInsertPatches.length) {
    for (const patch of sectionTableRowInsertPatches) {
      const paragraphs = findTopLevelParagraphs(next);
      const paragraph = paragraphs[patch.para];
      if (!paragraph) {
        throw new Error(`paragraph XML index not found for table row insert: ${patch.para}`);
      }
      const tables = patch.xmlTableId
        ? findAllBlocks(paragraph.xml, 'tbl')
        : findBlocks(paragraph.xml, 'tbl');
      const table = patch.xmlTableId
        ? tables.find((block, ordinal) => packageTableId(patch.section, patch.para, block.xml, ordinal) === patch.xmlTableId)
        : tables[patch.tableOrderInParagraph];
      if (!table) {
        throw new Error(`table XML index not found for row insert: para ${patch.para}, tableOrder ${patch.tableOrderInParagraph}`);
      }
      const inserted = insertTableRowsInOwningParagraph(paragraph.xml, table, patch);
      next = `${next.slice(0, paragraph.start)}${inserted}${next.slice(paragraph.end)}`;
    }
  }

  if (sectionCellPatches.length) {
    const uniqueCellPatches = [
      ...new Map(sectionCellPatches.map((patch) => [
        `${patch.section}:${patch.para}:${patch.xmlTableId ?? patch.tableOrderInParagraph}:${patch.cellIndex}`,
        patch,
      ])).values(),
    ];
    const paragraphs = findTopLevelParagraphs(next);
    const replacements = uniqueCellPatches.map((patch) => {
      const paragraph = paragraphs[patch.para];
      if (!paragraph) {
        throw new Error(`paragraph XML index not found for table patch: ${patch.para}`);
      }
      const tables = patch.xmlTableId
        ? findAllBlocks(paragraph.xml, 'tbl')
        : findBlocks(paragraph.xml, 'tbl');
      const table = patch.xmlTableId
        ? tables.find((block, ordinal) => packageTableId(patch.section, patch.para, block.xml, ordinal) === patch.xmlTableId)
        : tables[patch.tableOrderInParagraph];
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
          paragraphStyleIds: patch.paragraphStyleIds,
          paragraphTemplateIndices: patch.paragraphTemplateIndices,
          cellStyle: patch.cellStyle,
        }),
      };
    });
    for (const patch of replacements.sort((a, b) => b.start - a.start)) {
      next = `${next.slice(0, patch.start)}${patch.xml}${next.slice(patch.end)}`;
    }
  }

  if (sectionTableSizePatches.length) {
    // Table-size edits may target an outer table and one of its nested tables in
    // the same paragraph. Building all replacements from one stale XML snapshot
    // makes the later outer-table replacement overwrite the nested-table edit.
    // Re-resolve each target against the latest XML so overlapping edits compose.
    for (const patch of sectionTableSizePatches) {
      const paragraphs = findTopLevelParagraphs(next);
      const paragraph = paragraphs[patch.para];
      if (!paragraph) throw new Error(`paragraph XML index not found for table size: ${patch.para}`);
      const tables = patch.xmlTableId ? findAllBlocks(paragraph.xml, 'tbl') : findBlocks(paragraph.xml, 'tbl');
      const table = patch.xmlTableId
        ? tables.find((block, ordinal) => packageTableId(patch.section, patch.para, block.xml, ordinal) === patch.xmlTableId)
        : tables[patch.tableOrderInParagraph];
      if (!table) throw new Error(`table XML index not found for table size: ${patch.xmlTableId ?? patch.tableOrderInParagraph}`);
      const resized = resizeTableInOwningParagraph(paragraph.xml, table, patch);
      next = `${next.slice(0, paragraph.start)}${resized}${next.slice(paragraph.end)}`;
    }
  }

  if (sectionCellSizePatches.length) {
    for (const patch of sectionCellSizePatches) {
      const paragraphs = findTopLevelParagraphs(next);
      const paragraph = paragraphs[patch.para];
      if (!paragraph) throw new Error(`paragraph XML index not found for cell size: ${patch.para}`);
      const tables = patch.xmlTableId ? findAllBlocks(paragraph.xml, 'tbl') : findBlocks(paragraph.xml, 'tbl');
      const table = patch.xmlTableId
        ? tables.find((block, ordinal) => packageTableId(patch.section, patch.para, block.xml, ordinal) === patch.xmlTableId)
        : tables[patch.tableOrderInParagraph];
      if (!table) throw new Error(`table XML index not found for cell size: ${patch.xmlTableId ?? patch.tableOrderInParagraph}`);
      const cell = findBlocks(table.xml, 'tc')[patch.cellIndex];
      if (!cell) throw new Error(`cell XML index not found for cell size: ${patch.cellIndex}`);
      const resizedCellXml = setCellSizeXml(cell.xml, patch);
      const start = paragraph.start + table.start + cell.start;
      const end = paragraph.start + table.start + cell.end;
      next = `${next.slice(0, start)}${resizedCellXml}${next.slice(end)}`;
    }
  }

  if (sectionPictureClonePatches.length) {
    for (const patch of sectionPictureClonePatches) {
      const paragraphs = findTopLevelParagraphs(next);
      const paragraph = paragraphs[patch.para];
      if (!paragraph) throw new Error(`paragraph XML index not found for picture clone: ${patch.para}`);
      const tables = patch.xmlTableId ? findAllBlocks(paragraph.xml, 'tbl') : findBlocks(paragraph.xml, 'tbl');
      const table = patch.xmlTableId
        ? tables.find((block, ordinal) => packageTableId(patch.section, patch.para, block.xml, ordinal) === patch.xmlTableId)
        : tables[patch.tableOrderInParagraph];
      if (!table) throw new Error(`table XML index not found for picture clone: ${patch.xmlTableId ?? patch.tableOrderInParagraph}`);
      const cells = findBlocks(table.xml, 'tc');
      const cell = cells[patch.cellIndex];
      if (!cell) throw new Error(`cell XML index not found for picture clone: ${patch.cellIndex}`);
      const cellXml = insertPictureIntoCellXml(cell.xml, patch.sourcePictureXml, next, patch);
      const start = paragraph.start + table.start + cell.start;
      const end = paragraph.start + table.start + cell.end;
      next = `${next.slice(0, start)}${cellXml}${next.slice(end)}`;
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
    for (const patch of [...uniqueInsertPatches].sort((a, b) => b.para - a.para)) {
      const bodyParagraphs = findTopLevelParagraphs(next);
      const paragraph = bodyParagraphs[patch.para];
      if (!paragraph) {
        throw new Error(`paragraph XML index not found for insert: ${patch.para}`);
      }
      next = `${next.slice(0, paragraph.start)}${insertParagraphTextAfterXml(paragraph.xml, patch.text, {
        templateParagraphXml: patch.templateParagraphXml,
        styleIds: patch.styleIds,
        pageBodyHeight: sectionPageBodyHeight(next),
        ensureVisible: patch.ensureVisible,
      })}${next.slice(paragraph.end)}`;
    }
  }

  for (const patch of sectionShapePatches) {
    next = removeRectTextBoxesByText(next, patch.texts);
  }

  for (const patch of sectionTextBoxPatches) {
    next = replaceRectTextBoxText(next, patch.replacements);
  }

  if (sectionParagraphDeletePatches.length) {
    const paragraphNumbers = [...new Set(sectionParagraphDeletePatches.flatMap((patch) => patch.paras))]
      .sort((a, b) => b - a);
    const bodyParagraphs = findTopLevelParagraphs(next);
    assert.ok(bodyParagraphs.length - paragraphNumbers.length >= 1, 'text.deleteParagraphs must leave at least one paragraph in each section');
    for (const para of paragraphNumbers) {
      const paragraph = bodyParagraphs[para];
      if (!paragraph) {
        throw new Error(`paragraph XML index not found for delete: ${para}`);
      }
      next = `${next.slice(0, paragraph.start)}${next.slice(paragraph.end)}`;
    }
  }

  return next;
}

function sectionPageBodyHeight(sectionXml) {
  const pageHeight = Number(firstMatch(
    sectionXml,
    /<hp:pagePr\b[^>]*\bheight="(\d+)"/,
    '0',
  ));
  const marginTag = sectionXml.match(/<hp:margin\b[^>]*\/>/)?.[0] ?? '';
  const reserved = ['top', 'bottom', 'header', 'footer']
    .map((name) => Number(firstMatch(
      marginTag,
      new RegExp(`\\b${name}="(\\d+)"`),
      '0',
    )))
    .reduce((sum, value) => sum + value, 0);
  const bodyHeight = pageHeight - reserved;
  return Number.isFinite(bodyHeight) && bodyHeight > 0 ? bodyHeight : undefined;
}

function extractCellXmlFromPackage(inputBytes, table, cellIndex) {
  const entries = readZip(inputBytes);
  const sectionName = `Contents/section${table.section}.xml`;
  const sectionXml = entries.get(sectionName)?.toString('utf8');
  assert.ok(sectionXml, `${sectionName} not found`);
  const paragraph = findTopLevelParagraphs(sectionXml)[table.para];
  assert.ok(paragraph, `paragraph XML index not found: ${table.para}`);
  const tableXml = table.packageOnly
    ? findAllBlocks(paragraph.xml, 'tbl').find((block, ordinal) => packageTableId(table.section, table.para, block.xml, ordinal) === table.id)
    : findBlocks(paragraph.xml, 'tbl')[table.tableOrderInParagraph];
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

function extractPictureXmlFromPackage(inputBytes, pictureId) {
  const match = String(pictureId ?? '').match(/^pic_(\d+)$/);
  assert.ok(match, `invalid picture ID: ${pictureId}`);
  const targetIndex = Number(match[1]);
  const entries = readZip(inputBytes);
  let index = 0;
  for (const sectionName of [...entries.keys()].filter((name) => /^Contents\/section\d+\.xml$/i.test(name)).sort()) {
    const sectionXml = entries.get(sectionName)?.toString('utf8') ?? '';
    for (const picture of findAllBlocks(sectionXml, 'pic')) {
      if (index === targetIndex) return picture.xml;
      index += 1;
    }
  }
  throw new Error(`picture not found: ${pictureId}`);
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

function assertSupportedHwpxPackage(inputBytes) {
  const bytes = Buffer.from(inputBytes);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return;
  }
  let entries;
  try {
    entries = readZip(bytes);
  } catch {
    return;
  }
  const manifest = entries.get('META-INF/manifest.xml')?.toString('utf8') ?? '';
  if (/<(?:[\w.-]+:)?encryption-data\b/i.test(manifest)) {
    const error = new Error('unsupported_encrypted_hwpx: 배포용 또는 암호화된 HWPX 패키지는 암호 해제 없이 편집할 수 없습니다.');
    error.code = 'unsupported_encrypted_hwpx';
    throw error;
  }
}

function structuralBatchError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function verifyExpectedRunStyle(target, result, propertiesAt) {
  if (!result?.expectedRunStyle || !result?.expectedRunRange) return;
  const expected = result.expectedRunStyle;
  const range = result.expectedRunRange;
  const offsets = [...new Set([range.start, Math.max(range.start, range.end - 1)])];
  const aliases = {
    fontSizePt: ['fontSize', value => Number(value) * 100, value => value],
    textColor: [
      'textColor',
      value => String(value).toLowerCase(),
      value => String(value).toLowerCase(),
    ],
  };
  for (const offset of offsets) {
    const properties = tryJson(() => propertiesAt(offset));
    for (const [field, expectedValue] of Object.entries(expected)) {
      const identity = value => value;
      const [actualField, expectedTransform, actualTransform] =
        aliases[field] ?? [field, identity, identity];
      if (!properties
        || actualTransform(properties[actualField]) !== expectedTransform(expectedValue)) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'Structural run formatting did not survive reopening exactly.',
          {
            target,
            offset,
            field,
            expected: expectedTransform(expectedValue),
            actual: properties?.[actualField],
          },
        );
      }
    }
  }
}

export function verifyStructuralTarget(session, target, result = null) {
  if (!target || typeof target !== 'object') return;
  if (target.kind === 'paragraph') {
    const sectionCount = session.doc.getSectionCount();
    if (target.sectionIndex >= sectionCount
      || target.paragraphIndex >= session.doc.getParagraphCount(target.sectionIndex)) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural paragraph target was not found after reopening the candidate.',
        { target },
      );
    }
    if (result?.expectedText !== undefined) {
      const text = readBodyParagraphText(
        session.doc,
        target.sectionIndex,
        target.paragraphIndex,
      );
      if (text !== result.expectedText) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'A structural paragraph did not preserve its requested text after reopening.',
          { target, expectedText: result.expectedText, text },
        );
      }
    }
    if (result?.expectedStyleId !== undefined) {
      const style = tryJson(() => session.doc.getStyleAt(
        target.sectionIndex,
        target.paragraphIndex,
      ));
      if (!style || style.id !== result.expectedStyleId) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'A structural paragraph did not preserve its cloned style after reopening.',
          { target, expectedStyleId: result.expectedStyleId, style },
        );
      }
    }
    if (result?.expectedParaShapeId !== undefined) {
      const paragraphStyle = tryJson(() => session.doc.getParaPropertiesAt(
        target.sectionIndex,
        target.paragraphIndex,
      ));
      if (!paragraphStyle || paragraphStyle.paraShapeId !== result.expectedParaShapeId) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'A structural paragraph did not preserve its cloned paragraph shape after reopening.',
          { target, expectedParaShapeId: result.expectedParaShapeId, paragraphStyle },
        );
      }
    }
    if (result?.expectedCharShapeId !== undefined && result?.expectedText?.length > 0) {
      const characterStyle = tryJson(() => session.doc.getCharPropertiesAt(
        target.sectionIndex,
        target.paragraphIndex,
        0,
      ));
      if (!characterStyle || characterStyle.charShapeId !== result.expectedCharShapeId) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'A structural paragraph did not preserve its cloned character shape after reopening.',
          { target, expectedCharShapeId: result.expectedCharShapeId, characterStyle },
        );
      }
    }
    verifyExpectedRunStyle(target, result, offset => session.doc.getCharPropertiesAt(
      target.sectionIndex,
      target.paragraphIndex,
      offset,
    ));
    return;
  }
  if (target.kind === 'table' || target.kind === 'tableCaption') {
    const table = discoverTables(session.doc).find(item =>
      item.section === target.sectionIndex
      && item.para === target.paragraphIndex
      && item.control === target.controlIndex);
    if (!table) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural table target was not found after reopening the candidate.',
        { target },
      );
    }
    if (target.kind === 'tableCaption') {
      const properties = tryJson(() => session.doc.getTableProperties(
        target.sectionIndex,
        target.paragraphIndex,
        target.controlIndex,
      ));
      if (!properties || properties.hasCaption !== true) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISSING',
          'A structural table caption did not survive reopening the candidate.',
          { target, properties },
        );
      }
      const paragraphs = [];
      try {
        const paragraphCount = session.doc.getCellParagraphCount(
          target.sectionIndex,
          target.paragraphIndex,
          target.controlIndex,
          65534,
        );
        for (let paragraphIndex = 0; paragraphIndex < paragraphCount; paragraphIndex += 1) {
          const length = session.doc.getCellParagraphLength(
            target.sectionIndex,
            target.paragraphIndex,
            target.controlIndex,
            65534,
            paragraphIndex,
          );
          paragraphs.push(session.doc.getTextInCell(
            target.sectionIndex,
            target.paragraphIndex,
            target.controlIndex,
            65534,
            paragraphIndex,
            0,
            length,
          ));
        }
      } catch {
        paragraphs.length = 0;
      }
      const captionText = paragraphs.join('\n');
      if (result?.expectedCaptionText !== undefined
        && captionText !== result.expectedCaptionText) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'A structural table caption text did not survive reopening exactly.',
          { target, expectedCaptionText: result.expectedCaptionText, captionText },
        );
      }
    }
    return;
  }
  if (target.kind === 'image') {
    const properties = tryJson(() => session.doc.getPictureProperties(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
    ));
    if (!properties) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural image target was not found after reopening the candidate.',
        { target },
      );
    }
    return;
  }
  if (target.kind === 'section') {
    const pageDef = tryJson(() => session.doc.getPageDef(target.sectionIndex));
    if (!pageDef) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural section target was not found after reopening the candidate.',
        { target },
      );
    }
    return;
  }
  if (target.kind === 'headerFooter') {
    const applyTo = { both: 0, even: 1, odd: 2 }[target.applyTo];
    const headerFooter = tryJson(() => session.doc.getHeaderFooter(
      target.sectionIndex,
      target.type === 'header',
      applyTo,
    ));
    if (!headerFooter || headerFooter.exists !== true) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural header or footer target was not found after reopening the candidate.',
        { target },
      );
    }
    if (result?.expectedHeaderFooterText !== undefined
      && headerFooter.text !== result.expectedHeaderFooterText) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISMATCH',
        'A structural header or footer text did not survive reopening exactly.',
        {
          target,
          expectedHeaderFooterText: result.expectedHeaderFooterText,
          headerFooterText: headerFooter.text,
        },
      );
    }
    if (result?.expectedHeaderFooterAlign !== undefined) {
      const paragraphProperties = tryJson(() => session.doc.getParaPropertiesInHf(
        target.sectionIndex,
        target.type === 'header',
        applyTo,
        0,
      ));
      if (!paragraphProperties
        || paragraphProperties.alignment !== result.expectedHeaderFooterAlign) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'A structural header or footer alignment did not survive reopening exactly.',
          {
            target,
            expectedHeaderFooterAlign: result.expectedHeaderFooterAlign,
            headerFooterAlign: paragraphProperties?.alignment,
          },
        );
      }
    }
    return;
  }
  if (target.kind === 'footnote') {
    const footnote = tryJson(() => session.doc.getFootnoteInfo(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
    ));
    if (!footnote) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural footnote target was not found after reopening the candidate.',
        { target },
      );
    }
    const logicalFootnoteText = Array.isArray(footnote.texts)
      && typeof footnote.texts[0] === 'string'
      && footnote.texts[0].startsWith('  ')
      ? [footnote.texts[0].slice(2), ...footnote.texts.slice(1)].join('\n')
      : null;
    if (result?.expectedFootnoteText !== undefined
      && logicalFootnoteText !== result.expectedFootnoteText) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISMATCH',
        'A structural footnote body did not survive reopening exactly.',
        {
          target,
          expectedFootnoteText: result.expectedFootnoteText,
          footnoteTexts: footnote.texts,
          logicalFootnoteText,
        },
      );
    }
    return;
  }
  if (target.kind === 'style') {
    const style = tryJson(() => session.doc.getStyleDetail(target.styleId));
    if (!style) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural named style was not found after reopening the candidate.',
        { target },
      );
    }
    return;
  }
  if (target.kind === 'cell') {
    let paragraphCount = null;
    try {
      paragraphCount = session.doc.getCellParagraphCount(
        target.sectionIndex,
        target.paragraphIndex,
        target.controlIndex,
        target.cellIndex,
      );
    } catch {
      paragraphCount = null;
    }
    if (!Number.isInteger(paragraphCount)
      || target.cellParagraphIndex >= paragraphCount) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural table-cell target was not found after reopening the candidate.',
        { target, paragraphCount },
      );
    }
    verifyExpectedRunStyle(target, result, offset => session.doc.getCellCharPropertiesAt(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      target.cellParagraphIndex,
      offset,
    ));
    return;
  }
  if (target.kind === 'documentMetadata') {
    const metadata = tryJson(() => session.doc.getDocumentMetadata());
    const expected = result?.native?.metadata;
    const mismatch = !metadata || !expected || Object.entries(expected)
      .some(([key, value]) => metadata[key] !== value);
    if (mismatch) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'Structural document metadata did not survive reopening the candidate.',
        { target, expected, metadata },
      );
    }
    return;
  }
  throw structuralBatchError(
    'HWPX_TARGET_VERIFICATION_UNSUPPORTED',
    'The structural candidate returned a target kind without a reopen verifier.',
    { target },
  );
}

function verifyStructuralCommit(session, results) {
  const pageCount = session.doc.pageCount();
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw structuralBatchError(
      'HWPX_REOPEN_VALIDATION_FAILED',
      'The structural candidate reopened without a valid page.',
      { pageCount },
    );
  }
  const svg = session.doc.renderPageSvg(0);
  if (typeof svg !== 'string' || !svg.includes('<svg') || svg.length < 100) {
    throw structuralBatchError(
      'HWPX_RENDER_VALIDATION_FAILED',
      'The structural candidate did not render a nonblank SVG page.',
      { pageCount, svgLength: typeof svg === 'string' ? svg.length : null },
    );
  }
  for (const result of results) {
    verifyStructuralTarget(session, result.target, result);
    for (const target of result.createdTargets ?? []) {
      verifyStructuralTarget(session, target, result);
    }
  }
}

function materializeStructuralTrial(session) {
  if (typeof session.doc.reflowLinesegs === 'function') {
    session.doc.reflowLinesegs();
  }
  const candidateBytes = Buffer.from(session.doc.exportHwpx());
  const restored = restoreExportOmittedEmbeddedEntries(
    session.inputBytes,
    candidateBytes,
  );
  const qualification = qualifyHwpxCandidate(session.inputBytes, restored.bytes);
  qualification.restoredEntries = restored.restoredEntries;
  const committedBytes = overlayPreservedEntries(
    session.inputBytes,
    restored.bytes,
    qualification,
  );
  const reopened = new HwpxApiSession(committedBytes, {
    saveMode: 'preserve-package',
  });
  return { reopened, qualification };
}

export class HwpxApiSession {
  constructor(inputBytes, options = {}) {
    this.inputBytes = Buffer.from(inputBytes);
    assertSupportedHwpxPackage(this.inputBytes);
    this.doc = new HwpDocument(new Uint8Array(this.inputBytes));
    this.revision = 1;
    this.saveMode = options.saveMode ?? 'preserve-package';
    this.cellPatches = [];
    this.paragraphPatches = [];
    this.paragraphInsertPatches = [];
    this.paragraphDeletePatches = [];
    this.tableRowInsertPatches = [];
    this.tableSizePatches = [];
    this.cellSizePatches = [];
    this.pictureClonePatches = [];
    this.packagePatches = [];
    this.shapePatches = [];
    this.textBoxPatches = [];
    this.trackedChangePatches = [];
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

    const nativeTables = discoverTables(this.doc);
    const nestedTables = discoverNestedPackageTables(this.inputBytes);
    const tables = [...nativeTables, ...nestedTables];
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
      nestedTableCount: nestedTables.length,
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
    const objects = readPackageObjects(this.inputBytes);
    const nestedTables = discoverNestedPackageTables(this.inputBytes);
    return {
      ...objects,
      nestedTables: nestedTables.map((table) => ({
        id: table.id,
        section: table.section,
        paragraph: table.para,
        depth: table.xmlDepth,
        dims: table.dims,
      })),
    };
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

  paragraphTemplateXml(location) {
    if (location?.tableId || location?.table || location?.cell || location?.tableCell) {
      return this.cellTemplateParagraphXml(location);
    }
    return extractParagraphXmlFromPackage(this.inputBytes, location);
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
        paragraphStyleIds: command.paragraphStyleIds,
        paragraphTemplateIndices: command.paragraphTemplateIndices,
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
        paragraphStyleIds: cellCommand.paragraphStyleIds ?? command.paragraphStyleIds,
        paragraphTemplateIndices: cellCommand.paragraphTemplateIndices ?? command.paragraphTemplateIndices,
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

    if (key === 'appendparagraph' || key === 'paragraphappend') {
      const paragraph = normalizeParagraphLocation(location);
      return [{
        ...command,
        opId,
        op: 'insertParagraphAfter',
        target: { native: paragraph },
        text,
        styleSource: command.styleSource,
        ensureVisible: true,
      }];
    }

    if (key === 'textdeleteparagraphs') {
      return [{
        ...command,
        opId,
        op: 'deleteParagraphs',
        locations: command.locations.map((item) => normalizeParagraphLocation(item)),
      }];
    }

    if (key === 'tableinsertrows') {
      return [{
        ...command,
        opId,
        op: 'insertTableRows',
        target: command.target ?? command.location,
        rowIndex: Number(command.rowIndex),
        count: Number(command.count),
        templateRow: Number(command.templateRow),
        clearText: command.clearText !== false,
      }];
    }

    if (key === 'tablesetsize') {
      return [{
        ...command,
        opId,
        op: 'setTableSize',
        target: command.target ?? command.location,
        width: command.width === undefined ? undefined : Number(command.width),
        height: command.height === undefined ? undefined : Number(command.height),
      }];
    }

    if (key === 'tablesetcellsize') {
      return [{
        ...command,
        opId,
        op: 'setCellSize',
        target: command.target ?? command.location,
        width: command.width === undefined ? undefined : Number(command.width),
        height: command.height === undefined ? undefined : Number(command.height),
      }];
    }

    if (key === 'replacetext' || key === 'textreplace') {
      return [{ ...command, opId, op: 'replaceText', text }];
    }

    if (key === 'textreplacetracked' || key === 'replacetracked') {
      return [{ ...command, opId, op: 'replaceTracked', text }];
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

    if (key === 'imageclonetocell') {
      return [{
        ...command,
        opId,
        op: 'image.cloneToCell',
        target: command.target ?? command.location,
        sourcePictureId: command.sourcePictureId,
        targetParagraphIndex: Number(command.targetParagraphIndex ?? 0),
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
    validateHwpxCommands(ops);
    const locationChangingOps = ops.filter((op) => [
      'text.deleteParagraphs',
      'table.insertRows',
    ].includes(resolveHwpxCommand(op)?.op));
    if (locationChangingOps.length > 0 && ops.length !== 1) {
      const error = new Error('text.deleteParagraphs and table.insertRows must run alone because they invalidate paragraph and table-cell locations.');
      error.code = 'HWPX_LOCATION_CHANGING_BATCH_UNSUPPORTED';
      throw error;
    }
    if (ops.some(op => resolveHwpxCommand(op)?.op === 'text.replaceTracked')) {
      if (ops.length !== 1) {
        const error = new Error(
          'text.replaceTracked must be the only command in its batch until tracked-change-aware paragraph offsets are available.',
        );
        error.code = 'HWPX_TRACKED_CHANGE_BATCH_UNSUPPORTED';
        throw error;
      }
      let workingBytes = Buffer.from(this.inputBytes);
      const results = [];
      for (const op of ops) {
        const trial = new HwpxApiSession(workingBytes, { saveMode: this.saveMode });
        const trialResult = trial.commandsBatchUnsafe([op]);
        workingBytes = Buffer.from(trial.save().bytes);
        results.push(...trialResult.results);
      }
      this.inputBytes = workingBytes;
      this.doc = new HwpDocument(new Uint8Array(this.inputBytes));
      this.cellPatches = [];
      this.paragraphPatches = [];
      this.paragraphInsertPatches = [];
      this.paragraphDeletePatches = [];
      this.tableRowInsertPatches = [];
      this.tableSizePatches = [];
      this.cellSizePatches = [];
      this.pictureClonePatches = [];
      this.packagePatches = [];
      this.shapePatches = [];
      this.textBoxPatches = [];
      this.trackedChangePatches = [];
      this.revision += 1;
      return { revision: this.revision, results };
    }
    const classification = classifyHwpxCommands(ops);
    if (classification.mode === 'structural-export') {
      return this.commandsStructuralBatch(ops, classification);
    }
    const trial = new HwpxApiSession(this.inputBytes, { saveMode: this.saveMode });
    const trialResult = trial.commandsBatchUnsafe(ops);
    const committed = trial.save();
    this.inputBytes = Buffer.from(committed.bytes);
    this.doc = new HwpDocument(new Uint8Array(this.inputBytes));
    this.cellPatches = [];
    this.paragraphPatches = [];
    this.paragraphInsertPatches = [];
    this.paragraphDeletePatches = [];
    this.tableRowInsertPatches = [];
    this.tableSizePatches = [];
    this.cellSizePatches = [];
    this.pictureClonePatches = [];
    this.packagePatches = [];
    this.shapePatches = [];
    this.textBoxPatches = [];
    this.trackedChangePatches = [];
    this.revision += 1;
    return { revision: this.revision, results: trialResult.results };
  }

  commandsStructuralBatch(ops, classification = classifyHwpxCommands(ops)) {
    const normalizedOps = ops.flatMap((op, index) => this.normalizeCommand(op, index));
    let working = new HwpxApiSession(this.inputBytes, {
      saveMode: 'preserve-package',
    });
    let structuralDirty = false;
    const results = [];
    const qualifications = [];

    const flushStructural = () => {
      if (!structuralDirty) return;
      const materialized = materializeStructuralTrial(working);
      qualifications.push(materialized.qualification);
      working = materialized.reopened;
      structuralDirty = false;
    };

    for (const op of normalizedOps) {
      if (classifyHwpxCommands([op]).mode === 'structural-export') {
        const entry = resolveHwpxCommand(op);
        const structuralOp = {
          ...op,
          op: entry?.normalizeAs ?? entry?.op ?? op.op,
        };
        const result = applyHwpxStructuralCommand(working.doc, structuralOp, {
          before: working.exportJson(),
        });
        results.push({ ...result, opId: op.opId });
        structuralDirty = true;
        continue;
      }

      flushStructural();
      const patchResult = working.commandsBatchUnsafe([op]);
      results.push(...patchResult.results);
      const sourceBytes = Buffer.from(working.inputBytes);
      const saved = working.save();
      qualifications.push(qualifyHwpxCandidate(sourceBytes, saved.bytes));
      working = new HwpxApiSession(saved.bytes, {
        saveMode: 'preserve-package',
      });
    }
    flushStructural();

    verifyStructuralCommit(working, results);
    const validation = working.validationReport(working.doc);
    const qualification = {
      ok: qualifications.length > 0
        && qualifications.every(item => item.ok === true),
      stages: qualifications,
      changedEntries: [...new Set(
        qualifications.flatMap(item => item.changedEntries ?? []),
      )],
      createdEntries: [...new Set(
        qualifications.flatMap(item => item.createdEntries ?? []),
      )],
      copiedEntries: qualifications.flatMap(item => item.copiedEntries ?? []),
    };

    this.inputBytes = Buffer.from(working.inputBytes);
    this.doc = new HwpDocument(new Uint8Array(this.inputBytes));
    this.cellPatches = [];
    this.paragraphPatches = [];
    this.paragraphInsertPatches = [];
    this.paragraphDeletePatches = [];
    this.tableRowInsertPatches = [];
    this.tableSizePatches = [];
    this.cellSizePatches = [];
    this.pictureClonePatches = [];
    this.packagePatches = [];
    this.shapePatches = [];
    this.textBoxPatches = [];
    this.trackedChangePatches = [];
    this.revision += 1;
    return {
      revision: this.revision,
      results,
      classification,
      qualification,
      validation,
    };
  }

  commandsBatchUnsafe(ops) {
    const results = [];
    const normalizedOps = ops.flatMap((op, index) => this.normalizeCommand(op, index));
    for (const op of normalizedOps) {
      if (op.op === 'setCellText') {
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        const shouldFit = op.fit === true || op.layout?.fit === true || op.fitOptions;
        const fit = shouldFit ? this.fitText(op.target, op.text, op.fitOptions ?? op.layout ?? {}) : null;
        const text = fit?.text ?? op.text;
        const styleIds = this.resolveParagraphStyleIds(op);
        const paragraphStyleIds = op.paragraphStyleIds?.map((item) => (
          item === null ? null : mergeStyleIds(styleIds, item)
        ));
        if (!table.packageOnly) setCellTextWithApi(this.doc, table, cell.cellIndex, text);
        this.cellPatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          xmlTableId: table.packageOnly ? table.id : null,
          cellIndex: cell.cellIndex,
          text,
          styleIds,
          paragraphStyleIds,
          paragraphTemplateIndices: op.paragraphTemplateIndices,
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
        const templateParagraphXml = op.styleSource ? this.paragraphTemplateXml(op.styleSource) : null;
        this.paragraphInsertPatches.push({
          section,
          para: paragraph,
          text: op.text,
          templateParagraphXml,
          styleIds,
          ensureVisible: op.ensureVisible === true,
          opId: op.opId,
        });
        results.push({ opId: op.opId, ok: true, target: `s${section}_p${paragraph}`, action: 'text.insertAfterParagraph' });
      } else if (op.op === 'deleteParagraphs') {
        const bySection = new Map();
        for (const location of op.locations) {
          const { section, paragraph } = location;
          assert.ok(Number.isInteger(section) && section >= 0, 'text.deleteParagraphs requires a valid section');
          assert.ok(Number.isInteger(paragraph) && paragraph >= 0 && paragraph < this.doc.getParagraphCount(section), `text.deleteParagraphs paragraph out of range: ${section}:${paragraph}`);
          const paras = bySection.get(section) ?? [];
          paras.push(paragraph);
          bySection.set(section, paras);
        }
        for (const [section, paras] of bySection) {
          assert.ok(this.doc.getParagraphCount(section) - paras.length >= 1, 'text.deleteParagraphs must leave at least one paragraph in each section');
          this.paragraphDeletePatches.push({ section, paras, opId: op.opId });
        }
        results.push({ opId: op.opId, ok: true, action: 'text.deleteParagraphs', paragraphCount: op.locations.length });
      } else if (op.op === 'insertTableRows') {
        const table = this.tableFromLocation(op.target);
        assert.ok(op.rowIndex >= 0 && op.rowIndex <= table.dims.rowCount, `table.insertRows rowIndex out of range: ${op.rowIndex}`);
        assert.ok(op.templateRow >= 0 && op.templateRow < table.dims.rowCount, `table.insertRows templateRow out of range: ${op.templateRow}`);
        this.tableRowInsertPatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          xmlTableId: table.packageOnly ? table.id : null,
          rowIndex: op.rowIndex,
          count: op.count,
          templateRow: op.templateRow,
          clearText: op.clearText,
          extendBoundarySpans: op.extendBoundarySpans,
          opId: op.opId,
        });
        results.push({
          opId: op.opId,
          ok: true,
          action: 'table.insertRows',
          target: table.id,
          rowIndex: op.rowIndex,
          insertedRowCount: op.count,
          resultingRowCount: table.dims.rowCount + op.count,
        });
      } else if (op.op === 'setTableSize') {
        const table = this.tableFromLocation(op.target);
        this.tableSizePatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          xmlTableId: table.packageOnly ? table.id : null,
          width: op.width,
          height: op.height,
          opId: op.opId,
        });
        results.push({
          opId: op.opId,
          ok: true,
          action: 'table.setSize',
          target: table.id,
          width: op.width,
          height: op.height,
        });
      } else if (op.op === 'setCellSize') {
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        this.cellSizePatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          xmlTableId: table.packageOnly ? table.id : null,
          cellIndex: cell.cellIndex,
          width: op.width,
          height: op.height,
          opId: op.opId,
        });
        results.push({
          opId: op.opId,
          ok: true,
          action: 'table.setCellSize',
          target: cell.id,
          width: op.width,
          height: op.height,
        });
      } else if (op.op === 'image.cloneToCell') {
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        const sourcePictureXml = extractPictureXmlFromPackage(this.inputBytes, op.sourcePictureId);
        this.pictureClonePatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          xmlTableId: table.packageOnly ? table.id : null,
          cellIndex: cell.cellIndex,
          sourcePictureXml,
          sourcePictureId: op.sourcePictureId,
          targetParagraphIndex: op.targetParagraphIndex,
          width: op.width,
          height: op.height,
          vertOffset: op.vertOffset,
          horzOffset: op.horzOffset,
          zOrder: op.zOrder,
          opId: op.opId,
        });
        results.push({
          opId: op.opId,
          ok: true,
          action: 'image.cloneToCell',
          target: cell.id,
          sourcePictureId: op.sourcePictureId,
        });
      } else if (op.op === 'replaceText') {
        const { section, para } = op.target.native;
        const styleIds = this.paragraphStyleIds({
          paragraph: { section, number: para },
        });
        replaceTextInBody(this.doc, op);
        this.paragraphPatches.push({
          section,
          para,
          text: readBodyParagraphText(this.doc, section, para),
          styleIds,
          opId: op.opId,
        });
        results.push({ opId: op.opId, ok: true, action: 'text.replace' });
      } else if (op.op === 'replaceTracked') {
        replaceTextInBody(this.doc, op);
        this.trackedChangePatches.push(op);
        results.push({
          opId: op.opId,
          ok: true,
          action: 'text.replaceTracked',
          target: op.target,
          author: op.author,
        });
      } else if (op.op === 'layout.fitText') {
        const fit = this.fitText(op.location, op.text, op.options);
        results.push({ opId: op.opId, ok: true, changed: false, action: 'layout.fitText', fit });
      } else if (op.op === 'style.cloneCellTextStyle') {
        assert.ok(op.styleSource, 'style.clone requires source/styleSource location');
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        const target = this.inspectTarget(op.target);
        const styleIds = this.resolveParagraphStyleIds(op);
        if (!table.packageOnly) setCellTextWithApi(this.doc, table, cell.cellIndex, target.currentText);
        this.cellPatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          xmlTableId: table.packageOnly ? table.id : null,
          cellIndex: cell.cellIndex,
          text: target.currentText,
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
          if (!table.packageOnly) setCellTextWithApi(this.doc, table, cell.cellIndex, nextText);
          this.cellPatches.push({
            section: table.section,
            para: table.para,
            tableOrderInParagraph: table.tableOrderInParagraph,
            xmlTableId: table.packageOnly ? table.id : null,
            cellIndex: cell.cellIndex,
            text: nextText,
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
        if (!table.packageOnly) setCellTextWithApi(this.doc, table, cell.cellIndex, target.currentText);
        this.cellPatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          xmlTableId: table.packageOnly ? table.id : null,
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

    if (this.trackedChangePatches.length) {
      assert.equal(this.trackedChangePatches.length, 1, 'tracked changes are committed sequentially');
      assert.equal(
        this.cellPatches.length + this.paragraphPatches.length
          + this.paragraphInsertPatches.length + this.paragraphDeletePatches.length
          + this.tableRowInsertPatches.length + this.tableSizePatches.length + this.cellSizePatches.length
          + this.pictureClonePatches.length + this.packagePatches.length
          + this.shapePatches.length + this.textBoxPatches.length,
        0,
        'tracked changes cannot share an unsafe save stage with other patch types',
      );
      const tracked = applyTrackedReplacement(this.inputBytes, this.trackedChangePatches[0]);
      const reopened = new HwpDocument(new Uint8Array(tracked.bytes));
      this.revision += 1;
      return {
        bytes: tracked.bytes,
        revision: this.revision,
        validation: this.validationReport(reopened),
        trackedChange: tracked,
      };
    }

    if (!this.cellPatches.length && !this.paragraphPatches.length
      && !this.paragraphInsertPatches.length && !this.paragraphDeletePatches.length
      && !this.tableRowInsertPatches.length && !this.tableSizePatches.length && !this.cellSizePatches.length
      && !this.pictureClonePatches.length && !this.packagePatches.length
      && !this.shapePatches.length && !this.textBoxPatches.length) {
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
      ...this.paragraphDeletePatches.map((patch) => patch.section),
      ...this.tableRowInsertPatches.map((patch) => patch.section),
      ...this.tableSizePatches.map((patch) => patch.section),
      ...this.cellSizePatches.map((patch) => patch.section),
      ...this.pictureClonePatches.map((patch) => patch.section),
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
        this.paragraphDeletePatches,
        this.tableRowInsertPatches,
        this.tableSizePatches,
        this.cellSizePatches,
        this.pictureClonePatches,
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
    const sectionCount = doc.getSectionCount();
    let paragraphCount = 0;
    for (let section = 0; section < sectionCount; section += 1) {
      paragraphCount += doc.getParagraphCount(section);
    }
    return {
      sourceFormat: doc.getSourceFormat(),
      pageCount: doc.pageCount(),
      sectionCount,
      paragraphCount,
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
