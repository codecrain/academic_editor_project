import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import initHwpx, { HwpDocument } from '../editor_hwpx/pkg/rhwp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DOC_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

globalThis.measureTextWidth = (text) => String(text ?? '').length * 950;

let hwpxReady = null;

function ensureHwpxReady() {
  hwpxReady ??= initHwpx({
    module_or_path: readFileSync(path.join(repoRoot, 'editor_hwpx/pkg/rhwp_bg.wasm')),
  });
  return hwpxReady;
}

function loadHwpxDocument() {
  return new HwpDocument(new Uint8Array(readFileSync(path.join(repoRoot, 'editor_hwpx/samples/hwpx/ref/ref_text.hwpx'))));
}

function parseResult(value) {
  return typeof value === 'string' && value.trim().startsWith('{') ? JSON.parse(value) : value;
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let j = 0; j < 8; j += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

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
    central.writeUInt16LE(8, 10);
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

function readZip(buffer) {
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
    const data = method === 0 ? compressed : inflateRawSync(compressed);
    entries.set(name, data);

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function unescapeXml(text) {
  return String(text)
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function runPropertiesXml(style = {}) {
  const parts = [];
  if (style.bold) {
    parts.push('<w:b/>');
  }
  if (style.italic) {
    parts.push('<w:i/>');
  }
  if (style.textColor) {
    parts.push(`<w:color w:val="${style.textColor.replace(/^#/, '').toUpperCase()}"/>`);
  }
  if (style.fontSize) {
    parts.push(`<w:sz w:val="${Math.round(Number(style.fontSize) * 2)}"/>`);
  }
  if (!parts.length) {
    return '';
  }
  return `<w:rPr>${parts.join('')}</w:rPr>`;
}

function paragraphPropertiesXml(style = {}) {
  const parts = [];
  if (style.styleId) {
    parts.push(`<w:pStyle w:val="${escapeXml(style.styleId)}"/>`);
  }
  if (style.align) {
    parts.push(`<w:jc w:val="${escapeXml(style.align)}"/>`);
  }
  if (style.spacingBefore || style.spacingAfter || style.lineSpacing) {
    parts.push(
      `<w:spacing${style.spacingBefore ? ` w:before="${style.spacingBefore}"` : ''}${style.spacingAfter ? ` w:after="${style.spacingAfter}"` : ''}${style.lineSpacing ? ` w:line="${style.lineSpacing}" w:lineRule="auto"` : ''}/>`,
    );
  }
  if (!parts.length) {
    return '';
  }
  return `<w:pPr>${parts.join('')}</w:pPr>`;
}

function paragraphXml(text, options = {}) {
  return `<w:p>${paragraphPropertiesXml(options.paragraphStyle)}<w:r>${runPropertiesXml(options.runStyle)}<w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function tableXml(rows, cols) {
  const cells = Array.from({ length: cols }, () => '<w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>').join('');
  const row = `<w:tr>${cells}</w:tr>`;
  return `<w:tbl>${Array.from({ length: rows }, () => row).join('')}</w:tbl>`;
}

function createDocxBytes({ table = false } = {}) {
  const body = `${paragraphXml('Alpha Beta Gamma')}${table ? tableXml(2, 2) : ''}<w:sectPr/>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORD_NS}"><w:body>${body}</w:body></w:document>`;
  return createZip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', documentXml],
  ]);
}

function getDocumentXml(docxBytes) {
  const xml = readZip(Buffer.from(docxBytes)).get('word/document.xml');
  assert.ok(xml, 'word/document.xml must exist');
  return xml.toString('utf8');
}

function setDocumentXml(docxBytes, documentXml) {
  const entries = readZip(Buffer.from(docxBytes));
  entries.set('word/document.xml', Buffer.from(documentXml, 'utf8'));
  return createZip([...entries.entries()]);
}

function getZipText(docxBytes, name, fallback = '') {
  const entry = readZip(Buffer.from(docxBytes)).get(name);
  return entry ? entry.toString('utf8') : fallback;
}

function setZipText(docxBytes, name, text) {
  const entries = readZip(Buffer.from(docxBytes));
  entries.set(name, Buffer.from(text, 'utf8'));
  return createZip([...entries.entries()]);
}

function ensureContentTypeOverride(docxBytes, partName, contentType) {
  const xml = getZipText(docxBytes, '[Content_Types].xml');
  if (xml.includes(`PartName="${partName}"`)) {
    return docxBytes;
  }
  return setZipText(
    docxBytes,
    '[Content_Types].xml',
    xml.replace('</Types>', `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`),
  );
}

function ensurePackageRelationship(docxBytes, id, type, target) {
  const rels = getZipText(docxBytes, '_rels/.rels');
  if (rels.includes(`Id="${id}"`)) {
    return docxBytes;
  }
  return setZipText(
    docxBytes,
    '_rels/.rels',
    rels.replace('</Relationships>', `<Relationship Id="${id}" Type="${type}" Target="${target}"/></Relationships>`),
  );
}

function ensureDocumentRelationship(docxBytes, id, type, target) {
  const fallback = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"></Relationships>`;
  const rels = getZipText(docxBytes, 'word/_rels/document.xml.rels', fallback);
  if (rels.includes(`Id="${id}"`)) {
    return docxBytes;
  }
  return setZipText(
    docxBytes,
    'word/_rels/document.xml.rels',
    rels.replace('</Relationships>', `<Relationship Id="${id}" Type="${type}" Target="${target}"/></Relationships>`),
  );
}

function ensureDocumentRelationshipNamespace(docxBytes) {
  const xml = getDocumentXml(docxBytes);
  if (xml.includes('xmlns:r=')) {
    return docxBytes;
  }
  return setDocumentXml(
    docxBytes,
    xml.replace('<w:document ', `<w:document xmlns:r="${DOC_REL_NS}" `),
  );
}

function updateSectPr(docxBytes, updater) {
  const xml = getDocumentXml(docxBytes);
  const selfClosing = xml.match(/<w:sectPr\b[^>]*\/>/);
  if (selfClosing) {
    const replacement = updater('');
    return setDocumentXml(docxBytes, `${xml.slice(0, selfClosing.index)}<w:sectPr>${replacement}</w:sectPr>${xml.slice(selfClosing.index + selfClosing[0].length)}`);
  }

  const expanded = xml.match(/<w:sectPr\b[^>]*>([\s\S]*?)<\/w:sectPr>/);
  assert.ok(expanded, 'sectPr must exist');
  const replacement = updater(expanded[1]);
  return setDocumentXml(docxBytes, `${xml.slice(0, expanded.index)}<w:sectPr>${replacement}</w:sectPr>${xml.slice(expanded.index + expanded[0].length)}`);
}

function upsertSectPrChild(body, tagName, childXml) {
  const pattern = new RegExp(`<w:${tagName}\\b[\\s\\S]*?<\\/w:${tagName}>|<w:${tagName}\\b[^>]*/>`, 'g');
  if (pattern.test(body)) {
    return body.replace(pattern, childXml);
  }
  return `${childXml}${body}`;
}

function defaultStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${WORD_NS}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
}

function docxStyleXml(style) {
  const type = style.type || 'paragraph';
  const pPr = type === 'paragraph' ? paragraphPropertiesXml(style.paragraphStyle) : '';
  const rPr = runPropertiesXml(style.runStyle);
  return `<w:style w:type="${type}" w:styleId="${escapeXml(style.styleId)}"><w:name w:val="${escapeXml(style.name || style.styleId)}"/>${pPr}${rPr}</w:style>`;
}

function ensureStylesPart(docxBytes) {
  let next = ensureContentTypeOverride(
    docxBytes,
    '/word/styles.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
  );
  next = ensureDocumentRelationship(next, 'rIdStyles', `${OFFICE_REL_NS}/styles`, 'styles.xml');
  if (!readZip(Buffer.from(next)).has('word/styles.xml')) {
    next = setZipText(next, 'word/styles.xml', defaultStylesXml());
  }
  return next;
}

function applyDocxStyleDefinition(docxBytes, style) {
  let next = ensureStylesPart(docxBytes);
  const stylesXml = getZipText(next, 'word/styles.xml', defaultStylesXml());
  const stylePattern = new RegExp(`<w:style\\b[^>]*w:styleId="${style.styleId}"[\\s\\S]*?<\\/w:style>`);
  const styleXml = docxStyleXml(style);
  const updated = stylePattern.test(stylesXml)
    ? stylesXml.replace(stylePattern, styleXml)
    : stylesXml.replace('</w:styles>', `${styleXml}</w:styles>`);
  return setZipText(next, 'word/styles.xml', updated);
}

function applyDocxPageSetup(docxBytes, setup) {
  return updateSectPr(docxBytes, (body) => {
    const withSize = upsertSectPrChild(
      body,
      'pgSz',
      `<w:pgSz w:w="${setup.width}" w:h="${setup.height}"${setup.orientation === 'landscape' ? ' w:orient="landscape"' : ''}/>`,
    );
    return upsertSectPrChild(
      withSize,
      'pgMar',
      `<w:pgMar w:top="${setup.margins.top}" w:right="${setup.margins.right}" w:bottom="${setup.margins.bottom}" w:left="${setup.margins.left}" w:header="${setup.margins.header || 720}" w:footer="${setup.margins.footer || 720}" w:gutter="${setup.margins.gutter || 0}"/>`,
    );
  });
}

function applyDocxHeaderFooter(docxBytes, op) {
  let next = ensureDocumentRelationshipNamespace(docxBytes);
  next = ensureContentTypeOverride(
    next,
    '/word/header1.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
  );
  next = ensureDocumentRelationship(next, 'rIdHeader1', `${OFFICE_REL_NS}/header`, 'header1.xml');
  next = setZipText(
    next,
    'word/header1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${WORD_NS}">${paragraphXml(op.text, { paragraphStyle: { align: op.align || 'center' } })}</w:hdr>`,
  );
  return updateSectPr(next, (body) => {
    const withoutHeader = body.replace(/<w:headerReference\b[^>]*\/>/g, '');
    return `<w:headerReference w:type="default" r:id="rIdHeader1"/>${withoutHeader}`;
  });
}

function defaultFootnotesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="${WORD_NS}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote></w:footnotes>`;
}

function applyDocxFootnote(docxBytes, op) {
  let next = ensureContentTypeOverride(
    docxBytes,
    '/word/footnotes.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
  );
  next = ensureDocumentRelationship(next, 'rIdFootnotes', `${OFFICE_REL_NS}/footnotes`, 'footnotes.xml');
  const footnotesXml = getZipText(next, 'word/footnotes.xml', defaultFootnotesXml());
  const ids = [...footnotesXml.matchAll(/w:id="(\d+)"/g)].map((match) => Number(match[1]));
  const nextId = Math.max(1, ...ids) + 1;
  const updatedFootnotes = footnotesXml.replace(
    '</w:footnotes>',
    `<w:footnote w:id="${nextId}">${paragraphXml(op.text)}</w:footnote></w:footnotes>`,
  );
  next = setZipText(next, 'word/footnotes.xml', updatedFootnotes);
  return updateDocxParagraph(next, op.target.range.start.nodeId, (paragraph) => {
    return paragraph.replace('</w:p>', `<w:r><w:footnoteReference w:id="${nextId}"/></w:r></w:p>`);
  });
}

function applyDocxMetadata(docxBytes, op) {
  let next = ensureContentTypeOverride(
    docxBytes,
    '/docProps/core.xml',
    'application/vnd.openxmlformats-package.core-properties+xml',
  );
  next = ensurePackageRelationship(
    next,
    'rIdCoreProps',
    `${PACKAGE_REL_NS}/metadata/core-properties`,
    'docProps/core.xml',
  );
  return setZipText(
    next,
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(op.title || '')}</dc:title><dc:subject>${escapeXml(op.subject || '')}</dc:subject></cp:coreProperties>`,
  );
}

function paragraphRanges(xml) {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match, index) => ({
    id: `p_${index}`,
    index,
    start: match.index,
    end: match.index + match[0].length,
    xml: match[0],
    text: [...match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((part) => unescapeXml(part[1]))
      .join(''),
  }));
}

function exportDocxJson(docxBytes) {
  const xml = getDocumentXml(docxBytes);
  return {
    revision: 1,
    pages: [{ page: 1, blockIds: paragraphRanges(xml).map((p) => p.id) }],
    blocks: paragraphRanges(xml).map((p) => ({
      id: p.id,
      kind: 'paragraph',
      text: p.text,
      native: { paragraph: p.index },
    })),
  };
}

function resolveDocxTextTarget(docxBytes, query) {
  const block = exportDocxJson(docxBytes).blocks.find((item) => item.text.includes(query));
  assert.ok(block, `text target not found: ${query}`);
  const offset = block.text.indexOf(query);
  return {
    range: {
      start: { nodeId: block.id, offset },
      end: { nodeId: block.id, offset: offset + query.length },
    },
    native: { paragraph: block.native.paragraph, startOffset: offset, endOffset: offset + query.length },
  };
}

function replaceFirstText(fragment, updater) {
  return fragment.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/, (_match, open, text, close) => {
    return `${open}${escapeXml(updater(unescapeXml(text)))}${close}`;
  });
}

function updateDocxParagraph(docxBytes, nodeId, updater) {
  const xml = getDocumentXml(docxBytes);
  const index = Number(String(nodeId).replace(/^p_/, ''));
  const paragraph = paragraphRanges(xml).at(index);
  assert.ok(paragraph, `paragraph not found: ${nodeId}`);
  const updated = updater(paragraph.xml, paragraph.text);
  return setDocumentXml(docxBytes, `${xml.slice(0, paragraph.start)}${updated}${xml.slice(paragraph.end)}`);
}

function applyDocxCommand(docxBytes, op) {
  if (op.op === 'setDocumentMetadata') {
    return applyDocxMetadata(docxBytes, op);
  }

  if (op.op === 'defineStyle') {
    return applyDocxStyleDefinition(docxBytes, op.style);
  }

  if (op.op === 'setPageSetup') {
    return applyDocxPageSetup(docxBytes, op);
  }

  if (op.op === 'setHeaderFooter') {
    return applyDocxHeaderFooter(docxBytes, op);
  }

  if (op.op === 'insertText') {
    const { nodeId, offset } = op.target.range.start;
    return updateDocxParagraph(docxBytes, nodeId, (paragraph, text) => {
      return replaceFirstText(paragraph, () => `${text.slice(0, offset)}${op.text}${text.slice(offset)}`);
    });
  }

  if (op.op === 'replaceText') {
    const { start, end } = op.target.range;
    return updateDocxParagraph(docxBytes, start.nodeId, (paragraph, text) => {
      return replaceFirstText(paragraph, () => `${text.slice(0, start.offset)}${op.text}${text.slice(end.offset)}`);
    });
  }

  if (op.op === 'deleteRange') {
    const { start, end } = op.target.range;
    return updateDocxParagraph(docxBytes, start.nodeId, (paragraph, text) => {
      return replaceFirstText(paragraph, () => `${text.slice(0, start.offset)}${text.slice(end.offset)}`);
    });
  }

  if (op.op === 'appendParagraph') {
    const xml = getDocumentXml(docxBytes);
    const paragraph = paragraphXml(op.text, {
      paragraphStyle: op.paragraphStyle,
      runStyle: op.runStyle,
    });
    if (xml.includes('<w:sectPr/>')) {
      return setDocumentXml(docxBytes, xml.replace('<w:sectPr/>', `${paragraph}<w:sectPr/>`));
    }
    return setDocumentXml(docxBytes, xml.replace(/<w:sectPr\b/, `${paragraph}<w:sectPr`));
  }

  if (op.op === 'applyStyle') {
    const { nodeId } = op.target;
    return updateDocxParagraph(docxBytes, nodeId, (paragraph) => {
      if (paragraph.includes('<w:pPr>')) {
        return paragraph.replace('<w:pPr>', `<w:pPr><w:pStyle w:val="${escapeXml(op.styleId)}"/>`);
      }
      return paragraph.replace(/<w:p(\s[^>]*)?>/, (match) => `${match}<w:pPr><w:pStyle w:val="${escapeXml(op.styleId)}"/></w:pPr>`);
    });
  }

  if (op.op === 'setRunStyle') {
    const { nodeId } = op.target.range.start;
    return updateDocxParagraph(docxBytes, nodeId, (paragraph) => {
      const color = op.style.textColor ? op.style.textColor.replace(/^#/, '').toUpperCase() : '000000';
      const runStyle = `<w:rPr>${op.style.bold ? '<w:b/>' : ''}<w:color w:val="${color}"/></w:rPr>`;
      return paragraph.replace(/<w:r(\s[^>]*)?>/, (match) => `${match}${runStyle}`);
    });
  }

  if (op.op === 'setParagraphStyle') {
    const { nodeId } = op.target;
    return updateDocxParagraph(docxBytes, nodeId, (paragraph) => {
      return paragraph.replace(/<w:p(\s[^>]*)?>/, (match) => `${match}<w:pPr><w:jc w:val="${op.style.align}"/></w:pPr>`);
    });
  }

  if (op.op === 'createTable') {
    const xml = getDocumentXml(docxBytes);
    if (xml.includes('<w:sectPr/>')) {
      return setDocumentXml(docxBytes, xml.replace('<w:sectPr/>', `${tableXml(op.rows, op.cols)}<w:sectPr/>`));
    }
    return setDocumentXml(docxBytes, xml.replace(/<w:sectPr\b/, `${tableXml(op.rows, op.cols)}<w:sectPr`));
  }

  if (op.op === 'setCellText') {
    const xml = getDocumentXml(docxBytes);
    const cellIndex = op.target.tableCell.row * 2 + op.target.tableCell.col;
    const cells = [...xml.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)];
    const cell = cells.at(cellIndex);
    assert.ok(cell, `cell not found: ${cellIndex}`);
    const updated = replaceFirstText(cell[0], () => op.text);
    return setDocumentXml(docxBytes, `${xml.slice(0, cell.index)}${updated}${xml.slice(cell.index + cell[0].length)}`);
  }

  if (op.op === 'insertFootnote') {
    return applyDocxFootnote(docxBytes, op);
  }

  throw new Error(`Unsupported DOCX op ${op.op}`);
}

function savedDocxXmlAfter(op, options = {}) {
  const docxBytes = createDocxBytes(options);
  const target = op.resolve ? op.resolve(docxBytes) : null;
  const edited = applyDocxCommand(docxBytes, op.build(target));
  return getDocumentXml(edited);
}

const docxCommandCases = [
  {
    name: 'insertText',
    resolve: (bytes) => resolveDocxTextTarget(bytes, 'Alpha'),
    build: (target) => ({ op: 'insertText', target, text: 'API-' }),
    assertXml: (xml) => assert.match(xml, /<w:t>API-Alpha Beta Gamma<\/w:t>/),
  },
  {
    name: 'replaceText',
    resolve: (bytes) => resolveDocxTextTarget(bytes, 'Beta'),
    build: (target) => ({ op: 'replaceText', target, text: 'DOCX' }),
    assertXml: (xml) => assert.match(xml, /Alpha DOCX Gamma/),
  },
  {
    name: 'deleteRange',
    resolve: (bytes) => resolveDocxTextTarget(bytes, 'Beta '),
    build: (target) => ({ op: 'deleteRange', target }),
    assertXml: (xml) => assert.match(xml, /Alpha Gamma/),
  },
  {
    name: 'appendParagraph',
    build: () => ({ op: 'appendParagraph', text: 'Appended paragraph' }),
    assertXml: (xml) => assert.match(xml, /Appended paragraph/),
  },
  {
    name: 'setRunStyle',
    resolve: (bytes) => resolveDocxTextTarget(bytes, 'Alpha'),
    build: (target) => ({ op: 'setRunStyle', target, style: { bold: true, textColor: '#ff0000' } }),
    assertXml: (xml) => {
      assert.match(xml, /<w:b\/>/);
      assert.match(xml, /<w:color w:val="FF0000"\/>/);
    },
  },
  {
    name: 'setParagraphStyle',
    build: () => ({ op: 'setParagraphStyle', target: { nodeId: 'p_0' }, style: { align: 'center' } }),
    assertXml: (xml) => assert.match(xml, /<w:jc w:val="center"\/>/),
  },
  {
    name: 'createTable',
    build: () => ({ op: 'createTable', rows: 2, cols: 2 }),
    assertXml: (xml) => assert.equal((xml.match(/<w:tc>/g) ?? []).length, 4),
  },
  {
    name: 'setCellText',
    options: { table: true },
    build: () => ({ op: 'setCellText', target: { tableCell: { row: 0, col: 1 } }, text: 'Cell API' }),
    assertXml: (xml) => assert.match(xml, /Cell API/),
  },
];

for (const commandCase of docxCommandCases) {
  test(`DOCX command saves and reopens: ${commandCase.name}`, () => {
    const xml = savedDocxXmlAfter(commandCase, commandCase.options);
    commandCase.assertXml(xml);
  });
}

test('DOCX JSON export and text target resolution expose stable command input', () => {
  const docxBytes = createDocxBytes();
  const json = exportDocxJson(docxBytes);
  const target = resolveDocxTextTarget(docxBytes, 'Beta');
  assert.equal(json.blocks[0].id, 'p_0');
  assert.deepEqual(target.range, {
    start: { nodeId: 'p_0', offset: 6 },
    end: { nodeId: 'p_0', offset: 10 },
  });
});

const hwpxCommandCases = [
  {
    name: 'insertText',
    run: (doc) => doc.insertText(0, 0, 0, 'API '),
    assertDoc: (doc) => assert.match(doc.getTextRange(0, 0, 0, doc.getParagraphLength(0, 0)), /^API /),
  },
  {
    name: 'replaceText',
    run: (doc) => doc.replaceText(0, 0, 3, 5, 'RHWP'),
    assertDoc: (doc) => assert.match(doc.getTextRange(0, 0, 0, doc.getParagraphLength(0, 0)), /RHWP/),
  },
  {
    name: 'deleteRange',
    run: (doc) => doc.deleteRange(0, 0, 3, 0, 8),
    assertDoc: (doc) => assert.doesNotMatch(doc.getTextRange(0, 0, 0, doc.getParagraphLength(0, 0)), /Hello/),
  },
  {
    name: 'appendParagraph',
    run: (doc) => {
      const next = doc.getParagraphCount(0);
      parseResult(doc.insertParagraph(0, next));
      parseResult(doc.insertText(0, next, 0, 'Appended paragraph'));
    },
    assertDoc: (doc) => {
      const last = doc.getParagraphCount(0) - 1;
      assert.equal(doc.getTextRange(0, last, 0, doc.getParagraphLength(0, last)), 'Appended paragraph');
    },
  },
  {
    name: 'setRunStyle',
    run: (doc) => doc.applyCharFormat(0, 0, 0, 2, JSON.stringify({ bold: true, textColor: '#ff0000' })),
    assertDoc: (doc) => assert.match(doc.getTextRange(0, 0, 0, doc.getParagraphLength(0, 0)), /Hello/),
  },
  {
    name: 'setParagraphStyle',
    run: (doc) => doc.applyParaFormat(0, 0, JSON.stringify({ alignment: 'center', lineSpacing: 120 })),
    assertDoc: (doc) => {
      const props = JSON.parse(doc.getParaPropertiesAt(0, 0));
      assert.equal(props.alignment, 'center');
      assert.equal(props.lineSpacing, 120);
    },
  },
  {
    name: 'createTable',
    run: (doc) => doc.createTable(0, 0, 0, 2, 2),
    assertDoc: (doc) => {
      const dims = JSON.parse(doc.getTableDimensions(0, 1, 0));
      assert.deepEqual(dims, { rowCount: 2, colCount: 2, cellCount: 4 });
    },
  },
  {
    name: 'setCellText',
    run: (doc) => {
      const table = JSON.parse(doc.createTable(0, 0, 0, 2, 2));
      parseResult(doc.insertTextInCell(0, table.paraIdx, table.controlIdx, 0, 0, 0, 'Cell API'));
    },
    assertDoc: (doc) => assert.equal(doc.getTextInCell(0, 1, 0, 0, 0, 0, 100), 'Cell API'),
  },
];

for (const commandCase of hwpxCommandCases) {
  test(`HWPX command saves and reopens: ${commandCase.name}`, async () => {
    await ensureHwpxReady();
    const doc = loadHwpxDocument();
    const result = commandCase.run(doc);
    if (typeof result === 'string') {
      const parsed = parseResult(result);
      if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
        assert.equal(parsed.ok, true);
      }
    }
    const saved = doc.exportHwpx();
    assert.ok(saved.length > 0);
    const reopened = new HwpDocument(saved);
    commandCase.assertDoc(reopened);
  });
}

test('DOCX API-only scenario builds a journal manuscript package', () => {
  let docxBytes = createDocxBytes();

  const styles = [
    { styleId: 'JournalTitle', name: 'Journal Title', paragraphStyle: { align: 'center', spacingAfter: 240 }, runStyle: { bold: true, fontSize: 16 } },
    { styleId: 'JournalAuthors', name: 'Journal Authors', paragraphStyle: { align: 'center', spacingAfter: 160 }, runStyle: { italic: true, fontSize: 10 } },
    { styleId: 'JournalHeading1', name: 'Journal Heading 1', paragraphStyle: { spacingBefore: 240, spacingAfter: 80 }, runStyle: { bold: true, textColor: '#1f4e79', fontSize: 12 } },
    { styleId: 'JournalBody', name: 'Journal Body', paragraphStyle: { align: 'both', lineSpacing: 360 }, runStyle: { fontSize: 10 } },
    { styleId: 'JournalCaption', name: 'Journal Caption', paragraphStyle: { align: 'center', spacingBefore: 120, spacingAfter: 120 }, runStyle: { italic: true, fontSize: 9 } },
  ];

  docxBytes = applyDocxCommand(docxBytes, {
    op: 'setDocumentMetadata',
    title: 'API-only Journal Manuscript',
    subject: 'Contract verification with styles, notes, header, table, and page setup',
  });
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'setPageSetup',
    width: 11906,
    height: 16838,
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
  });
  for (const style of styles) {
    docxBytes = applyDocxCommand(docxBytes, { op: 'defineStyle', style });
  }
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'setHeaderFooter',
    text: 'API-only Journal Manuscript | Double-anonymized submission',
    align: 'center',
  });

  const titleTarget = resolveDocxTextTarget(docxBytes, 'Alpha Beta Gamma');
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'replaceText',
    target: titleTarget,
    text: 'A Multi-Agent Academic Editor Benchmark for Korean Office Documents',
  });
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'applyStyle',
    target: { nodeId: titleTarget.range.start.nodeId },
    styleId: 'JournalTitle',
  });
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'appendParagraph',
    text: 'Author A; Author B; Author C',
    paragraphStyle: { styleId: 'JournalAuthors' },
  });
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'appendParagraph',
    text: 'Abstract',
    paragraphStyle: { styleId: 'JournalHeading1' },
  });
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'appendParagraph',
    text: 'This structured abstract states the motivation, method, results, and limitations in a compact journal format while preserving all edits through the API save path.',
    paragraphStyle: { styleId: 'JournalBody' },
  });
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'appendParagraph',
    text: 'Keywords: HWPX; DOCX; WOPI; document automation; Korean office documents',
    paragraphStyle: { styleId: 'JournalBody' },
    runStyle: { italic: true },
  });

  for (let section = 1; section <= 8; section += 1) {
    docxBytes = applyDocxCommand(docxBytes, {
      op: 'appendParagraph',
      text: `${section}. ${['Introduction', 'Related Work', 'System Design', 'Dataset', 'Evaluation Protocol', 'Results', 'Ablations', 'Limitations'][section - 1]}`,
      paragraphStyle: { styleId: 'JournalHeading1' },
    });
    for (let para = 1; para <= 4; para += 1) {
      docxBytes = applyDocxCommand(docxBytes, {
        op: 'appendParagraph',
        text: `Section ${section} paragraph ${para} describes a reproducible editing operation, a target selector, persistence expectations, and reviewer-visible formatting constraints for a long-form manuscript.`,
        paragraphStyle: { styleId: 'JournalBody' },
      });
    }
  }

  const footnoteTarget = resolveDocxTextTarget(docxBytes, 'Section 2 paragraph 1');
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'insertFootnote',
    target: footnoteTarget,
    text: 'The scenario intentionally uses only v1 API commands and no direct editor UI actions.',
  });
  docxBytes = applyDocxCommand(docxBytes, { op: 'createTable', rows: 5, cols: 2 });
  const tableRows = [
    ['Metric', 'Expectation'],
    ['Target precision', 'No ambiguous selector is edited'],
    ['Style persistence', 'Run and paragraph formatting survive save/reopen'],
    ['Pagination', 'Page setup and headers remain in the package'],
    ['Auditability', 'Metadata and footnotes are inspectable in OpenXML'],
  ];
  tableRows.forEach((row, rowIndex) => {
    row.forEach((text, colIndex) => {
      docxBytes = applyDocxCommand(docxBytes, {
        op: 'setCellText',
        target: { tableCell: { row: rowIndex, col: colIndex } },
        text,
      });
    });
  });
  docxBytes = applyDocxCommand(docxBytes, {
    op: 'appendParagraph',
    text: 'Table 1. API-only manuscript conformance matrix.',
    paragraphStyle: { styleId: 'JournalCaption' },
  });

  const documentXml = getDocumentXml(docxBytes);
  const json = exportDocxJson(docxBytes);
  assert.ok(json.blocks.length >= 45, `expected long manuscript blocks, got ${json.blocks.length}`);
  assert.match(documentXml, /w:pgSz w:w="11906" w:h="16838"/);
  assert.match(documentXml, /w:headerReference w:type="default" r:id="rIdHeader1"/);
  assert.match(documentXml, /w:pStyle w:val="JournalTitle"/);
  assert.match(documentXml, /w:footnoteReference w:id="2"/);
  assert.match(documentXml, /API-only manuscript conformance matrix/);
  assert.match(getZipText(docxBytes, 'word/styles.xml'), /w:style w:type="paragraph" w:styleId="JournalHeading1"/);
  assert.match(getZipText(docxBytes, 'word/header1.xml'), /Double-anonymized submission/);
  assert.match(getZipText(docxBytes, 'word/footnotes.xml'), /only v1 API commands/);
  assert.match(getZipText(docxBytes, 'docProps/core.xml'), /API-only Journal Manuscript/);
});

test('HWPX API-only scenario builds a multi-page proposal with advanced controls', async () => {
  await ensureHwpxReady();
  const doc = loadHwpxDocument();

  parseResult(doc.setPageDef(0, JSON.stringify({
    width: 59528,
    height: 84186,
    marginLeft: 5668,
    marginRight: 5668,
    marginTop: 5668,
    marginBottom: 5668,
    marginHeader: 2800,
    marginFooter: 2800,
  })));
  parseResult(doc.createHeaderFooter(0, true, 0));
  parseResult(doc.insertTextInHeaderFooter(0, true, 0, 0, 0, 'AI 업무비서 HWPX 제안서 | API-only'));

  const title = 'AI 업무비서 테스트베드 고도화 실행계획';
  parseResult(doc.replaceText(0, 0, 0, doc.getParagraphLength(0, 0), title));
  parseResult(doc.applyParaFormat(0, 0, JSON.stringify({ alignment: 'center', lineSpacing: 140, spacingAfter: 500 })));
  parseResult(doc.applyCharFormat(0, 0, 0, title.length, JSON.stringify({ bold: true, textColor: '#1f4e79' })));

  const sectionCount = 16;
  for (let section = 1; section <= sectionCount; section += 1) {
    const headingPara = doc.getParagraphCount(0);
    const heading = `제${section}장. ${['목표', '현황', '요구사항', '아키텍처', '보안', '데이터', '검색', '편집', '검증', '배포', '운영', '관측성', '성능', '비용', '리스크', '로드맵'][section - 1]}`;
    parseResult(doc.insertParagraph(0, headingPara));
    parseResult(doc.insertText(0, headingPara, 0, heading));
    parseResult(doc.applyParaFormat(0, headingPara, JSON.stringify({ alignment: 'center', lineSpacing: 130, spacingBefore: 200, spacingAfter: 120 })));
    parseResult(doc.applyCharFormat(0, headingPara, 0, heading.length, JSON.stringify({ bold: true, textColor: '#c00000' })));

    for (let para = 1; para <= 3; para += 1) {
      const bodyPara = doc.getParagraphCount(0);
      const body = `제${section}장 본문 ${para}: 이 문단은 대상 선택, 서식 적용, 저장, 재오픈, 구조화 추출까지 동일한 API 흐름으로 처리되는 장문 제안서 검증 문단이다.`;
      parseResult(doc.insertParagraph(0, bodyPara));
      parseResult(doc.insertText(0, bodyPara, 0, body));
      parseResult(doc.applyParaFormat(0, bodyPara, JSON.stringify({ alignment: 'justify', lineSpacing: 165, spacingAfter: 80 })));
      if (para === 1) {
        parseResult(doc.applyCharFormat(0, bodyPara, 0, 5, JSON.stringify({ bold: true, textColor: '#0070c0' })));
      }
      if (section < sectionCount && para === 3) {
        parseResult(doc.insertPageBreak(0, bodyPara, doc.getParagraphLength(0, bodyPara)));
      }
    }
  }

  const tableAnchor = doc.getParagraphCount(0) - 1;
  const table = parseResult(doc.createTable(0, tableAnchor, 0, 5, 4));
  const insertHwpxCellText = (row, col, text) => {
    const cellIndex = row * 4 + col;
    return doc.insertTextInCell(0, table.paraIdx, table.controlIdx, cellIndex, 0, 0, text);
  };
  const cells = [
    ['구분', 'API', '검증', '상태'],
    ['페이지', 'setPageSetup/pageBreak', 'pageCount', '통과'],
    ['머리말', 'setHeaderFooter', 'section XML', '통과'],
    ['서식', 'applyCharFormat/applyParaFormat', 'section XML', '통과'],
    ['표', 'createTable/setCellText', 'cell reopen', '통과'],
  ];
  cells.forEach((row, rowIndex) => {
    row.forEach((text, colIndex) => {
      parseResult(insertHwpxCellText(rowIndex, colIndex, text));
    });
  });

  const saved = doc.exportHwpx();
  assert.ok(saved.length > 0);
  const reopened = new HwpDocument(saved);
  assert.ok(reopened.pageCount() >= 12, `expected many pages, got ${reopened.pageCount()}`);
  assert.ok(reopened.getParagraphCount(0) >= sectionCount * 4, `expected many paragraphs, got ${reopened.getParagraphCount(0)}`);
  assert.equal(reopened.getTextRange(0, 0, 0, title.length), title);
  assert.equal(reopened.getTextInCell(0, table.paraIdx, table.controlIdx, 19, 0, 0, 20), '통과');

  const sectionXml = getZipText(saved, 'Contents/section0.xml');
  assert.match(sectionXml, /AI 업무비서 테스트베드 고도화 실행계획/);
  assert.match(sectionXml, /제16장/);
  assert.match(sectionXml, /setHeaderFooter/);
});
