const command = ({
  op,
  category,
  description,
  normalizeAs = op,
  required = [],
  anyOf = [],
  aliases = [],
  precondition = 'none',
  fields = {},
  example,
  notes = [],
}) => Object.freeze({
  op,
  category,
  description,
  normalizeAs,
  required: Object.freeze(['op', ...required]),
  anyOf: Object.freeze(anyOf.map((group) => Object.freeze([...group]))),
  aliases: Object.freeze([...aliases]),
  precondition,
  fields: Object.freeze({ op: `Use exactly ${op}.`, commandId: 'Optional stable ID for matching results.', ...fields }),
  example: Object.freeze(example),
  notes: Object.freeze([...notes]),
});

const locationField = 'Exact paragraph or table-cell location returned by target_map, target_find, or target_inspect.';
const targetField = 'Exact inspected target or range returned by the current document session.';
const styleSourceField = 'Exact inspected paragraph or cell whose existing style must be cloned.';

const DOCX_COMMAND_CATALOG = Object.freeze([
  command({
    op: 'text.replaceParagraph', category: 'text', precondition: 'target_inspect',
    description: 'Replace all visible text in one inspected paragraph. Single-run and visually uniform multi-run paragraphs preserve their style automatically; only paragraphs with visibly distinct run formatting require explicit run-preserving segments from target_inspect.',
    required: ['location', 'text'], aliases: ['replaceParagraphText'],
    fields: {
      location: locationField,
      text: 'Complete replacement text.',
      segments: 'Required only when inspected runs have visibly distinct formatting. Provide one ordered { sourceRun, text } item per inspected run; concatenated segment text must exactly equal text.',
    },
    example: { op: 'text.replaceParagraph', location: { paragraph: { section: 0, number: 1 } }, text: 'Replacement paragraph.' },
    notes: ['Call target_inspect. Preserve every run index in order only when its runs have visibly distinct formatting; uniform multi-run placeholders can omit segments.'],
  }),
  command({
    op: 'text.replace', category: 'text', precondition: 'target_inspect',
    description: 'Replace an inspected text range.', required: ['target', 'text'], aliases: ['replaceText'],
    fields: { target: targetField, text: 'Replacement text.' },
    example: { op: 'text.replace', target: { native: { section: 0, para: 1, offset: 0, length: 4 } }, text: '2026' },
  }),
  command({
    op: 'insertText', category: 'text', precondition: 'target_inspect',
    normalizeAs: 'text.insert',
    description: 'Insert text at an inspected DOCX range start.', required: ['target', 'text'], aliases: ['text.insert'],
    fields: { target: targetField, text: 'Text to insert.' },
    example: { op: 'insertText', target: { range: { start: { nodeId: 'p_1', offset: 5 } } }, text: 'inserted text' },
  }),
  command({
    op: 'deleteRange', category: 'text', precondition: 'target_inspect',
    normalizeAs: 'text.delete',
    description: 'Delete an inspected DOCX text range.', required: ['target'], aliases: ['text.delete'],
    fields: { target: targetField },
    example: { op: 'deleteRange', target: { range: { start: { nodeId: 'p_1', offset: 2 }, end: { nodeId: 'p_1', offset: 6 } } } },
  }),
  command({
    op: 'appendParagraph', category: 'text',
    normalizeAs: 'paragraph.append',
    description: 'Append a new paragraph before the final document section properties.', required: ['text'], aliases: ['paragraph.append'],
    fields: {
      text: 'New paragraph text.',
      paragraphStyle: 'Optional paragraph style object. To use a named style, pass { styleId: "StyleId" }; never pass the style ID as a bare string.',
      runStyle: 'Optional run style object.',
    },
    example: { op: 'appendParagraph', text: 'New concluding paragraph.', paragraphStyle: { styleId: 'BodyText' } },
  }),
  command({
    op: 'table.writeCell', category: 'table', precondition: 'target_inspect',
    description: 'Replace one inspected table cell, optionally fitting text or cloning a source style.',
    required: ['location', 'text'], aliases: ['setCellText'],
    fields: { location: locationField, text: 'Complete cell text.', fit: 'Boolean: fit text before writing.', fitOptions: 'Optional fit limits.', styleSource: styleSourceField },
    example: { op: 'table.writeCell', location: { tableId: 'tbl_0', cell: { number: 1 } }, text: '18,420' },
  }),
  command({
    op: 'table.writeRichCell', category: 'table', precondition: 'target_inspect',
    description: 'Replace one inspected cell and clone paragraph/run style from another inspected location.',
    required: ['location', 'styleSource', 'text'],
    fields: { location: locationField, styleSource: styleSourceField, text: 'Complete cell text.' },
    example: { op: 'table.writeRichCell', location: { tableId: 'tbl_0', cell: { number: 1 } }, styleSource: { tableId: 'tbl_0', cell: { number: 0 } }, text: 'Styled value' },
  }),
  command({
    op: 'table.writeCells', category: 'table', precondition: 'target_inspect',
    description: 'Write multiple inspected cells in one revision-safe batch.', required: ['cells'],
    fields: { tableId: 'Default table ID for cells that omit tableId.', cells: 'Array of objects containing cell/location, text, and optional styleSource/fit options.', fit: 'Default fit flag.', fitOptions: 'Default fit limits.' },
    example: { op: 'table.writeCells', tableId: 'tbl_0', cells: [{ cell: { number: 0 }, text: 'A' }, { cell: { number: 1 }, text: 'B' }] },
  }),
  command({
    op: 'table.applyCellStyle', category: 'table', precondition: 'target_inspect',
    description: 'Apply an explicit DOCX outer-cell style or clone it from another inspected cell.',
    required: ['target'], anyOf: [['styleSource', 'source', 'cellStyle']], aliases: ['cell.applyStyle'],
    fields: { target: targetField, styleSource: styleSourceField, source: 'Alias of styleSource.', cellStyle: 'DOCX cell style such as width, fill, borderColor, verticalAlign, and margins.' },
    example: { op: 'table.applyCellStyle', target: { tableId: 'tbl_0', cell: { number: 1 } }, styleSource: { tableId: 'tbl_0', cell: { number: 0 } } },
  }),
  command({
    op: 'table.create', category: 'table',
    description: 'Append a new DOCX table.', required: ['rows', 'cols'], aliases: ['createTable'],
    fields: { rows: 'Positive integer row count.', cols: 'Positive integer column count.', cellStyle: 'Optional default cell style.', paragraphStyle: 'Optional default paragraph style.', runStyle: 'Optional default run style.' },
    example: { op: 'table.create', rows: 2, cols: 3 },
  }),
  command({
    op: 'table.insertCaption', category: 'table',
    description: 'Insert one caption paragraph immediately before an existing DOCX table without moving or rewriting the table.',
    required: ['tableId', 'text'], aliases: ['insertTableCaption'],
    fields: {
      tableId: 'Exact table ID returned by target_map or table.create.',
      text: 'Complete caption text.',
      paragraphStyle: 'Optional paragraph style object; use { styleId: "StyleId" } for a named style.',
      runStyle: 'Optional run style object.',
    },
    example: { op: 'table.insertCaption', tableId: 'tbl_0', text: 'Table 1. Evaluation matrix', paragraphStyle: { styleId: 'Caption' } },
  }),
  command({
    op: 'style.applyText', category: 'style', precondition: 'target_inspect',
    description: 'Clone paragraph/run style from an inspected source and optionally replace target text.',
    required: ['target', 'styleSource'],
    fields: { target: targetField, styleSource: styleSourceField, text: 'Optional replacement text; omit to preserve current text.' },
    example: { op: 'style.applyText', target: { paragraph: { number: 1 } }, styleSource: { paragraph: { number: 0 } }, text: 'Styled text' },
  }),
  command({
    op: 'paragraph.applyStyle', category: 'style', precondition: 'target_inspect',
    description: 'Clone paragraph/run style from an inspected source without changing target text.',
    required: ['target'], anyOf: [['styleSource', 'source']], aliases: ['style.applyParagraph'],
    fields: { target: targetField, styleSource: styleSourceField, source: 'Alias of styleSource.' },
    example: { op: 'paragraph.applyStyle', target: { paragraph: { number: 1 } }, styleSource: { paragraph: { number: 0 } } },
  }),
  command({
    op: 'style.clone', category: 'style', precondition: 'target_inspect',
    description: 'Alias-style command that clones paragraph/run style from source to target.',
    required: ['source', 'target'], aliases: ['style.cloneFromTarget'],
    fields: { source: styleSourceField, target: targetField },
    example: { op: 'style.clone', source: { paragraph: { number: 0 } }, target: { paragraph: { number: 1 } } },
  }),
  command({
    op: 'applyStyle', category: 'style', precondition: 'target_inspect',
    normalizeAs: 'paragraph.applyNamedStyle',
    description: 'Apply an existing named DOCX paragraph style.', required: ['target', 'styleId'], aliases: ['paragraph.applyNamedStyle'],
    fields: { target: targetField, styleId: 'Existing style ID from the same document or defineStyle.' },
    example: { op: 'applyStyle', target: { nodeId: 'p_1' }, styleId: 'Heading1' },
  }),
  command({
    op: 'setRunStyle', category: 'style', precondition: 'target_inspect',
    normalizeAs: 'style.setRunStyle',
    description: 'Set direct formatting on the first run of an inspected paragraph.', required: ['target', 'style'], aliases: ['style.setRunStyle'],
    fields: { target: targetField, style: 'Run style object such as bold, italic, fontSize, textColor, and fontFamily.' },
    example: { op: 'setRunStyle', target: { nodeId: 'p_1' }, style: { bold: true, fontSize: 12 } },
  }),
  command({
    op: 'setParagraphStyle', category: 'style', precondition: 'target_inspect',
    normalizeAs: 'style.setParagraphStyle',
    description: 'Set direct paragraph formatting on an inspected paragraph.', required: ['target', 'style'], aliases: ['style.setParagraphStyle'],
    fields: { target: targetField, style: 'Paragraph style object such as align, spacingBefore, spacingAfter, and lineSpacing.' },
    example: { op: 'setParagraphStyle', target: { nodeId: 'p_1' }, style: { align: 'center', spacingAfter: 120 } },
  }),
  command({
    op: 'list.writeBullets', category: 'list', precondition: 'target_inspect',
    description: 'Write stable visible bullet-list text into an inspected paragraph or cell.', required: ['location', 'items'], aliases: ['list.write'],
    fields: { location: locationField, items: 'Array of list item strings.', marker: 'Bullet marker, default -.', styleSource: styleSourceField },
    example: { op: 'list.writeBullets', location: { paragraph: { number: 1 } }, items: ['first', 'second'], marker: '-' },
    notes: ['Writes visible list text; it does not create a native Word numbering definition.'],
  }),
  command({
    op: 'list.applyNumbering', category: 'list', precondition: 'target_inspect',
    description: 'Write stable visible numbered-list text into an inspected paragraph or cell.', required: ['location', 'items'], aliases: ['paragraph.applyNumbering'],
    fields: { location: locationField, items: 'Array of list item strings.', startAt: 'First number, default 1.', suffix: 'Number suffix, default period.', styleSource: styleSourceField },
    example: { op: 'list.applyNumbering', location: { paragraph: { number: 1 } }, items: ['first', 'second'], startAt: 1, suffix: '.' },
    notes: ['Writes visible list text; it does not create a native Word numbering definition.'],
  }),
  command({
    op: 'layout.fitText', category: 'layout', precondition: 'target_inspect',
    description: 'Calculate wrapped/truncated text for an inspected target without writing it.', required: ['location', 'text'],
    fields: { location: locationField, text: 'Text to fit.', options: 'Fit limits such as maxCharsPerLine, maxLines, truncate, and ellipsis.' },
    example: { op: 'layout.fitText', location: { tableId: 'tbl_0', cell: { number: 1 } }, text: 'Long text', options: { maxCharsPerLine: 20, maxLines: 3, truncate: false } },
  }),
  command({
    op: 'image.replace', category: 'image', precondition: 'object_inventory',
    description: 'Replace bytes of an existing image discovered by object_inventory.', required: ['imageName'], anyOf: [['bytesBase64', 'bytes', 'filePath']], aliases: ['object.replaceImage', 'chart.replaceImage'],
    fields: { imageName: 'Exact package image name from object_inventory.', bytesBase64: 'Base64-encoded replacement image bytes.', bytes: 'Trusted in-process binary input only.', filePath: 'Trusted same-host file input only.', mimeType: 'Optional declared image MIME type, which must match the package extension and bytes.' },
    example: { op: 'image.replace', imageName: 'word/media/image1.png', bytesBase64: '<base64 image bytes>' },
  }),
  command({
    op: 'image.insertAfterParagraph', category: 'image', precondition: 'target_inspect',
    description: 'Insert a new inline image immediately after an inspected paragraph, with an optional caption paragraph.',
    required: ['location'], anyOf: [['bytesBase64', 'bytes', 'filePath']], aliases: ['image.insert', 'object.insertImage'],
    fields: {
      location: locationField,
      bytesBase64: 'Base64-encoded image bytes.',
      bytes: 'Trusted in-process binary input only.',
      filePath: 'Trusted same-host file input only.',
      mimeType: 'Optional declared image MIME type; it must match the image bytes.',
      widthEmu: 'Positive inline-image width in English Metric Units.',
      heightEmu: 'Positive inline-image height in English Metric Units.',
      altText: 'Optional accessible image description.',
      caption: 'Optional caption paragraph inserted immediately below the image.',
      captionParagraphStyle: 'Optional caption paragraph style object; use { styleId: "StyleId" } for a named style.',
      captionRunStyle: 'Optional caption run style object.',
    },
    example: {
      op: 'image.insertAfterParagraph',
      location: { paragraph: { section: 0, number: 1 } },
      bytesBase64: '<base64 image bytes>',
      widthEmu: 5486400,
      heightEmu: 3086100,
      altText: 'Research methodology framework',
      caption: 'Figure 1. Research methodology framework.',
    },
  }),
  command({
    op: 'image.generateAndReplace', category: 'image', precondition: 'object_inventory',
    description: 'Generate a simple PNG from numeric values and replace an existing PNG.', required: ['imageName', 'generator'], aliases: ['object.generateAndReplace', 'chart.generateAndReplace'],
    fields: { imageName: 'Exact PNG package name from object_inventory.', generator: 'Object with width, height, colors, and numeric values.' },
    example: { op: 'image.generateAndReplace', imageName: 'word/media/image1.png', generator: { width: 900, height: 520, values: [4, 9] } },
  }),
  command({
    op: 'setDocumentMetadata', category: 'package',
    description: 'Set DOCX core metadata.', anyOf: [['title', 'subject', 'creator', 'keywords', 'description']],
    fields: { title: 'Document title.', subject: 'Document subject.', creator: 'Document creator.', keywords: 'Document keywords.', description: 'Document description.' },
    example: { op: 'setDocumentMetadata', title: 'Journal Manuscript', creator: 'Research Team' },
  }),
  command({
    op: 'defineStyle', category: 'package',
    description: 'Create or replace a named DOCX style.', required: ['style'],
    fields: { style: 'Style object requiring styleId; may include name, type, basedOn, paragraphStyle, and runStyle.' },
    example: { op: 'defineStyle', style: { styleId: 'JournalHeading1', name: 'Journal Heading 1', type: 'paragraph', basedOn: 'Normal', runStyle: { bold: true, fontSize: 14 } } },
  }),
  command({
    op: 'setPageSetup', category: 'package',
    description: 'Set DOCX page size, orientation, and margins.', required: ['width', 'height'], anyOf: [['margins', 'marginTop']],
    fields: { width: 'Page width in twentieths of a point.', height: 'Page height in twentieths of a point.', orientation: 'portrait or landscape.', margins: 'Object with top, right, bottom, left and optional header/footer/gutter.', marginTop: 'Legacy flat top margin; use with marginRight, marginBottom, and marginLeft.' },
    example: { op: 'setPageSetup', width: 11906, height: 16838, margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  }),
  command({
    op: 'setHeaderFooter', category: 'package',
    description: 'Set or replace the default DOCX header, footer, or both.', anyOf: [['header', 'footer', 'text']],
    fields: { header: 'Header text.', footer: 'Footer text.', text: 'Legacy alias for header.', align: 'left, center, or right.' },
    example: { op: 'setHeaderFooter', header: 'Double-anonymized submission', footer: 'Page footer' },
  }),
  command({
    op: 'insertFootnote', category: 'package', precondition: 'target_inspect',
    description: 'Append a footnote reference to an inspected paragraph and create its footnote text.', required: ['target', 'text'],
    fields: { target: targetField, text: 'Footnote text.' },
    example: { op: 'insertFootnote', target: { range: { start: { nodeId: 'p_1', offset: 5 } } }, text: 'Footnote text.' },
    notes: ['The current DOCX engine places the footnote reference at the end of the inspected paragraph.'],
  }),
]);

const normalizeCommandName = (value) => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

const commandByName = new Map();
for (const entry of DOCX_COMMAND_CATALOG) {
  for (const name of [entry.op, ...entry.aliases]) {
    const key = normalizeCommandName(name);
    if (commandByName.has(key)) {
      throw new Error(`Duplicate DOCX command catalog name: ${name}`);
    }
    commandByName.set(key, entry);
  }
}

const DOCX_COMMAND_CATEGORIES = Object.freeze([...new Set(DOCX_COMMAND_CATALOG.map((entry) => entry.category))]);
const DOCX_COMMAND_OPS = Object.freeze(DOCX_COMMAND_CATALOG.map((entry) => entry.op));

function resolveDocxCommand(commandValue) {
  return commandByName.get(normalizeCommandName(commandValue)) || null;
}

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0 && value.some((item) => hasMeaningfulValue(item));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length > 0 && entries.some(([_key, item]) => hasMeaningfulValue(item));
  }
  return true;
}

function commandFieldValue(commandValue, field) {
  if (field === 'target') {
    return commandValue.target ?? commandValue.location;
  }
  if (field === 'location') {
    return commandValue.location ?? commandValue.target;
  }
  return commandValue[field];
}

const EMPTY_TEXT_CLEARING_OPS = new Set([
  'text.replaceParagraph',
  'text.replace',
  'appendParagraph',
  'table.writeCell',
  'table.writeRichCell',
]);

function requiredFieldIsValid(entry, commandValue, field) {
  const value = commandFieldValue(commandValue, field);
  if (field === 'text' && EMPTY_TEXT_CLEARING_OPS.has(entry.op)) {
    return typeof value === 'string';
  }
  return hasMeaningfulValue(value);
}

function alternativeFieldIsValid(entry, commandValue, field) {
  if ((entry.op === 'setDocumentMetadata' || entry.op === 'setHeaderFooter')
    && Object.hasOwn(commandValue, field)) {
    return typeof commandValue[field] === 'string';
  }
  return hasMeaningfulValue(commandValue[field]);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function stableDocxTargetKey(value) {
  const target = value?.location ?? value?.target ?? value;
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return '';
  }

  const native = target.native && typeof target.native === 'object' ? target.native : {};
  const tableId = String(target.tableId ?? target.table?.id ?? '').trim();
  const tableIndex = nonNegativeInteger(target.tableIndex ?? native.tableIndex);
  const tableKey = tableId ? `table:${tableId}` : tableIndex !== null ? `table-index:${tableIndex}` : '';
  const cell = target.cell ?? target.tableCell ?? (native.cellIndex !== undefined || native.row !== undefined ? native : null);
  if (cell && typeof cell === 'object' && tableKey) {
    const cellNumber = nonNegativeInteger(cell.number ?? cell.cellIndex ?? cell.index);
    if (cellNumber !== null) {
      return `${tableKey}/cell:${cellNumber}`;
    }
    const row = nonNegativeInteger(cell.row);
    const column = nonNegativeInteger(cell.column ?? cell.col);
    if (row !== null && column !== null) {
      return `${tableKey}/row:${row}/column:${column}`;
    }
    return '';
  }

  const range = target.range;
  if (range) {
    const startNodeId = String(range.start?.nodeId ?? '').trim();
    const endNodeId = String(range.end?.nodeId ?? startNodeId).trim();
    const startMatch = startNodeId.match(/^p_(\d+)$/);
    const startOffset = nonNegativeInteger(range.start?.offset ?? 0);
    const endOffset = range.end ? nonNegativeInteger(range.end.offset) : startOffset;
    if (!startMatch || endNodeId !== startNodeId || startOffset === null || endOffset === null || endOffset < startOffset) {
      return '';
    }
    return `paragraph:0:${Number(startMatch[1])}`;
  }

  const nodeId = String(target.nodeId ?? '').trim();
  const nodeMatch = nodeId.match(/^p_(\d+)$/);
  if (nodeMatch) {
    return `paragraph:0:${Number(nodeMatch[1])}`;
  }

  const paragraph = target.paragraph && typeof target.paragraph === 'object' ? target.paragraph : native;
  const paragraphNumber = nonNegativeInteger(paragraph.number ?? paragraph.paragraph ?? paragraph.para ?? paragraph.index);
  if (paragraphNumber !== null) {
    const hasNativeRange = paragraph.offset !== undefined || paragraph.startOffset !== undefined
      || paragraph.endOffset !== undefined || paragraph.length !== undefined;
    if (hasNativeRange) {
      const startOffset = nonNegativeInteger(paragraph.offset ?? paragraph.startOffset ?? 0);
      const explicitEnd = paragraph.endOffset !== undefined ? nonNegativeInteger(paragraph.endOffset) : null;
      const length = paragraph.length !== undefined ? nonNegativeInteger(paragraph.length) : null;
      const endOffset = explicitEnd ?? (startOffset !== null && length !== null ? startOffset + length : startOffset);
      if (startOffset === null || endOffset === null || endOffset < startOffset) {
        return '';
      }
    }
    const section = nonNegativeInteger(paragraph.section ?? 0);
    return section === null ? '' : `paragraph:${section}:${paragraphNumber}`;
  }
  return '';
}

function cellLocation(command, defaultTableId = '') {
  const location = command.location ?? command.target ?? {};
  return {
    ...location,
    tableId: command.tableId ?? location.tableId ?? defaultTableId,
    cell: command.cell ?? location.cell ?? command.tableCell ?? location.tableCell,
  };
}

function commandInspectionTargets(command, entry, commandIndex = 0) {
  const targets = [];
  const add = (value, role) => {
    targets.push({
      commandIndex,
      op: entry.op,
      role,
      value,
      key: stableDocxTargetKey(value),
    });
  };
  const addOptional = (value, role) => {
    if (value !== undefined && value !== null) {
      add(value, role);
    }
  };

  if (entry.op === 'table.writeCell' || entry.op === 'table.writeRichCell') {
    add(command.location ?? command.target, 'location');
    addOptional(command.styleSource, 'styleSource');
  } else if (entry.op === 'table.writeCells') {
    for (const [cellIndex, cell] of command.cells.entries()) {
      add(cellLocation(cell, cell.tableId ?? command.tableId), `cells[${cellIndex}]`);
      addOptional(cell.styleSource ?? command.styleSource, `cells[${cellIndex}].styleSource`);
    }
  } else if (entry.op === 'text.replaceParagraph' || entry.op === 'list.writeBullets'
    || entry.op === 'list.applyNumbering' || entry.op === 'layout.fitText'
    || entry.op === 'image.insertAfterParagraph') {
    add(command.location ?? command.target, 'location');
    addOptional(command.styleSource, 'styleSource');
  } else if (entry.op === 'text.replace' || entry.op === 'insertText' || entry.op === 'deleteRange'
    || entry.op === 'applyStyle' || entry.op === 'setRunStyle' || entry.op === 'setParagraphStyle'
    || entry.op === 'insertFootnote') {
    add(command.target ?? command.location, 'target');
  } else if (entry.op === 'table.applyCellStyle') {
    add(command.target ?? command.location, 'target');
    addOptional(command.styleSource ?? command.source, 'styleSource');
  } else if (entry.op === 'style.applyText') {
    add(command.target ?? command.location, 'target');
    add(command.styleSource, 'styleSource');
  } else if (entry.op === 'paragraph.applyStyle') {
    add(command.target ?? command.location, 'target');
    add(command.styleSource ?? command.source, 'styleSource');
  } else if (entry.op === 'style.clone') {
    add(command.target, 'target');
    add(command.source, 'source');
  }
  return targets;
}

function requiredInspectionTargets(commands, entries = null) {
  const resolvedEntries = entries ?? commands.map((command) => resolveDocxCommand(command?.op));
  return commands.flatMap((command, index) => {
    const entry = resolvedEntries[index];
    return entry?.precondition === 'target_inspect' ? commandInspectionTargets(command, entry, index) : [];
  });
}

function validateDocxCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('editor_docx_apply requires at least one command.');
  }
  return commands.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`DOCX command ${index + 1} must be an object.`);
    }
    const entry = resolveDocxCommand(value.op);
    if (!entry) {
      throw new Error(`Unsupported DOCX command op: ${String(value.op || '<missing>')}. Call editor_docx_command_catalog first.`);
    }
    const missing = entry.required.filter((field) => !requiredFieldIsValid(entry, value, field));
    if (missing.length) {
      throw new Error(`${entry.op} is missing required field(s): ${missing.join(', ')}.`);
    }
    for (const alternatives of entry.anyOf) {
      if (!alternatives.some((field) => alternativeFieldIsValid(entry, value, field))) {
        throw new Error(`${entry.op} requires at least one of: ${alternatives.join(', ')}.`);
      }
    }

    if (entry.op === 'table.writeCells') {
      if (!Array.isArray(value.cells) || value.cells.length === 0) {
        throw new Error('table.writeCells requires a nonempty cells array.');
      }
      for (const [cellIndex, cell] of value.cells.entries()) {
        if (!cell || typeof cell !== 'object' || Array.isArray(cell)) {
          throw new Error(`table.writeCells cells[${cellIndex}] must be an object.`);
        }
        if (!Object.hasOwn(cell, 'text') || typeof cell.text !== 'string') {
          throw new Error(`table.writeCells cells[${cellIndex}] requires a text string; an empty string explicitly clears the cell.`);
        }
      }
    }
    if (entry.op === 'table.create') {
      if (!Number.isInteger(value.rows) || value.rows <= 0 || !Number.isInteger(value.cols) || value.cols <= 0) {
        throw new Error('table.create rows and cols must be positive integers.');
      }
    }
    if (entry.op === 'image.insertAfterParagraph') {
      for (const field of ['widthEmu', 'heightEmu']) {
        if (value[field] !== undefined && (!Number.isInteger(value[field]) || value[field] <= 0)) {
          throw new Error(`image.insertAfterParagraph ${field} must be a positive integer.`);
        }
      }
      if (value.caption !== undefined && typeof value.caption !== 'string') {
        throw new Error('image.insertAfterParagraph caption must be a string.');
      }
    }
    if (entry.op === 'list.writeBullets' || entry.op === 'list.applyNumbering') {
      if (!Array.isArray(value.items) || value.items.length === 0
        || value.items.some((item) => typeof item !== 'string' || item.trim() === '')) {
        throw new Error(`${entry.op} items must be a nonempty array of nonempty strings.`);
      }
    }
    if (entry.op === 'defineStyle' && (typeof value.style?.styleId !== 'string' || value.style.styleId.trim() === '')) {
      throw new Error('defineStyle style.styleId must be a nonempty string.');
    }

    for (const target of commandInspectionTargets(value, entry, index)) {
      if (!target.key) {
        throw new Error(`${entry.op} ${target.role} must identify a stable paragraph or table-cell target.`);
      }
    }
    return entry;
  });
}

function getDocxCommandCatalog({ category, op } = {}) {
  const requestedCategory = String(category || '').trim();
  const requestedOp = String(op || '').trim();
  let commands = DOCX_COMMAND_CATALOG;
  if (requestedCategory) {
    commands = commands.filter((entry) => entry.category === requestedCategory);
  }
  if (requestedOp) {
    const resolved = resolveDocxCommand(requestedOp);
    commands = resolved ? commands.filter((entry) => entry.op === resolved.op) : [];
  }
  return {
    version: '1.0.0',
    sourceFormat: 'docx',
    categories: DOCX_COMMAND_CATEGORIES,
    commandCount: commands.length,
    commands,
  };
}

function commandsNeedPrecondition(entries, precondition) {
  return entries.some((entry) => entry.precondition === precondition);
}

export {
  DOCX_COMMAND_CATALOG,
  DOCX_COMMAND_CATEGORIES,
  DOCX_COMMAND_OPS,
  commandsNeedPrecondition,
  getDocxCommandCatalog,
  requiredInspectionTargets,
  resolveDocxCommand,
  stableDocxTargetKey,
  validateDocxCommands,
};
