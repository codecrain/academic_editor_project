import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import initHwpx, { HwpDocument } from '@rhwp/core';
import {
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
  inspectHwpxStructuralReferencesXml,
  overlayPreservedEntries,
  qualifyHwpxCandidate,
  restoreExportOmittedEmbeddedEntries,
} from './hwpx-package-policy.mjs';
import {
  HWPX_PACKAGE_ONLY_OPS,
  resolveHwpxCommand,
  validateHwpxCommands,
} from './hwpx-command-catalog.mjs';
import { applyHwpxStructuralCommand } from './hwpx-structural-commands.mjs';
import { assertFormatSourceSupport } from './hwpx-format-contract.mjs';
import { applyTrackedReplacement } from './hwpx-tracked-changes.mjs';
import { crc32, createZip, readZip } from './hwpx-zip.mjs';
import {
  analyzeSvgCellClipping,
  analyzeSvgPageMetrics,
  svgHasVisibleContent,
} from '../../editor_server/svg-render-evidence.mjs';

export { createZip, readZip } from './hwpx-zip.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const PATCH_COLLECTIONS = Object.freeze([
  'cellPatches', 'paragraphPatches', 'paragraphInsertPatches', 'paragraphDeletePatches',
  'tableRowInsertPatches', 'tableSizePatches', 'cellSizePatches',
  'pictureClonePatches', 'pictureInsertPatches', 'pictureReferencePatches',
  'packagePatches', 'shapePatches', 'textBoxPatches', 'trackedChangePatches',
]);

let hwpxReady = null;

function isZipPackage(bytesLike) {
  const bytes = Buffer.from(bytesLike);
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

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
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const parsed = typeof value === 'string' && (trimmed.startsWith('{') || trimmed.startsWith('['))
    ? JSON.parse(trimmed)
    : value;
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

function encodeHwpxInlineText(text, paragraphXml = '') {
  const tab = String(paragraphXml).match(/<hp:tab\b[^>]*\/>/)?.[0]
    ?? '<hp:tab width="3028" leader="0" type="1"/>';
  return String(text ?? '')
    .split(/(\r\n|\r|\n|\t)/)
    .map((part) => {
      if (part === '\r\n' || part === '\r' || part === '\n') return '<hp:lineBreak/>';
      if (part === '\t') return tab;
      return escapeXmlText(part);
    })
    .join('');
}

function reconcileExplicitLineSegmentsXml(paragraphXml, text) {
  const source = String(text ?? '');
  if (!/[\r\n]/.test(source) && !/<hp:lineBreak\/>/.test(paragraphXml)) return paragraphXml;
  const lines = source.split(/\r\n|\r|\n/);
  const arrayMatch = paragraphXml.match(/<hp:linesegarray\b[^>]*>([\s\S]*?)<\/hp:linesegarray>/);
  if (!arrayMatch) return paragraphXml;
  const sourceSegments = arrayMatch[1].match(/<hp:lineseg\b[^>]*\/>/g) || [];
  if (!sourceSegments.length) return paragraphXml;
  const firstVertPos = Number(firstMatch(sourceSegments[0], /\bvertpos="(-?\d+)"/, '0'));
  const secondVertPos = Number(firstMatch(sourceSegments[1] || '', /\bvertpos="(-?\d+)"/, String(firstVertPos)));
  const firstVertSize = Number(firstMatch(sourceSegments[0], /\bvertsize="(\d+)"/, '1000'));
  const firstSpacing = Number(firstMatch(sourceSegments[0], /\bspacing="(\d+)"/, '600'));
  const verticalStep = secondVertPos > firstVertPos
    ? secondVertPos - firstVertPos
    : firstVertSize + firstSpacing;
  let textPosition = 0;
  const segments = lines.map((line, index) => {
    const template = sourceSegments[Math.min(index, sourceSegments.length - 1)];
    let segment = setXmlAttribute(template, 'textpos', textPosition);
    if (index >= sourceSegments.length) {
      segment = setXmlAttribute(segment, 'vertpos', firstVertPos + verticalStep * index);
    }
    textPosition += Buffer.byteLength(line, 'utf16le') / 2 + (index < lines.length - 1 ? 1 : 0);
    return segment;
  }).join('');
  return paragraphXml.replace(arrayMatch[0], arrayMatch[0].replace(arrayMatch[1], segments));
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
    const paragraphFormat = tryJson(() => doc.getCellParaPropertiesAt(
      table.section, table.para, table.control, cellIndex, cellPara, 0,
    ));
    const characterFormat = len > 0
      ? tryJson(() => doc.getCellCharPropertiesAt(
        table.section, table.para, table.control, cellIndex, cellPara, 0,
      ))
      : null;
    const text = doc.getTextInCell(table.section, table.para, table.control, cellIndex, cellPara, 0, len);
    const measuredStyle = { paragraph: paragraphFormat, text: characterFormat };
    paragraphs.push({
      index: cellPara,
      length: len,
      text,
      paragraphFormat,
      characterFormat,
      hierarchy: measuredParagraphHierarchy(paragraphFormat, text),
      styleFingerprint: styleFingerprint(measuredStyle),
    });
  }
  return paragraphs;
}

function measuredParagraphHierarchy(paragraphFormat, text = '') {
  if (!paragraphFormat || typeof paragraphFormat !== 'object') return null;
  const leading = String(text || '').match(/^[\t ]*/)?.[0] || '';
  const candidates = {
    outlineType: paragraphFormat.outlineType,
    outlineLevel: paragraphFormat.outlineLevel ?? paragraphFormat.headingLevel ?? paragraphFormat.level,
    headType: paragraphFormat.headType,
    paraLevel: paragraphFormat.paraLevel,
    numberingId: paragraphFormat.numberingId,
    marginLeft: paragraphFormat.marginLeft ?? paragraphFormat.leftMargin,
    marginRight: paragraphFormat.marginRight ?? paragraphFormat.rightMargin,
    indent: paragraphFormat.indent ?? paragraphFormat.firstLineIndent,
    leadingSpaces: [...leading].filter(character => character === ' ').length,
    leadingTabs: [...leading].filter(character => character === '\t').length,
    alignment: paragraphFormat.alignment,
    lineSpacing: paragraphFormat.lineSpacing,
    spacingBefore: paragraphFormat.spacingBefore,
    spacingAfter: paragraphFormat.spacingAfter,
    keepWithNext: paragraphFormat.keepWithNext,
    keepLines: paragraphFormat.keepLines,
    pageBreakBefore: paragraphFormat.pageBreakBefore,
    paraShapeId: paragraphFormat.paraShapeId ?? paragraphFormat.paraPrIDRef,
  };
  const measured = Object.fromEntries(Object.entries(candidates).filter(([, value]) => (
    value !== undefined && value !== null && value !== ''
  )));
  return Object.keys(measured).length ? measured : null;
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
  const leftMargin = numberOrNull(cell.leftMargin) ?? numberOrNull(cell.marginLeft)
    ?? numberOrNull(cell.paddingLeft) ?? 0;
  const rightMargin = numberOrNull(cell.rightMargin) ?? numberOrNull(cell.marginRight)
    ?? numberOrNull(cell.paddingRight) ?? 0;
  const topMargin = numberOrNull(cell.topMargin) ?? numberOrNull(cell.marginTop)
    ?? numberOrNull(cell.paddingTop) ?? 0;
  const bottomMargin = numberOrNull(cell.bottomMargin) ?? numberOrNull(cell.marginBottom)
    ?? numberOrNull(cell.paddingBottom) ?? 0;
  const innerWidth = Math.max(0, width - leftMargin - rightMargin);
  const innerHeight = Math.max(0, height - topMargin - bottomMargin);
  // HWPX documents handled here are predominantly Korean.  Treating every
  // glyph as a half-em Latin character made the old capacity estimate roughly
  // twice as optimistic and allowed visibly clipped cells to finalize.  This
  // remains a planning estimate; final acceptance uses rendered clip evidence.
  const charWidth = Math.max(600, fontSize * 0.92);
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

function estimatedWrappedLineCount(text, capacity) {
  const maxCharsPerLine = Number(capacity?.maxCharsPerLine || 0);
  if (!maxCharsPerLine) return null;
  return String(text ?? '').split('\n').reduce((sum, line) => (
    sum + Math.max(1, Math.ceil(visualTextUnits(line) / maxCharsPerLine))
  ), 0);
}

function wrapLine(line, maxCharsPerLine) {
  return coreWrapLine(line, maxCharsPerLine);
}

function fitTextToCapacity(text, capacity, options = {}) {
  return coreFitTextToCapacity(text, capacity, options);
}

function normalizedTableDimensions(dims = {}) {
  const rows = Number(dims.rows ?? dims.rowCount);
  const columns = Number(dims.cols ?? dims.columns ?? dims.columnCount ?? dims.colCount);
  return {
    rows: Number.isFinite(rows) ? rows : null,
    columns: Number.isFinite(columns) ? columns : null,
  };
}

function tableIdentityFingerprint(table = {}) {
  const dimensions = normalizedTableDimensions(table.dims);
  return coreHashString(coreStableStringify({
    dimensions,
    cellCount: Number(table.dims?.cellCount ?? table.cells?.length ?? 0),
  }));
}

function matchBaselineTables(baselineTables = [], currentTables = [], ignoredBaselineIds = new Set()) {
  const currentByFingerprint = new Map();
  for (const table of currentTables) {
    const fingerprint = tableIdentityFingerprint(table);
    if (!currentByFingerprint.has(fingerprint)) currentByFingerprint.set(fingerprint, []);
    currentByFingerprint.get(fingerprint).push(table);
  }
  const matched = new Map();
  const claimed = new Set();
  for (const baselineTable of baselineTables) {
    if (ignoredBaselineIds.has(baselineTable.id)) continue;
    const candidates = currentByFingerprint.get(tableIdentityFingerprint(baselineTable)) ?? [];
    const currentTable = candidates.find(item => !claimed.has(item));
    if (currentTable) {
      matched.set(baselineTable, currentTable);
      claimed.add(currentTable);
    }
  }
  for (const baselineTable of baselineTables) {
    if (ignoredBaselineIds.has(baselineTable.id) || matched.has(baselineTable)) continue;
    const currentTable = currentTables.find(item =>
      !claimed.has(item) && item.id === baselineTable.id);
    if (currentTable) {
      matched.set(baselineTable, currentTable);
      claimed.add(currentTable);
    }
  }
  return matched;
}

function imageLogicalReference(imageName) {
  return String(imageName ?? '').split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? '';
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
        'table.applyCellStyle',
        'style.applyText',
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

function replaceMetadataElement(xml, tagName, value) {
  const escaped = escapeXmlText(value);
  const paired = new RegExp(`<opf:${tagName}\\b([^>]*)>[\\s\\S]*?<\\/opf:${tagName}>`, 'g');
  const pairedMatches = [...xml.matchAll(paired)];
  assert.ok(pairedMatches.length <= 1, `HWPX package has duplicate metadata element: ${tagName}`);
  if (pairedMatches.length === 1) {
    return xml.replace(paired, (_, attributes) => `<opf:${tagName}${attributes}>${escaped}</opf:${tagName}>`);
  }
  const selfClosing = new RegExp(`<opf:${tagName}\\b([^>]*)\\/>`, 'g');
  const selfClosingMatches = [...xml.matchAll(selfClosing)];
  assert.ok(selfClosingMatches.length <= 1, `HWPX package has duplicate metadata element: ${tagName}`);
  if (selfClosingMatches.length === 1) {
    return xml.replace(selfClosing, (_, attributes) => `<opf:${tagName}${attributes}>${escaped}</opf:${tagName}>`);
  }
  return xml.replace('</opf:metadata>', `<opf:${tagName}>${escaped}</opf:${tagName}></opf:metadata>`);
}

function metadataFieldName(attributes) {
  return String(attributes).match(/\bname\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase() ?? null;
}

function replaceMetadataMeta(xml, names, preferredName, value) {
  const escaped = escapeXmlText(value);
  const metaTag = /<opf:meta\b([^>]*?)(?:\/>|>([\s\S]*?)<\/opf:meta>)/g;
  let matched = 0;
  const next = xml.replace(metaTag, (whole, attributes) => {
    if (!names.includes(metadataFieldName(attributes))) return whole;
    matched += 1;
    return `<opf:meta${attributes}>${escaped}</opf:meta>`;
  });
  if (matched > 0) return next;
  return next.replace(
    '</opf:metadata>',
    `<opf:meta name="${preferredName}" content="text">${escaped}</opf:meta></opf:metadata>`,
  );
}

function patchHwpxDocumentMetadata(contentHpf, metadata) {
  const metadataBlocks = [...String(contentHpf).matchAll(/<opf:metadata\b[^>]*>[\s\S]*?<\/opf:metadata>/g)];
  assert.equal(metadataBlocks.length, 1, 'HWPX package must contain exactly one opf:metadata block');
  let next = contentHpf;
  if (metadata.title !== undefined) next = replaceMetadataElement(next, 'title', metadata.title);
  if (metadata.author !== undefined) next = replaceMetadataMeta(next, ['creator', 'author'], 'creator', metadata.author);
  if (metadata.subject !== undefined) next = replaceMetadataMeta(next, ['subject'], 'subject', metadata.subject);
  if (metadata.keywords !== undefined) next = replaceMetadataMeta(next, ['keyword', 'keywords'], 'keyword', metadata.keywords);
  if (metadata.description !== undefined) next = replaceMetadataMeta(next, ['description'], 'description', metadata.description);
  return next;
}

export function readHwpxDocumentMetadata(inputBytes) {
  assert.ok(isZipPackage(inputBytes), 'HWPX document metadata requires a package source');
  const contentHpf = readZip(inputBytes).get('Contents/content.hpf')?.toString('utf8');
  assert.ok(contentHpf, 'HWPX package metadata entry Contents/content.hpf was not found');
  const metadata = {};
  const pairedTitle = contentHpf.match(/<opf:title\b[^>]*>([\s\S]*?)<\/opf:title>/)?.[1];
  const title = pairedTitle ?? (contentHpf.match(/<opf:title\b[^>]*\/>/) ? '' : undefined);
  if (title !== undefined) metadata.title = decodeXmlText(title);
  for (const match of contentHpf.matchAll(/<opf:meta\b([^>]*?)(?:\/>|>([\s\S]*?)<\/opf:meta>)/g)) {
    const name = metadataFieldName(match[1]);
    const value = decodeXmlText(match[2] ?? '');
    if (name === 'creator' || name === 'author') metadata.author = value;
    else if (name === 'subject') metadata.subject = value;
    else if (name === 'keyword' || name === 'keywords') metadata.keywords = value;
    else if (name === 'description') metadata.description = value;
  }
  return metadata;
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
  if (!isZipPackage(inputBytes)) return [];
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
              'table.applyCellStyle',
              'style.applyText',
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
      const containers = findAllBlocks(xml, 'container');
      const re = /<hp:pic\b[\s\S]*?<\/hp:pic>/g;
      let match;
      while ((match = re.exec(xml))) {
        pics.push({
          sectionFile: name,
          byteOffset: match.index,
          binItemIDRef: firstMatch(match[0], /\bbinaryItemIDRef="([^"]+)"/, null),
          zOrder: firstMatch(match[0], /\bzOrder="([^"]+)"/, null),
          instanceId: integerAttribute(match[0].match(/<hp:pic\b[^>]*>/)?.[0] ?? '', 'instid'),
          insideContainer: containers.some((container) => match.index > container.start && match.index < container.end),
        });
      }
      return pics;
    }).map((picture, index) => ({ id: `pic_${index}`, ...picture }));
    const packageShapes = sectionXml.flatMap(({ name, xml }) => {
      const section = Number(name.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
      return findBlocks(xml, 'rect').map((block) => {
        const openingTag = block.xml.match(/<hp:rect\b[^>]*>/)?.[0] ?? '';
        return {
          section,
          sectionFile: name,
          byteOffset: block.start,
          instanceId: integerAttribute(openingTag, 'instid'),
          shapeObjectId: integerAttribute(openingTag, 'id'),
          zOrder: integerAttribute(openingTag, 'zOrder'),
          text: xmlVisibleText(block.xml),
          hasTextBox: /<hp:drawText\b/.test(block.xml),
        };
      });
    }).map((shape, index) => ({ id: `shape_${index}`, type: 'rect', ...shape }));
    return {
      images: names.filter((name) => /^BinData\/.+\.(bmp|gif|jpg|jpeg|png|wmf|emf)$/i.test(name))
        .map((name) => ({
          name,
          byteLength: entries.get(name)?.length ?? 0,
          sha256: createHash('sha256').update(entries.get(name) ?? Buffer.alloc(0)).digest('hex'),
          mimeType: (() => {
            const extension = name.split('.').pop()?.toLowerCase();
            if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
            if (['png', 'gif', 'bmp', 'wmf', 'emf'].includes(extension)) return `image/${extension}`;
            return null;
          })(),
        })),
      pictures,
      charts: sectionXml.flatMap(({ name, xml }) => [...xml.matchAll(/<hp:chart\b[\s\S]*?<\/hp:chart>/g)]
        .map((match) => ({ sectionFile: name, byteOffset: match.index })))
        .map((chart, index) => ({ id: `chart_${index}`, ...chart })),
      shapes: packageShapes,
      textBoxes: packageShapes.filter((shape) => shape.hasTextBox).map((shape, index) => ({
        id: `textbox_${index}`,
        shapeId: shape.id,
        section: shape.section,
        sectionFile: shape.sectionFile,
        byteOffset: shape.byteOffset,
        instanceId: shape.instanceId,
        text: shape.text,
      })),
      sections: names.filter((name) => /^Contents\/section\d+\.xml$/i.test(name)),
      xmlFiles: names.filter((name) => /\.xml$/i.test(name)),
      binaryFiles: names.filter((name) => /^BinData\//i.test(name)),
    };
  } catch {
    return { images: [], pictures: [], charts: [], shapes: [], textBoxes: [], sections: [], xmlFiles: [], binaryFiles: [] };
  }
}

function readNativePictureObjects(doc) {
  const pictures = [];
  const images = [];
  const shapesByTarget = new Map();
  const pictureTargetKeys = new Set();
  for (let pageIndex = 0; pageIndex < doc.pageCount(); pageIndex += 1) {
    const layout = tryJson(() => doc.getPageControlLayout(pageIndex));
    for (const control of layout?.controls || []) {
      const section = Number(control.secIdx);
      const paragraph = Number(control.parentParaIdx ?? control.paraIdx);
      const controlIndex = Number(control.controlIdx);
      if (![section, paragraph, controlIndex].every(Number.isInteger) || control.type === 'table') continue;
      const cellPath = Array.isArray(control.cellPath) ? control.cellPath.map((item) => ({
        controlIndex: Number(item.controlIndex ?? item.controlIdx),
        cellIndex: Number(item.cellIndex ?? item.cellIdx),
        cellParaIndex: Number(item.cellParaIndex ?? item.cellParaIdx ?? 0),
      })) : null;
      const key = `${section}:${paragraph}:${controlIndex}:${cellPath ? stableStringify(cellPath) : ''}`;
      const native = { section, paragraph, control: controlIndex, ...(cellPath ? { cellPath } : {}) };
      const placement = {
        pageHint: pageIndex + 1,
        bounds: stripUndefined({ x: control.x, y: control.y, width: control.w, height: control.h }),
        native,
      };
      if (control.type === 'image') {
        if (pictureTargetKeys.has(key)) continue;
        pictureTargetKeys.add(key);
        const id = `pic_native_${pictures.length}`;
        const properties = cellPath
          ? tryJson(() => doc.getCellPicturePropertiesByPath(section, paragraph, JSON.stringify(cellPath), controlIndex))
          : tryJson(() => doc.getPictureProperties(section, paragraph, controlIndex));
        pictures.push({
          id,
          section,
          paragraph,
          control: controlIndex,
          ...placement,
          properties,
          allowedActions: ['object.format'],
        });
        const cellPathJson = cellPath ? JSON.stringify(cellPath) : '';
        const imageBytes = (() => {
          try {
            const bytes = doc.getControlImageData(section, paragraph, cellPathJson, controlIndex);
            return bytes?.length ? Buffer.from(bytes) : null;
          } catch {
            return null;
          }
        })();
        if (imageBytes) {
          const mimeType = (() => {
            try { return doc.getControlImageMime(section, paragraph, cellPathJson, controlIndex) || null; } catch { return null; }
          })();
          images.push({
            name: id,
            byteLength: imageBytes.length,
            sha256: createHash('sha256').update(imageBytes).digest('hex'),
            mimeType,
            pictureId: id,
          });
        }
        continue;
      }
      const candidate = {
        id: '',
        type: String(control.type || 'shape'),
        ...placement,
        properties: tryJson(() => doc.getShapeProperties(section, paragraph, controlIndex)),
      };
      const previous = shapesByTarget.get(key);
      if (!previous || previous.type === 'group' && candidate.type !== 'group') {
        shapesByTarget.set(key, candidate);
      }
    }
  }
  for (let section = 0; section < doc.getSectionCount(); section += 1) {
    for (let paragraph = 0; paragraph < doc.getParagraphCount(section); paragraph += 1) {
      for (let control = 0; control < 32; control += 1) {
        const properties = tryJson(() => doc.getPictureProperties(section, paragraph, control));
        if (!properties) continue;
        const key = `${section}:${paragraph}:${control}:`;
        if (pictureTargetKeys.has(key)) continue;
        pictureTargetKeys.add(key);
        const id = `pic_native_${pictures.length}`;
        let imageBytes = null;
        try {
          const bytes = doc.getControlImageData(section, paragraph, '', control);
          if (bytes?.length) imageBytes = Buffer.from(bytes);
        } catch {
          imageBytes = null;
        }
        const mimeType = (() => {
          try { return doc.getControlImageMime(section, paragraph, '', control) || null; } catch { return null; }
        })();
        pictures.push({
          id,
          section,
          paragraph,
          control,
          pageHint: null,
          properties,
          native: { section, paragraph, control },
          allowedActions: ['object.format'],
        });
        if (imageBytes) {
          images.push({
            name: id,
            byteLength: imageBytes.length,
            sha256: createHash('sha256').update(imageBytes).digest('hex'),
            mimeType,
            pictureId: id,
          });
        }
      }
    }
  }
  const shapes = [...shapesByTarget.values()].map((shape, index) => ({ ...shape, id: `shape_native_${index}` }));
  return {
    images,
    pictures,
    charts: [],
    equations: [],
    textBoxes: [],
    shapes,
    sections: [],
    xmlFiles: [],
    binaryFiles: images.map((image) => image.name),
  };
}

function readNativeFootnotes(doc) {
  const footnotes = [];
  for (let section = 0; section < doc.getSectionCount(); section += 1) {
    for (let paragraph = 0; paragraph < doc.getParagraphCount(section); paragraph += 1) {
      for (let control = 0; control < 32; control += 1) {
        const value = tryJson(() => doc.getFootnoteInfo(section, paragraph, control));
        if (value?.ok) footnotes.push({ section, paragraph, control, ...value });
      }
    }
  }
  return footnotes;
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
  // A top-level paragraph can be only the anchor for a nested HWPX table.
  // Replacing that paragraph destroys the table; only its table-cell targets
  // are valid text-editing targets.
  const tableHostParagraphs = new Set(
    tables.map((table) => `${table.section}:${table.para}`),
  );
  return {
    paragraphs: sections.flatMap((section) => section.paragraphs
      .filter((paragraph) => !tableHostParagraphs.has(`${paragraph.section}:${paragraph.para}`))
      .map((paragraph) => ({
      id: paragraph.id,
      kind: 'paragraph',
       location: { paragraph: { section: paragraph.section, number: paragraph.para } },
       flow: { section: paragraph.section, paragraph: paragraph.para, order: 0 },
      currentText: paragraph.text,
      textLength: paragraph.text.length,
      styleFingerprint: paragraph.styleFingerprint,
      allowedActions: ['text.replaceParagraph', 'text.replace', 'style.applyText'],
      }))),
    cells: tables.flatMap((table) => table.cells.map((cell) => ({
      id: cell.id,
      kind: 'cell',
      location: cell.location,
      currentText: cell.text,
      textLength: cell.text.length,
      layout: cell.layout,
      styleFingerprint: cell.styleFingerprint,
       table: { id: table.id, dims: table.dims },
       flow: {
         section: table.section,
         paragraph: table.para,
         order: Number(table.tableOrderInParagraph ?? 0) + 1,
       },
      cell: {
        cellIndex: cell.cellIndex,
        row: cell.row,
        col: cell.col,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        pictureCount: Number(cell.pictureCount || 0),
      },
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
  const cellSizeTag = cellXml.match(/<hp:cellSz\b[^>]*\/>/)?.[0] ?? '';
  const cellMarginTag = cellXml.match(/<hp:cellMargin\b[^>]*\/>/)?.[0] ?? '';
  const cellWidth = integerAttribute(cellSizeTag, 'width');
  const cellInnerWidth = cellWidth === null
    ? null
    : Math.max(
      1,
      cellWidth
        - (integerAttribute(cellMarginTag, 'left', 0) ?? 0)
        - (integerAttribute(cellMarginTag, 'right', 0) ?? 0),
    );
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
    if (cellInnerWidth !== null && template.horzSize > cellInnerWidth) {
      template.horzSize = cellInnerWidth;
      template.lineSeg = setTagAttribute(template.lineSeg, 'horzsize', cellInnerWidth);
    }
    const built = buildParagraphXml(line, template, cursor);
    cursor = built.nextVertPos;
    return built.xml;
  }).join('');
  const textPatched = `${cellXml.slice(0, subList.innerStart)}${nextParagraphs}${cellXml.slice(subList.innerEnd)}`;
  return applyCellOuterStyleXml(textPatched, options.cellStyle);
}

function replaceFirstInlineTextXml(xml, text) {
  const escaped = encodeHwpxInlineText(text, xml);
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
  return reconcileExplicitLineSegmentsXml(
    applyParagraphStyleIdsXml(
      replaceInlineParagraphTextXml(paragraphXml, text),
      options.styleIds,
    ),
    text,
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
  const escaped = encodeHwpxInlineText(text, paragraphXml);
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
  const oneLineText = encodeHwpxInlineText(text, paragraphXml);
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

function normalizeObjectText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

function rectTextBoxes(sectionXml) {
  return findBlocks(sectionXml, 'rect')
    .filter((block) => /<hp:drawText\b/.test(block.xml))
    .map((block) => ({ ...block, text: normalizeObjectText(xmlVisibleText(block.xml)) }));
}

function exactRectTextMatchCounts(sectionXml, texts) {
  const counts = new Map(normalizeTextList(texts).map((value) => [normalizeObjectText(value), 0]));
  for (const block of rectTextBoxes(sectionXml)) {
    if (counts.has(block.text)) counts.set(block.text, counts.get(block.text) + 1);
  }
  return counts;
}

function removeRectTextBoxesByText(sectionXml, texts) {
  const targets = new Set(normalizeTextList(texts).map((value) => normalizeObjectText(value)));
  if (targets.size === 0) {
    return sectionXml;
  }
  let next = sectionXml;
  const rects = rectTextBoxes(next).filter((block) => targets.has(block.text));
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
  const rects = rectTextBoxes(next);
  const patches = [];
  for (const rect of rects) {
    let rectXml = rect.xml;
    const replacement = changes.find((item) => (
      normalizeObjectText(item.find ?? item.text) === rect.text
    ));
    if (!replacement) continue;
    const replaceWith = escapeXmlText(normalizeObjectText(
      replacement.replaceWith ?? replacement.value ?? replacement.newText ?? '',
    ));
    let wroteReplacement = false;
    rectXml = rectXml.replace(/(<hp:t\b[^>]*>)[\s\S]*?(<\/hp:t>)/g, (_, open, close) => {
      if (wroteReplacement) return `${open}${close}`;
      wroteReplacement = true;
      return `${open}${replaceWith}${close}`;
    });
    assert.ok(wroteReplacement, 'Matched text-box shape did not contain a writable hp:t node.');
    patches.push({ start: rect.start, end: rect.end, xml: rectXml });
  }
  for (const patch of patches.sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, patch.start)}${patch.xml}${next.slice(patch.end)}`;
  }
  return next;
}

function previewObjectSectionXml(inputBytes, section, shapePatches = [], textBoxPatches = []) {
  const sectionXml = readZip(inputBytes).get(`Contents/section${section}.xml`)?.toString('utf8');
  assert.ok(sectionXml, `Contents/section${section}.xml not found`);
  let next = sectionXml;
  for (const patch of shapePatches.filter((item) => Number(item.section) === Number(section))) {
    next = removeRectTextBoxesByText(next, patch.texts);
  }
  for (const patch of textBoxPatches.filter((item) => Number(item.section) === Number(section))) {
    next = replaceRectTextBoxText(next, patch.replacements);
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
  pictureInsertPatches = [],
  pictureReferencePatches = [],
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
  const sectionPictureInsertPatches = pictureInsertPatches.filter((patch) => patch.section === sectionIndex);
  const sectionPictureReferencePatches = pictureReferencePatches.filter((patch) => patch.section === sectionIndex);
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
      const sourcePictureXml = patch.newImage
        ? inlinePictureXml(next, patch)
        : patch.sourcePictureXml;
      const cellXml = insertPictureIntoCellXml(cell.xml, sourcePictureXml, next, patch);
      const start = paragraph.start + table.start + cell.start;
      const end = paragraph.start + table.start + cell.end;
      next = `${next.slice(0, start)}${cellXml}${next.slice(end)}`;
    }
  }

  for (const patch of sectionPictureReferencePatches) {
    next = retargetCellPictureReferenceXml(next, patch);
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

  if (sectionPictureInsertPatches.length) {
    for (const patch of [...sectionPictureInsertPatches].sort((a, b) => b.para - a.para)) {
      const paragraphs = findTopLevelParagraphs(next);
      const paragraph = paragraphs[patch.para];
      if (!paragraph) throw new Error(`paragraph XML index not found for picture insert: ${patch.para}`);
      const inserted = insertPictureAfterParagraphXml(paragraph.xml, next, patch);
      next = `${next.slice(0, paragraph.start)}${inserted}${next.slice(paragraph.end)}`;
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

function extractTableXmlFromPackageEntries(entries, table) {
  const sectionName = `Contents/section${table.section}.xml`;
  const sectionXml = entries.get(sectionName)?.toString('utf8');
  assert.ok(sectionXml, `${sectionName} not found`);
  const paragraph = findTopLevelParagraphs(sectionXml)[table.para];
  assert.ok(paragraph, `paragraph XML index not found: ${table.para}`);
  const tableXml = table.packageOnly
    ? findAllBlocks(paragraph.xml, 'tbl').find((block, ordinal) => packageTableId(table.section, table.para, block.xml, ordinal) === table.id)
    : findBlocks(paragraph.xml, 'tbl')[table.tableOrderInParagraph];
  assert.ok(tableXml, `table XML index not found: ${table.id}`);
  return tableXml.xml;
}

function extractCellXmlFromPackage(inputBytes, table, cellIndex, packageEntries = null) {
  const entries = packageEntries ?? readZip(inputBytes);
  const tableXml = extractTableXmlFromPackageEntries(entries, table);
  const cellXml = findBlocks(tableXml, 'tc')[cellIndex];
  assert.ok(cellXml, `cell XML index not found: ${table.id} cell ${cellIndex}`);
  return cellXml.xml;
}

function deleteTableFromHwpxPackage(inputBytes, table) {
  const entries = readZip(inputBytes);
  const sectionName = `Contents/section${table.section}.xml`;
  const sectionXml = entries.get(sectionName)?.toString('utf8');
  assert.ok(sectionXml, `${sectionName} not found`);
  const paragraph = findTopLevelParagraphs(sectionXml)[table.para];
  assert.ok(paragraph, `paragraph XML index not found: ${table.para}`);
  const tableBlock = table.packageOnly
    ? findAllBlocks(paragraph.xml, 'tbl').find((block, ordinal) =>
      packageTableId(table.section, table.para, block.xml, ordinal) === table.id)
    : findBlocks(paragraph.xml, 'tbl')[table.tableOrderInParagraph];
  assert.ok(tableBlock, `table XML index not found: ${table.id}`);
  const nextParagraph = `${paragraph.xml.slice(0, tableBlock.start)}${paragraph.xml.slice(tableBlock.end)}`;
  const nextSection = `${sectionXml.slice(0, paragraph.start)}${nextParagraph}${sectionXml.slice(paragraph.end)}`;
  entries.set(sectionName, Buffer.from(nextSection));
  const candidateBytes = createZip([...entries.entries()]);
  const allowedStructuralReferenceLosses = inspectHwpxStructuralReferencesXml(tableBlock.xml);
  const qualification = qualifyHwpxCandidate(inputBytes, candidateBytes, {
    allowedStructuralReferenceLosses,
  });
  const committedBytes = overlayPreservedEntries(inputBytes, candidateBytes, qualification);
  return {
    bytes: committedBytes,
    qualification,
    allowedStructuralReferenceLosses,
  };
}

function renderedLayoutSnapshot(session) {
  const pages = Array.from({ length: session.doc.pageCount() }, (_value, pageIndex) => {
    const svg = session.doc.renderPageSvg(pageIndex);
    const metrics = analyzeSvgPageMetrics(svg);
    const lowOccupancy = metrics.sparseContent === true
      || (Number.isFinite(metrics.verticalOccupancy)
        && metrics.verticalOccupancy < 0.12
        && Number(metrics.textCharacters || 0) < 180);
    return {
      page: pageIndex + 1,
      nonBlank: svgHasVisibleContent(svg),
      lowOccupancy,
      clipCount: analyzeSvgCellClipping(svg).issues.length,
    };
  });
  return {
    pageCount: pages.length,
    blankPageCount: pages.filter((page) => page.nonBlank !== true).length,
    lowOccupancyPageCount: pages.filter((page) => page.lowOccupancy).length,
    clipCount: pages.reduce((sum, page) => sum + page.clipCount, 0),
    pages,
  };
}

function autoFitLayoutBudget(ops) {
  const commands = ops.filter((op) => resolveHwpxCommand(op)?.op === 'table.autoFit');
  const minimum = (field, fallback) => Math.min(...commands.map((command) => (
    command[field] === undefined ? fallback : Number(command[field])
  )));
  return {
    maxPageGrowth: minimum('maxPageGrowth', 1),
    maxBlankPageGrowth: minimum('maxBlankPageGrowth', 0),
    maxLowOccupancyGrowth: minimum('maxLowOccupancyGrowth', 0),
  };
}

function explicitCellParagraphIndex(command) {
  const target = command.target ?? command.location ?? {};
  const direct = target.native ?? {};
  return target.cellParagraphIndex
    ?? target.cellParaIndex
    ?? target.cellPara
    ?? direct.cellParagraphIndex
    ?? direct.cellParaIndex
    ?? direct.cellPara;
}

function assertAutoFitLayoutRegression(baseline, candidate, budget) {
  const delta = {
    pageGrowth: candidate.pageCount - baseline.pageCount,
    blankPageGrowth: candidate.blankPageCount - baseline.blankPageCount,
    lowOccupancyGrowth: candidate.lowOccupancyPageCount - baseline.lowOccupancyPageCount,
    clipGrowth: candidate.clipCount - baseline.clipCount,
  };
  if (delta.clipGrowth > 0) {
    throw structuralBatchError(
      'HWPX_AUTOFIT_RENDER_CLIPPING_REGRESSION',
      'The auto-fit candidate introduced rendered table-cell clipping after reopen.',
      { baseline, candidate, delta, budget },
    );
  }
  if (delta.pageGrowth > budget.maxPageGrowth
    || delta.blankPageGrowth > budget.maxBlankPageGrowth
    || delta.lowOccupancyGrowth > budget.maxLowOccupancyGrowth) {
    throw structuralBatchError(
      'HWPX_AUTOFIT_PAGINATION_REGRESSION',
      'The auto-fit candidate exceeded the explicit document-level pagination budget.',
      { baseline, candidate, delta, budget },
    );
  }
}

function annotateTablePictureSlots(inputBytes, tables) {
  if (!isZipPackage(inputBytes)) {
    for (const table of tables) {
      for (const cell of table.cells) cell.pictureCount = 0;
    }
    return tables;
  }
  const entries = readZip(inputBytes);
  for (const table of tables) {
    try {
      const tableXml = extractTableXmlFromPackageEntries(entries, table);
      const cellBlocks = findBlocks(tableXml, 'tc');
      for (const cell of table.cells) {
        const pictureCount = cellBlocks[cell.cellIndex]
          ? findAllBlocks(cellBlocks[cell.cellIndex].xml, 'pic').length
          : 0;
        cell.pictureCount = pictureCount;
        if (pictureCount > 0 && !cell.allowedActions.includes('image.replaceInCell')) {
          cell.allowedActions.push('image.replaceInCell');
        }
      }
    } catch {
      for (const cell of table.cells) cell.pictureCount = 0;
    }
  }
  return tables;
}

function imagePackageFormat(bytes, declaredMimeType) {
  const mime = String(declaredMimeType ?? '').toLowerCase();
  let extension = null;
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) extension = 'png';
  else if (bytes[0] === 0xFF && bytes[1] === 0xD8) extension = 'jpg';
  else if (bytes.subarray(0, 3).toString('ascii') === 'GIF') extension = 'gif';
  else if (bytes.subarray(0, 2).toString('ascii') === 'BM') extension = 'bmp';
  if (!extension) {
    throw structuralBatchError(
      'HWPX_IMAGE_FORMAT_UNSUPPORTED',
      'HWPX image commands support PNG, JPEG, GIF, and BMP raster bytes.',
      { declaredMimeType: mime || null },
    );
  }
  const expectedMime = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
  if (mime) {
    const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime;
    if (normalized !== expectedMime) {
      throw structuralBatchError(
        'HWPX_IMAGE_MIME_MISMATCH',
        'The declared image MIME type does not match the binary signature.',
        { declaredMimeType: normalized, detectedMimeType: expectedMime },
      );
    }
  }
  return { extension, mediaType: expectedMime };
}

function imagePixelDimensions(bytes, extension) {
  let width;
  let height;
  if (extension === 'png' && bytes.length >= 24) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (extension === 'gif' && bytes.length >= 10) {
    width = bytes.readUInt16LE(6);
    height = bytes.readUInt16LE(8);
  } else if (extension === 'bmp' && bytes.length >= 26) {
    width = Math.abs(bytes.readInt32LE(18));
    height = Math.abs(bytes.readInt32LE(22));
  } else if (extension === 'jpg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xFF) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
        0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(marker)) {
        height = bytes.readUInt16BE(offset + 5);
        width = bytes.readUInt16BE(offset + 7);
        break;
      }
      offset += 2 + length;
    }
  }
  assert.ok(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0,
    'image.insertAfterParagraph could not read image dimensions');
  return { width, height };
}

function fittedInlineImageSize(pixelWidth, pixelHeight, requestedWidth, requestedHeight) {
  let width = Number(requestedWidth) || pixelWidth * 75;
  let height = Number(requestedHeight) || pixelHeight * 75;
  if (requestedWidth && !requestedHeight) height = width * pixelHeight / pixelWidth;
  if (requestedHeight && !requestedWidth) width = height * pixelWidth / pixelHeight;
  const scale = Math.min(1, 42000 / width, 28000 / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function reservePackageImageSlot(inputBytes, pendingPatches, extension) {
  const entries = readZip(inputBytes);
  const manifest = entries.get('Contents/content.hpf')?.toString('utf8') ?? '';
  const usedIds = new Set([
    ...[...manifest.matchAll(/<opf:item\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]),
    ...pendingPatches.map(patch => patch.itemId).filter(Boolean),
  ]);
  let index = 1;
  while (usedIds.has(`image${index}`)
    || entries.has(`BinData/image${index}.${extension}`)
    || pendingPatches.some(patch => patch.name === `BinData/image${index}.${extension}`)) {
    index += 1;
  }
  return { itemId: `image${index}`, href: `BinData/image${index}.${extension}` };
}

function inlinePictureXml(sectionXml, patch) {
  const pictureIds = [...sectionXml.matchAll(/<hp:pic\b[^>]*\bid="(\d+)"/g)].map(match => Number(match[1]));
  const instanceIds = [...sectionXml.matchAll(/<hp:pic\b[^>]*\binstid="(\d+)"/g)].map(match => Number(match[1]));
  const zOrders = [...sectionXml.matchAll(/<hp:pic\b[^>]*\bzOrder="(\d+)"/g)].map(match => Number(match[1]));
  const pictureId = Math.max(0, ...pictureIds) + 1;
  const instanceId = Math.max(0, ...instanceIds) + 1;
  const zOrder = Math.max(-1, ...zOrders) + 1;
  const sourceWidth = patch.pixelWidth * 75;
  const sourceHeight = patch.pixelHeight * 75;
  const scaleX = patch.width / sourceWidth;
  const scaleY = patch.height / sourceHeight;
  const comment = escapeXmlText(patch.altText || '첨부 이미지');
  return `<hp:pic id="${pictureId}" zOrder="${zOrder}" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${instanceId}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="${sourceWidth}" height="${sourceHeight}"/><hp:curSz width="${patch.width}" height="${patch.height}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${Math.round(patch.width / 2)}" centerY="${Math.round(patch.height / 2)}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="${scaleX}" e2="0" e3="0" e4="0" e5="${scaleY}" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="${patch.itemId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${sourceWidth}" y="0"/><hc:pt2 x="${sourceWidth}" y="${sourceHeight}"/><hc:pt3 x="0" y="${sourceHeight}"/></hp:imgRect><hp:imgClip left="0" right="${sourceWidth}" top="0" bottom="${sourceHeight}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${sourceWidth}" dimheight="${sourceHeight}"/><hp:effects/><hp:sz width="${patch.width}" widthRelTo="ABSOLUTE" height="${patch.height}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="CENTER" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${comment}</hp:shapeComment></hp:pic>`;
}

function insertPictureAfterParagraphXml(paragraphXml, sectionXml, patch) {
  const template = paragraphTemplateFromXml(paragraphXml);
  const sourceSegments = [...paragraphXml.matchAll(/<hp:lineseg\b[^>]*\/>/g)].map(match => match[0]);
  const last = sourceSegments.at(-1) ?? template.lineSeg;
  const lastVertPos = Number(firstMatch(last, /\bvertpos="(\d+)"/, String(template.startVertPos)));
  const lastVertSize = Number(firstMatch(last, /\bvertsize="(\d+)"/, String(template.vertSize)));
  const lastSpacing = Number(firstMatch(last, /\bspacing="(\d+)"/, String(template.spacing)));
  const pageBodyHeight = sectionPageBodyHeight(sectionXml);
  let vertPos = lastVertPos + lastVertSize + lastSpacing;
  let pOpen = template.pOpen;
  if (pageBodyHeight > 0 && vertPos + patch.height > pageBodyHeight) {
    pOpen = setXmlAttribute(pOpen, 'pageBreak', 1);
    vertPos = 0;
  }
  const lineSeg = buildLineSeg(template, 0, vertPos)
    .replace(/\bvertsize="[^"]*"/, `vertsize="${patch.height}"`)
    .replace(/\btextheight="[^"]*"/, `textheight="${patch.height}"`)
    .replace(/\bbaseline="[^"]*"/, `baseline="${patch.height}"`)
    .replace(/\bspacing="[^"]*"/, 'spacing="0"');
  const picture = inlinePictureXml(sectionXml, patch);
  const imageParagraph = `${pOpen}<hp:run charPrIDRef="${template.charPrIDRef}">${picture}</hp:run><hp:linesegarray>${lineSeg}</hp:linesegarray></hp:p>`;
  if (!patch.caption) return `${paragraphXml}${imageParagraph}`;
  const caption = buildParagraphXml(patch.caption, template, vertPos + patch.height + template.spacing).xml;
  return `${paragraphXml}${imageParagraph}${caption}`;
}

function resolveCellPackageImage(inputBytes, table, cellIndex) {
  const cellXml = extractCellXmlFromPackage(inputBytes, table, cellIndex);
  const pictures = findAllBlocks(cellXml, 'pic');
  assert.equal(
    pictures.length,
    1,
    `image.replaceInCell requires exactly one existing picture in ${table.id} cell ${cellIndex}`,
  );
  const itemId = firstMatch(pictures[0].xml, /\bbinaryItemIDRef="([^"]+)"/, null);
  assert.ok(itemId, 'image.replaceInCell target picture is missing binaryItemIDRef');
  const entries = readZip(inputBytes);
  const contentHpf = entries.get('Contents/content.hpf')?.toString('utf8') ?? '';
  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const itemTag = contentHpf.match(new RegExp(`<opf:item\\b[^>]*\\bid="${escapedId}"[^>]*/>`))?.[0];
  assert.ok(itemTag, `image.replaceInCell package item not found: ${itemId}`);
  const href = firstMatch(itemTag, /\bhref="([^"]+)"/, null);
  assert.ok(href && entries.has(href), `image.replaceInCell package bytes not found: ${href}`);
  const sectionReferences = [...entries.entries()]
    .filter(([name]) => /^Contents\/section\d+\.xml$/i.test(name))
    .reduce((count, [, value]) => (
      count + [...value.toString('utf8').matchAll(new RegExp(`\\bbinaryItemIDRef="${escapedId}"`, 'g'))].length
    ), 0);
  return { itemId, href, sectionReferences };
}

function retargetCellPictureReferenceXml(sectionXml, patch) {
  const paragraphs = findTopLevelParagraphs(sectionXml);
  const paragraph = paragraphs[patch.para];
  assert.ok(paragraph, `paragraph XML index not found for picture retarget: ${patch.para}`);
  const tables = patch.xmlTableId
    ? findAllBlocks(paragraph.xml, 'tbl')
    : findBlocks(paragraph.xml, 'tbl');
  const table = patch.xmlTableId
    ? tables.find((block, ordinal) => packageTableId(patch.section, patch.para, block.xml, ordinal) === patch.xmlTableId)
    : tables[patch.tableOrderInParagraph];
  assert.ok(table, `table XML index not found for picture retarget: ${patch.xmlTableId ?? patch.tableOrderInParagraph}`);
  const cell = findBlocks(table.xml, 'tc')[patch.cellIndex];
  assert.ok(cell, `cell XML index not found for picture retarget: ${patch.cellIndex}`);
  const pictures = findAllBlocks(cell.xml, 'pic');
  assert.equal(pictures.length, 1, 'image.replaceInCell requires exactly one existing picture in the target cell');
  const picture = pictures[0];
  const escapedOldId = patch.oldItemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\bbinaryItemIDRef="${escapedOldId}"`);
  assert.match(picture.xml, pattern, `picture does not reference expected package item: ${patch.oldItemId}`);
  const nextPictureXml = picture.xml.replace(pattern, `binaryItemIDRef="${patch.newItemId}"`);
  const nextCellXml = `${cell.xml.slice(0, picture.start)}${nextPictureXml}${cell.xml.slice(picture.end)}`;
  const start = paragraph.start + table.start + cell.start;
  const end = paragraph.start + table.start + cell.end;
  return `${sectionXml.slice(0, start)}${nextCellXml}${sectionXml.slice(end)}`;
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

function captureCellParagraphTemplate(doc, table, cellIndex, paragraphIndex) {
  const paragraph = tryJson(() => doc.getCellParaPropertiesAt(
    table.section, table.para, table.control, cellIndex, paragraphIndex,
  ));
  const character = tryJson(() => doc.getCellCharPropertiesAt(
    table.section, table.para, table.control, cellIndex, paragraphIndex, 0,
  ));
  const namedStyle = tryJson(() => doc.getCellStyleAt(
    table.section, table.para, table.control, cellIndex, paragraphIndex,
  ));
  return { paragraph, character, namedStyle };
}

function restoreCellParagraphTemplate(doc, table, cellIndex, paragraphIndex, template) {
  if (!template) return;
  const styleId = Number(template.namedStyle?.id);
  const paraShapeId = Number(template.paragraph?.paraShapeId);
  const charShapeId = Number(template.character?.charShapeId);
  if (![styleId, paraShapeId, charShapeId].every((value) => Number.isInteger(value) && value >= 0)) {
    throw structuralBatchError(
      'HWP_CELL_PARAGRAPH_TEMPLATE_UNAVAILABLE',
      'The selected HWP cell paragraph template does not expose stable style identifiers.',
      { cellIndex, paragraphIndex, styleId, paraShapeId, charShapeId },
    );
  }
  // Prefer exact paragraph/character/style identity restoration. Runtimes that
  // expose only named-style application use that public operation as the
  // source-format-safe fallback.
  const applyStyle = typeof doc.applyCellStyleIds === 'function'
    ? () => doc.applyCellStyleIds(
      table.section, table.para, table.control, cellIndex, paragraphIndex,
      styleId, paraShapeId, charShapeId,
    )
    : () => doc.applyCellStyle(
      table.section, table.para, table.control, cellIndex, paragraphIndex, styleId,
    );
  parseResult(applyStyle(), 'applyCellStyle');
}

function setCellTextWithApi(doc, table, cellIndex, text, options = {}) {
  const originalParagraphCount = doc.getCellParagraphCount(
    table.section, table.para, table.control, cellIndex,
  );
  const originalTemplates = Array.from({ length: originalParagraphCount }, (_value, paragraphIndex) => (
    captureCellParagraphTemplate(doc, table, cellIndex, paragraphIndex)
  ));
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
    const explicitTemplateIndex = options.paragraphTemplateIndices?.[index];
    const templateIndex = explicitTemplateIndex === null
      ? null
      : Number.isInteger(Number(explicitTemplateIndex))
        ? Number(explicitTemplateIndex)
        : Math.min(index, Math.max(0, originalTemplates.length - 1));
    if (templateIndex !== null) {
      restoreCellParagraphTemplate(
        doc, table, cellIndex, index, originalTemplates[templateIndex] ?? originalTemplates.at(-1),
      );
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

function equivalentExactValue(actual, expected) {
  if (actual === expected) return true;
  if ((Array.isArray(actual) && Array.isArray(expected))
    || (actual && expected && typeof actual === 'object' && typeof expected === 'object')) {
    return coreStableStringify(actual) === coreStableStringify(expected);
  }
  return false;
}

function verifyExpectedRunStyle(target, result, propertiesAt) {
  if (!result?.expectedRunStyle || !result?.expectedRunRange) return;
  const expected = result.expectedRunStyle;
  const range = result.expectedRunRange;
  const offsets = [...new Set([range.start, Math.max(range.start, range.end - 1)])];
  const aliases = {
    fontSizePt: ['fontSize', value => Number(value) * 100, value => value],
    color: [
      'textColor',
      value => String(value).toLowerCase(),
      value => String(value).toLowerCase(),
    ],
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
      const transformedExpected = expectedTransform(expectedValue);
      const transformedActual = properties ? actualTransform(properties[actualField]) : undefined;
      if (!properties || !equivalentExactValue(transformedActual, transformedExpected)) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'Structural run formatting did not survive reopening exactly.',
          {
            target,
            offset,
            field,
            expected: transformedExpected,
            actual: properties?.[actualField],
          },
        );
      }
    }
  }
}

function equivalentFormatValue(actual, expected, scope, field) {
  if (scope === 'paragraph' && typeof expected === 'number') {
    const divisors = {
      indent: 150, marginLeft: 150, marginRight: 150,
      spacingBefore: 75, spacingAfter: 75,
    };
    if (divisors[field]) {
      return Math.abs(Number(actual) - Math.round((expected / divisors[field]) * 10) / 10) < 0.01;
    }
  }
  if (typeof expected === 'number') return Number(actual) === expected;
  return equivalentExactValue(actual, expected);
}

function verifyExpectedFormat(session, target, result) {
  const expected = result?.expectedFormat;
  if (!expected) return;
  let properties = null;
  if (expected.scope === 'paragraph' && target.kind === 'paragraph') {
    properties = tryJson(() => session.doc.getParaPropertiesAt(target.sectionIndex, target.paragraphIndex));
  } else if (expected.scope === 'paragraph' && target.kind === 'cell') {
    properties = tryJson(() => session.doc.getCellParaPropertiesAt(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
      target.cellIndex, target.cellParagraphIndex,
    ));
  } else if (expected.scope === 'cell' && target.kind === 'cell') {
    properties = tryJson(() => session.doc.getCellProperties(
      target.sectionIndex, target.paragraphIndex, target.controlIndex, target.cellIndex,
    ));
  } else if (expected.scope === 'table' && target.kind === 'table') {
    properties = tryJson(() => session.doc.getTableProperties(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
    ));
  } else if (expected.scope === 'image' && target.kind === 'image') {
    properties = Array.isArray(target.cellPath)
      ? tryJson(() => session.doc.getCellPicturePropertiesByPath(
        target.sectionIndex,
        target.paragraphIndex,
        JSON.stringify(target.cellPath),
        target.controlIndex,
      ))
      : tryJson(() => session.doc.getPictureProperties(
        target.sectionIndex, target.paragraphIndex, target.controlIndex,
      ));
  } else if (expected.scope === 'shape' && target.kind === 'shape') {
    properties = tryJson(() => session.doc.getShapeProperties(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
    ));
  }
  const mismatch = !properties || Object.entries(expected.properties)
    .find(([field, value]) => !equivalentFormatValue(properties[field], value, expected.scope, field));
  if (mismatch) {
    throw structuralBatchError(
      'HWPX_CREATED_TARGET_MISMATCH',
      'Direct formatting did not survive reopening exactly.',
      { target, scope: expected.scope, mismatch, properties },
    );
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
    verifyExpectedFormat(session, target, result);
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
    if (result?.expectedTableDimensions) {
      const dimensions = tryJson(() => session.doc.getTableDimensions(
        target.sectionIndex, target.paragraphIndex, target.controlIndex,
      ));
      const mismatch = Object.entries(result.expectedTableDimensions)
        .filter(([, value]) => value !== undefined)
        .find(([field, value]) => Number(dimensions?.[field]) !== Number(value));
      if (mismatch) {
        throw structuralBatchError('HWPX_CREATED_TARGET_MISMATCH', 'Table structure dimensions did not survive reopening.', {
          target, expected: result.expectedTableDimensions, dimensions, mismatch,
        });
      }
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
    verifyExpectedFormat(session, target, result);
    return;
  }
  if (target.kind === 'deletedTable') {
    if (Number.isInteger(result?.expectedTableCount)) {
      const actualTableCount = discoverTables(session.doc).length;
      if (actualTableCount !== result.expectedTableCount) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'Deleted table count did not survive reopening.',
          { target, expectedTableCount: result.expectedTableCount, actualTableCount },
        );
      }
      return;
    }
    const table = discoverTables(session.doc).find(item =>
      item.section === target.sectionIndex
      && item.para === target.paragraphIndex
      && item.control === target.controlIndex);
    if (table) throw structuralBatchError('HWPX_CREATED_TARGET_MISMATCH', 'Deleted table still exists after reopening.', { target });
    return;
  }
  if (target.kind === 'image') {
    const properties = Array.isArray(target.cellPath)
      ? tryJson(() => session.doc.getCellPicturePropertiesByPath(
        target.sectionIndex,
        target.paragraphIndex,
        JSON.stringify(target.cellPath),
        target.controlIndex,
      ))
      : tryJson(() => session.doc.getPictureProperties(
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
    if (result?.expectedImageSha256) {
      const bytes = tryJson(() => session.doc.getControlImageData(
        target.sectionIndex,
        target.paragraphIndex,
        '',
        target.controlIndex,
      ));
      const imageBytes = bytes?.length ? Buffer.from(bytes) : null;
      const actualSha256 = imageBytes ? createHash('sha256').update(imageBytes).digest('hex') : null;
      const mimeType = tryJson(() => session.doc.getControlImageMime(
        target.sectionIndex,
        target.paragraphIndex,
        '',
        target.controlIndex,
      ));
      if (!imageBytes || imageBytes.length !== result.expectedImageByteLength
        || actualSha256 !== result.expectedImageSha256
        || (result.expectedImageMimeType && mimeType !== result.expectedImageMimeType)) {
        throw structuralBatchError(
          'HWPX_IMAGE_ASSET_MISMATCH',
          'Inserted image bytes or MIME type did not survive save and reopen exactly.',
          {
            target,
            expectedSha256: result.expectedImageSha256,
            actualSha256,
            expectedByteLength: result.expectedImageByteLength,
            actualByteLength: imageBytes?.length ?? null,
            expectedMimeType: result.expectedImageMimeType,
            actualMimeType: mimeType,
          },
        );
      }
    }
    verifyExpectedFormat(session, target, result);
    return;
  }
  if (target.kind === 'shape') {
    const properties = tryJson(() => session.doc.getShapeProperties(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
    ));
    if (!properties) {
      throw structuralBatchError(
        'HWPX_CREATED_TARGET_MISSING',
        'A structural shape target was not found after reopening the candidate.',
        { target },
      );
    }
    verifyExpectedFormat(session, target, result);
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
    verifyExpectedFormat(session, target, result);
    if (result?.expectedCellHeight !== undefined) {
      const properties = tryJson(() => session.doc.getCellProperties(
        target.sectionIndex,
        target.paragraphIndex,
        target.controlIndex,
        target.cellIndex,
      ));
      if (!properties || Number(properties.height) < Number(result.expectedCellHeight)) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'An auto-fitted table-cell row did not preserve its requested height after reopening.',
          {
            target,
            expectedCellHeight: result.expectedCellHeight,
            cellHeight: properties?.height,
          },
        );
      }
    }
    if (result?.expectedPictureCount !== undefined) {
      const table = session.readJson().tables.find((item) => item.section === target.sectionIndex
        && item.para === target.paragraphIndex
        && item.control === target.controlIndex);
      const pictureCount = Number(table?.cells?.[target.cellIndex]?.pictureCount || 0);
      if (pictureCount !== Number(result.expectedPictureCount)) {
        throw structuralBatchError(
          'HWPX_CREATED_TARGET_MISMATCH',
          'A cloned table-cell picture did not survive reopening exactly.',
          { target, expectedPictureCount: result.expectedPictureCount, pictureCount },
        );
      }
    }
    return;
  }
  if (target.kind === 'documentMetadata') {
    const metadata = readHwpxDocumentMetadata(session.inputBytes);
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

function materializeStructuralTrial(session, allowedStructuralReferenceLosses = null) {
  if (typeof session.doc.reflowLinesegs === 'function') {
    session.doc.reflowLinesegs();
  }
  if (!isZipPackage(session.inputBytes)) {
    const candidateBytes = Buffer.from(session.doc.exportHwp());
    const reopened = new HwpxApiSession(candidateBytes, { saveMode: 'hwp-export' });
    return {
      reopened,
      qualification: {
        ok: reopened.doc.getSourceFormat() === session.doc.getSourceFormat(),
        sourceFormat: session.doc.getSourceFormat(),
        outputFormat: reopened.doc.getSourceFormat(),
        formatPreserved: reopened.doc.getSourceFormat() === session.doc.getSourceFormat(),
        changedEntries: [],
        createdEntries: [],
        copiedEntries: [],
      },
    };
  }
  const candidateBytes = Buffer.from(session.doc.exportHwpx());
  const restored = restoreExportOmittedEmbeddedEntries(
    session.inputBytes,
    candidateBytes,
  );
  const qualification = qualifyHwpxCandidate(session.inputBytes, restored.bytes, {
    allowedStructuralReferenceLosses,
  });
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
    this.revision = Math.max(1, Number(options.initialRevision || 1));
    this.saveMode = options.saveMode ?? (isZipPackage(this.inputBytes) ? 'preserve-package' : 'hwp-export');
    this.analysisCache = null;
    this.resetPendingPatches();
  }

  queueDocumentMetadata(metadata) {
    assert.ok(isZipPackage(this.inputBytes), 'HWPX package metadata requires a package source');
    const manifestName = 'Contents/content.hpf';
    const pending = this.packagePatches.find(patch => patch.name === manifestName && !patch.create);
    const current = pending?.bytes?.toString('utf8')
      ?? readZip(this.inputBytes).get(manifestName)?.toString('utf8');
    assert.ok(current, 'HWPX package metadata entry Contents/content.hpf was not found');
    const bytes = Buffer.from(patchHwpxDocumentMetadata(current, metadata), 'utf8');
    if (pending) pending.bytes = bytes;
    else this.packagePatches.push({ name: manifestName, bytes });
    return { ok: true, changed: Object.keys(metadata).length, metadata };
  }

  invalidateAnalysisCache() {
    this.analysisCache = null;
  }

  resetPendingPatches() {
    for (const key of PATCH_COLLECTIONS) this[key] = [];
  }

  hasPendingPatches() {
    return PATCH_COLLECTIONS.some(key => this[key].length > 0);
  }

  adoptCommittedBytes(bytes) {
    this.inputBytes = Buffer.from(bytes);
    this.doc = new HwpDocument(new Uint8Array(this.inputBytes));
    this.resetPendingPatches();
    this.revision += 1;
    this.invalidateAnalysisCache();
  }

  exportJson() {
    if (!this.hasPendingPatches() && this.analysisCache?.revision === this.revision) {
      return this.analysisCache.json;
    }
    const sections = [];
    const blocks = [];
    for (let section = 0; section < this.doc.getSectionCount(); section += 1) {
      const paragraphCount = this.doc.getParagraphCount(section);
      const paragraphs = [];
      for (let para = 0; para < paragraphCount; para += 1) {
        const text = readBodyParagraphText(this.doc, section, para);
        const id = `s${section}_p${para}`;
        const style = tryJson(() => this.paragraphStyleIds({ paragraph: { section, number: para } })) || {};
        const paragraphFormat = tryJson(() => this.doc.getParaPropertiesAt(section, para));
        const characterFormat = text.length > 0
          ? tryJson(() => this.doc.getCharPropertiesAt(section, para, 0))
          : null;
        const measuredStyle = { ids: style, paragraph: paragraphFormat, text: characterFormat };
        const paragraphFingerprint = {
          hash: hashString(stableStringify({ kind: 'paragraph', ...measuredStyle })),
          basis: { kind: 'paragraph', ...measuredStyle },
        };
        paragraphs.push({
          id,
          section,
          para,
          text,
          style,
          paragraphFormat,
          characterFormat,
          hierarchy: measuredParagraphHierarchy(paragraphFormat, text),
          styleFingerprint: paragraphFingerprint,
          native: { section, para },
        });
        blocks.push({
          id,
          kind: 'paragraph',
          text,
          style,
          paragraphFormat,
          characterFormat,
          hierarchy: measuredParagraphHierarchy(paragraphFormat, text),
          styleFingerprint: paragraphFingerprint,
          native: { section, paragraph: para },
        });
      }
      sections.push({ section, paragraphCount, paragraphs });
    }

    const nativeTables = discoverTables(this.doc);
    const nestedTables = discoverNestedPackageTables(this.inputBytes);
    const tables = annotateTablePictureSlots(this.inputBytes, [...nativeTables, ...nestedTables]);
    const styleGraph = readStyleGraph(this.doc);
    const objectGraph = isZipPackage(this.inputBytes)
      ? readPackageObjects(this.inputBytes)
      : readNativePictureObjects(this.doc);
    const editableTargets = buildEditableTargets(sections, tables);
    const json = {
      revision: this.revision,
      sourceFormat: this.doc.getSourceFormat(),
      metadata: isZipPackage(this.inputBytes) ? readHwpxDocumentMetadata(this.inputBytes) : null,
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
    if (!this.hasPendingPatches()) {
      this.analysisCache = { revision: this.revision, json };
    }
    return json;
  }

  readJson() {
    return this.exportJson();
  }

  semanticSnapshot() {
    const json = this.exportJson();
    const sectionCount = this.doc.getSectionCount();
    const pageDefinitions = Array.from({ length: sectionCount }, (_, section) => ({
      section,
      pageDef: tryJson(() => this.doc.getPageDef(section)),
    }));
    const headerFooters = Array.from({ length: sectionCount }, (_, section) => (
      [true, false].flatMap((isHeader) => [0, 1, 2].map((applyTo) => ({
        section,
        isHeader,
        applyTo,
        value: tryJson(() => this.doc.getHeaderFooter(section, isHeader, applyTo)),
      })))
    )).flat().filter((item) => item.value?.exists);
    return {
      ...json,
      layoutGraph: {
        ...json.layoutGraph,
        pageDefinitions,
        headerFooters,
        footnotes: readNativeFootnotes(this.doc),
      },
    };
  }

  analyze() {
    return this.exportJson();
  }

  targetMap() {
    const json = this.exportJson();
    const paragraphById = new Map(json.sections.flatMap((section) => section.paragraphs || [])
      .map((paragraph) => [paragraph.id, paragraph]));
    const cellById = new Map(json.tables.flatMap((table) => (table.cells || []).map((cell) => [cell.id, { table, cell }])));
    return {
      paragraphs: (json.editableTargets?.paragraphs || []).map((target) => {
        const source = paragraphById.get(target.id);
        const pageHint = this.paragraphPageHint(source?.section, source?.para);
        return {
          ...target,
          ...(pageHint ? { pageHint } : {}),
          hierarchy: source?.hierarchy ?? null,
          paragraphFormat: source?.paragraphFormat ?? null,
          characterFormat: source?.characterFormat ?? null,
        };
      }),
      cells: (json.editableTargets?.cells || []).map((target) => {
        const source = cellById.get(target.id);
        const pageHint = source
          ? this.pageHintFromRect(source.table.layout?.bbox) ?? this.paragraphPageHint(source.table.section, source.table.para)
          : null;
        const firstParagraph = source?.cell?.paragraphs?.[0] ?? null;
        return {
          ...target,
          ...(pageHint ? { pageHint } : {}),
          hierarchy: source?.cell?.paragraphs?.length === 1 ? firstParagraph?.hierarchy ?? null : null,
          paragraphFormat: source?.cell?.paragraphs?.length === 1 ? firstParagraph?.paragraphFormat ?? null : null,
          characterFormat: source?.cell?.paragraphs?.length === 1 ? firstParagraph?.characterFormat ?? null : null,
        };
      }),
    };
  }

  pageHintFromRect(rect) {
    if (!rect || !Number.isFinite(Number(rect.y))) return null;
    const pageCount = Math.max(1, Number(this.doc.pageCount()) || 1);
    const reportedPageIndex = Math.max(0, Number(rect.pageIndex) || 0);
    const pageInfo = tryJson(() => this.doc.getPageInfo(Math.min(reportedPageIndex, pageCount - 1)));
    const pageHeight = Number(pageInfo?.height || 0);
    const flowPageIndex = pageHeight > 0 ? Math.floor(Math.max(0, Number(rect.y)) / pageHeight) : 0;
    return Math.min(pageCount, Math.max(reportedPageIndex, flowPageIndex) + 1);
  }

  paragraphPageHint(section, paragraph) {
    const rect = tryJson(() => this.doc.getCursorRect(section, paragraph, 0));
    return this.pageHintFromRect(rect);
  }

  objectInventory() {
    const nativeObjects = readNativePictureObjects(this.doc);
    const objects = (() => {
      if (!isZipPackage(this.inputBytes)) return nativeObjects;
      const packageObjects = readPackageObjects(this.inputBytes);
      let nativePictureIndex = 0;
      const pictures = packageObjects.pictures.map((picture) => {
        const native = picture.insideContainer ? null : nativeObjects.pictures[nativePictureIndex++];
        return native ? {
          ...picture,
          pageHint: native.pageHint,
          bounds: native.bounds,
          native: native.native,
          properties: native.properties,
          allowedActions: ['image.cloneToCell', 'object.format'],
        } : { ...picture, allowedActions: ['image.cloneToCell'] };
      });
      const nativeShapesByInstance = new Map(nativeObjects.shapes
        .filter((shape) => Number.isInteger(shape.properties?.instanceId))
        .map((shape) => [Number(shape.properties.instanceId), shape]));
      const matchedNativeShapeIds = new Set();
      const shapes = packageObjects.shapes.map((shape) => {
        const native = nativeShapesByInstance.get(Number(shape.shapeObjectId));
        if (native) matchedNativeShapeIds.add(native.id);
        return native ? {
          ...shape,
          type: native.type === 'group' ? shape.type : native.type,
          pageHint: native.pageHint,
          bounds: native.bounds,
          native: native.native,
          properties: native.properties,
        } : shape;
      });
      shapes.push(...nativeObjects.shapes.filter((shape) => !matchedNativeShapeIds.has(shape.id)));
      const shapeById = new Map(shapes.map((shape) => [shape.id, shape]));
      const textBoxes = packageObjects.textBoxes.map((textBox) => {
        const shape = shapeById.get(textBox.shapeId);
        return shape ? {
          ...textBox,
          pageHint: shape.pageHint,
          bounds: shape.bounds,
          native: shape.native,
        } : textBox;
      });
      return { ...packageObjects, pictures, shapes, textBoxes };
    })();
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

  readAsset(imageName) {
    const name = String(imageName || '').trim();
    assert.ok(name, 'imageName is required');
    if (isZipPackage(this.inputBytes)) {
      const bytes = readZip(this.inputBytes).get(name);
      assert.ok(bytes?.length, `embedded image not found: ${name}`);
      const extension = name.split('.').pop()?.toLowerCase();
      const mimeType = extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : ['png', 'gif', 'bmp', 'wmf', 'emf'].includes(extension) ? `image/${extension}` : null;
      return {
        name,
        bytes: Buffer.from(bytes),
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        mimeType,
      };
    }
    const inventory = readNativePictureObjects(this.doc);
    const image = inventory.images.find((item) => item.name === name);
    assert.ok(image, `embedded image not found: ${name}`);
    const picture = inventory.pictures.find((item) => item.id === image.pictureId);
    assert.ok(picture, `placed picture not found for image: ${name}`);
    const cellPathJson = Array.isArray(picture.native?.cellPath)
      ? JSON.stringify(picture.native.cellPath)
      : '';
    const bytes = this.doc.getControlImageData(picture.section, picture.paragraph, cellPathJson, picture.control);
    assert.ok(bytes?.length, `embedded image bytes unavailable: ${name}`);
    return { ...image, bytes: Buffer.from(bytes) };
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
      const pageHint = this.pageHintFromRect(table.layout?.bbox)
        ?? this.paragraphPageHint(table.section, table.para);
      return {
        kind: 'cell',
        id: cell.id,
        ...(pageHint ? { pageHint } : {}),
        location: cell.location,
        currentText: cell.text,
        table: {
          id: table.id,
          dims: table.dims,
          native: table.native,
          layout: table.layout,
        },
        flow: {
          section: table.section,
          paragraph: table.para,
          order: Number(table.tableOrderInParagraph ?? 0) + 1,
        },
        cell,
        style: cell.style,
        styleFingerprint: cell.styleFingerprint ?? styleFingerprint(cell.style),
        layout: cell.layout,
        allowedActions: cell.allowedActions,
      };
    }
    const { section, paragraph } = normalizeParagraphLocation(location);
    assert.ok(paragraph !== undefined, `paragraph location is incomplete: ${JSON.stringify(location)}`);
    const text = readBodyParagraphText(this.doc, section, paragraph);
    const style = this.paragraphStyleIds({ paragraph: { section, number: paragraph } });
    const paragraphFormat = tryJson(() => this.doc.getParaPropertiesAt(section, paragraph));
    const characterFormat = text.length > 0
      ? tryJson(() => this.doc.getCharPropertiesAt(section, paragraph, 0))
      : null;
    const measuredStyle = { ids: style, paragraph: paragraphFormat, text: characterFormat };
    const pageHint = this.paragraphPageHint(section, paragraph);
    return {
      kind: 'paragraph',
      id: `s${section}_p${paragraph}`,
      ...(pageHint ? { pageHint } : {}),
      location: { paragraph: { section, number: paragraph } },
      flow: { section, paragraph, order: 0 },
      currentText: text,
      textLength: text.length,
      style,
      paragraphFormat,
      characterFormat,
      hierarchy: measuredParagraphHierarchy(paragraphFormat, text),
      styleFingerprint: {
        hash: hashString(stableStringify({ kind: 'paragraph', ...measuredStyle })),
        basis: { kind: 'paragraph', ...measuredStyle },
      },
      allowedActions: ['text.replaceParagraph', 'text.replace', 'style.applyText'],
      native: { section, paragraph },
    };
  }

  fitText(location, text, options = {}) {
    const target = this.inspectTarget(location);
    if (target.kind !== 'cell') {
      return { text: String(text ?? ''), changed: false, truncated: false, reason: 'Text fitting applies to table cells only' };
    }
    return fitTextToCapacity(text, target.layout.capacity, options);
  }

  styleFingerprint(location) {
    const target = this.inspectTarget(location);
    if (target.kind !== 'cell') {
      return target.styleFingerprint;
    }
    return target.styleFingerprint ?? styleFingerprint(target.style);
  }

  cellTemplateParagraphXml(location) {
    if (!isZipPackage(this.inputBytes)) return '';
    const table = this.tableFromLocation(location);
    const cell = this.cellFromLocation(table, location);
    return firstCellParagraphXml(extractCellXmlFromPackage(this.inputBytes, table, cell.cellIndex));
  }

  paragraphTemplateXml(location) {
    if (!isZipPackage(this.inputBytes)) return null;
    if (location?.tableId || location?.table || location?.cell || location?.tableCell) {
      return this.cellTemplateParagraphXml(location);
    }
    return extractParagraphXmlFromPackage(this.inputBytes, location);
  }

  paragraphStyleIds(location) {
    if (!isZipPackage(this.inputBytes)) {
      if (location?.tableId || location?.table || location?.cell || location?.tableCell) {
        const table = this.tableFromLocation(location);
        const cell = this.cellFromLocation(table, location);
        const paragraphIndex = Number(location.cellParagraphIndex ?? location.cellParaIndex ?? 0);
        const paragraph = tryJson(() => this.doc.getCellParaPropertiesAt(
          table.section, table.para, table.control, cell.cellIndex, paragraphIndex, 0,
        ));
        const text = tryJson(() => this.doc.getCellCharPropertiesAt(
          table.section, table.para, table.control, cell.cellIndex, paragraphIndex, 0,
        ));
        const namedStyle = tryJson(() => this.doc.getCellStyleAt(
          table.section, table.para, table.control, cell.cellIndex, paragraphIndex,
        ));
        return stripUndefined(normalizeStyleIds({
          paraShapeId: paragraph?.paraShapeId,
          styleId: namedStyle?.id,
          charShapeId: text?.charShapeId,
        }));
      }
      const { section, paragraph } = normalizeParagraphLocation(location);
      const paragraphProperties = tryJson(() => this.doc.getParaPropertiesAt(section, paragraph));
      const characterProperties = tryJson(() => this.doc.getCharPropertiesAt(section, paragraph, 0));
      const namedStyle = tryJson(() => this.doc.getStyleAt(section, paragraph));
      return stripUndefined(normalizeStyleIds({
        paraShapeId: paragraphProperties?.paraShapeId,
        styleId: namedStyle?.id,
        charShapeId: characterProperties?.charShapeId,
      }));
    }
    if (location?.tableId || location?.table || location?.cell || location?.tableCell) {
      return paragraphStyleIdsFromXml(this.cellTemplateParagraphXml(location));
    }
    return paragraphStyleIdsFromXml(extractParagraphXmlFromPackage(this.inputBytes, location));
  }

  cellOuterStyle(location) {
    const table = this.tableFromLocation(location);
    const cell = this.cellFromLocation(table, location);
    if (!isZipPackage(this.inputBytes)) {
      const properties = tryJson(() => this.doc.getCellProperties(
        table.section, table.para, table.control, cell.cellIndex,
      ));
      return normalizeCellStyle(properties || {});
    }
    return cellOuterStyleFromXml(extractCellXmlFromPackage(this.inputBytes, table, cell.cellIndex));
  }

  resolveParagraphStyleIds(command = {}) {
    const explicit = normalizeStyleIds(command.styleIds);
    const sourceLocation = command.styleSource;
    const source = sourceLocation ? this.paragraphStyleIds(sourceLocation) : {};
    return mergeStyleIds(source, explicit);
  }

  resolveCellStyle(command = {}) {
    const explicit = normalizeCellStyle(command.cellStyle);
    const sourceLocation = command.styleSource;
    const source = sourceLocation ? this.cellOuterStyle(sourceLocation) : {};
    return mergeCellStyles(source, explicit);
  }

  resolveText(query, options = {}) {
    const rawQuery = String(query ?? '');
    assert.ok(rawQuery.length > 0, 'resolveText requires a non-empty query');
    const caseSensitive = options.caseSensitive ?? false;
    const kind = options.kind == null ? null : String(options.kind);
    const exact = options.exact === true;
    assert.ok(kind === null || kind === 'paragraph' || kind === 'cell', 'resolveText kind must be paragraph or cell');
    const hits = parseResult(this.doc.searchAllText(query, caseSensitive, options.includeCells ?? true), 'searchAllText');
    const matches = (Array.isArray(hits) ? hits : hits.matches ?? [])
      .filter((item) => item?.kind === 'paragraph' || item?.kind === 'cell')
      .filter((item) => kind === null || item?.kind === kind)
      .filter((item) => !exact || String(item?.text ?? '').trim() === rawQuery.trim());
    const occurrence = options.occurrence ?? 1;
    const match = matches[occurrence - 1];
    if (match) {
      return match;
    }

    const source = caseSensitive ? rawQuery : rawQuery.toLowerCase();
    const jsonMatches = [];
    const json = this.exportJson();
    for (const block of json.blocks) {
      if (kind === 'cell') continue;
      const haystack = caseSensitive ? block.text : block.text.toLowerCase();
      const offset = haystack.indexOf(source);
      if (exact ? String(block.text ?? '').trim() === rawQuery.trim() : offset !== -1) {
        const exactOffset = exact ? 0 : offset;
        jsonMatches.push({
          kind: 'paragraph',
          text: block.text,
          offset: exactOffset,
          range: {
            start: { nodeId: block.id, offset: exactOffset },
            end: { nodeId: block.id, offset: exactOffset + String(query).length },
          },
          location: { paragraph: { section: block.native.section ?? 0, number: block.native.paragraph ?? block.native.para ?? 0 } },
          native: block.native,
        });
      }
    }
    for (const table of json.tables) {
      if (kind === 'paragraph') continue;
      for (const cell of table.cells) {
        const haystack = caseSensitive ? cell.text : cell.text.toLowerCase();
        const offset = haystack.indexOf(source);
        if (exact ? String(cell.text ?? '').trim() === rawQuery.trim() : offset !== -1) {
          const exactOffset = exact ? 0 : offset;
          jsonMatches.push({
            kind: 'cell',
            text: cell.text,
            offset: exactOffset,
            range: {
              start: { nodeId: cell.id, offset: exactOffset },
              end: { nodeId: cell.id, offset: exactOffset + String(query).length },
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

    if (key === 'tablewritecell') {
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
        styleSource: command.styleSource,
        paragraphStyleIds: command.paragraphStyleIds,
        paragraphTemplateIndices: command.paragraphTemplateIndices,
      }];
    }

    if (key === 'tablewritecells') {
      const cells = command.cells ?? [];
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
        styleSource: cellCommand.styleSource ?? command.styleSource,
        paragraphStyleIds: cellCommand.paragraphStyleIds ?? command.paragraphStyleIds,
        paragraphTemplateIndices: cellCommand.paragraphTemplateIndices ?? command.paragraphTemplateIndices,
      }));
    }

    if (key === 'textreplaceparagraph') {
      const paragraph = normalizeParagraphLocation(location);
      return [{
        ...command,
        opId,
        op: 'replaceParagraphText',
        target: { native: paragraph },
        text,
      }];
    }

    if (key === 'textinsertafterparagraph') {
      const paragraph = normalizeParagraphLocation(location);
      return [{
        ...command,
        opId,
        op: 'insertParagraphAfter',
        target: { native: paragraph },
        text,
        styleSource: command.styleSource,
      }];
    }

    if (key === 'appendparagraph') {
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
        extendBoundarySpans: command.extendBoundarySpans === true,
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

    if (key === 'tableautofit') {
      return [{
        ...command,
        opId,
        op: 'autoFitCell',
        target: command.target ?? command.location,
        minHeight: command.minHeight === undefined ? undefined : Number(command.minHeight),
        extraPadding: command.extraPadding === undefined ? undefined : Number(command.extraPadding),
      }];
    }

    if (key === 'textreplace') {
      return [{ ...command, opId, op: 'replaceText', text }];
    }

    if (key === 'textreplacetracked') {
      return [{ ...command, opId, op: 'replaceTracked', text }];
    }

    if (key === 'imagereplace') {
      return [{
        ...command,
        opId,
        op: 'image.replace',
        imageName: command.imageName ?? command.target?.imageName ?? command.target?.name ?? location.imageName ?? location.name,
        bytesBase64: command.bytesBase64,
      }];
    }

    if (key === 'imagereplaceincell') {
      return [{
        ...command,
        opId,
        op: 'image.replaceInCell',
        target: command.target ?? command.location,
        bytesBase64: command.bytesBase64,
        mimeType: command.mimeType,
      }];
    }

    if (key === 'imageinsertafterparagraph') {
      return [{
        ...command,
        opId,
        op: 'image.insertAfterParagraph',
        target: command.target ?? command.location,
        bytesBase64: command.bytesBase64,
        mimeType: command.mimeType,
        width: command.width,
        height: command.height,
        altText: command.altText,
        caption: command.caption,
      }];
    }

    if (key === 'imageinsertincell') {
      return [{
        ...command,
        opId,
        op: 'image.insertInCell',
        target: command.target ?? command.location,
        bytesBase64: command.bytesBase64,
        mimeType: command.mimeType,
        targetParagraphIndex: command.targetParagraphIndex,
        width: command.width,
        height: command.height,
        altText: command.altText,
      }];
    }

    if (key === 'imagegenerateandreplace') {
      return [{
        ...command,
        opId,
        op: 'image.generateAndReplace',
        imageName: command.imageName ?? command.target?.imageName ?? command.target?.name ?? location.imageName ?? location.name,
        generator: command.generator ?? {},
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

    if (key === 'objectdeletetextboxbytext') {
      const section = Number(command.section ?? command.target?.section ?? command.location?.section ?? 0);
      return [{
        ...command,
        opId,
        op: 'object.deleteTextBoxByText',
        section: Number.isFinite(section) ? section : 0,
        texts: normalizeTextList(command.texts),
      }];
    }

    if (key === 'objectreplacetextboxtext') {
      const section = Number(command.section ?? command.target?.section ?? command.location?.section ?? 0);
      return [{
        ...command,
        opId,
        op: 'object.replaceTextBoxText',
        section: Number.isFinite(section) ? section : 0,
        replacements: command.replacements,
      }];
    }

    if (key === 'styleapplytext') {
      return [{
        ...command,
        opId,
        op: 'style.applyText',
        target: command.target,
        text: command.text,
        styleSource: command.styleSource,
      }];
    }

    if (key === 'tableapplycellstyle') {
      return [{
        ...command,
        opId,
        op: 'table.applyCellStyle',
        target: command.target,
        styleSource: command.styleSource,
        cellStyle: command.cellStyle,
      }];
    }

    return [{ ...command, opId: command.opId ?? opId }];
  }

  apply(commands) {
    return this.commandsBatch(commands);
  }

  commandsBatch(ops) {
    validateHwpxCommands(ops);
    const sourceFormat = isZipPackage(this.inputBytes) ? 'hwpx' : 'hwp';
    for (const op of ops) {
      const entry = resolveHwpxCommand(op);
      if (entry?.op === 'format.apply' || entry?.op === 'object.format') {
        assertFormatSourceSupport(op.scope, op.properties, sourceFormat);
      }
      const paragraphScopedCellFormat = (
        (entry?.op === 'format.apply' && ['character', 'paragraph'].includes(op.scope))
        || ['setRunStyle', 'setParagraphStyle', 'applyStyle'].includes(entry?.op)
      );
      if (paragraphScopedCellFormat) {
        const location = commandLocation(op);
        const isCellTarget = location?.tableId !== undefined
          || location?.cell !== undefined
          || location?.tableCell !== undefined
          || location?.cellIndex !== undefined
          || location?.native?.cellIndex !== undefined;
        if (isCellTarget && explicitCellParagraphIndex(op) === undefined) {
          const table = this.tableFromLocation(location);
          const cell = this.cellFromLocation(table, location);
          if ((cell.paragraphs?.length ?? 1) > 1) {
            throw structuralBatchError(
              'HWPX_CELL_PARAGRAPH_INDEX_REQUIRED',
              'Character or paragraph formatting of a multi-paragraph cell requires an explicit cellParagraphIndex.',
              {
                tableId: table.id,
                cellIndex: cell.cellIndex,
                paragraphCount: cell.paragraphs.length,
              },
            );
          }
        }
      }
    }
    if (!isZipPackage(this.inputBytes)) {
      const unsupported = ops
        .map(op => resolveHwpxCommand(op)?.op ?? op?.op)
        .filter(op => HWPX_PACKAGE_ONLY_OPS.has(op));
      if (unsupported.length) {
        const error = new Error(
          `The source is binary HWP and these commands require HWPX package XML: ${[...new Set(unsupported)].join(', ')}. Use native setRunStyle/setParagraphStyle/applyStyle commands, insert a new image, or explicitly convert the document before using package-only commands.`,
        );
        error.code = 'HWP_COMMAND_REQUIRES_HWPX_PACKAGE';
        error.details = { unsupported: [...new Set(unsupported)] };
        throw error;
      }
    }
    const locationChangingOps = ops.filter((op) => [
      'text.deleteParagraphs',
      'table.insertRows',
      'table.structure',
      'paragraph.structure',
    ].includes(resolveHwpxCommand(op)?.op));
    if (locationChangingOps.length > 0 && ops.length !== 1) {
      const error = new Error('Location-changing paragraph and table structure commands must run alone because they invalidate inspected targets.');
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
      this.adoptCommittedBytes(workingBytes);
      return { revision: this.revision, results };
    }
    const packageClassification = classifyHwpxCommands(ops);
    const hwpSource = !isZipPackage(this.inputBytes);
    const structuralReasons = [...packageClassification.reasons];
    if (hwpSource && ops.some(op => (
      ['image.insertAfterParagraph', 'image.insertInCell'].includes(resolveHwpxCommand(op)?.op ?? op?.op)
    ))) {
      structuralReasons.push(...ops
        .map(op => resolveHwpxCommand(op)?.op ?? op?.op)
        .filter(op => ['image.insertAfterParagraph', 'image.insertInCell'].includes(op)));
    }
    const classification = {
      mode: structuralReasons.length > 0 ? 'structural-export' : 'patch-safe',
      reasons: structuralReasons,
    };
    if (classification.mode === 'structural-export') {
      return this.commandsStructuralBatch(ops, classification);
    }
    const verifiesAutoFitClipping = ops.some(sourceOp =>
      resolveHwpxCommand(sourceOp)?.op === 'table.autoFit');
    const baselineAutoFitLayout = verifiesAutoFitClipping ? renderedLayoutSnapshot(this) : null;
    const autoFitBudget = verifiesAutoFitClipping ? autoFitLayoutBudget(ops) : null;
    const trial = new HwpxApiSession(this.inputBytes, { saveMode: this.saveMode });
    const trialResult = trial.commandsBatchUnsafe(ops);
    const committed = trial.save();
    if (verifiesAutoFitClipping) {
      const reopened = new HwpxApiSession(committed.bytes, { saveMode: this.saveMode });
      assertAutoFitLayoutRegression(
        baselineAutoFitLayout,
        renderedLayoutSnapshot(reopened),
        autoFitBudget,
      );
    }
    this.adoptCommittedBytes(committed.bytes);
    return { revision: this.revision, results: trialResult.results };
  }

  commandsStructuralBatch(ops, classification = classifyHwpxCommands(ops)) {
    const verifiesAutoFitClipping = ops.some(sourceOp =>
      resolveHwpxCommand(sourceOp)?.op === 'table.autoFit');
    const baselineAutoFitLayout = verifiesAutoFitClipping ? renderedLayoutSnapshot(this) : null;
    const autoFitBudget = verifiesAutoFitClipping ? autoFitLayoutBudget(ops) : null;
    let working = new HwpxApiSession(this.inputBytes, {
      saveMode: this.saveMode,
    });
    let structuralDirty = false;
    let allowedStructuralReferenceLosses = null;
    const results = [];
    const qualifications = [];

    const flushStructural = () => {
      if (!structuralDirty) return;
      const materialized = materializeStructuralTrial(
        working,
        allowedStructuralReferenceLosses,
      );
      qualifications.push(materialized.qualification);
      working = materialized.reopened;
      structuralDirty = false;
      allowedStructuralReferenceLosses = null;
    };

    for (const [opIndex, sourceOp] of ops.entries()) {
      const entry = resolveHwpxCommand(sourceOp);
      const hwpSource = !isZipPackage(working.inputBytes);
      if (entry?.op === 'field.setValues') {
        flushStructural();
        const fields = tryJson(() => working.doc.getFieldList()) ?? [];
        const updated = [];
        for (const requested of sourceOp.values) {
          let field;
          if (requested.fieldId !== undefined) {
            field = fields.find(item => Number(item.fieldId) === Number(requested.fieldId));
            assert.ok(field, `field.setValues fieldId was not found: ${requested.fieldId}`);
          } else {
            const name = String(requested.name).trim();
            const matches = fields.filter(item => String(item.name ?? '') === name);
            assert.ok(matches.length > 0, `field.setValues name was not found: ${name}`);
            if (requested.occurrence === undefined) {
              assert.equal(matches.length, 1, `field.setValues name is ambiguous; provide occurrence: ${name}`);
              [field] = matches;
            } else {
              field = matches[Number(requested.occurrence)];
              assert.ok(field, `field.setValues occurrence is out of range: ${name}[${requested.occurrence}]`);
            }
          }
          const result = parseResult(
            working.doc.setFieldValue(Number(field.fieldId), requested.value),
            'setFieldValue',
          );
          updated.push({
            fieldId: Number(field.fieldId),
            name: String(field.name ?? ''),
            oldValue: result?.oldValue ?? field.value ?? '',
            newValue: requested.value,
          });
        }
        const materialized = materializeStructuralTrial(working);
        const reopenedFields = tryJson(() => materialized.reopened.doc.getFieldList()) ?? [];
        for (const expected of updated) {
          const actual = reopenedFields.find(item => Number(item.fieldId) === expected.fieldId);
          if (!actual || String(actual.value ?? '') !== expected.newValue) {
            throw structuralBatchError(
              'HWPX_FIELD_VALUE_REOPEN_MISMATCH',
              'A field value did not survive save and reopen exactly.',
              { expected, actual: actual ?? null },
            );
          }
        }
        qualifications.push(materialized.qualification);
        working = materialized.reopened;
        results.push({
          opId: commandId(sourceOp, opIndex),
          op: entry.op,
          changed: updated.filter(item => item.oldValue !== item.newValue).length,
          fields: updated,
        });
        continue;
      }
      if (!hwpSource && entry?.op === 'table.structure' && sourceOp.action === 'deleteTable') {
        flushStructural();
        const before = working.exportJson();
        const location = commandLocation(sourceOp);
        const tableId = location?.tableId;
        const table = before.tables.find(item => item.id === tableId);
        assert.ok(table, `deleteTable target table not found: ${tableId || '(missing tableId)'}`);
        const deleted = deleteTableFromHwpxPackage(working.inputBytes, table);
        qualifications.push(deleted.qualification);
        working = new HwpxApiSession(deleted.bytes, { saveMode: 'preserve-package' });
        results.push({
          opId: commandId(sourceOp, opIndex),
          op: entry.op,
          changed: 1,
          target: {
            kind: 'deletedTable',
            sectionIndex: table.section,
            paragraphIndex: table.para,
            controlIndex: table.control,
          },
          createdTargets: [],
          native: { ok: true, method: 'package-table-delete' },
          expectedTableCount: before.tables.length - 1,
        });
        continue;
      }
      if (isZipPackage(working.inputBytes) && entry?.op === 'setDocumentMetadata') {
        flushStructural();
        const structuralOp = {
          ...sourceOp,
          opId: commandId(sourceOp, opIndex),
          op: entry.normalizeAs ?? entry.op,
        };
        const result = applyHwpxStructuralCommand(working.doc, structuralOp, {
          applyPackageMetadata: metadata => working.queueDocumentMetadata(metadata),
        });
        const saved = working.save();
        qualifications.push(qualifyHwpxCandidate(working.inputBytes, saved.bytes));
        working = new HwpxApiSession(saved.bytes, { saveMode: 'preserve-package' });
        results.push({ ...result, opId: structuralOp.opId });
        continue;
      }
      const packageStructural = entry
        && classifyHwpxCommands([{ ...sourceOp, op: entry.op }]).mode === 'structural-export';
      const useStructuralAdapter = entry && (
        (packageStructural && (entry.op !== 'appendParagraph' || hwpSource))
        || (hwpSource && ['image.insertAfterParagraph', 'image.insertInCell'].includes(entry.op))
      );
      if (useStructuralAdapter) {
        const before = working.exportJson();
        if (isZipPackage(working.inputBytes)
          && entry.op === 'table.structure'
          && sourceOp.action === 'deleteTable') {
          const location = commandLocation(sourceOp);
          const tableId = location?.tableId;
          const table = before.tables.find(item => item.id === tableId);
          assert.ok(table, `deleteTable target table not found: ${tableId || '(missing tableId)'}`);
          const tableXml = extractTableXmlFromPackageEntries(readZip(working.inputBytes), table);
          allowedStructuralReferenceLosses = inspectHwpxStructuralReferencesXml(tableXml);
        }
        if (isZipPackage(working.inputBytes)
          && entry.op === 'paragraph.structure'
          && sourceOp.action === 'mergePrevious') {
          allowedStructuralReferenceLosses = {
            objectCounts: { p: 1 },
            binaryReferenceCounts: {},
          };
        }
        const structuralOp = {
          ...sourceOp,
          opId: commandId(sourceOp, opIndex),
          op: entry.normalizeAs ?? entry.op,
        };
        const result = applyHwpxStructuralCommand(working.doc, structuralOp, {
          before,
        });
        working.invalidateAnalysisCache();
        results.push({ ...result, opId: structuralOp.opId });
        structuralDirty = true;
        continue;
      }

      flushStructural();
      for (const normalizedOp of working.normalizeCommand(sourceOp, opIndex)) {
        const patchResult = working.commandsBatchUnsafe([normalizedOp]);
        results.push(...patchResult.results);
        const sourceBytes = Buffer.from(working.inputBytes);
        const sourceFormat = working.doc.getSourceFormat();
        const saved = working.save();
        if (isZipPackage(sourceBytes)) {
          qualifications.push(qualifyHwpxCandidate(sourceBytes, saved.bytes));
        } else {
          const reopened = new HwpDocument(new Uint8Array(saved.bytes));
          qualifications.push({
            ok: reopened.getSourceFormat() === sourceFormat,
            sourceFormat,
            outputFormat: reopened.getSourceFormat(),
            formatPreserved: reopened.getSourceFormat() === sourceFormat,
            changedEntries: [],
            createdEntries: [],
            copiedEntries: [],
          });
        }
        working = new HwpxApiSession(saved.bytes, {
          saveMode: isZipPackage(saved.bytes) ? 'preserve-package' : 'hwp-export',
        });
      }
    }
    flushStructural();

    verifyStructuralCommit(working, results);
    if (verifiesAutoFitClipping) {
      assertAutoFitLayoutRegression(
        baselineAutoFitLayout,
        renderedLayoutSnapshot(working),
        autoFitBudget,
      );
    }
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

    this.adoptCommittedBytes(working.inputBytes);
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
        if (!table.packageOnly) {
          setCellTextWithApi(this.doc, table, cell.cellIndex, text, {
            paragraphTemplateIndices: op.paragraphTemplateIndices,
          });
        }
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
          if (isZipPackage(this.inputBytes)) {
            this.paragraphDeletePatches.push({ section, paras, opId: op.opId });
          } else {
            for (const para of [...new Set(paras)].sort((a, b) => b - a)) {
              parseResult(this.doc.deleteParagraph(section, para), 'deleteParagraph');
            }
            this.paragraphDeletePatches.push({ section, paras: [], opId: op.opId });
          }
        }
        results.push({ opId: op.opId, ok: true, action: 'text.deleteParagraphs', paragraphCount: op.locations.length });
      } else if (op.op === 'insertTableRows') {
        const table = this.tableFromLocation(op.target);
        assert.ok(op.rowIndex >= 0 && op.rowIndex <= table.dims.rowCount, `table.insertRows rowIndex out of range: ${op.rowIndex}`);
        assert.ok(op.templateRow >= 0 && op.templateRow < table.dims.rowCount, `table.insertRows templateRow out of range: ${op.templateRow}`);
        if (!isZipPackage(this.inputBytes)) {
          const adjacentTemplate = op.templateRow === op.rowIndex
            || op.templateRow === op.rowIndex - 1;
          assert.ok(
            adjacentTemplate,
            'HWP table.insertRows requires templateRow to be adjacent to rowIndex so native insertion can preserve the selected row style exactly.',
          );
          for (let index = 0; index < op.count; index += 1) {
            const dimensions = tryJson(() => this.doc.getTableDimensions(
              table.section, table.para, table.control,
            ));
            const rowCount = Number(dimensions?.rows ?? dimensions?.rowCount ?? table.dims.rowCount + index);
            const insertAtStart = op.rowIndex === 0;
            const insertAtEnd = op.rowIndex >= rowCount;
            const referenceRow = insertAtStart ? 0 : insertAtEnd ? rowCount - 1 : op.rowIndex;
            parseResult(this.doc.insertTableRow(
              table.section,
              table.para,
              table.control,
              referenceRow,
              insertAtEnd || (!insertAtStart && op.templateRow === op.rowIndex - 1),
            ), 'insertTableRow');
          }
          if (op.clearText !== false) {
            const dimensions = tryJson(() => this.doc.getTableDimensions(
              table.section, table.para, table.control,
            ));
            const cellCount = Number(dimensions?.cellCount ?? 0);
            for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
              const info = tryJson(() => this.doc.getCellInfo(
                table.section, table.para, table.control, cellIndex,
              ));
              const row = Number(info?.row);
              if (row >= op.rowIndex && row < op.rowIndex + op.count) {
                clearCellWithApi(this.doc, table, cellIndex);
              }
            }
          }
        }
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
        if (!isZipPackage(this.inputBytes)) {
          const tableProperties = tryJson(() => this.doc.getTableProperties(
            table.section, table.para, table.control,
          ));
          const dimensions = tryJson(() => this.doc.getTableDimensions(
            table.section, table.para, table.control,
          ));
          const currentWidth = Number(tableProperties?.tableWidth || 0);
          const currentHeight = Number(tableProperties?.tableHeight || 0);
          assert.ok(currentWidth > 0 && currentHeight > 0, 'getTableProperties returned no HWP table geometry');
          const updates = [];
          for (let cellIndex = 0; cellIndex < Number(dimensions?.cellCount || 0); cellIndex += 1) {
            const properties = tryJson(() => this.doc.getCellProperties(
              table.section, table.para, table.control, cellIndex,
            ));
            assert.ok(properties, `getCellProperties returned no HWP cell geometry: ${cellIndex}`);
            const update = { cellIdx: cellIndex };
            if (op.width !== undefined) {
              update.widthDelta = Math.round(Number(properties.width || 0) * (op.width / currentWidth - 1));
            }
            if (op.height !== undefined) {
              update.heightDelta = Math.round(Number(properties.height || 0) * (op.height / currentHeight - 1));
            }
            updates.push(update);
          }
          parseResult(this.doc.resizeTableCells(
            table.section, table.para, table.control, JSON.stringify(updates),
          ), 'resizeTableCells');
        }
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
        if (!isZipPackage(this.inputBytes)) {
          const properties = tryJson(() => this.doc.getCellProperties(
            table.section, table.para, table.control, cell.cellIndex,
          ));
          assert.ok(properties, 'getCellProperties returned no HWP cell geometry');
          const update = { cellIdx: cell.cellIndex };
          if (op.width !== undefined) update.widthDelta = op.width - Number(properties.width || 0);
          if (op.height !== undefined) update.heightDelta = op.height - Number(properties.height || 0);
          parseResult(this.doc.resizeTableCells(
            table.section, table.para, table.control, JSON.stringify([update]),
          ), 'resizeTableCells');
        }
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
      } else if (op.op === 'autoFitCell') {
        const table = this.tableFromLocation(op.target);
        const measured = applyHwpxStructuralCommand(this.doc, {
          ...op,
          op: 'table.autoFit',
        }, { before: this.exportJson() });
        const desiredHeight = Number(measured.expectedCellHeight || 0);
        for (const update of measured.native?.updates || []) {
          this.cellSizePatches.push({
            section: table.section,
            para: table.para,
            tableOrderInParagraph: table.tableOrderInParagraph,
            xmlTableId: table.packageOnly ? table.id : null,
            cellIndex: Number(update.cellIdx),
            height: desiredHeight,
            opId: op.opId,
          });
        }
        results.push({
          opId: op.opId,
          ok: true,
          action: 'table.autoFit',
          target: measured.target,
          changed: measured.native?.updates?.length || 0,
          expectedCellHeight: desiredHeight,
          measuredContentHeight: measured.measuredContentHeight,
          previousCellHeight: measured.previousCellHeight,
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
          expectedPictureCount: Number(cell.pictureCount || 0) + 1,
        });
      } else if (op.op === 'image.insertInCell') {
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        const bytes = op.bytesBase64 ? Buffer.from(op.bytesBase64, 'base64') : null;
        assert.ok(bytes && bytes.length > 0, 'image.insertInCell requires bytesBase64');
        const format = imagePackageFormat(bytes, op.mimeType);
        const pixels = imagePixelDimensions(bytes, format.extension);
        const requested = fittedInlineImageSize(pixels.width, pixels.height, op.width, op.height);
        const cellStyle = cell.style?.cell ?? {};
        const innerWidth = Math.max(1, Number(cellStyle.width || 0)
          - Number(cellStyle.paddingLeft || 0) - Number(cellStyle.paddingRight || 0));
        const innerHeight = Math.max(1, Number(cellStyle.height || 0)
          - Number(cellStyle.paddingTop || 0) - Number(cellStyle.paddingBottom || 0));
        const scale = Math.min(1, innerWidth / requested.width, innerHeight / requested.height);
        const size = {
          width: Math.max(1, Math.round(requested.width * scale)),
          height: Math.max(1, Math.round(requested.height * scale)),
        };
        const slot = reservePackageImageSlot(this.inputBytes, this.packagePatches, format.extension);
        const imageSha256 = createHash('sha256').update(bytes).digest('hex');
        this.pictureClonePatches.push({
          section: table.section,
          para: table.para,
          tableOrderInParagraph: table.tableOrderInParagraph,
          xmlTableId: table.packageOnly ? table.id : null,
          cellIndex: cell.cellIndex,
          targetParagraphIndex: Number(op.targetParagraphIndex ?? 0),
          itemId: slot.itemId,
          pixelWidth: pixels.width,
          pixelHeight: pixels.height,
          width: size.width,
          height: size.height,
          altText: String(op.altText || ''),
          newImage: true,
          opId: op.opId,
        });
        this.packagePatches.push({
          name: slot.href,
          itemId: slot.itemId,
          mediaType: format.mediaType,
          bytes: Buffer.from(bytes),
          create: true,
          opId: op.opId,
        });
        results.push({
          opId: op.opId,
          ok: true,
          action: 'image.insertInCell',
          target: cell.id,
          imageName: slot.href,
          sha256: imageSha256,
          byteLength: bytes.length,
          width: size.width,
          height: size.height,
          expectedPictureCount: Number(cell.pictureCount || 0) + 1,
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
      } else if (op.op === 'style.applyText') {
        const target = this.inspectTarget(op.target);
        const nextText = op.text !== undefined ? op.text : target.currentText;
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
        const bytes = op.bytesBase64 ? Buffer.from(op.bytesBase64, 'base64') : null;
        assert.ok(bytes && bytes.length > 0, 'image.replace requires bytesBase64');
        this.packagePatches.push({ name: op.imageName, bytes: Buffer.from(bytes), opId: op.opId });
        results.push({ opId: op.opId, ok: true, target: op.imageName, action: 'image.replace', byteLength: bytes.length });
      } else if (op.op === 'image.replaceInCell') {
        const table = this.tableFromLocation(op.target);
        const cell = this.cellFromLocation(table, op.target);
        const bytes = op.bytesBase64 ? Buffer.from(op.bytesBase64, 'base64') : null;
        assert.ok(bytes && bytes.length > 0, 'image.replaceInCell requires bytesBase64');
        const format = imagePackageFormat(bytes, op.mimeType);
        const slot = resolveCellPackageImage(this.inputBytes, table, cell.cellIndex);
        const imageSha256 = createHash('sha256').update(bytes).digest('hex');
        let imageName;
        if (slot.sectionReferences === 1) {
          imageName = `BinData/${slot.itemId}.${format.extension}`;
          this.packagePatches.push({
            name: slot.href,
            replacementName: imageName,
            itemId: slot.itemId,
            mediaType: format.mediaType,
            bytes: Buffer.from(bytes),
            opId: op.opId,
          });
        } else {
          const replacementSlot = reservePackageImageSlot(
            this.inputBytes,
            this.packagePatches,
            format.extension,
          );
          imageName = replacementSlot.href;
          this.pictureReferencePatches.push({
            section: table.section,
            para: table.para,
            tableOrderInParagraph: table.tableOrderInParagraph,
            xmlTableId: table.packageOnly ? table.id : null,
            cellIndex: cell.cellIndex,
            oldItemId: slot.itemId,
            newItemId: replacementSlot.itemId,
            opId: op.opId,
          });
          this.packagePatches.push({
            name: replacementSlot.href,
            itemId: replacementSlot.itemId,
            mediaType: format.mediaType,
            bytes: Buffer.from(bytes),
            create: true,
            opId: op.opId,
          });
        }
        results.push({
          opId: op.opId,
          ok: true,
          target: cell.id,
          action: 'image.replaceInCell',
          imageName,
          sha256: imageSha256,
          byteLength: bytes.length,
        });
      } else if (op.op === 'image.insertAfterParagraph') {
        const target = this.inspectTarget(op.target);
        assert.equal(target.kind, 'paragraph', 'image.insertAfterParagraph requires a paragraph target');
        const bytes = op.bytesBase64 ? Buffer.from(op.bytesBase64, 'base64') : null;
        assert.ok(bytes && bytes.length > 0, 'image.insertAfterParagraph requires bytesBase64');
        const format = imagePackageFormat(bytes, op.mimeType);
        const pixels = imagePixelDimensions(bytes, format.extension);
        const size = fittedInlineImageSize(pixels.width, pixels.height, op.width, op.height);
        const slot = reservePackageImageSlot(this.inputBytes, this.packagePatches, format.extension);
        const imageSha256 = createHash('sha256').update(bytes).digest('hex');
        this.pictureInsertPatches.push({
          section: target.native.section,
          para: target.native.paragraph,
          itemId: slot.itemId,
          pixelWidth: pixels.width,
          pixelHeight: pixels.height,
          width: size.width,
          height: size.height,
          altText: String(op.altText || ''),
          caption: String(op.caption || ''),
          opId: op.opId,
        });
        this.packagePatches.push({
          name: slot.href,
          itemId: slot.itemId,
          mediaType: format.mediaType,
          bytes: Buffer.from(bytes),
          create: true,
          opId: op.opId,
        });
        results.push({
          opId: op.opId,
          ok: true,
          target: target.id,
          action: 'image.insertAfterParagraph',
          imageName: slot.href,
          sha256: imageSha256,
          byteLength: bytes.length,
        });
      } else if (op.op === 'image.generateAndReplace') {
        assert.ok(op.imageName, 'image.generateAndReplace requires imageName');
        assert.match(op.imageName, /\.png$/i, 'image.generateAndReplace currently requires a PNG package entry');
        const bytes = generatePngBytes(op.generator);
        this.packagePatches.push({ name: op.imageName, bytes, opId: op.opId });
        results.push({ opId: op.opId, ok: true, target: op.imageName, action: 'image.generateAndReplace', byteLength: bytes.length });
      } else if (op.op === 'object.deleteTextBoxByText') {
        assert.ok(op.texts?.length, 'object.deleteTextBoxByText requires texts.');
        const section = op.section ?? 0;
        const preview = previewObjectSectionXml(this.inputBytes, section, this.shapePatches, this.textBoxPatches);
        const matchCounts = exactRectTextMatchCounts(preview, op.texts);
        const missing = [...matchCounts].filter(([, count]) => count === 0).map(([text]) => text);
        if (missing.length) {
          throw structuralBatchError(
            'HWPX_TEXTBOX_NOT_FOUND',
            'object.deleteTextBoxByText requires every exact visible-text selector to match an inventoried text box.',
            { section, missing },
          );
        }
        const matchedTextBoxCount = [...matchCounts.values()].reduce((sum, count) => sum + count, 0);
        this.shapePatches.push({ section, texts: op.texts, opId: op.opId });
        results.push({
          opId: op.opId,
          ok: true,
          action: 'object.deleteTextBoxByText',
          section,
          selectorCount: op.texts.length,
          matchedTextBoxCount,
        });
      } else if (op.op === 'object.replaceTextBoxText') {
        assert.ok(op.replacements?.length, 'object.replaceTextBoxText requires replacements.');
        const section = op.section ?? 0;
        let preview = previewObjectSectionXml(this.inputBytes, section, this.shapePatches, this.textBoxPatches);
        let matchedTextBoxCount = 0;
        for (const replacement of op.replacements) {
          const matchCount = exactRectTextMatchCounts(preview, [replacement.find]).get(normalizeObjectText(replacement.find)) ?? 0;
          if (matchCount === 0) {
            throw structuralBatchError(
              'HWPX_TEXTBOX_NOT_FOUND',
              'object.replaceTextBoxText requires every exact visible-text selector to match an inventoried text box.',
              { section, missing: [replacement.find] },
            );
          }
          matchedTextBoxCount += matchCount;
          preview = replaceRectTextBoxText(preview, [replacement]);
        }
        this.textBoxPatches.push({ section, replacements: op.replacements, opId: op.opId });
        results.push({
          opId: op.opId,
          ok: true,
          action: 'object.replaceTextBoxText',
          section,
          replacementCount: op.replacements.length,
          matchedTextBoxCount,
        });
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
        const maxLines = cell.layout?.capacity?.maxLines;
        const requiredLines = estimatedWrappedLineCount(cell.text, cell.layout?.capacity);
        const explicitParagraphs = String(cell.text ?? '').split('\n').length;
        if (maxLines && requiredLines && requiredLines > maxLines) {
          issues.push({
            severity: 'warning',
            code: 'cell-content-clipped',
            message: 'Estimated line capacity suggests that cell content may be clipped; confirm with rendered-layout evidence.',
            location: cell.location,
            explicitParagraphs,
            requiredLines,
            maxLines,
            requiredHeight: Math.ceil(requiredLines * Number(cell.layout.capacity.basis?.lineHeight || 0)),
            availableHeight: Number(cell.layout.capacity.basis?.innerHeight || 0),
          });
        }
      }
    }
    if (options.baselineJson) {
      if (Number(options.baselineJson.pageCount) !== Number(json.pageCount)) {
        issues.push({
          severity: 'warning',
          code: 'page-count-changed',
          message: 'The rendered page count changed from the opened source. Confirm that the pagination change is intentional.',
          before: Number(options.baselineJson.pageCount),
          after: Number(json.pageCount),
          delta: Number(json.pageCount) - Number(options.baselineJson.pageCount),
        });
      }
      const baselineTables = options.baselineJson.tables ?? [];
      const deletedTableIds = new Set(options.deletedTableIds ?? []);
      const matchedTables = matchBaselineTables(baselineTables, json.tables ?? [], deletedTableIds);
      const requiredTableIds = new Set(options.templatePolicy?.requiredTableIds || []);
      const removableTableIds = new Set(options.templatePolicy?.removableTableIds || []);
      for (const baselineTable of baselineTables) {
        const currentTable = deletedTableIds.has(baselineTable.id)
          ? null
          : matchedTables.get(baselineTable);
        if (!currentTable) {
          if (!removableTableIds.has(baselineTable.id)) {
            issues.push({
              severity: requiredTableIds.has(baselineTable.id) ? 'error' : 'warning',
              code: requiredTableIds.has(baselineTable.id) ? 'required-table-missing' : 'unclassified-table-missing',
              message: requiredTableIds.has(baselineTable.id)
                ? 'A table marked required by the template policy is missing.'
                : 'An unclassified baseline table is missing; classify it as removable or required.',
              tableId: baselineTable.id,
            });
          }
          continue;
        }
        const baselineDimensions = normalizedTableDimensions(baselineTable.dims);
        const currentDimensions = normalizedTableDimensions(currentTable.dims);
        if ((baselineDimensions.rows !== null && currentDimensions.rows !== null
            && baselineDimensions.rows !== currentDimensions.rows)
          || (baselineDimensions.columns !== null && currentDimensions.columns !== null
            && baselineDimensions.columns !== currentDimensions.columns)) {
          issues.push({
            severity: 'warning',
            code: 'table-dimensions-changed',
            message: 'Table dimensions changed from the opened source. Confirm that this template change is intentional.',
            tableId: baselineTable.id,
            before: baselineTable.dims,
            after: currentTable.dims,
          });
        }
        for (const baselineCell of baselineTable.cells ?? []) {
          const currentCell = currentTable.cells?.find(cell =>
            Number(cell.cellIndex) === Number(baselineCell.cellIndex));
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
      const currentImages = new Map((json.objectGraph?.images || []).map((image) => [image.name, image]));
      const baselinePictures = options.baselineJson.objectGraph?.pictures ?? [];
      const currentPictures = json.objectGraph?.pictures ?? [];
      const requiredImageNames = new Set(options.templatePolicy?.requiredImageNames || []);
      const replaceableImageNames = new Set(options.templatePolicy?.replaceableImageNames || []);
      for (const baselineImage of options.baselineJson.objectGraph?.images ?? []) {
        const currentImage = currentImages.get(baselineImage.name);
        if (!currentImage) {
          issues.push({
            severity: requiredImageNames.has(baselineImage.name) ? 'error' : 'warning',
            code: requiredImageNames.has(baselineImage.name) ? 'required-image-missing' : 'unclassified-image-missing',
            message: requiredImageNames.has(baselineImage.name)
              ? 'An embedded image marked required by the template policy is missing.'
              : 'An unclassified baseline image is missing; classify it as replaceable or required.',
            imageName: baselineImage.name,
            beforeSha256: baselineImage.sha256,
          });
        } else if (baselineImage.sha256 && currentImage.sha256 && baselineImage.sha256 !== currentImage.sha256
          && !replaceableImageNames.has(baselineImage.name)) {
          const required = requiredImageNames.has(baselineImage.name);
          issues.push({
            severity: required ? 'error' : 'info',
            code: required ? 'required-image-bytes-changed' : 'image-bytes-changed',
            message: required
              ? 'An embedded image marked required changed bytes from the opened source.'
              : 'Embedded image bytes changed from the opened source.',
            imageName: baselineImage.name,
            beforeSha256: baselineImage.sha256,
            afterSha256: currentImage.sha256,
          });
        }
        if (requiredImageNames.has(baselineImage.name)) {
          const logicalReference = imageLogicalReference(baselineImage.name);
          const beforePlacementCount = baselinePictures.filter(picture =>
            String(picture.binItemIDRef ?? picture.binaryItemIDRef ?? '') === logicalReference).length;
          const afterPlacementCount = currentPictures.filter(picture =>
            String(picture.binItemIDRef ?? picture.binaryItemIDRef ?? '') === logicalReference).length;
          if (afterPlacementCount < beforePlacementCount) {
            issues.push({
              severity: 'error',
              code: 'required-image-placement-missing',
              message: 'One or more placements of an image marked required disappeared.',
              imageName: baselineImage.name,
              before: beforePlacementCount,
              after: afterPlacementCount,
            });
          }
        }
      }
      const baselinePictureCount = Number(options.baselineJson.objectGraph?.pictures?.length || 0);
      const currentPictureCount = Number(json.objectGraph?.pictures?.length || 0);
      if (currentPictureCount < baselinePictureCount) {
        issues.push({
          severity: 'warning',
          code: 'baseline-picture-count-decreased',
          message: 'One or more placed picture objects disappeared from the document.',
          before: baselinePictureCount,
          after: currentPictureCount,
        });
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
    if (this.saveMode === 'hwp-export') {
      if (!this.hasPendingPatches()) {
        return {
          bytes: Buffer.from(this.inputBytes),
          revision: this.revision,
          validation: this.validationReport(new HwpDocument(new Uint8Array(this.inputBytes))),
        };
      }
      const saved = Buffer.from(this.doc.exportHwp());
      const reopened = new HwpDocument(new Uint8Array(saved));
      this.revision += 1;
      return { bytes: saved, revision: this.revision, validation: this.validationReport(reopened) };
    }
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
          + this.pictureClonePatches.length + this.pictureInsertPatches.length
          + this.pictureReferencePatches.length + this.packagePatches.length
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

    if (!this.hasPendingPatches()) {
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
      ...this.pictureInsertPatches.map((patch) => patch.section),
      ...this.pictureReferencePatches.map((patch) => patch.section),
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
        this.pictureInsertPatches,
        this.pictureReferencePatches,
        this.shapePatches,
        this.textBoxPatches,
      );
      entries.set(sectionName, Buffer.from(nextSectionXml, 'utf8'));
    }
    for (const patch of this.packagePatches) {
      if (patch.create) {
        assert.ok(!entries.has(patch.name), `package entry already exists: ${patch.name}`);
        entries.set(patch.name, patch.bytes);
        const manifestName = 'Contents/content.hpf';
        const manifest = entries.get(manifestName)?.toString('utf8') ?? '';
        assert.ok(manifest.includes('</opf:manifest>'), 'HWPX package manifest is missing');
        const itemTag = `<opf:item id="${patch.itemId}" href="${patch.name}" media-type="${patch.mediaType}" isEmbeded="1"/>`;
        entries.set(manifestName, Buffer.from(manifest.replace('</opf:manifest>', `${itemTag}</opf:manifest>`), 'utf8'));
      } else if (patch.replacementName) {
        assert.ok(entries.has(patch.name), `package entry not found: ${patch.name}`);
        if (patch.replacementName !== patch.name) entries.delete(patch.name);
        entries.set(patch.replacementName, patch.bytes);
        const manifestName = 'Contents/content.hpf';
        const manifest = entries.get(manifestName)?.toString('utf8') ?? '';
        const escapedId = patch.itemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const itemPattern = new RegExp(`<opf:item\\b[^>]*\\bid="${escapedId}"[^>]*/>`);
        const itemTag = manifest.match(itemPattern)?.[0];
        assert.ok(itemTag, `package item not found while saving: ${patch.itemId}`);
        const nextItemTag = setXmlAttribute(
          setXmlAttribute(itemTag, 'href', patch.replacementName),
          'media-type',
          patch.mediaType,
        );
        entries.set(manifestName, Buffer.from(manifest.replace(itemPattern, nextItemTag), 'utf8'));
      } else {
        assert.ok(entries.has(patch.name), `package entry not found: ${patch.name}`);
        entries.set(patch.name, patch.bytes);
      }
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
