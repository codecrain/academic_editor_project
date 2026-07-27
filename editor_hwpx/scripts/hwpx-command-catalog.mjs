const command = ({
  op,
  category,
  description,
  normalizeAs = op,
  required = [],
  optional = [],
  anyOf = [],
  aliases = [],
  precondition = 'none',
  readiness = 'available',
  execution = 'preserve-package',
  nativeMethods = [],
  capability = readiness,
  enum: enumValues = {},
  fields = {},
  example,
  notes = [],
}) => Object.freeze({
  op,
  category,
  description,
  normalizeAs,
  required: Object.freeze(['op', ...required]),
  optional: Object.freeze([...optional]),
  anyOf: Object.freeze(anyOf.map((group) => Object.freeze([...group]))),
  aliases: Object.freeze([...aliases]),
  precondition,
  readiness,
  execution,
  nativeMethods: Object.freeze([...nativeMethods]),
  capability,
  enum: Object.freeze(Object.fromEntries(
    Object.entries(enumValues).map(([field, values]) => [field, Object.freeze([...values])]),
  )),
  fields: Object.freeze({
    op: `Use exactly ${op}.`,
    commandId: 'Optional stable ID for matching command results.',
    ...fields,
  }),
  example: Object.freeze(example),
  notes: Object.freeze([...notes]),
});

const locationField = 'Exact paragraph or table-cell location returned by target_map, target_find, or target_inspect.';
const styleSourceField = 'Exact inspected paragraph or cell whose existing HWPX style must be cloned.';

const HWPX_COMMAND_CATALOG = Object.freeze([
  command({
    op: 'text.replaceParagraph',
    category: 'text',
    description: 'Replace all visible text in one inspected body paragraph while preserving its paragraph and character style IDs.',
    required: ['location', 'text'],
    aliases: ['replaceParagraphText'],
    precondition: 'target_inspect',
    fields: { location: locationField, text: 'Complete replacement text.' },
    example: { op: 'text.replaceParagraph', location: { paragraph: { section: 0, number: 1 } }, text: '교체 문단' },
  }),
  command({
    op: 'text.insertAfterParagraph',
    category: 'text',
    description: 'Insert one or more newline-delimited paragraphs after an inspected body paragraph.',
    required: ['location', 'text'],
    aliases: ['insertParagraphAfter', 'text.insertParagraphAfter'],
    precondition: 'target_inspect',
    fields: { location: locationField, text: 'Text to insert; newlines create additional paragraphs.', styleSource: styleSourceField },
    example: { op: 'text.insertAfterParagraph', location: { paragraph: { section: 0, number: 1 } }, text: '신규 요약\n신규 세부내용' },
  }),
  command({
    op: 'text.replace',
    category: 'text',
    description: 'Replace an inspected text range within one body paragraph.',
    required: ['target', 'text'],
    aliases: ['replaceText'],
    precondition: 'target_inspect',
    fields: { target: locationField, text: 'Replacement text.' },
    example: { op: 'text.replace', target: { native: { section: 0, para: 1, offset: 0, length: 4 } }, text: '2026' },
    notes: ['The replacement range must stay inside one body paragraph.'],
  }),
  command({
    op: 'text.replaceTracked',
    category: 'text',
    description: 'Replace an inspected HWPX text range while preserving a native tracked-change record.',
    required: ['target', 'text', 'author'],
    optional: ['date'],
    precondition: 'target_inspect',
    execution: 'tracked-package-transform',
    fields: { target: locationField, text: 'Replacement text.', author: 'Tracked-change author name.' },
    example: {
      op: 'text.replaceTracked',
      target: { native: { section: 0, para: 1, offset: 0, length: 4 } },
      text: '2026',
      author: '검토자',
    },
    notes: [
      'Native HWPX Delete/Insert markup is emitted only for a range contained in one hp:t run; unsupported cross-run ranges fail without mutation.',
      'This operation must currently be the only command in its atomic batch because RHWP paragraph inspection does not yet collapse deleted tracked text.',
    ],
  }),
  command({
    op: 'insertText',
    category: 'text',
    description: 'Insert text at an inspected HWPX paragraph offset.',
    required: ['target', 'text'],
    aliases: ['text.insert'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['insertText'],
    fields: { target: locationField, text: 'Text to insert.' },
    example: {
      op: 'insertText',
      target: { native: { section: 0, para: 1, offset: 5, length: 0 } },
      text: '삽입 문구',
    },
  }),
  command({
    op: 'deleteRange',
    category: 'text',
    description: 'Delete one inspected HWPX text range.',
    required: ['target'],
    aliases: ['text.delete'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['deleteRange'],
    fields: { target: locationField },
    example: {
      op: 'deleteRange',
      target: { native: { section: 0, para: 1, offset: 2, length: 4 } },
    },
  }),
  command({
    op: 'appendParagraph',
    category: 'text',
    description: 'Insert a new paragraph after an inspected HWPX body paragraph.',
    required: ['target', 'text'],
    optional: ['styleSource'],
    aliases: ['paragraph.append'],
    precondition: 'target_inspect',
    execution: 'preserve-package-adapter',
    fields: { target: locationField, text: 'New paragraph text.', styleSource: styleSourceField },
    example: {
      op: 'appendParagraph',
      target: { paragraph: { section: 0, number: 1 } },
      text: '새 결론 문단',
    },
  }),
  command({
    op: 'table.writeCell',
    category: 'table',
    description: 'Replace one inspected table cell, optionally fitting text and cloning paragraph style IDs.',
    required: ['location', 'text'],
    aliases: ['setCellText'],
    precondition: 'target_inspect',
    fields: {
      location: locationField,
      text: 'Complete cell text; newline creates another cell paragraph.',
      fit: 'Boolean: fit text before writing.',
      fitOptions: 'Optional fit limits.',
      styleSource: styleSourceField,
    },
    example: { op: 'table.writeCell', location: { tableId: 'tbl_0', cell: { number: 1 } }, text: '18,420' },
  }),
  command({
    op: 'table.writeRichCell',
    category: 'table',
    description: 'Replace one inspected table cell and clone paragraph/character style IDs from another inspected location.',
    required: ['location', 'styleSource', 'text'],
    precondition: 'target_inspect',
    fields: { location: locationField, styleSource: styleSourceField, text: 'Complete cell text.' },
    example: {
      op: 'table.writeRichCell',
      location: { tableId: 'tbl_0', cell: { number: 1 } },
      styleSource: { tableId: 'tbl_0', cell: { number: 0 } },
      text: '서식 복제 값',
    },
  }),
  command({
    op: 'table.writeCells',
    category: 'table',
    description: 'Write multiple inspected table cells in one atomic batch.',
    required: ['cells'],
    precondition: 'target_inspect',
    fields: {
      tableId: 'Default table ID for cells that omit tableId.',
      cells: 'Nonempty array containing cell/location, text, and optional styleSource/fit options.',
      fit: 'Default fit flag.',
      fitOptions: 'Default fit limits.',
    },
    example: {
      op: 'table.writeCells',
      tableId: 'tbl_0',
      cells: [
        { cell: { number: 0 }, text: '가' },
        { cell: { number: 1 }, text: '나' },
      ],
    },
  }),
  command({
    op: 'table.applyCellStyle',
    category: 'table',
    description: 'Apply explicit HWPX outer-cell style values or clone them from another inspected cell.',
    required: ['target'],
    anyOf: [['styleSource', 'source', 'cellStyle']],
    aliases: ['cell.applyStyle'],
    precondition: 'target_inspect',
    fields: {
      target: locationField,
      styleSource: styleSourceField,
      source: 'Alias of styleSource.',
      cellStyle: 'HWPX cell style fields such as borderFillIDRef, vertical alignment, and margins.',
    },
    example: {
      op: 'table.applyCellStyle',
      target: { tableId: 'tbl_0', cell: { number: 1 } },
      styleSource: { tableId: 'tbl_0', cell: { number: 0 } },
    },
  }),
  command({
    op: 'table.create',
    category: 'table',
    description: 'Create a new HWPX table after an inspected body paragraph.',
    required: ['target', 'rows', 'columns'],
    optional: ['width', 'height', 'cellTexts'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: [
      'createTableEx',
      'getCellProperties',
      'resizeTableCells',
      'insertTextInCell',
      'setTableProperties',
    ],
    fields: {
      target: locationField,
      rows: 'Positive integer row count.',
      columns: 'Positive integer column count.',
      width: 'Optional table width in HWP units.',
      height: 'Optional table height in HWP units.',
      cellTexts: 'Optional row-major array of initial cell text.',
    },
    example: {
      op: 'table.create',
      target: { paragraph: { section: 0, number: 1 } },
      rows: 2,
      columns: 3,
    },
  }),
  command({
    op: 'table.insertCaption',
    category: 'table',
    description: 'Insert a caption paragraph adjacent to an inspected HWPX table.',
    required: ['target', 'text'],
    optional: ['position'],
    precondition: 'target_inspect',
    readiness: 'unavailable',
    execution: 'structural-adapter',
    nativeMethods: ['setTableProperties', 'insertTextInCell'],
    enum: { position: ['before', 'after'] },
    fields: { target: locationField, text: 'Complete caption text.', position: 'before or after; default before.' },
    example: {
      op: 'table.insertCaption',
      target: { tableId: 'tbl_0', cell: { number: 0 } },
      text: '표 1. 평가 결과',
    },
    notes: [
      'The pinned published @rhwp/core@0.7.15 reports success but drops the caption during structural export and reopen.',
    ],
  }),
  command({
    op: 'style.applyText',
    category: 'style',
    description: 'Clone paragraph/character style IDs from an inspected source and optionally replace target text.',
    required: ['target', 'styleSource'],
    precondition: 'target_inspect',
    fields: { target: locationField, styleSource: styleSourceField, text: 'Optional replacement text.' },
    example: {
      op: 'style.applyText',
      target: { paragraph: { section: 0, number: 2 } },
      styleSource: { paragraph: { section: 0, number: 1 } },
      text: '서식 적용 텍스트',
    },
  }),
  command({
    op: 'paragraph.applyStyle',
    category: 'style',
    description: 'Clone paragraph/character style IDs from an inspected source without changing target text.',
    required: ['target'],
    anyOf: [['styleSource', 'source']],
    aliases: ['style.applyParagraph'],
    precondition: 'target_inspect',
    fields: { target: locationField, styleSource: styleSourceField, source: 'Alias of styleSource.' },
    example: {
      op: 'paragraph.applyStyle',
      target: { paragraph: { section: 0, number: 2 } },
      styleSource: { paragraph: { section: 0, number: 1 } },
    },
  }),
  command({
    op: 'style.clone',
    category: 'style',
    description: 'Clone paragraph/character text style from one inspected target to another.',
    required: ['source', 'target'],
    aliases: ['style.cloneFromTarget'],
    precondition: 'target_inspect',
    fields: { source: styleSourceField, target: locationField },
    example: {
      op: 'style.clone',
      source: { tableId: 'tbl_0', cell: { number: 0 } },
      target: { tableId: 'tbl_0', cell: { number: 1 } },
    },
  }),
  command({
    op: 'applyStyle',
    category: 'style',
    description: 'Apply an existing named HWPX paragraph style.',
    required: ['target', 'styleId'],
    aliases: ['paragraph.applyNamedStyle'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['applyStyle', 'applyCellStyle'],
    fields: { target: locationField, styleId: 'Existing style ID returned by inspection or defineStyle.' },
    example: { op: 'applyStyle', target: { paragraph: { section: 0, number: 1 } }, styleId: 12 },
  }),
  command({
    op: 'setRunStyle',
    category: 'style',
    description: 'Set direct character formatting on an inspected HWPX text target.',
    required: ['target', 'style'],
    aliases: ['style.setRunStyle'],
    precondition: 'target_inspect',
    readiness: 'unavailable',
    execution: 'structural-adapter',
    nativeMethods: [
      'applyCharFormat',
      'applyCharFormatInCell',
      'findOrCreateFontId',
    ],
    notes: [
      'The pinned published @rhwp/core@0.7.15 reports success but loses the requested run formatting during structural export and reopen.',
    ],
    fields: { target: locationField, style: 'Character format such as bold, italic, font size, color, and font family.' },
    example: { op: 'setRunStyle', target: { paragraph: { section: 0, number: 1 } }, style: { bold: true, fontSizePt: 12 } },
  }),
  command({
    op: 'setParagraphStyle',
    category: 'style',
    description: 'Set direct paragraph formatting on an inspected HWPX paragraph.',
    required: ['target', 'style'],
    aliases: ['style.setParagraphStyle'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['applyParaFormat', 'applyParaFormatInCell'],
    fields: { target: locationField, style: 'Paragraph format such as alignment, spacing, margins, and line spacing.' },
    example: { op: 'setParagraphStyle', target: { paragraph: { section: 0, number: 1 } }, style: { align: 'center' } },
  }),
  command({
    op: 'list.writeBullets',
    category: 'list',
    description: 'Write stable visible bullet-list text into an inspected paragraph or cell.',
    required: ['location', 'items'],
    aliases: ['list.write'],
    precondition: 'target_inspect',
    fields: { location: locationField, items: 'Nonempty string array.', marker: 'Visible bullet marker; default "-".', styleSource: styleSourceField },
    example: { op: 'list.writeBullets', location: { paragraph: { section: 0, number: 1 } }, items: ['첫째', '둘째'], marker: '-' },
    notes: ['This writes visible list text. Native HWPX numbering objects are not yet created and the quality report records this limitation.'],
  }),
  command({
    op: 'list.applyNumbering',
    category: 'list',
    description: 'Write stable visible numbered-list text into an inspected paragraph or cell.',
    required: ['location', 'items'],
    aliases: ['paragraph.applyNumbering'],
    precondition: 'target_inspect',
    fields: {
      location: locationField,
      items: 'Nonempty string array.',
      startAt: 'First visible number; default 1.',
      suffix: 'Visible number suffix; default ".".',
      styleSource: styleSourceField,
    },
    example: { op: 'list.applyNumbering', location: { paragraph: { section: 0, number: 1 } }, items: ['첫째', '둘째'], startAt: 1 },
    notes: ['This writes visible list text. Native HWPX numbering objects are not yet created and the quality report records this limitation.'],
  }),
  command({
    op: 'layout.fitText',
    category: 'layout',
    description: 'Calculate wrapping/truncation for one inspected table cell without changing the document.',
    required: ['location', 'text'],
    precondition: 'target_inspect',
    fields: { location: locationField, text: 'Text to fit.', options: 'Fit limits such as maxCharsPerLine, maxLines, truncate, and ellipsis.' },
    example: {
      op: 'layout.fitText',
      location: { tableId: 'tbl_0', cell: { number: 1 } },
      text: '긴 텍스트',
      options: { maxLines: 3, truncate: false },
    },
  }),
  command({
    op: 'image.replace',
    category: 'image',
    description: 'Replace bytes of an existing package image discovered by object_inventory.',
    required: ['imageName'],
    anyOf: [['bytesBase64', 'bytes', 'filePath']],
    aliases: ['object.replaceImage', 'chart.replaceImage'],
    precondition: 'object_inventory',
    fields: {
      imageName: 'Exact package image name.',
      bytesBase64: 'Base64-encoded image bytes.',
      bytes: 'Trusted in-process bytes only.',
      filePath: 'Trusted same-host file path only.',
      mimeType: 'Optional declared image MIME type.',
    },
    example: { op: 'image.replace', imageName: 'BinData/image1.png', bytesBase64: '<base64>' },
  }),
  command({
    op: 'image.insertAfterParagraph',
    category: 'image',
    description: 'Insert a new inline image after an inspected HWPX paragraph.',
    required: ['target'],
    optional: ['mimeType', 'width', 'height', 'altText', 'caption'],
    anyOf: [['bytesBase64', 'bytes', 'filePath']],
    aliases: ['image.insert', 'object.insertImage'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['insertParagraph', 'insertPicture', 'insertText'],
    fields: {
      target: locationField,
      bytesBase64: 'Base64-encoded image bytes.',
      bytes: 'Trusted in-process binary input only.',
      filePath: 'Trusted same-host file input only.',
      mimeType: 'Declared image MIME type matching the bytes.',
      width: 'Optional width in HWP units.',
      height: 'Optional height in HWP units.',
      altText: 'Optional accessible image description.',
      caption: 'Optional caption paragraph text.',
    },
    example: {
      op: 'image.insertAfterParagraph',
      target: { paragraph: { section: 0, number: 1 } },
      bytesBase64: '<base64>',
      mimeType: 'image/png',
    },
  }),
  command({
    op: 'image.generateAndReplace',
    category: 'image',
    description: 'Generate a deterministic PNG chart-like image from numeric values and replace an existing PNG package entry.',
    required: ['imageName', 'generator'],
    aliases: ['object.generateAndReplace', 'chart.generateAndReplace'],
    precondition: 'object_inventory',
    fields: { imageName: 'Exact PNG package image name.', generator: 'Object containing width, height, colors, and numeric values.' },
    example: { op: 'image.generateAndReplace', imageName: 'BinData/image1.png', generator: { width: 900, height: 520, values: [4, 9] } },
  }),
  command({
    op: 'setDocumentMetadata',
    category: 'package',
    description: 'Set HWPX package metadata.',
    optional: ['title', 'subject', 'author', 'keywords', 'description'],
    anyOf: [['title', 'subject', 'author', 'keywords', 'description']],
    readiness: 'unavailable',
    execution: 'structural-adapter',
    nativeMethods: ['setDocumentMetadata', 'getDocumentMetadata'],
    notes: [
      'The repository source implements this adapter, but no published @rhwp/core artifact through 0.8.2 exposes the required metadata methods.',
    ],
    fields: {
      title: 'Document title.',
      subject: 'Document subject.',
      author: 'Document author.',
      keywords: 'Document keywords.',
      description: 'Document description.',
    },
    example: { op: 'setDocumentMetadata', title: '공공기관 업무보고', author: '기획조정실' },
  }),
  command({
    op: 'defineStyle',
    category: 'package',
    description: 'Create a named HWPX paragraph or character style.',
    required: ['name', 'kind', 'properties'],
    execution: 'structural-adapter',
    nativeMethods: ['createStyle', 'updateStyleShapes', 'findOrCreateFontId'],
    enum: { kind: ['paragraph', 'character'] },
    fields: {
      name: 'Unique style name.',
      kind: 'paragraph or character.',
      properties: 'Style properties accepted by the RHWP style APIs.',
    },
    example: { op: 'defineStyle', name: '공공기관_강조', kind: 'paragraph', properties: { bold: true, fontSizePt: 12 } },
  }),
  command({
    op: 'setPageSetup',
    category: 'package',
    description: 'Set HWPX page size, orientation, and margins for one section.',
    required: ['sectionIndex', 'width', 'height'],
    optional: ['orientation', 'margins'],
    execution: 'structural-adapter',
    nativeMethods: ['setPageDef'],
    enum: { orientation: ['portrait', 'landscape'] },
    fields: {
      sectionIndex: 'Zero-based section index.',
      width: 'Page width in HWP units.',
      height: 'Page height in HWP units.',
      orientation: 'portrait or landscape.',
      margins: 'Object containing top, right, bottom, left, header, footer, and gutter.',
    },
    example: { op: 'setPageSetup', sectionIndex: 0, width: 59528, height: 84189, margins: { top: 5669, right: 5669, bottom: 5669, left: 5669 } },
  }),
  command({
    op: 'setHeaderFooter',
    category: 'package',
    description: 'Create or replace an HWPX header or footer in one section.',
    required: ['target', 'type', 'text'],
    optional: ['applyTo', 'align'],
    readiness: 'unavailable',
    execution: 'structural-adapter',
    nativeMethods: [
      'createHeaderFooter',
      'insertTextInHeaderFooter',
      'applyParaFormatInHf',
      'deleteHeaderFooter',
    ],
    notes: [
      'The pinned published @rhwp/core@0.7.15 surface exposes these methods, but header/footer content does not survive structural export and reopen.',
    ],
    enum: {
      type: ['header', 'footer'],
      applyTo: ['both', 'odd', 'even'],
      align: ['left', 'center', 'right'],
    },
    fields: {
      target: 'Section target such as { sectionIndex: 0 }.',
      type: 'header or footer.',
      text: 'Header or footer text.',
      applyTo: 'both, odd, or even pages.',
      align: 'left, center, or right.',
    },
    example: { op: 'setHeaderFooter', target: { sectionIndex: 0 }, type: 'footer', text: '공공기관 내부검토용', align: 'center' },
  }),
  command({
    op: 'insertFootnote',
    category: 'package',
    description: 'Insert a footnote reference at an inspected HWPX text target and create its footnote body.',
    required: ['target', 'text'],
    precondition: 'target_inspect',
    readiness: 'unavailable',
    execution: 'structural-adapter',
    nativeMethods: ['insertFootnote', 'insertTextInFootnote'],
    notes: [
      'The pinned published @rhwp/core@0.7.15 traps during footnote insertion on the supported blank-document fixture.',
    ],
    fields: { target: locationField, text: 'Footnote body text.' },
    example: {
      op: 'insertFootnote',
      target: { native: { section: 0, para: 1, offset: 5, length: 0 } },
      text: '통계 작성 기준일은 2026년 6월 30일이다.',
    },
  }),
  command({
    op: 'object.deleteTextBoxByText',
    category: 'object',
    description: 'Delete text-box shapes in one section whose visible text matches any supplied string.',
    required: ['texts'],
    aliases: ['object.deleteByText', 'shape.deleteByText'],
    precondition: 'object_inventory',
    fields: { section: 'Zero-based section index; default 0.', texts: 'Nonempty array of exact text strings.' },
    example: { op: 'object.deleteTextBoxByText', section: 0, texts: ['삭제 대상 안내문'] },
  }),
  command({
    op: 'object.replaceTextBoxText',
    category: 'object',
    description: 'Replace visible text inside text-box shapes without deleting the shape.',
    required: ['replacements'],
    aliases: ['shape.replaceText', 'textbox.replaceText'],
    precondition: 'object_inventory',
    fields: { section: 'Zero-based section index; default 0.', replacements: 'Nonempty array of {find, replaceWith} objects.' },
    example: {
      op: 'object.replaceTextBoxText',
      section: 0,
      replacements: [{ find: '기존 문구', replaceWith: '변경 문구' }],
    },
  }),
]);

const normalizeCommandName = (value) => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const commandByName = new Map();
for (const entry of HWPX_COMMAND_CATALOG) {
  for (const name of [entry.op, ...entry.aliases]) {
    const key = normalizeCommandName(name);
    if (commandByName.has(key)) {
      throw new Error(`Duplicate HWPX command catalog name: ${name}`);
    }
    commandByName.set(key, entry);
  }
}

const HWPX_COMMAND_CATEGORIES = Object.freeze([...new Set(HWPX_COMMAND_CATALOG.map((entry) => entry.category))]);
const HWPX_COMMAND_OPS = Object.freeze(HWPX_COMMAND_CATALOG.map((entry) => entry.op));

function resolveHwpxCommand(value) {
  if (value?.group && value?.action && !value.op) {
    return commandByName.get(normalizeCommandName(`${value.group}.${value.action}`)) || null;
  }
  return commandByName.get(normalizeCommandName(value?.op ?? value)) || null;
}

function meaningful(value, { allowEmptyString = false } = {}) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return allowEmptyString || value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function fieldValue(commandValue, field) {
  if (field === 'target') return commandValue.target ?? commandValue.location;
  if (field === 'location') return commandValue.location ?? commandValue.target;
  return commandValue[field];
}

const EMPTY_TEXT_OPS = new Set([
  'text.replaceParagraph',
  'text.insertAfterParagraph',
  'text.replace',
  'text.replaceTracked',
  'table.writeCell',
  'table.writeRichCell',
]);

const SINGLE_TARGET_INSPECTION_OPS = new Set([
  'text.replace',
  'text.replaceTracked',
  'insertText',
  'deleteRange',
  'appendParagraph',
  'table.create',
  'table.insertCaption',
  'applyStyle',
  'setRunStyle',
  'setParagraphStyle',
  'image.insertAfterParagraph',
  'insertFootnote',
]);

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function stableHwpxTargetKey(value) {
  const target = value?.location ?? value?.target ?? value;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return '';
  const native = target.native && typeof target.native === 'object' ? target.native : {};
  const tableId = String(target.tableId ?? target.table?.id ?? '').trim();
  const cell = target.cell ?? target.tableCell ?? (native.cellIndex !== undefined ? native : null);
  if (tableId && cell && typeof cell === 'object') {
    const number = nonNegativeInteger(cell.number ?? cell.cellIndex ?? cell.index);
    if (number !== null) return `table:${tableId}/cell:${number}`;
    const row = nonNegativeInteger(cell.row);
    const column = nonNegativeInteger(cell.column ?? cell.col);
    return row !== null && column !== null ? `table:${tableId}/row:${row}/column:${column}` : '';
  }
  const paragraph = target.paragraph && typeof target.paragraph === 'object'
    ? target.paragraph
    : Object.keys(native).length > 0 ? native : target;
  const number = nonNegativeInteger(
    paragraph.number
      ?? paragraph.paragraph
      ?? paragraph.paragraphIndex
      ?? paragraph.para
      ?? paragraph.index,
  );
  const section = nonNegativeInteger(paragraph.section ?? paragraph.sectionIndex ?? 0);
  return number !== null && section !== null ? `paragraph:${section}:${number}` : '';
}

function cellLocation(commandValue, defaultTableId = '') {
  const location = commandValue.location ?? commandValue.target ?? {};
  return {
    ...location,
    tableId: commandValue.tableId ?? location.tableId ?? defaultTableId,
    cell: commandValue.cell ?? location.cell ?? commandValue.tableCell ?? location.tableCell,
  };
}

function commandInspectionTargets(commandValue, entry, commandIndex = 0) {
  const targets = [];
  const add = (value, role) => targets.push({
    commandIndex,
    op: entry.op,
    role,
    value,
    key: stableHwpxTargetKey(value),
  });
  const optional = (value, role) => {
    if (value !== undefined && value !== null) add(value, role);
  };

  if (entry.op === 'table.writeCell' || entry.op === 'table.writeRichCell') {
    add(commandValue.location ?? commandValue.target, 'location');
    optional(commandValue.styleSource, 'styleSource');
  } else if (entry.op === 'table.writeCells') {
    for (const [index, cell] of commandValue.cells.entries()) {
      add(cellLocation(cell, cell.tableId ?? commandValue.tableId ?? commandValue.location?.tableId), `cells[${index}]`);
      optional(cell.styleSource ?? commandValue.styleSource, `cells[${index}].styleSource`);
    }
  } else if (['text.replaceParagraph', 'text.insertAfterParagraph', 'list.writeBullets', 'list.applyNumbering', 'layout.fitText'].includes(entry.op)) {
    add(commandValue.location ?? commandValue.target, 'location');
    optional(commandValue.styleSource, 'styleSource');
  } else if (SINGLE_TARGET_INSPECTION_OPS.has(entry.op)) {
    add(commandValue.target ?? commandValue.location, 'target');
    if (entry.op === 'appendParagraph') optional(commandValue.styleSource, 'styleSource');
  } else if (entry.op === 'table.applyCellStyle') {
    add(commandValue.target ?? commandValue.location, 'target');
    optional(commandValue.styleSource ?? commandValue.source, 'styleSource');
  } else if (entry.op === 'style.applyText') {
    add(commandValue.target ?? commandValue.location, 'target');
    add(commandValue.styleSource, 'styleSource');
  } else if (entry.op === 'paragraph.applyStyle') {
    add(commandValue.target ?? commandValue.location, 'target');
    add(commandValue.styleSource ?? commandValue.source, 'styleSource');
  } else if (entry.op === 'style.clone') {
    add(commandValue.target, 'target');
    add(commandValue.source, 'source');
  }
  return targets;
}

function requiredInspectionTargets(commands, entries = null) {
  const resolved = entries ?? commands.map((value) => resolveHwpxCommand(value));
  return commands.flatMap((value, index) => {
    const entry = resolved[index];
    return entry?.precondition === 'target_inspect' ? commandInspectionTargets(value, entry, index) : [];
  });
}

function validateHwpxCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('editor_hwpx_apply requires at least one command.');
  }
  return commands.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`HWPX command ${index + 1} must be an object.`);
    }
    const entry = resolveHwpxCommand(value);
    if (!entry) {
      throw new Error(`Unsupported HWPX command op: ${String(value.op || `${value.group || ''}.${value.action || ''}` || '<missing>')}. Call editor_hwpx_command_catalog first.`);
    }
    if (entry.readiness !== 'available') {
      throw new Error(
        `HWPX command ${entry.op} is not ready in the installed runtime (${entry.readiness}).`,
      );
    }
    const missing = entry.required.filter((field) => {
      if (field === 'op') return !meaningful(value.op) && !(meaningful(value.group) && meaningful(value.action));
      const candidate = fieldValue(value, field);
      return !meaningful(candidate, { allowEmptyString: field === 'text' && EMPTY_TEXT_OPS.has(entry.op) });
    });
    if (missing.length) {
      throw new Error(`${entry.op} is missing required field(s): ${missing.join(', ')}.`);
    }
    for (const alternatives of entry.anyOf) {
      if (!alternatives.some((field) => meaningful(value[field]))) {
        throw new Error(`${entry.op} requires at least one of: ${alternatives.join(', ')}.`);
      }
    }
    for (const [field, allowed] of Object.entries(entry.enum)) {
      if (value[field] !== undefined && value[field] !== null && !allowed.includes(value[field])) {
        throw new Error(`${entry.op} ${field} must be one of: ${allowed.join(', ')}.`);
      }
    }
    if (entry.op === 'table.writeCells') {
      if (!Array.isArray(value.cells) || value.cells.length === 0) {
        throw new Error('table.writeCells requires a nonempty cells array.');
      }
      value.cells.forEach((cell, cellIndex) => {
        if (!cell || typeof cell !== 'object' || Array.isArray(cell)) {
          throw new Error(`table.writeCells cells[${cellIndex}] must be an object.`);
        }
        if (!Object.hasOwn(cell, 'text') || typeof cell.text !== 'string') {
          throw new Error(`table.writeCells cells[${cellIndex}] requires a text string; an empty string explicitly clears the cell.`);
        }
      });
    }
    if (entry.op === 'table.create' && value.caption !== undefined) {
      throw new Error(
        'table.create caption is not ready in the installed runtime; create the table without caption.',
      );
    }
    if (entry.op === 'list.writeBullets' || entry.op === 'list.applyNumbering') {
      if (!Array.isArray(value.items) || value.items.length === 0
        || value.items.some((item) => typeof item !== 'string' || item.trim() === '')) {
        throw new Error(`${entry.op} items must be a nonempty array of nonempty strings.`);
      }
    }
    if (entry.op === 'object.deleteTextBoxByText'
      && (!Array.isArray(value.texts) || value.texts.length === 0 || value.texts.some((item) => typeof item !== 'string' || !item.trim()))) {
      throw new Error('object.deleteTextBoxByText texts must be a nonempty array of nonempty strings.');
    }
    if (entry.op === 'object.replaceTextBoxText'
      && (!Array.isArray(value.replacements) || value.replacements.length === 0
        || value.replacements.some((item) => typeof item?.find !== 'string' || !item.find || typeof item?.replaceWith !== 'string'))) {
      throw new Error('object.replaceTextBoxText replacements must contain nonempty find strings and string replaceWith values.');
    }
    for (const target of commandInspectionTargets(value, entry, index)) {
      if (!target.key) {
        throw new Error(`${entry.op} ${target.role} must identify a stable paragraph or table-cell target.`);
      }
    }
    return entry;
  });
}

function getHwpxCommandCatalog({ category, op } = {}) {
  const requestedCategory = String(category || '').trim();
  const requestedOp = String(op || '').trim();
  let commands = HWPX_COMMAND_CATALOG;
  if (requestedCategory) commands = commands.filter((entry) => entry.category === requestedCategory);
  if (requestedOp) {
    const resolved = resolveHwpxCommand(requestedOp);
    commands = resolved ? commands.filter((entry) => entry.op === resolved.op) : [];
  }
  return {
    version: '1.0.0',
    sourceFormat: 'hwpx',
    categories: HWPX_COMMAND_CATEGORIES,
    commandCount: commands.length,
    commands,
  };
}

function commandsNeedPrecondition(entries, precondition) {
  return entries.some((entry) => entry.precondition === precondition);
}

export {
  HWPX_COMMAND_CATALOG,
  HWPX_COMMAND_CATEGORIES,
  HWPX_COMMAND_OPS,
  commandsNeedPrecondition,
  getHwpxCommandCatalog,
  requiredInspectionTargets,
  resolveHwpxCommand,
  stableHwpxTargetKey,
  validateHwpxCommands,
};
