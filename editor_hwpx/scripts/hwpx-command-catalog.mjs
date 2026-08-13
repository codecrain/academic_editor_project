import { formatCatalogFields, normalizeFormatProperties } from './hwpx-format-contract.mjs';

const command = ({
  op,
  category,
  description,
  normalizeAs = op,
  required = [],
  optional = [],
  anyOf = [],
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
    commandId: 'Optional stable ID for direct API callers; required by editor_hwpx_edit.',
    ...fields,
  }),
  example: Object.freeze(example),
  notes: Object.freeze([...notes]),
});

const locationField = 'Exact paragraph or table-cell location returned by editor_hwpx_inspect(view="outline"|"target").';
const styleSourceField = 'Exact inspected paragraph or cell whose existing HWPX style must be cloned.';

const HWPX_COMMAND_CATALOG = Object.freeze([
  command({
    op: 'field.setValues',
    category: 'field',
    description: 'Set one or more inventoried form-field values by stable field ID or by an unambiguous name and occurrence. The whole batch is saved, reopened, and verified atomically.',
    required: ['values'],
    precondition: 'field_inventory',
    execution: 'structural-adapter',
    nativeMethods: ['setFieldValue'],
    fields: {
      values: 'Array of {fieldId,value} or {name,occurrence?,value}. occurrence is zero-based and is required when a name is repeated.',
    },
    example: {
      op: 'field.setValues',
      values: [
        { name: '신청인', value: '홍길동' },
        { name: '연락처', occurrence: 0, value: '010-0000-0000' },
      ],
    },
    notes: ['Missing or ambiguous fields fail the complete atomic command before any revision is committed.'],
  }),
  command({
    op: 'text.replaceParagraph',
    category: 'text',
    description: 'Replace all visible text in one inspected body paragraph while preserving its paragraph and character style IDs.',
    required: ['location', 'text'],
    precondition: 'target_inspect',
    fields: { location: locationField, text: 'Complete replacement text.' },
    example: { op: 'text.replaceParagraph', location: { paragraph: { section: 0, number: 1 } }, text: '교체 문단' },
  }),
  command({
    op: 'text.insertAfterParagraph',
    category: 'text',
    description: 'Insert one or more newline-delimited paragraphs after an inspected body paragraph.',
    required: ['location', 'text'],
    precondition: 'target_inspect',
    fields: { location: locationField, text: 'Text to insert; newlines create additional paragraphs.', styleSource: styleSourceField },
    example: { op: 'text.insertAfterParagraph', location: { paragraph: { section: 0, number: 1 } }, text: '신규 요약\n신규 세부내용' },
  }),
  command({
    op: 'text.replace',
    category: 'text',
    description: 'Replace an inspected text range within one body paragraph.',
    required: ['target', 'text'],
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
    fields: {
      target: locationField,
      text: 'Replacement text.',
      author: 'Tracked-change author name.',
      date: 'Optional ISO-8601 tracked-change timestamp.',
    },
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
    op: 'field.manage',
    category: 'field',
    description: 'Update any inventoried ClickHere field guide/memo/name/editability, or delete one top-level ClickHere field by stable field ID.',
    required: ['action', 'fieldId'],
    optional: ['guide', 'memo', 'name', 'editable'],
    precondition: 'field_inventory',
    execution: 'structural-adapter',
    nativeMethods: ['getFieldList', 'updateClickHereProps', 'removeFieldAt'],
    enum: { action: ['update', 'delete'] },
    fields: {
      action: 'update or delete.', fieldId: 'Stable field ID returned by editor_hwpx_inspect(view="fields").',
      guide: 'Optional replacement guide for action=update.', memo: 'Optional replacement memo for action=update.',
      name: 'Optional replacement name for action=update.', editable: 'Optional replacement form editability for action=update.',
    },
    example: { op: 'field.manage', action: 'update', fieldId: 7, guide: '신청인 성명', name: 'applicant_name', editable: true },
    notes: ['Update accepts body, table-cell, and text-box ClickHere fields. Delete is intentionally rejected for virtual table-cell field regions because their native deletion coordinates differ from top-level ClickHere controls.'],
  }),
  command({
    op: 'field.insert',
    category: 'field',
    description: 'Insert one ClickHere form field at an inspected body paragraph, table cell, or text-box paragraph.',
    required: ['target'],
    optional: ['guide', 'memo', 'name', 'editable'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['insertClickHereField', 'insertClickHereFieldInCell'],
    fields: {
      target: locationField,
      guide: 'Optional visible guide text.',
      memo: 'Optional field memo.',
      name: 'Optional unique field name.',
      editable: 'Optional editability flag; defaults to true.',
    },
    example: {
      op: 'field.insert',
      target: { native: { section: 0, para: 1, offset: 4 } },
      guide: '신청인 성명', name: 'applicant_name', editable: true,
    },
  }),
  command({
    op: 'deleteRange',
    category: 'text',
    description: 'Delete one inspected HWPX text range.',
    required: ['target'],
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
    op: 'text.deleteParagraphs',
    category: 'text',
    description: 'Delete one or more inspected top-level body paragraphs, including any tables or controls anchored in those paragraphs.',
    required: ['locations'],
    precondition: 'target_inspect',
    fields: {
      locations: 'Nonempty array of exact paragraph locations returned by editor_hwpx_inspect(view="outline"|"target").',
    },
    example: {
      op: 'text.deleteParagraphs',
      locations: [
        { paragraph: { section: 0, number: 3 } },
        { paragraph: { section: 0, number: 4 } },
      ],
    },
    notes: [
      'This is a package-preserving structural deletion and may intentionally remove tables or other controls anchored in the selected paragraphs.',
      'Run it alone in a batch because all later paragraph and table locations change after deletion.',
    ],
  }),
  command({
    op: 'table.writeCell',
    category: 'table',
    description: 'Replace one inspected table cell, optionally fitting text and cloning paragraph style IDs.',
    required: ['location', 'text'],
    optional: ['fit', 'fitOptions', 'styleSource', 'paragraphStyleIds', 'paragraphTemplateIndices'],
    precondition: 'target_inspect',
    fields: {
      location: locationField,
      text: 'Complete cell text; newline creates another cell paragraph.',
      fit: 'Boolean: fit text before writing.',
      fitOptions: 'Optional fit limits.',
      styleSource: styleSourceField,
      paragraphStyleIds: 'Optional array aligned to newline-delimited cell paragraphs. Each entry may override paraPrIDRef, styleIDRef, or charPrIDRef for that paragraph.',
      paragraphTemplateIndices: 'Optional array aligned to newline-delimited cell paragraphs. Each entry may reuse one zero-based paragraph from the original cell; exact text preserves all inline controls, while an equal number of leading tab characters preserves and rewrites structural tab controls.',
    },
    example: { op: 'table.writeCell', location: { tableId: 'tbl_0', cell: { number: 1 } }, text: '18,420' },
  }),
  command({
    op: 'table.writeCells',
    category: 'table',
    description: 'Write multiple inspected table cells in one atomic batch.',
    required: ['cells'],
    optional: ['tableId', 'fit', 'fitOptions', 'paragraphStyleIds', 'paragraphTemplateIndices'],
    precondition: 'target_inspect',
    fields: {
      tableId: 'Default table ID for cells that omit tableId.',
      cells: 'Nonempty array containing cell/location, text, and optional styleSource/fit options.',
      fit: 'Default fit flag.',
      fitOptions: 'Default fit limits.',
      paragraphStyleIds: 'Optional per-cell array aligned to that cell text paragraphs.',
      paragraphTemplateIndices: 'Optional per-cell array of original paragraph indices aligned to the replacement text.',
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
    anyOf: [['styleSource', 'cellStyle']],
    precondition: 'target_inspect',
    fields: {
      target: locationField,
      styleSource: styleSourceField,
      cellStyle: 'HWPX cell style fields such as borderFillIDRef, vertical alignment, and margins.',
    },
    example: {
      op: 'table.applyCellStyle',
      target: { tableId: 'tbl_0', cell: { number: 1 } },
      styleSource: { tableId: 'tbl_0', cell: { number: 0 } },
    },
  }),
  command({
    op: 'table.insertRows',
    category: 'table',
    description: 'Insert cloned rows into an inspected HWPX table while preserving column spans, cell styles, and crossing row merges.',
    required: ['target', 'rowIndex', 'count', 'templateRow'],
    optional: ['clearText', 'extendBoundarySpans'],
    precondition: 'target_inspect',
    fields: {
      target: 'Exact inspected cell location identifying the table to change.',
      rowIndex: 'Zero-based row index before which new rows are inserted; rowCount appends.',
      count: 'Number of rows to insert, from 1 through 20.',
      templateRow: 'Existing zero-based row whose cell geometry and styles are cloned.',
      clearText: 'Whether cloned cell text is cleared; defaults to true.',
      extendBoundarySpans: 'When true, a multi-row merged cell ending exactly at rowIndex is extended across the inserted rows.',
    },
    example: {
      op: 'table.insertRows',
      target: { tableId: 'tbl_0', cell: { number: 0 } },
      rowIndex: 3,
      count: 2,
      templateRow: 2,
      clearText: true,
      extendBoundarySpans: true,
    },
    notes: [
      'Run it alone in a batch, then inspect the table again at the returned revision before writing the new cells.',
    ],
  }),
  command({
    op: 'table.setSize',
    category: 'table',
    description: 'Set the declared width and/or height of an inspected HWPX table without reconstructing the package.',
    required: ['target'],
    anyOf: [['width', 'height']],
    precondition: 'target_inspect',
    fields: {
      target: 'Exact inspected cell location identifying the table to resize.',
      width: 'Optional positive table width in HWP units.',
      height: 'Optional positive table height in HWP units.',
    },
    example: {
      op: 'table.setSize',
      target: { tableId: 'tbl_0', cell: { number: 0 } },
      height: 70902,
    },
  }),
  command({
    op: 'table.setCellSize',
    category: 'table',
    description: 'Set the width and/or height of one inspected HWPX table cell without changing its content or style.',
    required: ['target'],
    anyOf: [['width', 'height']],
    precondition: 'target_inspect',
    fields: {
      target: 'Exact inspected table-cell location to resize.',
      width: 'Optional positive cell width in HWP units.',
      height: 'Optional positive cell height in HWP units.',
    },
    example: {
      op: 'table.setCellSize',
      target: { tableId: 'tbl_0', cell: { number: 4 } },
      height: 15932,
    },
  }),
  command({
    op: 'table.autoFit',
    category: 'table',
    description: 'Measure the current rendered content of one inspected cell, grow every cell in that row to the required minimum height, and repaginate the document.',
    required: ['target'],
    optional: [
      'minHeight', 'maxHeight', 'extraPadding',
      'maxPageGrowth', 'maxBlankPageGrowth', 'maxLowOccupancyGrowth',
    ],
    precondition: 'target_inspect',
    execution: 'package-patch',
    nativeMethods: [
      'getCellProperties',
      'getCellParagraphCount',
      'getCellParagraphLength',
      'getCursorRectInCell',
      'getTableDimensions',
      'getCellInfo',
      'resizeTableCells',
    ],
    fields: {
      target: locationField,
      minHeight: 'Optional minimum row height in HWP units.',
      maxHeight: 'Optional maximum row height in HWP units. The page-content safety limit is used when omitted.',
      extraPadding: 'Optional additional bottom-safe space in HWP units.',
      maxPageGrowth: 'Maximum allowed page-count increase for the reopened atomic batch. Defaults to 1.',
      maxBlankPageGrowth: 'Maximum allowed increase in blank rendered pages. Defaults to 0.',
      maxLowOccupancyGrowth: 'Maximum allowed increase in sparse/low-occupancy rendered pages. Defaults to 0.',
    },
    example: { op: 'table.autoFit', target: { tableId: 'tbl_0', cell: { number: 1 } }, extraPadding: 200 },
  }),
  command({
    op: 'table.create',
    category: 'table',
    description: 'Create a new HWPX table after an inspected body paragraph.',
    required: ['target', 'rows', 'columns'],
    optional: ['width', 'height', 'cellTexts', 'caption'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: [
      'createTableEx',
      'getCellProperties',
      'resizeTableCells',
      'insertTextInCell',
      'setTableProperties',
      'deleteTextInCell',
    ],
    fields: {
      target: locationField,
      rows: 'Positive integer row count.',
      columns: 'Positive integer column count.',
      width: 'Optional table width in HWP units.',
      height: 'Optional table height in HWP units.',
      cellTexts: 'Optional row-major array of initial cell text.',
      caption: 'Optional nonempty native table caption text.',
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
    readiness: 'available',
    execution: 'structural-adapter',
    nativeMethods: ['setTableProperties', 'deleteTextInCell', 'insertTextInCell'],
    enum: { position: ['before', 'after'] },
    fields: { target: locationField, text: 'Complete caption text.', position: 'before or after; default before.' },
    example: {
      op: 'table.insertCaption',
      target: { tableId: 'tbl_0', cell: { number: 0 } },
      text: '표 1. 평가 결과',
    },
    notes: [
      'Requires the repository source-built RHWP runtime; save/reopen verification is mandatory.',
    ],
  }),
  command({
    op: 'table.structure',
    category: 'table',
    description: 'Insert/delete rows or columns, merge/split cells, split/attach a table, or delete one inspected table through one location-changing command.',
    required: ['target', 'action'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: [
      'insertTableRow', 'insertTableColumn', 'deleteTableRow', 'deleteTableColumn',
      'mergeTableCells', 'splitTableCellInto', 'splitTable', 'mergeTableWithNext', 'deleteTableControl',
    ],
    enum: {
      action: ['insertRow', 'insertColumn', 'deleteRow', 'deleteColumn', 'mergeCells', 'splitCell', 'splitTable', 'attachNextTable', 'deleteTable'],
      side: ['before', 'after'],
    },
    fields: {
      target: 'Exact inspected table target.',
      action: 'Requested table structure mutation.',
      row: 'Zero-based row for row and split operations.',
      column: 'Zero-based column for column and split operations.',
      startRow: 'Inclusive merge start row.', startColumn: 'Inclusive merge start column.',
      endRow: 'Inclusive merge end row.', endColumn: 'Inclusive merge end column.',
      rows: 'Split row count.', columns: 'Split column count.',
      side: 'before or after for insertion.', equalRowHeight: 'Use equal split row heights.', mergeFirst: 'Merge an existing span before splitting.',
      atRow: 'First zero-based row to move into the second table for splitTable. Must not be the first row.',
    },
    example: { op: 'table.structure', target: { tableId: 'tbl_0', cell: { number: 0 } }, action: 'mergeCells', startRow: 0, startColumn: 0, endRow: 0, endColumn: 2 },
    notes: ['Runs alone because it invalidates table-cell locations.'],
  }),
  command({
    op: 'table.transform',
    category: 'table',
    description: 'Transpose an inspected whole table, calculate one target cell, or equalize the selected table range without reconstructing the table.',
    required: ['target', 'action'],
    optional: ['row', 'column', 'formula', 'writeResult', 'startRow', 'startColumn', 'endRow', 'endColumn'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['transposeTableCellsInPlace', 'evaluateTableFormula', 'resizeTableCells'],
    enum: { action: ['transpose', 'calculate', 'equalizeRowHeight', 'equalizeColumnWidth'] },
    fields: {
      target: 'Exact inspected table target.', action: 'Whole-table transpose, formula calculation, or equalization action.',
      row: 'Zero-based formula target row.', column: 'Zero-based formula target column.',
      formula: 'Formula such as =SUM(A1:A5).', writeResult: 'Write the formula result into the target cell; defaults to true.',
      startRow: 'Optional inclusive range start row.', startColumn: 'Optional inclusive range start column.',
      endRow: 'Optional inclusive range end row.', endColumn: 'Optional inclusive range end column.',
    },
    example: { op: 'table.transform', target: { tableId: 'tbl_0', cell: { number: 0 } }, action: 'transpose' },
    notes: ['Runs alone because transpose changes table dimensions and all cell locations.'],
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
    op: 'applyStyle',
    category: 'style',
    description: 'Apply an existing named HWPX paragraph style.',
    required: ['target', 'styleId'],
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
    precondition: 'target_inspect',
    readiness: 'available',
    execution: 'structural-adapter',
    nativeMethods: [
      'applyCharFormat',
      'applyCharFormatInCell',
      'findOrCreateFontId',
    ],
    notes: [
      'Requires the repository source-built RHWP runtime; both range boundaries are verified after reopen.',
    ],
    fields: { target: locationField, style: 'Character format such as bold, italic, font size, color, and font family.' },
    example: { op: 'setRunStyle', target: { paragraph: { section: 0, number: 1 } }, style: { bold: true, fontSizePt: 12 } },
  }),
  command({
    op: 'setParagraphStyle',
    category: 'style',
    description: 'Set direct paragraph formatting on an inspected HWPX paragraph.',
    required: ['target', 'style'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['applyParaFormat', 'applyParaFormatInCell'],
    fields: { target: locationField, style: 'Paragraph format such as alignment, spacing, margins, and line spacing.' },
    example: { op: 'setParagraphStyle', target: { paragraph: { section: 0, number: 1 } }, style: { align: 'center' } },
  }),
  command({
    op: 'format.apply',
    category: 'style',
    description: 'Apply validated direct character, paragraph, table-cell, or table formatting through one strict contract.',
    required: ['scope', 'target'],
    anyOf: [['properties', 'styleRef']],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: [
      'applyCharFormat', 'applyCharFormatInCell',
      'applyParaFormat', 'applyParaFormatInCell',
      'setCellProperties', 'setTableProperties',
    ],
    enum: { scope: ['character', 'paragraph', 'cell', 'table'] },
    fields: {
      scope: 'character, paragraph, cell, or table.',
      target: locationField,
      properties: formatCatalogFields(),
      styleRef: 'Cross-document measured-format reference with source documentId, exact source location, and optional scope; resolved by the MCP gateway.',
    },
    example: {
      op: 'format.apply',
      scope: 'paragraph',
      target: { paragraph: { section: 0, number: 1 } },
      properties: { alignment: 'justify', lineSpacingType: 'Percent', lineSpacing: 160, indent: 1000 },
    },
    notes: [
      'Unknown properties and out-of-range values fail the whole atomic batch; they are never silently ignored.',
      'Character or paragraph scope on a multi-paragraph cell requires target.cellParagraphIndex; the first cell paragraph is never selected implicitly.',
      'A cell border or fill patch starts from the inspected cell border/fill state, so unspecified sides, diagonals, and fill attributes are preserved.',
    ],
  }),
  command({
    op: 'paragraph.structure',
    category: 'layout',
    description: 'Split or merge a paragraph, or insert a native page/column break at an inspected offset.',
    required: ['target', 'action'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['splitParagraph', 'mergeParagraph', 'insertPageBreak', 'insertColumnBreak'],
    enum: { action: ['split', 'mergePrevious', 'pageBreak', 'columnBreak'] },
    fields: { target: locationField, action: 'Requested paragraph mutation.', offset: 'Required insertion/split offset except mergePrevious.' },
    example: { op: 'paragraph.structure', target: { native: { section: 0, para: 1, offset: 5 } }, action: 'pageBreak', offset: 5 },
    notes: ['Runs alone because split and merge invalidate paragraph locations.'],
  }),
  command({
    op: 'image.replace',
    category: 'image',
    description: 'Replace bytes of an existing package image discovered by object_inventory.',
    required: ['imageName'],
    anyOf: [['bytesBase64', 'assetRef']],
    precondition: 'object_inventory',
    fields: {
      imageName: 'Exact package image name.',
      bytesBase64: 'Base64-encoded image bytes.',
      assetRef: 'Cross-document asset reference with source documentId and exact inventoried imageName; resolved only by the MCP gateway.',
      mimeType: 'Optional declared image MIME type.',
    },
    example: { op: 'image.replace', imageName: 'BinData/image1.png', bytesBase64: '<base64>' },
  }),
  command({
    op: 'image.insertAfterParagraph',
    category: 'image',
    description: 'Insert a bounded image after an inspected paragraph using safe inline paragraph flow by default.',
    required: ['target'],
    optional: ['assetRef', 'mimeType', 'width', 'height', 'altText', 'caption'],
    anyOf: [['bytesBase64', 'assetRef']],
    precondition: 'target_inspect',
    execution: 'preserve-package-adapter',
    fields: {
      target: locationField,
      bytesBase64: 'Base64-encoded image bytes.',
      assetRef: 'Cross-document asset reference with source documentId and exact inventoried imageName; resolved only by the MCP gateway.',
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
    notes: ['The created image is re-read and must persist treatAsChar=true before the command succeeds. Native HWP may retain dormant Paper/Square fields while inline mode is active. Use object.format after re-inspection for intentional floating placement.'],
  }),
  command({
    op: 'image.replaceInCell',
    category: 'image',
    description: 'Replace the single existing picture in an inspected table cell without rewriting document structure.',
    required: ['target'],
    optional: ['assetRef', 'mimeType'],
    anyOf: [['bytesBase64', 'assetRef']],
    precondition: 'target_inspect',
    fields: {
      target: 'Exact inspected table-cell location containing one picture slot.',
      bytesBase64: 'Base64-encoded image bytes.',
      assetRef: 'Cross-document asset reference with source documentId and exact inventoried imageName; resolved only by the MCP gateway.',
      mimeType: 'Declared image MIME type matching the bytes.',
    },
    example: {
      op: 'image.replaceInCell',
      target: { tableId: 'tbl_0', cell: { number: 1 } },
      bytesBase64: '<base64>',
      mimeType: 'image/png',
    },
  }),
  command({
    op: 'image.insertInCell',
    category: 'image',
    description: 'Insert a new bounded picture into an inspected table-cell paragraph, including an empty signature or seal field.',
    required: ['target'],
    optional: ['assetRef', 'mimeType', 'targetParagraphIndex', 'width', 'height', 'altText'],
    anyOf: [['bytesBase64', 'assetRef']],
    precondition: 'target_inspect',
    execution: 'preserve-package-adapter',
    fields: {
      target: 'Exact inspected destination table-cell location.',
      bytesBase64: 'Base64-encoded image bytes.',
      assetRef: 'Cross-document asset reference with source documentId and exact inventoried imageName; resolved only by the MCP gateway.',
      mimeType: 'Declared image MIME type matching the bytes.',
      targetParagraphIndex: 'Zero-based paragraph inside the destination cell; defaults to 0.',
      width: 'Optional positive picture width in HWP units; contained within the cell inner width.',
      height: 'Optional positive picture height in HWP units; contained within the cell inner height.',
      altText: 'Optional accessible image description.',
    },
    example: {
      op: 'image.insertInCell',
      target: { tableId: 'tbl_1', cell: { number: 2 } },
      bytesBase64: '<base64>',
      mimeType: 'image/png',
      altText: '대표자 서명',
    },
    notes: [
      'HWPX stores centered inline content in the exact destination cell. Binary HWP stores a cell-contained overlay at the inspected cell coordinates because its native adapter cannot add a nested inline picture; the receipt reports placementMode=cell-anchored-overlay.',
      'Both paths must survive save/reopen. Resize the cell explicitly first when a larger signature field is intended.',
    ],
  }),
  command({
    op: 'image.cloneToCell',
    category: 'image',
    description: 'Clone an existing picture control discovered by object_inventory into a paragraph of an inspected table cell.',
    required: ['target', 'sourcePictureId'],
    optional: ['targetParagraphIndex', 'width', 'height', 'vertOffset', 'horzOffset', 'zOrder'],
    precondition: 'target_inspect',
    fields: {
      target: 'Exact inspected destination table-cell location.',
      sourcePictureId: 'Stable picture ID returned by object_inventory, such as pic_0.',
      targetParagraphIndex: 'Zero-based paragraph inside the destination cell; defaults to 0.',
      width: 'Optional positive picture width in HWP units.',
      height: 'Optional positive picture height in HWP units.',
      vertOffset: 'Optional nonnegative vertical offset in HWP units.',
      horzOffset: 'Optional nonnegative horizontal offset in HWP units.',
      zOrder: 'Optional nonnegative z-order.',
    },
    example: {
      op: 'image.cloneToCell',
      target: { tableId: 'tbl_1', cell: { number: 2 } },
      sourcePictureId: 'pic_0',
      targetParagraphIndex: 7,
      vertOffset: 1035,
      horzOffset: 32860,
    },
  }),
  command({
    op: 'image.generateAndReplace',
    category: 'image',
    description: 'Generate a deterministic PNG chart-like image from numeric values and replace an existing PNG package entry.',
    required: ['imageName', 'generator'],
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
    readiness: 'available',
    execution: 'preserve-package-adapter',
    nativeMethods: [],
    notes: [
      'Writes Contents/content.hpf directly and verifies the package metadata after reopen.',
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
    op: 'section.configure',
    category: 'layout',
    description: 'Apply one explicit section-level page-border, column, section-definition, endnote-shape, page-hide, or page-number-start setting through the same native controls used by the editor UI.',
    required: ['sectionIndex', 'action'],
    optional: ['properties', 'paragraphIndex', 'offset', 'startNumber'],
    execution: 'structural-adapter',
    nativeMethods: ['setPageBorderFill', 'setColumnDef', 'setSectionDef', 'getEndnoteShape', 'applyEndnoteShape', 'setPageHide', 'insertNewNumber'],
    enum: { action: ['pageBorder', 'columns', 'properties', 'endnoteShape', 'pageHide', 'pageNumberStart'] },
    fields: {
      sectionIndex: 'Zero-based section index.', action: 'One section configuration action.',
      properties: 'Validated properties for pageBorder, columns, properties, endnoteShape, or pageHide; endnoteShape includes numbering, separator, placement, and note-spacing controls; pageHide uses hideHeader, hideFooter, hideMasterPage, hideBorder, hideFill, and hidePageNum.',
      paragraphIndex: 'Required body paragraph index for pageHide and pageNumberStart.',
      offset: 'Required body character offset for pageNumberStart.', startNumber: 'Required starting page number from 1 through 65535.',
    },
    example: { op: 'section.configure', sectionIndex: 0, action: 'columns', properties: { count: 2, type: 'normal', sameWidth: true, spacing: 2268 } },
  }),
  command({
    op: 'setHeaderFooter',
    category: 'package',
    description: 'Create or replace an HWPX header or footer, including page, total-page, file-name fields and built-in templates.',
    required: ['target', 'type'],
    optional: ['text', 'fields', 'templateId', 'applyTo', 'align'],
    readiness: 'available',
    execution: 'structural-adapter',
    nativeMethods: [
      'createHeaderFooter',
      'insertTextInHeaderFooter',
      'insertFieldInHf',
      'applyHfTemplate',
      'applyParaFormatInHf',
      'deleteHeaderFooter',
    ],
    notes: [
      'Supply text with optional fields, or templateId 0 through 10; every dynamic field is checked after save and reopen.',
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
      fields: 'Optional [{ type: pageNumber|totalPages|fileName, charOffset }] inserted into text offsets.',
      templateId: 'Optional native header/footer template id from 0 through 10; mutually exclusive with text and fields.',
      applyTo: 'both, odd, or even pages.',
      align: 'left, center, or right.',
    },
    example: { op: 'setHeaderFooter', target: { sectionIndex: 0 }, type: 'footer', text: 'Page  of ', fields: [{ type: 'pageNumber', charOffset: 5 }, { type: 'totalPages', charOffset: 9 }], align: 'center' },
  }),
  command({
    op: 'insertFootnote',
    category: 'package',
    description: 'Insert a footnote reference at an inspected HWPX text target and create its footnote body.',
    required: ['target', 'text'],
    precondition: 'target_inspect',
    readiness: 'available',
    execution: 'structural-adapter',
    nativeMethods: ['insertFootnote', 'insertTextInFootnote'],
    notes: [
      'Requires the repository source-built RHWP runtime and footnote reference/body verification after reopen.',
    ],
    fields: { target: locationField, text: 'Footnote body text.' },
    example: {
      op: 'insertFootnote',
      target: { native: { section: 0, para: 1, offset: 5, length: 0 } },
      text: '통계 작성 기준일은 2026년 6월 30일이다.',
    },
  }),
  command({
    op: 'note.insert',
    category: 'note',
    description: 'Insert a footnote or endnote reference at an inspected text target and populate its note body.',
    required: ['target', 'kind', 'text'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['insertFootnote', 'insertEndnote', 'insertTextInFootnote'],
    enum: { kind: ['footnote', 'endnote'] },
    fields: { target: locationField, kind: 'footnote or endnote.', text: 'Complete note body text.' },
    example: { op: 'note.insert', target: { native: { section: 0, para: 1, offset: 5 } }, kind: 'endnote', text: '근거 자료: 2026년 6월 기준.' },
  }),
  command({
    op: 'note.manage',
    category: 'note',
    description: 'Replace a complete footnote/endnote body, apply one note-paragraph format, or delete one exact inspected note control.',
    required: ['action', 'target'],
    optional: ['text', 'paragraphIndex', 'properties'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['getFootnoteInfo', 'deleteTextInFootnote', 'insertTextInFootnote', 'splitParagraphInFootnote', 'mergeParagraphInFootnote', 'applyParaFormatInFootnote', 'deleteFootnote'],
    enum: { action: ['replaceText', 'formatParagraph', 'delete'] },
    fields: {
      action: 'replaceText, formatParagraph, or delete.',
      target: 'Exact inspected note control coordinates { native: { section, para, control } }.',
      text: 'Required complete replacement body for replaceText; use newline for note paragraphs.',
      paragraphIndex: 'Required zero-based note paragraph index for formatParagraph.',
      properties: 'Required validated paragraph-format patch for formatParagraph.',
    },
    example: { op: 'note.manage', action: 'replaceText', target: { native: { section: 0, para: 1, control: 0 } }, text: 'Updated evidence\nSecond note paragraph' },
  }),
  command({
    op: 'bookmark.manage',
    category: 'bookmark',
    description: 'Create, rename, or delete one native bookmark using its exact inspected anchor or control coordinates.',
    required: ['action', 'target'],
    optional: ['name', 'newName'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['addBookmark', 'renameBookmark', 'deleteBookmark'],
    enum: { action: ['create', 'rename', 'delete'] },
    fields: {
      action: 'Bookmark mutation action.', target: 'Text anchor for create or native bookmark control coordinates for rename/delete.',
      name: 'Required bookmark name for create.', newName: 'Required replacement name for rename.',
    },
    example: { op: 'bookmark.manage', action: 'create', target: { native: { section: 0, para: 1, offset: 0 } }, name: 'summary_start' },
  }),
  command({
    op: 'object.deleteTextBoxByText',
    category: 'object',
    description: 'Delete text-box shapes in one section whose visible text matches any supplied string.',
    required: ['texts'],
    precondition: 'object_inventory',
    fields: { section: 'Zero-based section index; default 0.', texts: 'Nonempty array of exact text strings.' },
    example: { op: 'object.deleteTextBoxByText', section: 0, texts: ['삭제 대상 안내문'] },
  }),
  command({
    op: 'object.format',
    category: 'object',
    description: 'Apply validated positioning, wrapping, size, crop, caption, border, fill, rotation, text-box, or equation properties to one inventoried object.',
    required: ['scope', 'target', 'properties'],
    precondition: 'object_inventory',
    execution: 'structural-adapter',
    nativeMethods: ['setPictureProperties', 'setShapeProperties', 'setEquationProperties'],
    enum: { scope: ['image', 'shape', 'equation'] },
    fields: {
      scope: 'image, shape, or equation.',
      target: 'Native section, paragraph, and control indices returned by object inventory.',
      properties: formatCatalogFields(),
    },
    example: {
      op: 'object.format',
      scope: 'image',
      target: { native: { section: 0, para: 3, control: 0 } },
      properties: { treatAsChar: true, width: 18000, height: 12000, hasCaption: true, captionDirection: 'Bottom' },
    },
    notes: ['Unknown properties and out-of-range values fail the whole atomic batch.'],
  }),
  command({
    op: 'object.create',
    category: 'object',
    description: 'Insert a shape, text box, or equation at an inspected body text position; text-box content is written through the exact native text-box path.',
    required: ['target', 'kind'],
    optional: ['shapeType', 'width', 'height', 'horzOffset', 'vertOffset', 'treatAsChar', 'textWrap', 'lineFlipX', 'lineFlipY', 'polygonPoints', 'text', 'script', 'fontSize', 'color'],
    precondition: 'target_inspect',
    execution: 'structural-adapter',
    nativeMethods: ['createShapeControl', 'insertTextInCell', 'insertEquation'],
    enum: { kind: ['shape', 'textBox', 'equation'] },
    fields: {
      target: locationField, kind: 'shape, textBox, or equation.', shapeType: 'Shape subtype for kind=shape.',
      width: 'Positive object width in HWP units.', height: 'Positive object height in HWP units.',
      horzOffset: 'Horizontal HWP-unit offset.', vertOffset: 'Vertical HWP-unit offset.',
      treatAsChar: 'Inline placement flag.', textWrap: 'Native text-wrap mode.', lineFlipX: 'Line flip flag.', lineFlipY: 'Line flip flag.', polygonPoints: 'Polygon points for shapeType=polygon.',
      text: 'Initial text-box content.', script: 'Equation script.', fontSize: 'Equation font size in HWP units.', color: 'Equation packed color.',
    },
    example: { op: 'object.create', target: { native: { section: 0, para: 1, offset: 3 } }, kind: 'textBox', width: 18000, height: 9000, text: '검토 요약' },
  }),
  command({
    op: 'object.manage',
    category: 'object',
    description: 'Set exact text-box content, arrange a shape z-order, group or ungroup exact inspected drawing controls (shapes and pictures), or delete one exact image, shape, or equation control.',
    required: ['action', 'kind'],
    optional: ['text', 'order', 'targets'],
    precondition: 'object_inventory',
    execution: 'structural-adapter',
    nativeMethods: ['deletePictureControl', 'deleteShapeControl', 'deleteEquationControl', 'changeShapeZOrder', 'groupShapes', 'ungroupShape', 'deleteTextInCell', 'insertTextInCell'],
    enum: { action: ['setText', 'arrange', 'group', 'ungroup', 'delete'], kind: ['image', 'shape', 'textBox', 'equation', 'object'], order: ['front', 'back', 'forward', 'backward'] },
    fields: { action: 'Object management action.', kind: 'Exact object kind. Use object (or the legacy shape alias) for group or ungroup.', target: 'Native object coordinates returned by object inventory; required for every action except group.', targets: 'For action=group only: at least two exact inspected native shape or picture targets in one section.', text: 'Required replacement text for action=setText.', order: 'Required z-order operation for action=arrange.' },
    example: { op: 'object.manage', action: 'arrange', kind: 'shape', target: { native: { section: 0, para: 2, control: 0 } }, order: 'front' },
  }),
  command({
    op: 'object.replaceTextBoxText',
    category: 'object',
    description: 'Replace visible text inside text-box shapes without deleting the shape.',
    required: ['replacements'],
    precondition: 'object_inventory',
    fields: { section: 'Zero-based section index; default 0.', replacements: 'Nonempty array of {find, replaceWith} objects.' },
    example: {
      op: 'object.replaceTextBoxText',
      section: 0,
      replacements: [{ find: '기존 문구', replaceWith: '변경 문구' }],
    },
  }),
]);

const HWPX_PACKAGE_ONLY_OPS = Object.freeze(new Set([
  'image.replace',
  'image.replaceInCell',
  'image.cloneToCell',
  'image.generateAndReplace',
  'object.deleteTextBoxByText',
  'object.replaceTextBoxText',
  'text.replaceTracked',
  'style.applyText',
  'table.applyCellStyle',
]));

const commandByName = new Map(HWPX_COMMAND_CATALOG.map((entry) => [entry.op, entry]));

const HWPX_COMMAND_CATEGORIES = Object.freeze([...new Set(HWPX_COMMAND_CATALOG.map((entry) => entry.category))]);
const HWPX_COMMAND_OPS = Object.freeze(HWPX_COMMAND_CATALOG.map((entry) => entry.op));

function resolveHwpxCommand(value) {
  const op = typeof value === 'string' ? value : value?.op;
  return typeof op === 'string' ? commandByName.get(op) || null : null;
}

function meaningful(value, { allowEmptyString = false } = {}) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return allowEmptyString || value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function unsupportedFields(value, allowed) {
  const allowedFields = new Set(allowed);
  return Object.keys(value).filter((field) => !allowedFields.has(field));
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
  'image.replaceInCell',
  'image.insertInCell',
  'image.cloneToCell',
  'insertFootnote',
  'table.insertRows',
  'table.setSize',
  'table.setCellSize',
  'table.autoFit',
  'format.apply',
  'table.structure',
  'table.transform',
  'paragraph.structure',
  'field.insert',
  'note.insert',
  'note.manage',
  'bookmark.manage',
  'object.create',
  'object.manage',
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

  if (entry.op === 'table.writeCell') {
    add(commandValue.location ?? commandValue.target, 'location');
    optional(commandValue.styleSource, 'styleSource');
  } else if (entry.op === 'table.writeCells') {
    for (const [index, cell] of commandValue.cells.entries()) {
      add(cellLocation(cell, cell.tableId ?? commandValue.tableId ?? commandValue.location?.tableId), `cells[${index}]`);
      optional(cell.styleSource ?? commandValue.styleSource, `cells[${index}].styleSource`);
    }
  } else if (['text.replaceParagraph', 'text.insertAfterParagraph'].includes(entry.op)) {
    add(commandValue.location ?? commandValue.target, 'location');
    optional(commandValue.styleSource, 'styleSource');
  } else if (entry.op === 'object.manage' && commandValue.action === 'group') {
    for (const [index, target] of (commandValue.targets ?? []).entries()) {
      add(target, `targets[${index}]`);
    }
  } else if (SINGLE_TARGET_INSPECTION_OPS.has(entry.op)) {
    add(commandValue.target ?? commandValue.location, 'target');
    if (entry.op === 'appendParagraph') optional(commandValue.styleSource, 'styleSource');
  } else if (entry.op === 'table.applyCellStyle') {
    add(commandValue.target ?? commandValue.location, 'target');
    optional(commandValue.styleSource, 'styleSource');
  } else if (entry.op === 'style.applyText') {
    add(commandValue.target ?? commandValue.location, 'target');
    add(commandValue.styleSource, 'styleSource');
  } else if (entry.op === 'text.deleteParagraphs') {
    for (const [index, location] of commandValue.locations.entries()) {
      add(location, `locations[${index}]`);
    }
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

function validateParagraphStyleIds(value, paragraphCount, label) {
  if (!Array.isArray(value) || value.length !== paragraphCount) {
    throw new Error(`${label} paragraphStyleIds must contain exactly one entry per newline-delimited paragraph.`);
  }
  for (const [index, entry] of value.entries()) {
    if (entry === null) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${label} paragraphStyleIds[${index}] must be an object or null.`);
    }
    const declared = [
      entry.paraPrIDRef ?? entry.paraPrId ?? entry.paraShapeId ?? entry.paragraphStyleId,
      entry.styleIDRef ?? entry.styleId ?? entry.namedStyleId,
      entry.charPrIDRef ?? entry.charPrId ?? entry.charShapeId ?? entry.textStyleId,
    ].filter((item) => item !== undefined);
    if (!declared.length || declared.some((item) => !Number.isInteger(Number(item)) || Number(item) < 0)) {
      throw new Error(`${label} paragraphStyleIds[${index}] must contain nonnegative integer style IDs.`);
    }
  }
}

function validateParagraphTemplateIndices(value, paragraphCount, label) {
  if (!Array.isArray(value) || value.length !== paragraphCount) {
    throw new Error(`${label} paragraphTemplateIndices must contain exactly one entry per newline-delimited paragraph.`);
  }
  if (value.some((entry) => entry !== null && (!Number.isInteger(Number(entry)) || Number(entry) < 0))) {
    throw new Error(`${label} paragraphTemplateIndices entries must be nonnegative integers or null.`);
  }
}

function validateHwpxCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('editor_hwpx_edit requires at least one command.');
  }
  return commands.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`HWPX command ${index + 1} must be an object.`);
    }
    const entry = resolveHwpxCommand(value);
    if (!entry) {
      throw new Error(`Unsupported HWPX command op: ${String(value.op || '<missing>')}. Call editor_hwpx_inspect with view=catalog first.`);
    }
    if (entry.readiness !== 'available') {
      throw new Error(
        `HWPX command ${entry.op} is not ready in the installed runtime (${entry.readiness}).`,
      );
    }
    const unknownFields = unsupportedFields(value, [...Object.keys(entry.fields), 'opId']);
    if (unknownFields.length) {
      throw new Error(`${entry.op} has unsupported field(s): ${unknownFields.join(', ')}.`);
    }
    const missing = entry.required.filter((field) => {
      if (field === 'op') return !meaningful(value.op);
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
        const unknownCellFields = unsupportedFields(cell, [
          'commandId', 'opId', 'tableId', 'location', 'cell', 'tableCell', 'text',
          'fit', 'layout', 'fitOptions', 'styleSource', 'paragraphStyleIds', 'paragraphTemplateIndices',
        ]);
        if (unknownCellFields.length) {
          throw new Error(`table.writeCells cells[${cellIndex}] has unsupported field(s): ${unknownCellFields.join(', ')}.`);
        }
      });
    }
    if (entry.op === 'text.deleteParagraphs') {
      if (!Array.isArray(value.locations) || value.locations.length === 0 || value.locations.length > 500) {
        throw new Error('text.deleteParagraphs locations must contain 1 through 500 paragraph locations.');
      }
      const keys = value.locations.map((location) => stableHwpxTargetKey(location));
      if (keys.some((key) => !key.startsWith('paragraph:'))) {
        throw new Error('text.deleteParagraphs locations must identify top-level paragraphs.');
      }
      if (new Set(keys).size !== keys.length) {
        throw new Error('text.deleteParagraphs locations must be unique.');
      }
    }
    if (entry.op === 'field.setValues') {
      if (!Array.isArray(value.values) || value.values.length < 1 || value.values.length > 100) {
        throw new Error('field.setValues values must contain 1 through 100 entries.');
      }
      const selectors = new Set();
      value.values.forEach((field, fieldIndex) => {
        if (!field || typeof field !== 'object' || Array.isArray(field)) {
          throw new Error(`field.setValues values[${fieldIndex}] must be an object.`);
        }
        const unknownFields = Object.keys(field).filter(key => !['fieldId', 'name', 'occurrence', 'value'].includes(key));
        if (unknownFields.length) {
          throw new Error(`field.setValues values[${fieldIndex}] has unsupported field(s): ${unknownFields.join(', ')}.`);
        }
        const hasId = Number.isInteger(field.fieldId) && field.fieldId >= 0;
        const hasName = typeof field.name === 'string' && field.name.trim().length > 0;
        if (hasId === hasName) {
          throw new Error(`field.setValues values[${fieldIndex}] requires exactly one of fieldId or name.`);
        }
        if (hasName && field.name.length > 512) {
          throw new Error(`field.setValues values[${fieldIndex}].name must not exceed 512 characters.`);
        }
        if (typeof field.value !== 'string' || field.value.length > 100_000) {
          throw new Error(`field.setValues values[${fieldIndex}].value must be a string no longer than 100000 characters.`);
        }
        if (field.occurrence !== undefined
          && (!hasName || !Number.isInteger(field.occurrence) || field.occurrence < 0)) {
          throw new Error(`field.setValues values[${fieldIndex}].occurrence must be a nonnegative integer used with name.`);
        }
        const selector = hasId
          ? `id:${field.fieldId}`
          : `name:${field.name.trim()}:${field.occurrence === undefined ? 'unique' : field.occurrence}`;
        if (selectors.has(selector)) {
          throw new Error(`field.setValues contains a duplicate selector: ${selector}.`);
        }
        selectors.add(selector);
      });
    }
    if (entry.op === 'field.manage') {
      if (!['update', 'delete'].includes(value.action)
        || !Number.isInteger(value.fieldId) || value.fieldId < 0) {
        throw new Error('field.manage requires action update/delete and a nonnegative fieldId.');
      }
      const unsupported = unsupportedFields(value, ['op', 'commandId', 'action', 'fieldId', 'guide', 'memo', 'name', 'editable']);
      if (unsupported.length) throw new Error(`field.manage has unsupported field(s): ${unsupported.join(', ')}.`);
      if (value.action === 'delete' && ['guide', 'memo', 'name', 'editable'].some(field => value[field] !== undefined)) {
        throw new Error('field.manage delete does not accept update properties.');
      }
      if (value.action === 'update' && !['guide', 'memo', 'name', 'editable'].some(field => value[field] !== undefined)) {
        throw new Error('field.manage update requires at least one replacement property.');
      }
    }
    if (entry.op === 'table.writeCell' && value.paragraphStyleIds !== undefined) {
      validateParagraphStyleIds(value.paragraphStyleIds, String(value.text ?? '').split('\n').length, entry.op);
    }
    if (entry.op === 'table.writeCell' && value.paragraphTemplateIndices !== undefined) {
      validateParagraphTemplateIndices(value.paragraphTemplateIndices, String(value.text ?? '').split('\n').length, entry.op);
    }
    if (entry.op === 'table.writeCells') {
      for (const [cellIndex, cell] of value.cells.entries()) {
        const paragraphStyleIds = cell.paragraphStyleIds ?? value.paragraphStyleIds;
        if (paragraphStyleIds !== undefined) {
          validateParagraphStyleIds(
            paragraphStyleIds,
            String(cell.text ?? '').split('\n').length,
            `table.writeCells cells[${cellIndex}]`,
          );
        }
        const paragraphTemplateIndices = cell.paragraphTemplateIndices ?? value.paragraphTemplateIndices;
        if (paragraphTemplateIndices !== undefined) {
          validateParagraphTemplateIndices(
            paragraphTemplateIndices,
            String(cell.text ?? '').split('\n').length,
            `table.writeCells cells[${cellIndex}]`,
          );
        }
      }
    }
    if (entry.op === 'table.insertRows') {
      for (const field of ['rowIndex', 'templateRow']) {
        if (nonNegativeInteger(value[field]) === null) {
          throw new Error(`table.insertRows ${field} must be a nonnegative integer.`);
        }
      }
      const count = nonNegativeInteger(value.count);
      if (count === null || count < 1 || count > 20) {
        throw new Error('table.insertRows count must be an integer from 1 through 20.');
      }
      if (value.clearText !== undefined && typeof value.clearText !== 'boolean') {
        throw new Error('table.insertRows clearText must be a boolean.');
      }
      if (value.extendBoundarySpans !== undefined && typeof value.extendBoundarySpans !== 'boolean') {
        throw new Error('table.insertRows extendBoundarySpans must be a boolean.');
      }
    }
    if (entry.op === 'table.setSize' || entry.op === 'table.setCellSize') {
      for (const field of ['width', 'height']) {
        if (value[field] !== undefined && (!Number.isInteger(Number(value[field])) || Number(value[field]) <= 0)) {
          throw new Error(`${entry.op} ${field} must be a positive integer.`);
        }
      }
    }
    if (entry.op === 'table.autoFit') {
      for (const field of [
        'minHeight', 'maxHeight', 'extraPadding',
        'maxPageGrowth', 'maxBlankPageGrowth', 'maxLowOccupancyGrowth',
      ]) {
        if (value[field] !== undefined && nonNegativeInteger(value[field]) === null) {
          throw new Error(`table.autoFit ${field} must be a nonnegative integer.`);
        }
      }
      if (value.maxHeight !== undefined && Number(value.maxHeight) < 1) {
        throw new Error('table.autoFit maxHeight must be a positive integer.');
      }
    }
    if (entry.op === 'format.apply' || entry.op === 'object.format') {
      normalizeFormatProperties(value.scope, value.properties, { resolveFontId: () => 0 });
    }
    if (entry.op === 'table.structure') {
      const requiredByAction = {
        insertRow: ['row'], insertColumn: ['column'], deleteRow: ['row'], deleteColumn: ['column'],
        mergeCells: ['startRow', 'startColumn', 'endRow', 'endColumn'],
        splitCell: ['row', 'column'], splitTable: ['atRow'], attachNextTable: [], deleteTable: [],
      }[value.action] ?? [];
      const missingArguments = requiredByAction.filter(field => nonNegativeInteger(value[field]) === null);
      if (missingArguments.length) throw new Error(`table.structure ${value.action} requires nonnegative integer field(s): ${missingArguments.join(', ')}.`);
      for (const field of ['rows', 'columns']) {
        if (value[field] !== undefined && (nonNegativeInteger(value[field]) === null || Number(value[field]) < 1)) {
          throw new Error(`table.structure ${field} must be a positive integer.`);
        }
      }
    }
    if (entry.op === 'table.transform') {
      const requiredByAction = {
        transpose: [],
        calculate: ['row', 'column', 'formula'],
        equalizeRowHeight: [],
        equalizeColumnWidth: [],
      }[value.action] ?? [];
      const missingArguments = requiredByAction.filter((field) => {
        if (field === 'formula') return typeof value.formula !== 'string' || !value.formula.trim();
        return nonNegativeInteger(value[field]) === null;
      });
      if (missingArguments.length) throw new Error(`table.transform ${value.action} requires: ${missingArguments.join(', ')}.`);
      for (const field of ['startRow', 'startColumn', 'endRow', 'endColumn']) {
        if (value[field] !== undefined && nonNegativeInteger(value[field]) === null) {
          throw new Error(`table.transform ${field} must be a nonnegative integer.`);
        }
      }
      if (value.writeResult !== undefined && typeof value.writeResult !== 'boolean') {
        throw new Error('table.transform writeResult must be a boolean.');
      }
    }
    if (entry.op === 'field.insert') {
      for (const field of ['guide', 'memo', 'name']) {
        if (value[field] !== undefined && (typeof value[field] !== 'string' || value[field].length > 4096)) {
          throw new Error(`field.insert ${field} must be a string up to 4096 characters.`);
        }
      }
      if (value.editable !== undefined && typeof value.editable !== 'boolean') throw new Error('field.insert editable must be a boolean.');
    }
    if (entry.op === 'note.insert' && (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 100_000)) {
      throw new Error('note.insert text must be a nonblank string up to 100000 characters.');
    }
    if (entry.op === 'section.configure') {
      if (nonNegativeInteger(value.sectionIndex) === null) throw new Error('section.configure sectionIndex must be a nonnegative integer.');
      const needsProperties = ['pageBorder', 'columns', 'properties', 'endnoteShape', 'pageHide'].includes(value.action);
      if (needsProperties && (!value.properties || typeof value.properties !== 'object' || Array.isArray(value.properties) || Object.keys(value.properties).length === 0)) {
        throw new Error(`section.configure ${value.action} requires a nonempty properties object.`);
      }
      if (['pageHide', 'pageNumberStart'].includes(value.action) && nonNegativeInteger(value.paragraphIndex) === null) {
        throw new Error(`section.configure ${value.action} requires a nonnegative paragraphIndex.`);
      }
      if (value.action === 'pageNumberStart') {
        if (nonNegativeInteger(value.offset) === null) throw new Error('section.configure pageNumberStart requires a nonnegative offset.');
        if (!Number.isInteger(value.startNumber) || value.startNumber < 1 || value.startNumber > 65535) {
          throw new Error('section.configure pageNumberStart requires startNumber from 1 through 65535.');
        }
      }
    }
    if (entry.op === 'bookmark.manage') {
      if (value.action === 'create' && (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 512)) {
        throw new Error('bookmark.manage create requires a nonblank name up to 512 characters.');
      }
      if (value.action === 'rename' && (typeof value.newName !== 'string' || !value.newName.trim() || value.newName.length > 512)) {
        throw new Error('bookmark.manage rename requires a nonblank newName up to 512 characters.');
      }
    }
    if (entry.op === 'object.create') {
      if (value.kind === 'equation' && (typeof value.script !== 'string' || !value.script.trim())) {
        throw new Error('object.create equation requires a nonblank script.');
      }
      if (value.kind === 'textBox' && value.text !== undefined && typeof value.text !== 'string') {
        throw new Error('object.create textBox text must be a string.');
      }
    }
    if (entry.op === 'object.manage') {
      if (value.action === 'setText' && (value.kind !== 'textBox' || typeof value.text !== 'string')) {
        throw new Error('object.manage setText requires kind=textBox and a text string.');
      }
      if (value.action === 'arrange' && (!['shape', 'textBox'].includes(value.kind) || !['front', 'back', 'forward', 'backward'].includes(value.order))) {
        throw new Error('object.manage arrange requires a shape/textBox and a valid order.');
      }
    }
    if (entry.op === 'paragraph.structure' && value.action !== 'mergePrevious'
      && nonNegativeInteger(value.offset ?? value.target?.offset ?? value.target?.native?.offset) === null) {
      throw new Error(`paragraph.structure ${value.action} requires a nonnegative offset.`);
    }
    if (entry.op === 'image.cloneToCell') {
      if (!/^pic_\d+$/.test(String(value.sourcePictureId ?? ''))) {
        throw new Error('image.cloneToCell sourcePictureId must be a picture ID returned by object_inventory.');
      }
      for (const field of ['targetParagraphIndex', 'vertOffset', 'horzOffset', 'zOrder']) {
        if (value[field] !== undefined && nonNegativeInteger(value[field]) === null) {
          throw new Error(`image.cloneToCell ${field} must be a nonnegative integer.`);
        }
      }
      for (const field of ['width', 'height']) {
        if (value[field] !== undefined && (!Number.isInteger(Number(value[field])) || Number(value[field]) <= 0)) {
          throw new Error(`image.cloneToCell ${field} must be a positive integer.`);
        }
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
    if (entry.op === 'object.replaceTextBoxText') {
      value.replacements.forEach((replacement, replacementIndex) => {
        const unknownReplacementFields = unsupportedFields(replacement, ['find', 'replaceWith']);
        if (unknownReplacementFields.length) {
          throw new Error(`object.replaceTextBoxText replacements[${replacementIndex}] has unsupported field(s): ${unknownReplacementFields.join(', ')}.`);
        }
      });
      const normalizedFinds = value.replacements.map((item) => item.find.replace(/\r\n?/g, '\n'));
      if (new Set(normalizedFinds).size !== normalizedFinds.length) {
        throw new Error('object.replaceTextBoxText replacements must use unique find strings.');
      }
      if (value.replacements.some((item) => item.find.replace(/\r\n?/g, '\n') === item.replaceWith.replace(/\r\n?/g, '\n'))) {
        throw new Error('object.replaceTextBoxText replacements must change the visible text.');
      }
    }
    for (const target of commandInspectionTargets(value, entry, index)) {
      if (!target.key) {
        throw new Error(`${entry.op} ${target.role} must identify a stable paragraph or table-cell target.`);
      }
    }
    return entry;
  });
}

function getHwpxCommandCatalog({ category, op, sourceFormat = 'hwpx' } = {}) {
  const requestedCategory = String(category || '').trim();
  const requestedOp = String(op || '').trim();
  let commands = HWPX_COMMAND_CATALOG;
  if (requestedCategory) commands = commands.filter((entry) => entry.category === requestedCategory);
  if (requestedOp) {
    const resolved = resolveHwpxCommand(requestedOp);
    commands = resolved ? commands.filter((entry) => entry.op === resolved.op) : [];
  }
  const normalizedSourceFormat = String(sourceFormat || 'hwpx').toLowerCase();
  const sourceAwareCommands = commands.map((entry) => {
    const hwpAvailable = !HWPX_PACKAGE_ONLY_OPS.has(entry.op);
    const hwpxAvailable = true;
    const available = normalizedSourceFormat !== 'hwp' || hwpAvailable;
    const publishedFields = {
      ...entry.fields,
      commandId: 'Required stable ID for matching this editor_hwpx_edit command to its result.',
      ...(['format.apply', 'object.format'].includes(entry.op)
        ? { properties: formatCatalogFields(normalizedSourceFormat) }
        : {}),
    };
    return {
      ...entry,
      required: Object.freeze([...new Set([...entry.required, 'commandId'])]),
      fields: Object.freeze(publishedFields),
      example: Object.freeze({ commandId: `example-${entry.op.replace(/[^a-z0-9]+/gi, '-')}`, ...entry.example }),
      precondition: entry.precondition === 'target_inspect'
        ? 'editor_hwpx_inspect(view="target")'
        : entry.precondition === 'object_inventory'
          ? 'editor_hwpx_inspect(view="objects")'
          : entry.precondition === 'field_inventory'
            ? 'editor_hwpx_inspect(view="fields")'
          : entry.precondition,
      sourceSupport: { hwp: hwpAvailable, hwpx: hwpxAvailable },
      readiness: available ? entry.readiness : 'unavailable-for-source-format',
      ...(available ? {} : {
        unavailableReason: 'This command depends on HWPX package XML. Use a native formatting/insertion command or explicitly convert the source first.',
      }),
    };
  });
  return {
    version: '3.2.0',
    sourceFormat: normalizedSourceFormat,
    categories: HWPX_COMMAND_CATEGORIES,
    commandCount: sourceAwareCommands.length,
    availableCommandCount: sourceAwareCommands.filter(entry => entry.readiness === 'available').length,
    commands: sourceAwareCommands,
  };
}

function commandsNeedPrecondition(entries, precondition) {
  return entries.some((entry) => entry.precondition === precondition);
}

export {
  HWPX_COMMAND_CATALOG,
  HWPX_COMMAND_CATEGORIES,
  HWPX_COMMAND_OPS,
  HWPX_PACKAGE_ONLY_OPS,
  commandsNeedPrecondition,
  getHwpxCommandCatalog,
  requiredInspectionTargets,
  resolveHwpxCommand,
  stableHwpxTargetKey,
  validateHwpxCommands,
};
