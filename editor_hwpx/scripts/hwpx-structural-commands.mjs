import { createHash } from 'node:crypto';

import { normalizeFormatProperties } from './hwpx-format-contract.mjs';

const CELL_BORDER_FILL_FIELDS = Object.freeze([
  'borderFillId',
  'borderLeft', 'borderRight', 'borderTop', 'borderBottom',
  'fillType', 'fillColor', 'patternColor', 'patternType',
  'diagonalLine', 'diagonalSlash', 'diagonalBackSlash',
  'diagonalWidth', 'diagonalColor', 'centerLine',
]);
const CELL_BORDER_FILL_PATCH_FIELDS = new Set(CELL_BORDER_FILL_FIELDS.filter(field => field !== 'borderFillId'));

function structuralError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function nonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 0xFFFF_FFFF ? number : null;
}

function firstInteger(...values) {
  for (const value of values) {
    const number = nonNegativeInteger(value);
    if (number !== null) return number;
  }
  return null;
}

function firstSpecifiedInteger(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return nonNegativeInteger(value);
    }
  }
  return null;
}

function parseNativeObject(value, method) {
  let parsed;
  try {
    parsed = value && typeof value === 'object'
      ? value
      : JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('result is not an object');
    }
  } catch (cause) {
    throw structuralError(
      'HWPX_ENGINE_RESULT_INVALID',
      `${method} returned an invalid RHWP result.`,
      { method, value: String(value), cause: cause.message },
    );
  }
  return parsed;
}

function parseNativeArray(value, method) {
  let parsed;
  try {
    parsed = value && typeof value === 'object' ? value : JSON.parse(String(value));
    if (!Array.isArray(parsed)) throw new Error('result is not an array');
  } catch (cause) {
    throw structuralError(
      'HWPX_ENGINE_RESULT_INVALID',
      `${method} returned an invalid RHWP array result.`,
      { method, value: String(value), cause: cause.message },
    );
  }
  return parsed;
}

function parseNativeResult(value, method, requiredU32Fields = []) {
  const parsed = parseNativeObject(value, method);
  if (parsed.ok !== true) {
    throw structuralError(
      'HWPX_ENGINE_RESULT_INVALID',
      `${method} returned an unsuccessful RHWP result.`,
      { method, value: String(value) },
    );
  }
  for (const field of requiredU32Fields) {
    if (typeof parsed[field] !== 'number' || nonNegativeInteger(parsed[field]) === null) {
      throw structuralError(
        'HWPX_ENGINE_RESULT_INVALID',
        `${method} omitted a required RHWP u32 field: ${field}.`,
        { method, field, value: String(value) },
      );
    }
  }
  return parsed;
}

function requireMethod(doc, method) {
  if (typeof doc?.[method] !== 'function') {
    throw structuralError(
      'HWPX_ENGINE_METHOD_UNAVAILABLE',
      `RHWP method is unavailable: ${method}.`,
      { method },
    );
  }
  return doc[method].bind(doc);
}

function resolveHwpxTextTarget(value, options = {}) {
  const offsetRequired = options.offsetRequired !== false;
  const target = value?.target ?? value?.location ?? value ?? {};
  const native = target.native && typeof target.native === 'object' ? target.native : {};
  const paragraph = target.paragraph && typeof target.paragraph === 'object'
    ? target.paragraph
    : {};
  const sectionIndex = firstSpecifiedInteger(
    target.sectionIndex,
    target.section,
    paragraph.sectionIndex,
    paragraph.section,
    native.sectionIndex,
    native.section,
  );
  const paragraphIndex = firstSpecifiedInteger(
    target.paragraphIndex,
    target.para,
    paragraph.paragraphIndex,
    paragraph.number,
    paragraph.index,
    native.paragraphIndex,
    native.paragraph,
    native.para,
  );
  const offset = firstSpecifiedInteger(
    target.offset,
    target.charOffset,
    native.offset,
    native.charOffset,
  );
  const length = firstSpecifiedInteger(target.length, native.length);

  if (sectionIndex === null || paragraphIndex === null || (offsetRequired && offset === null)) {
    throw structuralError(
      'HWPX_TARGET_INVALID',
      'The HWPX text target must identify sectionIndex, paragraphIndex, and a nonnegative offset.',
      { target },
    );
  }
  return {
    sectionIndex,
    paragraphIndex,
    offset: offset ?? 0,
    ...(length === null ? {} : { length }),
  };
}

function inspectedParagraphLength(doc, context, target) {
  if (typeof doc?.getParagraphLength === 'function') {
    const length = doc.getParagraphLength(target.sectionIndex, target.paragraphIndex);
    const normalized = nonNegativeInteger(length);
    if (normalized !== null) return normalized;
  }

  const sections = context?.before?.sections;
  if (Array.isArray(sections)) {
    const section = sections.find(item =>
      firstInteger(item?.section, item?.sectionIndex) === target.sectionIndex);
    const paragraphs = section?.paragraphs;
    if (Array.isArray(paragraphs)) {
      const paragraph = paragraphs.find(item =>
        firstInteger(item?.para, item?.paragraph, item?.paragraphIndex, item?.number)
          === target.paragraphIndex);
      if (typeof paragraph?.text === 'string') return [...paragraph.text].length;
      const length = firstInteger(paragraph?.textLength, paragraph?.length);
      if (length !== null) return length;
    }
  }

  throw structuralError(
    'HWPX_RANGE_INSPECTION_REQUIRED',
    'A verified paragraph length is required before applying a text range operation.',
    { target },
  );
}

function publicParagraphTarget(sectionIndex, paragraphIndex, offset = 0) {
  return {
    kind: 'paragraph',
    sectionIndex,
    paragraphIndex,
    offset,
  };
}

function structuralResult(command, native, target, createdTargets = [], evidence = {}) {
  return {
    op: command.op,
    changed: 1,
    target,
    createdTargets,
    native,
    ...evidence,
  };
}

function applyInsertText(doc, command, context) {
  if (typeof command.text !== 'string' || command.text.length === 0) {
    throw structuralError('HWPX_TEXT_REQUIRED', 'insertText requires a nonempty text string.');
  }
  const target = resolveHwpxTextTarget(command);
  const paragraphLength = inspectedParagraphLength(doc, context, target);
  if (target.offset > paragraphLength) {
    throw structuralError(
      'HWPX_TARGET_INVALID',
      'insertText offset exceeds the inspected HWPX paragraph length.',
      { target, paragraphLength },
    );
  }
  const insertText = requireMethod(doc, 'insertText');
  const native = parseNativeResult(insertText(
    target.sectionIndex,
    target.paragraphIndex,
    target.offset,
    command.text,
  ), 'insertText', ['charOffset']);
  return structuralResult(
    command,
    native,
    publicParagraphTarget(target.sectionIndex, target.paragraphIndex, native.charOffset),
  );
}

function resolveDeleteRange(command) {
  const target = command.target ?? command.location ?? {};
  const range = target.range && typeof target.range === 'object' ? target.range : target;
  if (range.start && range.end) {
    return {
      start: resolveHwpxTextTarget(range.start),
      end: resolveHwpxTextTarget(range.end),
    };
  }
  const start = resolveHwpxTextTarget(target);
  if (start.length === undefined) {
    throw structuralError(
      'HWPX_INVALID_RANGE',
      'deleteRange requires start/end targets or a target with length.',
      { target },
    );
  }
  return {
    start,
    end: {
      ...start,
      offset: nonNegativeInteger(start.offset + start.length),
    },
  };
}

function applyDeleteRange(doc, command, context) {
  const { start, end } = resolveDeleteRange(command);
  const sameParagraph = start.sectionIndex === end.sectionIndex
    && start.paragraphIndex === end.paragraphIndex;
  if (!sameParagraph || end.offset === null || end.offset <= start.offset) {
    throw structuralError(
      'HWPX_INVALID_RANGE',
      'deleteRange must be a forward, nonempty range inside one HWPX paragraph.',
      { start, end },
    );
  }
  const paragraphLength = inspectedParagraphLength(doc, context, start);
  if (start.offset > paragraphLength || end.offset > paragraphLength) {
    throw structuralError(
      'HWPX_INVALID_RANGE',
      'deleteRange exceeds the inspected HWPX paragraph length.',
      { start, end, paragraphLength },
    );
  }

  const deleteRange = requireMethod(doc, 'deleteRange');
  const native = parseNativeResult(deleteRange(
    start.sectionIndex,
    start.paragraphIndex,
    start.offset,
    end.paragraphIndex,
    end.offset,
  ), 'deleteRange', ['paraIdx', 'charOffset']);
  return structuralResult(
    command,
    native,
    publicParagraphTarget(start.sectionIndex, native.paraIdx, native.charOffset),
  );
}

function resolveAppendParagraphStyleSource(doc, styleSource, context) {
  const sourceCommand = { target: styleSource };
  if (isCellStyleTarget(sourceCommand)) {
    if (styleSource?.tableId) {
      const tables = context?.before?.tables?.filter(item => item?.id === styleSource.tableId) ?? [];
      if (tables.length !== 1) {
        throw structuralError(
          'HWPX_STYLE_SOURCE_UNRESOLVED',
          'appendParagraph styleSource must resolve to exactly one inspected table.',
          { styleSource, matches: tables.length },
        );
      }
      const requestedCell = firstSpecifiedInteger(
        styleSource.cell?.number,
        styleSource.tableCell?.number,
        styleSource.cellIndex,
      );
      const cells = tables[0].cells?.filter(item =>
        firstSpecifiedInteger(
          item?.native?.cellIndex,
          item?.cellIndex,
          item?.location?.cell?.number,
        ) === requestedCell) ?? [];
      if (cells.length !== 1) {
        throw structuralError(
          'HWPX_STYLE_SOURCE_UNRESOLVED',
          'appendParagraph styleSource must resolve to exactly one inspected table cell.',
          { styleSource, matches: cells.length },
        );
      }
    }
    let target;
    try {
      target = resolveHwpxCellTarget(sourceCommand, context);
    } catch (cause) {
      throw structuralError(
        'HWPX_STYLE_SOURCE_UNRESOLVED',
        'appendParagraph table-cell styleSource could not be resolved.',
        { styleSource, cause: cause.message },
      );
    }
    const getCellStyleAt = requireMethod(doc, 'getCellStyleAt');
    const getCellParaPropertiesAt = requireMethod(doc, 'getCellParaPropertiesAt');
    const getCellCharPropertiesAt = requireMethod(doc, 'getCellCharPropertiesAt');
    const style = parseNativeObject(getCellStyleAt(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      target.cellParagraphIndex,
    ), 'getCellStyleAt');
    const styleId = nonNegativeInteger(style.id);
    if (styleId === null || styleId > 0xFF) {
      throw structuralError(
        'HWPX_STYLE_SOURCE_UNRESOLVED',
        'appendParagraph table-cell styleSource did not return a valid style ID.',
        { styleSource, style },
      );
    }
    const paragraphProperties = parseNativeObject(getCellParaPropertiesAt(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      target.cellParagraphIndex,
    ), 'getCellParaPropertiesAt');
    const characterProperties = parseNativeObject(getCellCharPropertiesAt(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      target.cellParagraphIndex,
      0,
    ), 'getCellCharPropertiesAt');
    return {
      ...target,
      styleId,
      paragraphProperties,
      characterProperties,
    };
  }

  let target;
  try {
    target = resolveHwpxTextTarget(sourceCommand, { offsetRequired: false });
  } catch (cause) {
    throw structuralError(
      'HWPX_STYLE_SOURCE_UNRESOLVED',
      'appendParagraph paragraph styleSource could not be resolved.',
      { styleSource, cause: cause.message },
    );
  }
  const sections = context?.before?.sections;
  if (Array.isArray(sections)) {
    const matches = sections.flatMap(section =>
      Array.isArray(section?.paragraphs) ? section.paragraphs : [])
      .filter(paragraph =>
        firstSpecifiedInteger(paragraph?.section, paragraph?.sectionIndex) === target.sectionIndex
        && firstSpecifiedInteger(
          paragraph?.para,
          paragraph?.paragraph,
          paragraph?.paragraphIndex,
          paragraph?.number,
        ) === target.paragraphIndex);
    if (matches.length !== 1) {
      throw structuralError(
        'HWPX_STYLE_SOURCE_UNRESOLVED',
        'appendParagraph styleSource must resolve to exactly one inspected paragraph.',
        { styleSource, matches: matches.length },
      );
    }
  }
  const getStyleAt = requireMethod(doc, 'getStyleAt');
  const getParaPropertiesAt = requireMethod(doc, 'getParaPropertiesAt');
  const getCharPropertiesAt = requireMethod(doc, 'getCharPropertiesAt');
  const style = parseNativeObject(
    getStyleAt(target.sectionIndex, target.paragraphIndex),
    'getStyleAt',
  );
  const styleId = nonNegativeInteger(style.id);
  if (styleId === null || styleId > 0xFF) {
    throw structuralError(
      'HWPX_STYLE_SOURCE_UNRESOLVED',
      'appendParagraph paragraph styleSource did not return a valid style ID.',
      { styleSource, style },
    );
  }
  return {
    kind: 'paragraph',
    sectionIndex: target.sectionIndex,
    paragraphIndex: target.paragraphIndex,
    styleId,
    paragraphProperties: parseNativeObject(
      getParaPropertiesAt(target.sectionIndex, target.paragraphIndex),
      'getParaPropertiesAt',
    ),
    characterProperties: parseNativeObject(
      getCharPropertiesAt(target.sectionIndex, target.paragraphIndex, 0),
      'getCharPropertiesAt',
    ),
  };
}

function applyAppendParagraph(doc, command, context) {
  if (typeof command.text !== 'string') {
    throw structuralError('HWPX_TEXT_REQUIRED', 'appendParagraph requires a text string.');
  }
  const target = resolveHwpxTextTarget(command, { offsetRequired: false });
  const insertParagraph = requireMethod(doc, 'insertParagraph');
  const insertText = requireMethod(doc, 'insertText');
  // Native HWP insertion already inherits the preceding paragraph's effective
  // paragraph and character shapes. Reapplying the HWPX-shaped property object
  // through applyParaFormat corrupts unit-scaled properties (notably indent).
  // Keep the native inheritance, apply only the named style when requested, and
  // verify the reopened result below.
  const hwpSource = typeof doc.getSourceFormat === 'function' && doc.getSourceFormat() === 'hwp';
  const applyStyle = command.styleSource === undefined
    ? null
    : requireMethod(doc, 'applyStyle');
  const applyParaFormat = command.styleSource === undefined || hwpSource
    ? null
    : requireMethod(doc, 'applyParaFormat');
  const applyCharFormat = command.styleSource === undefined || command.text.length === 0 || hwpSource
    ? null
    : requireMethod(doc, 'applyCharFormat');
  const requestedParagraphIndex = target.paragraphIndex + 1;
  if (nonNegativeInteger(requestedParagraphIndex) === null) {
    throw structuralError(
      'HWPX_TARGET_INVALID',
      'appendParagraph cannot derive a valid RHWP paragraph index after the target.',
      { target },
    );
  }
  const styleSource = command.styleSource === undefined
    ? null
    : resolveAppendParagraphStyleSource(doc, command.styleSource, context);
  const paragraphStyle = styleSource === null
    ? null
    : { ...styleSource.paragraphProperties };
  if (paragraphStyle) delete paragraphStyle.paraShapeId;
  const characterStyle = styleSource === null || command.text.length === 0
    ? null
    : { ...styleSource.characterProperties };
  if (characterStyle) delete characterStyle.charShapeId;
  const lines = command.text.split('\n');
  const nativeParagraphs = [];
  const createdTargets = [];
  let nextParagraphIndex = requestedParagraphIndex;
  for (const text of lines) {
    const paragraphNative = parseNativeResult(
      insertParagraph(target.sectionIndex, nextParagraphIndex),
      'insertParagraph',
      ['paraIdx'],
    );
    const paragraphIndex = paragraphNative.paraIdx;
    const styleNative = styleSource === null
      ? null
      : parseNativeResult(
        applyStyle(target.sectionIndex, paragraphIndex, styleSource.styleId),
        'applyStyle',
      );
    const paragraphFormatNative = applyParaFormat === null
      ? null
      : parseNativeResult(
        applyParaFormat(
          target.sectionIndex,
          paragraphIndex,
          JSON.stringify(paragraphStyle),
        ),
        'applyParaFormat',
      );
    const textNative = parseNativeResult(
      insertText(target.sectionIndex, paragraphIndex, 0, text),
      'insertText',
      ['charOffset'],
    );
    const characterFormatNative = applyCharFormat === null || text.length === 0
      ? null
      : parseNativeResult(
        applyCharFormat(
          target.sectionIndex,
          paragraphIndex,
          0,
          [...text].length,
          JSON.stringify(characterStyle),
        ),
        'applyCharFormat',
      );
    nativeParagraphs.push({
      paragraph: paragraphNative,
      ...(styleNative === null ? {} : {
        style: {
          ...styleNative,
          source: styleSource,
          styleId: styleSource.styleId,
          paragraphFormat: paragraphFormatNative,
          characterFormat: characterFormatNative,
        },
      }),
      text: textNative,
    });
    createdTargets.push({
      kind: 'paragraph',
      sectionIndex: target.sectionIndex,
      paragraphIndex,
    });
    nextParagraphIndex = paragraphIndex + 1;
  }
  const [firstNative] = nativeParagraphs;
  const [firstTarget] = createdTargets;
  return {
    ...structuralResult(
    command,
    {
      ...firstNative,
      ...(nativeParagraphs.length === 1 ? {} : { paragraphs: nativeParagraphs }),
    },
    { ...firstTarget, offset: firstNative.text.charOffset },
    createdTargets,
    ),
    ...(lines.length === 1
      ? { expectedText: command.text }
      : { expectedParagraphTexts: lines }),
    ...(styleSource === null ? {} : { expectedStyleId: styleSource.styleId }),
    ...(styleSource?.paragraphProperties?.paraShapeId === undefined
      ? {}
      : { expectedParaShapeId: styleSource.paragraphProperties.paraShapeId }),
    ...(styleSource?.characterProperties?.charShapeId === undefined
      ? {}
      : { expectedCharShapeId: styleSource.characterProperties.charShapeId }),
  };
}

function positiveInteger(value, maximum = 0xFFFF_FFFF) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= maximum ? number : null;
}

function resolveSectionIndex(doc, value) {
  const sectionIndex = firstSpecifiedInteger(value);
  if (sectionIndex === null) {
    throw structuralError('HWPX_SECTION_INVALID', 'A valid RHWP section index is required.');
  }
  if (typeof doc?.getSectionCount === 'function') {
    const sectionCount = nonNegativeInteger(doc.getSectionCount());
    if (sectionCount === null || sectionIndex >= sectionCount) {
      throw structuralError(
        'HWPX_SECTION_INVALID',
        'The requested HWPX section does not exist.',
        { sectionIndex, sectionCount },
      );
    }
  }
  return sectionIndex;
}

function nativeTableTarget(sectionIndex, paragraphIndex, controlIndex) {
  return {
    kind: 'table',
    sectionIndex,
    paragraphIndex,
    controlIndex,
  };
}

function resolveHwpxTableTarget(command, context) {
  const target = command.target ?? command.location ?? {};
  const direct = target.native && typeof target.native === 'object' ? target.native : target;
  let sectionIndex = firstSpecifiedInteger(direct.sectionIndex, direct.section);
  let paragraphIndex = firstSpecifiedInteger(
    direct.paragraphIndex,
    direct.paragraph,
    direct.para,
  );
  let controlIndex = firstSpecifiedInteger(
    direct.controlIndex,
    direct.control,
    direct.controlIdx,
  );
  const tableId = target.tableId ?? target.id;
  if ((sectionIndex === null || paragraphIndex === null || controlIndex === null) && tableId) {
    const table = context?.before?.tables?.find(item => item?.id === tableId);
    const native = table?.native ?? table ?? {};
    sectionIndex = firstSpecifiedInteger(native.sectionIndex, native.section);
    paragraphIndex = firstSpecifiedInteger(
      native.paragraphIndex,
      native.paragraph,
      native.para,
    );
    controlIndex = firstSpecifiedInteger(
      native.controlIndex,
      native.control,
      native.controlIdx,
    );
  }
  if (sectionIndex === null || paragraphIndex === null || controlIndex === null) {
    throw structuralError(
      'HWPX_TABLE_TARGET_INVALID',
      'The HWPX table target must resolve to section, paragraph, and control indices.',
      { target },
    );
  }
  return { kind: 'table', sectionIndex, paragraphIndex, controlIndex };
}

function applyCreateTable(doc, command, context) {
  const rows = positiveInteger(command.rows, 0xFFFF);
  const columns = positiveInteger(command.columns, 256);
  if (rows === null || columns === null) {
    throw structuralError(
      'HWPX_TABLE_DIMENSIONS_INVALID',
      'table.create rows and columns must be positive RHWP table dimensions.',
      { rows: command.rows, columns: command.columns },
    );
  }
  const target = resolveHwpxTextTarget(command, { offsetRequired: false });
  const charOffset = inspectedParagraphLength(doc, context, target);
  const options = {
    sectionIdx: target.sectionIndex,
    paraIdx: target.paragraphIndex,
    charOffset,
    rowCount: rows,
    colCount: columns,
    treatAsChar: false,
  };
  let desiredColumnWidths = null;
  if (command.width !== undefined) {
    const width = positiveInteger(command.width);
    if (width === null || width < columns * 200) {
      throw structuralError(
        'HWPX_TABLE_DIMENSIONS_INVALID',
        'table.create width must allocate at least 200 HWP units per column.',
        { width: command.width, columns },
      );
    }
    const base = Math.floor(width / columns);
    desiredColumnWidths = Array.from(
      { length: columns },
      (_, index) => base + (index < width % columns ? 1 : 0),
    );
  }
  if (command.height !== undefined && positiveInteger(command.height) === null) {
    throw structuralError(
      'HWPX_TABLE_DIMENSIONS_INVALID',
      'table.create height must be a positive HWP-unit value.',
      { height: command.height },
    );
  }
  if (command.height !== undefined && Number(command.height) < rows * 200) {
    throw structuralError(
      'HWPX_TABLE_DIMENSIONS_INVALID',
      'table.create height must allocate at least 200 HWP units per row.',
      { height: command.height, rows },
    );
  }
  const cellCount = rows * columns;
  if (command.cellTexts !== undefined
    && (!Array.isArray(command.cellTexts)
      || command.cellTexts.length > cellCount
      || command.cellTexts.some(text => typeof text !== 'string'))) {
    throw structuralError(
      'HWPX_TABLE_CELL_TEXTS_INVALID',
      'table.create cellTexts must be a row-major string array no larger than the table.',
      { cellCount },
    );
  }
  if (command.caption !== undefined
    && (typeof command.caption !== 'string' || command.caption.length === 0)) {
    throw structuralError(
      'HWPX_CAPTION_TEXT_REQUIRED',
      'table.create caption must be a nonempty string.',
    );
  }
  const resizeRequested = command.width !== undefined || command.height !== undefined;
  const getCellProperties = !resizeRequested
    ? null
    : requireMethod(doc, 'getCellProperties');
  const resizeTableCells = !resizeRequested
    ? null
    : requireMethod(doc, 'resizeTableCells');
  const insertTextInCell = command.cellTexts?.some(text => text.length > 0)
    ? requireMethod(doc, 'insertTextInCell')
    : null;
  if (command.caption !== undefined) {
    requireMethod(doc, 'setTableProperties');
    requireMethod(doc, 'deleteTextInCell');
    requireMethod(doc, 'insertTextInCell');
  }
  const createTableEx = requireMethod(doc, 'createTableEx');
  const tableNative = parseNativeResult(
    createTableEx(JSON.stringify(options)),
    'createTableEx',
    ['paraIdx', 'controlIdx'],
  );
  const createdTarget = nativeTableTarget(
    target.sectionIndex,
    tableNative.paraIdx,
    tableNative.controlIdx,
  );
  const native = { table: tableNative };
  const createdTargets = [createdTarget];

  if (resizeRequested) {
    const desiredBaseHeight = command.height === undefined
      ? null
      : Math.floor(command.height / rows);
    const heightRemainder = command.height === undefined ? 0 : command.height % rows;
    const updates = [];
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const properties = parseNativeObject(
        getCellProperties(
          createdTarget.sectionIndex,
          createdTarget.paragraphIndex,
          createdTarget.controlIndex,
          cellIndex,
        ),
        'getCellProperties',
      );
      const row = Math.floor(cellIndex / columns);
      const column = cellIndex % columns;
      const update = { cellIdx: cellIndex };
      if (desiredColumnWidths) {
        const currentWidth = positiveInteger(properties.width);
        if (currentWidth === null) {
          throw structuralError(
            'HWPX_ENGINE_RESULT_INVALID',
            'getCellProperties omitted a positive cell width.',
            { cellIndex, value: properties.width },
          );
        }
        update.widthDelta = desiredColumnWidths[column] - currentWidth;
      }
      if (desiredBaseHeight !== null) {
        const currentHeight = positiveInteger(properties.height);
        if (currentHeight === null) {
          throw structuralError(
            'HWPX_ENGINE_RESULT_INVALID',
            'getCellProperties omitted a positive cell height.',
            { cellIndex, value: properties.height },
          );
        }
        const desiredHeight = desiredBaseHeight + (row < heightRemainder ? 1 : 0);
        update.heightDelta = desiredHeight - currentHeight;
      }
      updates.push(update);
    }
    native.resize = parseNativeResult(
      resizeTableCells(
        createdTarget.sectionIndex,
        createdTarget.paragraphIndex,
        createdTarget.controlIndex,
        JSON.stringify(updates),
      ),
      'resizeTableCells',
    );
  }

  if (command.cellTexts !== undefined) {
    native.cells = [];
    for (const [cellIndex, text] of command.cellTexts.entries()) {
      if (text.length === 0) continue;
      native.cells.push(parseNativeResult(
        insertTextInCell(
          createdTarget.sectionIndex,
          createdTarget.paragraphIndex,
          createdTarget.controlIndex,
          cellIndex,
          0,
          0,
          text,
        ),
        'insertTextInCell',
        ['charOffset'],
      ));
    }
  }

  if (command.caption !== undefined) {
    const captionResult = applyInsertTableCaption(doc, {
      op: 'table.insertCaption',
      target: createdTarget,
      text: command.caption,
      position: 'before',
    }, context);
    native.caption = captionResult.native;
    createdTargets.push(captionResult.target);
  }
  return {
    ...structuralResult(command, native, createdTarget, createdTargets),
    ...(command.caption === undefined ? {} : { expectedCaptionText: command.caption }),
  };
}

function applyInsertTableCaption(doc, command, context) {
  if (typeof command.text !== 'string' || command.text.length === 0) {
    throw structuralError('HWPX_CAPTION_TEXT_REQUIRED', 'table.insertCaption requires text.');
  }
  const position = command.position ?? 'before';
  if (!['before', 'after'].includes(position)) {
    throw structuralError(
      'HWPX_CAPTION_POSITION_INVALID',
      'table.insertCaption position must be before or after.',
      { position },
    );
  }
  const table = resolveHwpxTableTarget(command, context);
  const setTableProperties = requireMethod(doc, 'setTableProperties');
  const deleteTextInCell = requireMethod(doc, 'deleteTextInCell');
  const insertTextInCell = requireMethod(doc, 'insertTextInCell');
  if (typeof doc?.getTableProperties === 'function') {
    const properties = parseNativeObject(
      doc.getTableProperties(
        table.sectionIndex,
        table.paragraphIndex,
        table.controlIndex,
      ),
      'getTableProperties',
    );
    if (properties.hasCaption === true) {
      throw structuralError(
        'HWPX_CAPTION_ALREADY_EXISTS',
        'The selected HWPX table already has a native caption.',
        { table },
      );
    }
  }
  const captionNative = parseNativeResult(
    setTableProperties(
      table.sectionIndex,
      table.paragraphIndex,
      table.controlIndex,
      JSON.stringify({
        hasCaption: true,
        captionDirection: position === 'before' ? 2 : 3,
        captionAutoNumber: false,
      }),
    ),
    'setTableProperties',
    ['captionCharOffset'],
  );
  const clearedNative = captionNative.captionCharOffset === 0
    ? null
    : parseNativeResult(
      deleteTextInCell(
        table.sectionIndex,
        table.paragraphIndex,
        table.controlIndex,
        65534,
        0,
        0,
        captionNative.captionCharOffset,
      ),
      'deleteTextInCell',
    );
  const textNative = parseNativeResult(
    insertTextInCell(
      table.sectionIndex,
      table.paragraphIndex,
      table.controlIndex,
      65534,
      0,
      0,
      command.text,
    ),
    'insertTextInCell',
    ['charOffset'],
  );
  return {
    ...structuralResult(command, {
      caption: captionNative,
      cleared: clearedNative,
      text: textNative,
    }, {
      ...table,
      kind: 'tableCaption',
    }, []),
    expectedCaptionText: command.text,
  };
}

const IMAGE_MIME_TO_EXTENSION = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/bmp', 'bmp'],
]);

function decodeImageBytes(command) {
  if (command.bytes instanceof Uint8Array) {
    const bytes = Buffer.from(command.bytes);
    if (bytes.length > 0) return bytes;
  }
  if (typeof command.bytesBase64 === 'string') {
    const encoded = command.bytesBase64.trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw structuralError('HWPX_IMAGE_REQUIRED', 'Image bytesBase64 is invalid.');
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > 0
      && bytes.toString('base64').replace(/=+$/, '') === encoded.replace(/=+$/, '')) {
      return bytes;
    }
  }
  if (typeof command.filePath === 'string' && command.filePath.length > 0) {
    const bytes = readFileSync(command.filePath);
    if (bytes.length > 0) return bytes;
  }
  throw structuralError(
    'HWPX_IMAGE_REQUIRED',
    'image.insertAfterParagraph requires nonempty bytes, bytesBase64, or filePath.',
  );
}

function sniffImage(bytes, declaredMimeType, filePath) {
  const declaredExtension = IMAGE_MIME_TO_EXTENSION.get(
    String(declaredMimeType ?? '').toLowerCase(),
  );
  if (declaredMimeType !== undefined && !declaredExtension) {
    throw structuralError(
      'HWPX_IMAGE_FORMAT_UNSUPPORTED',
      'The declared image MIME type is not supported by RHWP.',
      { mimeType: declaredMimeType },
    );
  }
  let signatureExtension = null;
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    signatureExtension = 'png';
  } else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    signatureExtension = 'jpg';
  } else if (bytes.subarray(0, 3).toString('ascii') === 'GIF') {
    signatureExtension = 'gif';
  } else if (bytes.subarray(0, 2).toString('ascii') === 'BM') {
    signatureExtension = 'bmp';
  }
  if (declaredExtension && signatureExtension && declaredExtension !== signatureExtension) {
    throw structuralError(
      'HWPX_IMAGE_FORMAT_UNSUPPORTED',
      'The declared image MIME type does not match the binary signature.',
      { declaredExtension, signatureExtension },
    );
  }
  let fileExtension = null;
  if (filePath) {
    const candidate = extname(filePath).slice(1).toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(candidate)) {
      fileExtension = candidate === 'jpeg' ? 'jpg' : candidate;
    }
  }
  if (fileExtension && signatureExtension && fileExtension !== signatureExtension) {
    throw structuralError(
      'HWPX_IMAGE_FORMAT_UNSUPPORTED',
      'The image file extension does not match the binary signature.',
      { fileExtension, signatureExtension },
    );
  }
  if (declaredExtension && fileExtension && declaredExtension !== fileExtension) {
    throw structuralError(
      'HWPX_IMAGE_FORMAT_UNSUPPORTED',
      'The declared image MIME type does not match the file extension.',
      { declaredExtension, fileExtension },
    );
  }
  let extension = declaredExtension;
  extension ??= fileExtension;
  extension ??= signatureExtension;
  if (!extension) {
    throw structuralError(
      'HWPX_IMAGE_FORMAT_UNSUPPORTED',
      'RHWP image insertion supports PNG, JPEG, GIF, and BMP inputs.',
    );
  }

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
  if (!positiveInteger(width) || !positiveInteger(height)) {
    throw structuralError(
      'HWPX_IMAGE_FORMAT_UNSUPPORTED',
      'The image dimensions could not be read safely.',
      { extension },
    );
  }
  return {
    extension,
    width,
    height,
    mimeType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
  };
}

function inspectedPageImageBounds(doc, target) {
  let page = null;
  if (typeof doc?.getPageDef === 'function') {
    try {
      page = parseNativeObject(doc.getPageDef(target.sectionIndex), 'getPageDef');
    } catch {
      page = null;
    }
  }
  const pageWidth = positiveInteger(page?.width) ?? 59528;
  const pageHeight = positiveInteger(page?.height) ?? 84189;
  const contentWidth = Math.max(
    1,
    pageWidth - Number(page?.marginLeft || 0) - Number(page?.marginRight || 0),
  );
  const contentHeight = Math.max(
    1,
    pageHeight - Number(page?.marginTop || 0) - Number(page?.marginBottom || 0),
  );
  return {
    width: Math.max(1, Math.floor(contentWidth * 0.92)),
    height: Math.max(1, Math.floor(contentHeight * 0.45)),
  };
}

function fitImageDimensions(image, requestedWidth, requestedHeight, bounds) {
  let width = requestedWidth;
  let height = requestedHeight;
  if (width === undefined && height === undefined) {
    width = image.width * 75;
    height = image.height * 75;
  } else if (width === undefined) {
    width = Math.round(Number(height) * image.width / image.height);
  } else if (height === undefined) {
    height = Math.round(Number(width) * image.height / image.width);
  }
  width = positiveInteger(width);
  height = positiveInteger(height);
  if (width === null || height === null) return null;
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function applyInsertImage(doc, command, context) {
  const bytes = decodeImageBytes(command);
  const image = sniffImage(bytes, command.mimeType, command.filePath);
  if (command.caption !== undefined
    && (typeof command.caption !== 'string' || command.caption.length === 0)) {
    throw structuralError(
      'HWPX_IMAGE_CAPTION_INVALID',
      'image.insertAfterParagraph caption must be a nonempty string.',
    );
  }
  const target = resolveHwpxTextTarget(command, { offsetRequired: false });
  const bounds = inspectedPageImageBounds(doc, target);
  if (!bounds) {
    throw structuralError('HWPX_IMAGE_BOUNDS_UNAVAILABLE', 'Image target geometry is unavailable.', { target });
  }
  const fitted = fitImageDimensions(image, command.width, command.height, bounds);
  if (!fitted) {
    throw structuralError(
      'HWPX_IMAGE_DIMENSIONS_INVALID',
      'Image width and height must be positive HWP-unit values.',
      { width: command.width, height: command.height },
    );
  }
  const insertPicture = requireMethod(doc, 'insertPicture');
  const setPictureProperties = requireMethod(doc, 'setPictureProperties');
  const getPictureProperties = requireMethod(doc, 'getPictureProperties');
  const requestedParagraphIndex = target.paragraphIndex + 1;
  if (nonNegativeInteger(requestedParagraphIndex) === null) {
    throw structuralError(
      'HWPX_TARGET_INVALID',
      'image.insertAfterParagraph cannot derive a paragraph after the target.',
      { target },
    );
  }
  const insertParagraph = requireMethod(doc, 'insertParagraph');
  const insertText = command.caption === undefined ? null : requireMethod(doc, 'insertText');
  const paragraphNative = parseNativeResult(
    insertParagraph(target.sectionIndex, requestedParagraphIndex),
    'insertParagraph',
    ['paraIdx'],
  );
  const pictureNative = parseNativeResult(
    insertPicture(
      target.sectionIndex,
      paragraphNative.paraIdx,
      0,
      '',
      new Uint8Array(bytes),
      fitted.width,
      fitted.height,
      image.width,
      image.height,
      image.extension,
      String(command.altText ?? ''),
      null,
      null,
    ),
    'insertPicture',
    ['paraIdx', 'controlIdx'],
  );
  const createdTarget = {
    kind: 'image',
    sectionIndex: target.sectionIndex,
    paragraphIndex: pictureNative.paraIdx,
    controlIndex: pictureNative.controlIdx,
  };
  const placement = normalizeFormatProperties('image', {
    treatAsChar: true,
    textWrap: 'TopAndBottom',
    vertRelTo: 'Para',
    vertAlign: 'Top',
    horzRelTo: 'Para',
    horzAlign: 'Center',
    vertOffset: 0,
    horzOffset: 0,
    allowOverlap: false,
    restrictInPage: true,
    keepWithAnchor: true,
    width: fitted.width,
    height: fitted.height,
  });
  const placementNative = parseNativeResult(setPictureProperties(
    createdTarget.sectionIndex,
    createdTarget.paragraphIndex,
    createdTarget.controlIndex,
    JSON.stringify(placement),
  ), 'setPictureProperties');
  const actualPlacement = parseNativeObject(getPictureProperties(
    createdTarget.sectionIndex,
    createdTarget.paragraphIndex,
    createdTarget.controlIndex,
  ), 'getPictureProperties');
  if (actualPlacement.treatAsChar !== true) {
    throw structuralError(
      'HWPX_IMAGE_PLACEMENT_VERIFICATION_FAILED',
      'The inserted image did not persist safe inline paragraph flow.',
      { createdTarget, requestedPlacement: placement, actualPlacement },
    );
  }
  const createdTargets = [createdTarget];
  let captionNative = null;
  if (command.caption !== undefined) {
    const captionParagraphIndex = pictureNative.paraIdx + 1;
    if (nonNegativeInteger(captionParagraphIndex) === null) {
      throw structuralError(
        'HWPX_TARGET_INVALID',
        'The image caption paragraph index exceeds the RHWP u32 range.',
        { pictureNative },
      );
    }
    const paragraph = parseNativeResult(
      insertParagraph(target.sectionIndex, captionParagraphIndex),
      'insertParagraph',
      ['paraIdx'],
    );
    const text = parseNativeResult(
      insertText(target.sectionIndex, paragraph.paraIdx, 0, command.caption),
      'insertText',
      ['charOffset'],
    );
    const captionTarget = {
      kind: 'paragraph',
      sectionIndex: target.sectionIndex,
      paragraphIndex: paragraph.paraIdx,
    };
    createdTargets.push(captionTarget);
    captionNative = { paragraph, text };
  }
  return structuralResult(command, {
    paragraph: paragraphNative,
    picture: pictureNative,
    placement: placementNative,
    actualPlacement,
    caption: captionNative,
  }, createdTarget, createdTargets, {
    expectedImageSha256: createHash('sha256').update(bytes).digest('hex'),
    expectedImageByteLength: bytes.length,
    expectedImageMimeType: image.mimeType,
    expectedImageDimensions: { width: image.width, height: image.height },
    expectedPlacedDimensions: fitted,
    requestedPlacement: placement,
    verifiedInlinePlacement: true,
  });
}

function applyInsertImageInCell(doc, command, context) {
  const bytes = decodeImageBytes(command);
  const image = sniffImage(bytes, command.mimeType, command.filePath);
  const target = command.target ?? command.location ?? {};
  const tableId = String(target.tableId ?? target.table?.id ?? '');
  const table = (context?.before?.tables ?? []).find((item) => String(item.id) === tableId);
  const cellNumber = nonNegativeInteger(target.cell?.number ?? target.cell?.cellIndex ?? target.cell?.index);
  const cell = table?.cells?.find((item) => Number(item.cellIndex) === cellNumber);
  const targetParagraphIndex = nonNegativeInteger(command.targetParagraphIndex ?? 0);
  if (!table || !cell || targetParagraphIndex === null || !cell.paragraphs?.[targetParagraphIndex]) {
    throw structuralError(
      'HWPX_TARGET_INVALID',
      'image.insertInCell requires an inspected table cell and an existing target paragraph index.',
      { tableId, cellNumber, targetParagraphIndex },
    );
  }
  const cellStyle = cell.style?.cell ?? {};
  const cellBounds = cell.layout?.bbox ?? {};
  const innerWidth = Number(cellStyle.width || 0)
    - Number(cellStyle.paddingLeft || 0) - Number(cellStyle.paddingRight || 0);
  const innerHeight = Number(cellStyle.height || 0)
    - Number(cellStyle.paddingTop || 0) - Number(cellStyle.paddingBottom || 0);
  if (!(innerWidth > 0) || !(innerHeight > 0)) {
    throw structuralError(
      'HWPX_IMAGE_BOUNDS_UNAVAILABLE',
      'The inspected table cell does not expose positive inner image bounds.',
      { tableId, cellNumber, innerWidth, innerHeight },
    );
  }
  const fitted = fitImageDimensions(image, command.width, command.height, {
    width: innerWidth,
    height: innerHeight,
  });
  if (!fitted) {
    throw structuralError(
      'HWPX_IMAGE_DIMENSIONS_INVALID',
      'Image width and height must be positive HWP-unit values.',
      { width: command.width, height: command.height },
    );
  }
  const native = cell.native ?? {};
  const sectionIndex = firstSpecifiedInteger(native.section, table.section);
  const paragraphIndex = firstSpecifiedInteger(native.paragraph, table.para);
  const controlIndex = firstSpecifiedInteger(native.control, table.control);
  const nativeCellIndex = firstSpecifiedInteger(native.cellIndex, cell.cellIndex);
  if ([sectionIndex, paragraphIndex, controlIndex, nativeCellIndex].some((value) => value === null)) {
    throw structuralError('HWPX_TARGET_INVALID', 'The inspected table cell omits native insertion coordinates.', {
      tableId,
      cellNumber,
    });
  }
  const cellPath = [{
    controlIndex,
    cellIndex: nativeCellIndex,
    cellParaIndex: targetParagraphIndex,
  }];
  const cellPathJson = JSON.stringify(cellPath);
  const insertPicture = requireMethod(doc, 'insertPicture');
  const setPictureProperties = requireMethod(doc, 'setPictureProperties');
  const pictureNative = parseNativeResult(insertPicture(
    sectionIndex,
    paragraphIndex,
    0,
    cellPathJson,
    new Uint8Array(bytes),
    fitted.width,
    fitted.height,
    image.width,
    image.height,
    image.extension,
    String(command.altText ?? ''),
    null,
    null,
  ), 'insertPicture', ['controlIdx']);
  // Legacy HWP's cellPath insertion creates a top-level sibling overlay and
  // does not retain the nested path in the saved object graph.  Therefore the
  // placement below is intentionally paper-relative and must be the final
  // reflowing mutation; the receipt names this format boundary explicitly.
  const unitsPerCssPixel = 75;
  const cellX = Number(cellBounds.x);
  const cellY = Number(cellBounds.y);
  const cellWidthPx = Number(cellBounds.w ?? cellBounds.width);
  const cellHeightPx = Number(cellBounds.h ?? cellBounds.height);
  if (![cellX, cellY, cellWidthPx, cellHeightPx].every(Number.isFinite)
    || cellWidthPx <= 0 || cellHeightPx <= 0) {
    throw structuralError(
      'HWPX_IMAGE_BOUNDS_UNAVAILABLE',
      'The inspected table cell does not expose rendered bounds required for centered native HWP placement.',
      { tableId, cellNumber, cellStyle, cellBounds },
    );
  }
  const placement = normalizeFormatProperties('image', {
    treatAsChar: false,
    textWrap: 'Square',
    vertRelTo: 'Paper',
    vertAlign: 'Top',
    horzRelTo: 'Paper',
    horzAlign: 'Left',
    vertOffset: Math.round((cellY + Math.max(0, cellHeightPx - fitted.height / unitsPerCssPixel) / 2) * unitsPerCssPixel),
    horzOffset: Math.round((cellX + Math.max(0, cellWidthPx - fitted.width / unitsPerCssPixel) / 2) * unitsPerCssPixel),
    allowOverlap: false,
    restrictInPage: true,
    keepWithAnchor: true,
    width: fitted.width,
    height: fitted.height,
  });
  const placementNative = parseNativeResult(setPictureProperties(
    sectionIndex,
    paragraphIndex,
    pictureNative.controlIdx,
    JSON.stringify(placement),
  ), 'setPictureProperties');
  const getPictureProperties = requireMethod(doc, 'getPictureProperties');
  const actualPlacement = parseNativeObject(getPictureProperties(
    sectionIndex,
    paragraphIndex,
    pictureNative.controlIdx,
  ), 'getPictureProperties');
  return structuralResult(command, pictureNative, {
    kind: 'cell',
    sectionIndex,
    paragraphIndex,
    controlIndex,
    cellIndex: nativeCellIndex,
    cellParagraphIndex: targetParagraphIndex,
  }, [{
    kind: 'image',
    sectionIndex,
    paragraphIndex,
    controlIndex: pictureNative.controlIdx,
  }], {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
    width: fitted.width,
    height: fitted.height,
    placementMode: 'cell-anchored-overlay',
    requestedPlacement: placement,
    placementNative,
    placement: actualPlacement,
  });
}

function applyPageSetup(doc, command) {
  const sectionIndex = resolveSectionIndex(doc, command.sectionIndex);
  const width = positiveInteger(command.width);
  const height = positiveInteger(command.height);
  if (width === null || height === null) {
    throw structuralError(
      'HWPX_PAGE_SETUP_INVALID',
      'setPageSetup width and height must be positive HWP-unit values.',
    );
  }
  if (command.orientation !== undefined
    && !['portrait', 'landscape'].includes(command.orientation)) {
    throw structuralError(
      'HWPX_PAGE_SETUP_INVALID',
      'setPageSetup orientation must be portrait or landscape.',
    );
  }
  const payload = { width, height };
  const marginMap = {
    top: 'marginTop',
    right: 'marginRight',
    bottom: 'marginBottom',
    left: 'marginLeft',
    header: 'marginHeader',
    footer: 'marginFooter',
    gutter: 'marginGutter',
  };
  for (const [publicName, nativeName] of Object.entries(marginMap)) {
    if (command.margins?.[publicName] !== undefined) {
      const margin = nonNegativeInteger(command.margins[publicName]);
      if (margin === null) {
        throw structuralError(
          'HWPX_PAGE_SETUP_INVALID',
          `setPageSetup margins.${publicName} must be a nonnegative HWP-unit value.`,
        );
      }
      payload[nativeName] = margin;
    }
  }
  if (command.orientation !== undefined) {
    payload.landscape = command.orientation === 'landscape';
  }
  if ((payload.marginLeft ?? 0) + (payload.marginRight ?? 0) >= width
    || (payload.marginTop ?? 0) + (payload.marginBottom ?? 0) >= height) {
    throw structuralError(
      'HWPX_PAGE_SETUP_INVALID',
      'setPageSetup page margins must leave a positive body area.',
      { width, height, margins: command.margins },
    );
  }
  const setPageDef = requireMethod(doc, 'setPageDef');
  const native = parseNativeResult(
    setPageDef(sectionIndex, JSON.stringify(payload)),
    'setPageDef',
    ['pageCount'],
  );
  return structuralResult(command, native, {
    kind: 'section',
    sectionIndex,
  });
}

const HEADER_FOOTER_APPLY_TO = new Map([
  ['both', 0],
  ['even', 1],
  ['odd', 2],
]);

const HEADER_FOOTER_FIELD_TYPES = new Map([
  ['pageNumber', 1],
  ['totalPages', 2],
  ['fileName', 3],
]);

function normalizeHeaderFooterFields(command, textLength) {
  if (command.fields === undefined) return [];
  if (!Array.isArray(command.fields)) {
    throw structuralError('HWPX_HEADER_FOOTER_FIELDS_INVALID', 'setHeaderFooter fields must be an array.');
  }
  return command.fields.map((field, index) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      throw structuralError('HWPX_HEADER_FOOTER_FIELD_INVALID', 'Each header/footer field must be an object.', { index });
    }
    const nativeType = HEADER_FOOTER_FIELD_TYPES.get(field.type);
    if (nativeType === undefined) {
      throw structuralError('HWPX_HEADER_FOOTER_FIELD_TYPE_INVALID', 'Header/footer field type must be pageNumber, totalPages, or fileName.', { index, type: field.type });
    }
    if (!Number.isInteger(field.charOffset) || field.charOffset < 0 || field.charOffset > textLength) {
      throw structuralError('HWPX_HEADER_FOOTER_FIELD_OFFSET_INVALID', 'Header/footer field charOffset must be within the supplied text.', {
        index, charOffset: field.charOffset, textLength,
      });
    }
    return { type: field.type, nativeType, charOffset: field.charOffset, index };
  });
}

function applyHeaderFooter(doc, command) {
  if (!['header', 'footer'].includes(command.type)) {
    throw structuralError(
      'HWPX_HEADER_FOOTER_TYPE_INVALID',
      'setHeaderFooter type must be header or footer.',
      { type: command.type },
    );
  }
  const hasTemplate = command.templateId !== undefined;
  if (hasTemplate && (!Number.isInteger(command.templateId) || command.templateId < 0 || command.templateId > 10)) {
    throw structuralError('HWPX_HEADER_FOOTER_TEMPLATE_INVALID', 'setHeaderFooter templateId must be an integer from 0 through 10.');
  }
  if (!hasTemplate && typeof command.text !== 'string') {
    throw structuralError(
      'HWPX_HEADER_FOOTER_TEXT_REQUIRED',
      'setHeaderFooter requires a text string unless templateId is supplied.',
    );
  }
  const applyToName = command.applyTo ?? 'both';
  const applyTo = HEADER_FOOTER_APPLY_TO.get(applyToName);
  if (applyTo === undefined) {
    throw structuralError(
      'HWPX_HEADER_FOOTER_APPLY_INVALID',
      'setHeaderFooter applyTo must be both, odd, or even.',
    );
  }
  const align = command.align ?? 'left';
  if (!['left', 'center', 'right'].includes(align)) {
    throw structuralError(
      'HWPX_HEADER_FOOTER_ALIGN_INVALID',
      'setHeaderFooter align must be left, center, or right.',
    );
  }
  const sectionIndex = resolveSectionIndex(doc, command.target?.sectionIndex);
  const isHeader = command.type === 'header';
  const fields = hasTemplate ? [] : normalizeHeaderFooterFields(command, command.text.length);
  if (hasTemplate) {
    const getHeaderFooter = requireMethod(doc, 'getHeaderFooter');
    const existing = parseNativeResult(
      getHeaderFooter(sectionIndex, isHeader, applyTo),
      'getHeaderFooter',
    );
    const template = parseNativeResult(
      requireMethod(doc, 'applyHfTemplate')(sectionIndex, isHeader, applyTo, command.templateId),
      'applyHfTemplate',
    );
    const headerFooter = parseNativeResult(
      getHeaderFooter(sectionIndex, isHeader, applyTo),
      'getHeaderFooter',
      ['paraIndex', 'controlIndex'],
    );
    const paragraphProperties = parseNativeObject(
      requireMethod(doc, 'getParaPropertiesInHf')(sectionIndex, isHeader, applyTo, 0),
      'getParaPropertiesInHf',
    );
    return {
      ...structuralResult(command, { replaced: existing.exists === true ? existing : null, template }, {
        kind: 'headerFooter', sectionIndex, paragraphIndex: headerFooter.paraIndex,
        controlIndex: headerFooter.controlIndex, type: command.type, applyTo: applyToName,
      }),
      expectedHeaderFooterText: (headerFooter.dynamicFields?.length ?? 0) === 0
        ? headerFooter.text
        : undefined,
      expectedHeaderFooterAlign: paragraphProperties.alignment,
      expectedHeaderFooterFields: headerFooter.dynamicFields ?? [],
    };
  }
  const createHeaderFooter = requireMethod(doc, 'createHeaderFooter');
  const insertTextInHeaderFooter = requireMethod(doc, 'insertTextInHeaderFooter');
  const applyParaFormatInHf = requireMethod(doc, 'applyParaFormatInHf');
  let replaced = null;
  if (typeof doc?.getHeaderFooter === 'function') {
    const existing = parseNativeResult(
      doc.getHeaderFooter(sectionIndex, isHeader, applyTo),
      'getHeaderFooter',
    );
    if (existing.exists === true) {
      const deleteHeaderFooter = requireMethod(doc, 'deleteHeaderFooter');
      replaced = parseNativeResult(
        deleteHeaderFooter(sectionIndex, isHeader, applyTo),
        'deleteHeaderFooter',
      );
    }
  }
  const controlNative = parseNativeResult(
    createHeaderFooter(sectionIndex, isHeader, applyTo),
    'createHeaderFooter',
    ['paraIndex', 'controlIndex'],
  );
  const textNative = parseNativeResult(
    insertTextInHeaderFooter(sectionIndex, isHeader, applyTo, 0, 0, command.text),
    'insertTextInHeaderFooter',
    ['charOffset'],
  );
  const alignNative = parseNativeResult(
    applyParaFormatInHf(
      sectionIndex,
      isHeader,
      applyTo,
      0,
      JSON.stringify({ alignment: align }),
    ),
    'applyParaFormatInHf',
  );
  const insertFieldInHf = fields.length > 0 ? requireMethod(doc, 'insertFieldInHf') : null;
  const fieldNative = [...fields]
    .sort((left, right) => right.charOffset - left.charOffset || right.index - left.index)
    .map((field) => parseNativeResult(
      insertFieldInHf(sectionIndex, isHeader, applyTo, 0, field.charOffset, field.nativeType),
      'insertFieldInHf',
      ['charOffset', 'insertedAt', 'insertedLength'],
    ));
  const headerFooter = parseNativeResult(
    requireMethod(doc, 'getHeaderFooter')(sectionIndex, isHeader, applyTo),
    'getHeaderFooter',
  );
  return {
    ...structuralResult(command, {
      replaced,
      control: controlNative,
      text: textNative,
      alignment: alignNative,
      fields: fieldNative,
    }, {
      kind: 'headerFooter',
      sectionIndex,
      paragraphIndex: controlNative.paraIndex,
      controlIndex: controlNative.controlIndex,
      type: command.type,
      applyTo: applyToName,
    }),
    // Native HWPX reparse materializes auto-number placeholders as text slots.
    // Dynamic-field integrity is verified independently below; raw placeholder
    // spacing is not a stable user-text representation across the round trip.
    expectedHeaderFooterText: fields.length === 0 ? headerFooter.text : undefined,
    expectedHeaderFooterStaticText: command.text,
    expectedHeaderFooterAlign: align,
    expectedHeaderFooterFields: headerFooter.dynamicFields ?? [],
  };
}

function applyInsertFootnote(doc, command, context) {
  return applyNoteInsert(doc, { ...command, kind: 'footnote' }, context, 'insertFootnote');
}

function applyNoteInsert(doc, command, context, operationName = 'note.insert') {
  if (!['footnote', 'endnote'].includes(command.kind)) {
    throw structuralError('HWPX_NOTE_KIND_INVALID', `${operationName} kind must be footnote or endnote.`);
  }
  if (typeof command.text !== 'string' || command.text.trim().length === 0) {
    throw structuralError(
      operationName === 'insertFootnote' ? 'HWPX_FOOTNOTE_TEXT_REQUIRED' : 'HWPX_NOTE_TEXT_REQUIRED',
      `${operationName} requires a nonblank note body.`,
    );
  }
  const target = resolveHwpxTextTarget(command);
  const paragraphLength = inspectedParagraphLength(doc, context, target);
  if (target.offset > paragraphLength) {
    throw structuralError(
      'HWPX_TARGET_INVALID',
      `${operationName} offset exceeds the inspected HWPX paragraph length.`,
      { target, paragraphLength },
    );
  }
  const methodName = command.kind === 'endnote' ? 'insertEndnote' : 'insertFootnote';
  const insertNote = requireMethod(doc, methodName);
  const insertTextInFootnote = requireMethod(doc, 'insertTextInFootnote');
  const controlNative = parseNativeResult(
    insertNote(target.sectionIndex, target.paragraphIndex, target.offset),
    methodName,
    command.kind === 'endnote'
      ? ['paraIdx', 'controlIdx', 'endnoteNumber']
      : ['paraIdx', 'controlIdx', 'footnoteNumber'],
  );
  const textNative = parseNativeResult(
    insertTextInFootnote(
      target.sectionIndex,
      controlNative.paraIdx,
      controlNative.controlIdx,
      0,
      2,
      command.text,
    ),
    'insertTextInFootnote',
    ['charOffset'],
  );
  const createdTarget = command.op === 'insertFootnote'
    ? {
      // Keep the pre-existing insertFootnote target shape stable for callers.
      kind: 'footnote',
      sectionIndex: target.sectionIndex,
      paragraphIndex: controlNative.paraIdx,
      controlIndex: controlNative.controlIdx,
      footnoteNumber: controlNative.footnoteNumber,
    }
    : {
      kind: 'note',
      noteKind: command.kind,
      sectionIndex: target.sectionIndex,
      paragraphIndex: controlNative.paraIdx,
      controlIndex: controlNative.controlIdx,
      noteNumber: command.kind === 'endnote' ? controlNative.endnoteNumber : controlNative.footnoteNumber,
    };
  return {
    ...structuralResult(command, {
      control: controlNative,
      text: textNative,
    }, createdTarget, [createdTarget]),
    expectedNoteText: command.text,
    ...(command.op === 'insertFootnote' ? { expectedFootnoteText: command.text } : {}),
  };
}

function resolveNoteTarget(doc, command) {
  const target = resolveObjectTarget(command, 'note');
  if (Array.isArray(target.cellPath)) {
    throw structuralError('HWPX_NOTE_TARGET_INVALID', 'A note target cannot be nested inside a table cell path.', { target });
  }
  const info = parseNativeObject(requireMethod(doc, 'getFootnoteInfo')(
    target.sectionIndex, target.paragraphIndex, target.controlIndex,
  ), 'getFootnoteInfo');
  if (info.ok !== true || !Array.isArray(info.texts) || !Number.isInteger(info.paraCount)) {
    throw structuralError('HWPX_NOTE_TARGET_INVALID', 'The exact inspected target is not a readable footnote or endnote control.', { target, info });
  }
  return { ...target, noteInfo: info };
}

function replaceNoteText(doc, target, nextText) {
  const getInfo = requireMethod(doc, 'getFootnoteInfo');
  const deleteText = requireMethod(doc, 'deleteTextInFootnote');
  const mergeParagraph = requireMethod(doc, 'mergeParagraphInFootnote');
  const splitParagraph = requireMethod(doc, 'splitParagraphInFootnote');
  const insertText = requireMethod(doc, 'insertTextInFootnote');
  const args = [target.sectionIndex, target.paragraphIndex, target.controlIndex];
  let info = parseNativeObject(getInfo(...args), 'getFootnoteInfo');
  for (let paragraphIndex = Number(info.paraCount) - 1; paragraphIndex >= 1; paragraphIndex -= 1) {
    const currentText = String(info.texts[paragraphIndex] ?? '');
    if (currentText.length > 0) {
      parseNativeResult(deleteText(...args, paragraphIndex, 0, [...currentText].length), 'deleteTextInFootnote');
    }
    parseNativeResult(mergeParagraph(...args, paragraphIndex), 'mergeParagraphInFootnote');
    info = parseNativeObject(getInfo(...args), 'getFootnoteInfo');
  }
  const firstText = String(info.texts[0] ?? '');
  const bodyOffset = firstText.startsWith('  ') ? 2 : 0;
  const bodyLength = [...firstText].length - bodyOffset;
  if (bodyLength > 0) {
    parseNativeResult(deleteText(...args, 0, bodyOffset, bodyLength), 'deleteTextInFootnote');
  }
  const lines = nextText.split('\n');
  let lastNative = { ok: true, charOffset: bodyOffset };
  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      // The first note paragraph has an inline note-number control before its
      // visible two-character body prefix. Native split offsets are logical
      // (text plus inline controls), whereas getFootnoteInfo exposes visible
      // text only. Later note paragraphs have no marker control.
      const splitOffset = index === 1
        ? bodyOffset + [...lines[0]].length + 1
        : [...lines[index - 1]].length;
      lastNative = parseNativeResult(splitParagraph(...args, index - 1, splitOffset, undefined), 'splitParagraphInFootnote');
    }
    if (line.length > 0) {
      lastNative = parseNativeResult(insertText(...args, index, index === 0 ? bodyOffset : 0, line), 'insertTextInFootnote', ['charOffset']);
    }
  }
  return lastNative;
}

function applyNoteManage(doc, command) {
  const action = String(command.action ?? '');
  const target = resolveNoteTarget(doc, command);
  if (action === 'replaceText') {
    if (typeof command.text !== 'string' || command.text.length > 100_000) {
      throw structuralError('HWPX_NOTE_TEXT_INVALID', 'note.manage replaceText requires text up to 100000 characters.', { target });
    }
    const native = replaceNoteText(doc, target, command.text);
    return {
      ...structuralResult(command, native, { ...target, kind: 'note' }),
      expectedNoteText: command.text,
    };
  }
  if (action === 'formatParagraph') {
    const paragraphIndex = nonNegativeInteger(command.paragraphIndex);
    if (paragraphIndex === null || paragraphIndex >= target.noteInfo.paraCount || !command.properties || typeof command.properties !== 'object') {
      throw structuralError('HWPX_NOTE_FORMAT_INVALID', 'note.manage formatParagraph requires an existing paragraphIndex and paragraph-format properties.', { target });
    }
    const properties = normalizeParagraphStyle(command.properties);
    const native = parseNativeResult(requireMethod(doc, 'applyParaFormatInFootnote')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex, paragraphIndex, JSON.stringify(properties),
    ), 'applyParaFormatInFootnote');
    return {
      ...structuralResult(command, native, { ...target, kind: 'note', noteParagraphIndex: paragraphIndex }),
      expectedFormat: { scope: 'noteParagraph', properties },
    };
  }
  if (action === 'delete') {
    const native = parseNativeResult(requireMethod(doc, 'deleteFootnote')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
    ), 'deleteFootnote');
    return structuralResult(command, native, { ...target, kind: 'deletedNote' });
  }
  throw structuralError('HWPX_NOTE_ACTION_INVALID', `Unsupported note.manage action: ${action}.`);
}

function commandTargetOffset(command) {
  const target = command.target ?? command.location ?? {};
  const native = target.native && typeof target.native === 'object' ? target.native : {};
  return firstSpecifiedInteger(target.offset, target.charOffset, native.offset, native.charOffset, 0);
}

function applyFieldInsert(doc, command, context) {
  const targetValue = command.target ?? command.location ?? {};
  const guide = typeof command.guide === 'string' ? command.guide : '';
  const memo = typeof command.memo === 'string' ? command.memo : '';
  const name = typeof command.name === 'string' ? command.name : '';
  const editable = command.editable ?? true;
  if (![guide, memo, name].every(value => value.length <= 4096) || typeof editable !== 'boolean') {
    throw structuralError('HWPX_FIELD_INSERT_INVALID', 'field.insert guide, memo, and name must be strings up to 4096 characters and editable must be a boolean.');
  }
  if (isCellStyleTarget({ target: targetValue })) {
    const target = resolveHwpxCellTarget(command, context);
    const offset = commandTargetOffset(command);
    const paragraphLength = inspectedCellParagraphLength(doc, context, target);
    if (offset === null || offset > paragraphLength) {
      throw structuralError('HWPX_TARGET_INVALID', 'field.insert offset exceeds the inspected cell or text-box paragraph length.', { target, offset, paragraphLength });
    }
    const targetNative = targetValue.native && typeof targetValue.native === 'object' ? targetValue.native : {};
    const native = parseNativeResult(requireMethod(doc, 'insertClickHereFieldInCell')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
      target.cellIndex, target.cellParagraphIndex, offset,
      targetValue.inTextBox === true || targetNative.inTextBox === true,
      guide, memo, name, editable,
    ), 'insertClickHereFieldInCell', ['fieldId', 'charOffset']);
    const createdTarget = { ...target, kind: 'field', fieldId: native.fieldId };
    return {
      ...structuralResult(command, native, createdTarget, [createdTarget]),
      expectedField: { fieldId: native.fieldId, name, guide, memo, editableInForm: editable },
    };
  }
  const target = resolveHwpxTextTarget(command);
  const paragraphLength = inspectedParagraphLength(doc, context, target);
  if (target.offset > paragraphLength) {
    throw structuralError('HWPX_TARGET_INVALID', 'field.insert offset exceeds the inspected body paragraph length.', { target, paragraphLength });
  }
  const native = parseNativeResult(requireMethod(doc, 'insertClickHereField')(
    target.sectionIndex, target.paragraphIndex, target.offset, guide, memo, name, editable,
  ), 'insertClickHereField', ['fieldId', 'charOffset']);
  const createdTarget = {
    kind: 'field', sectionIndex: target.sectionIndex, paragraphIndex: target.paragraphIndex,
    fieldId: native.fieldId,
  };
  return {
    ...structuralResult(command, native, createdTarget, [createdTarget]),
    expectedField: { fieldId: native.fieldId, name, guide, memo, editableInForm: editable },
  };
}

function fieldById(doc, fieldId) {
  const fields = parseNativeArray(requireMethod(doc, 'getFieldList')(), 'getFieldList');
  const field = fields.find(item => Number(item.fieldId) === fieldId);
  if (!field) {
    throw structuralError('HWPX_FIELD_NOT_FOUND', 'The requested ClickHere field was not found in the current document revision.', { fieldId, fields });
  }
  return field;
}

function applyFieldManage(doc, command) {
  const action = String(command.action ?? '');
  const fieldId = nonNegativeInteger(command.fieldId);
  if (fieldId === null) {
    throw structuralError('HWPX_FIELD_MANAGE_INVALID', 'field.manage requires a nonnegative fieldId returned by the current field inventory.');
  }
  const field = fieldById(doc, fieldId);
  if (action === 'update') {
    const guide = command.guide ?? field.guide ?? '';
    const memo = command.memo ?? field.memo ?? '';
    const name = command.name ?? field.name ?? '';
    const editable = command.editable ?? field.editableInForm ?? true;
    if (![guide, memo, name].every(value => typeof value === 'string' && value.length <= 4096)
      || typeof editable !== 'boolean') {
      throw structuralError('HWPX_FIELD_MANAGE_INVALID', 'field.manage update guide, memo, and name must be strings up to 4096 characters and editable must be boolean.');
    }
    const native = parseNativeResult(requireMethod(doc, 'updateClickHereProps')(
      fieldId, guide, memo, name, editable,
    ), 'updateClickHereProps');
    return {
      ...structuralResult(command, native, {
        kind: 'field', sectionIndex: field.location?.sectionIndex, paragraphIndex: field.location?.paraIndex, fieldId,
      }),
      expectedField: { fieldId, name, guide, memo, editableInForm: editable },
    };
  }
  if (action === 'delete') {
    if (field.cellField === true) {
      throw structuralError('HWPX_CELL_FIELD_DELETE_UNSUPPORTED', 'field.manage delete currently requires a top-level ClickHere field because nested field deletion uses a different native coordinate contract.', { field });
    }
    const sectionIndex = nonNegativeInteger(field.location?.sectionIndex);
    const paragraphIndex = nonNegativeInteger(field.location?.paraIndex);
    const offset = nonNegativeInteger(field.startCharIdx);
    if (sectionIndex === null || paragraphIndex === null || offset === null || field.location?.path?.length) {
      throw structuralError('HWPX_FIELD_DELETE_LOCATION_UNSUPPORTED', 'field.manage delete requires a top-level ClickHere field with native section, paragraph, and character coordinates.', { field });
    }
    const native = parseNativeResult(requireMethod(doc, 'removeFieldAt')(
      sectionIndex, paragraphIndex, offset,
    ), 'removeFieldAt');
    return {
      ...structuralResult(command, native, {
        kind: 'deletedField', sectionIndex, paragraphIndex, fieldId,
      }),
      expectedDeletedFieldId: fieldId,
    };
  }
  throw structuralError('HWPX_FIELD_MANAGE_ACTION_INVALID', `Unsupported field.manage action: ${action}.`);
}

const SECTION_DEFINITION_FIELDS = new Set([
  'pageNum', 'pageNumType', 'pictureNum', 'tableNum', 'equationNum',
  'columnSpacing', 'defaultTabSpacing', 'hideHeader', 'hideFooter',
  'hideMasterPage', 'hideBorder', 'hideFill', 'hideEmptyLine',
]);

const PAGE_BORDER_FIELDS = new Set([
  'basis', 'spacingLeft', 'spacingRight', 'spacingTop', 'spacingBottom',
  'headerInside', 'footerInside', 'fillArea', 'hideBorder', 'hideFill', 'applyPage',
  'borderLeft', 'borderRight', 'borderTop', 'borderBottom',
  'fillType', 'fillColor', 'patternColor', 'patternType',
]);

const ENDNOTE_SHAPE_FIELDS = new Set([
  'numberFormat', 'userChar', 'prefixChar', 'suffixChar', 'startNumber',
  'separatorEnabled', 'separatorLength', 'separatorMarginTop', 'separatorMarginBottom',
  'noteSpacing', 'separatorLineType', 'separatorLineWidth', 'separatorColor',
  'numberCodeSuperscript', 'printInlineAfterText', 'numbering', 'placement',
]);

function completeEndnoteShapePatch(doc, sectionIndexValue, properties) {
  const current = parseNativeObject(requireMethod(doc, 'getEndnoteShape')(sectionIndexValue), 'getEndnoteShape');
  return {
    ...Object.fromEntries(Object.entries(current).filter(([field]) => ENDNOTE_SHAPE_FIELDS.has(field))),
    ...properties,
  };
}

function sectionIndex(command) {
  const value = boundedIndex(command.sectionIndex, 'sectionIndex');
  return value;
}

function requiredSectionProperties(command, action, fields) {
  const properties = command.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw structuralError('HWPX_SECTION_PROPERTIES_INVALID', `section.configure ${action} requires a properties object.`);
  }
  const unknown = Object.keys(properties).filter(field => !fields.has(field));
  if (unknown.length) {
    throw structuralError('HWPX_SECTION_PROPERTIES_INVALID', `section.configure ${action} received unsupported properties: ${unknown.join(', ')}.`, { unknown });
  }
  if (Object.keys(properties).length === 0) {
    throw structuralError('HWPX_SECTION_PROPERTIES_INVALID', `section.configure ${action} requires at least one property.`);
  }
  return properties;
}

function completePageBorderPatch(doc, sectionIndexValue, properties) {
  const current = parseNativeObject(requireMethod(doc, 'getPageBorderFill')(sectionIndexValue), 'getPageBorderFill');
  const inherited = Object.fromEntries(Object.entries(current)
    .filter(([field]) => PAGE_BORDER_FIELDS.has(field)));
  return { ...inherited, ...properties };
}

function applySectionConfigure(doc, command) {
  const sectionIndexValue = sectionIndex(command);
  const action = String(command.action ?? '');
  if (action === 'pageBorder') {
    const properties = requiredSectionProperties(command, action, PAGE_BORDER_FIELDS);
    const nativeProperties = completePageBorderPatch(doc, sectionIndexValue, properties);
    const native = parseNativeResult(requireMethod(doc, 'setPageBorderFill')(
      sectionIndexValue, JSON.stringify(nativeProperties),
    ), 'setPageBorderFill');
    return {
      ...structuralResult(command, native, { kind: 'section', sectionIndex: sectionIndexValue }),
      expectedSection: { action, properties },
    };
  }
  if (action === 'columns') {
    const properties = requiredSectionProperties(command, action, new Set(['count', 'type', 'sameWidth', 'spacing']));
    const current = parseNativeObject(requireMethod(doc, 'getColumnDef')(sectionIndexValue), 'getColumnDef');
    const count = positiveInteger(properties.count ?? current.columnCount);
    const typeName = properties.type ?? ({ 0: 'normal', 1: 'distribute', 2: 'parallel' }[Number(current.columnType)]);
    const type = { normal: 0, distribute: 1, parallel: 2 }[typeName];
    const sameWidth = properties.sameWidth ?? current.sameWidth;
    const spacing = Number(properties.spacing ?? current.spacing);
    if (count === null || type === undefined || typeof sameWidth !== 'boolean'
      || !Number.isInteger(spacing) || spacing < -32768 || spacing > 32767) {
      throw structuralError('HWPX_SECTION_COLUMNS_INVALID', 'section.configure columns requires a positive count, type normal/distribute/parallel, boolean sameWidth, and i16 spacing.', { properties, current });
    }
    const native = parseNativeResult(requireMethod(doc, 'setColumnDef')(
      sectionIndexValue, count, type, sameWidth ? 1 : 0, spacing,
    ), 'setColumnDef');
    return {
      ...structuralResult(command, native, { kind: 'section', sectionIndex: sectionIndexValue }),
      expectedSection: { action, properties: { columnCount: count, columnType: type, sameWidth, spacing } },
    };
  }
  if (action === 'properties') {
    const properties = requiredSectionProperties(command, action, SECTION_DEFINITION_FIELDS);
    for (const [field, value] of Object.entries(properties)) {
      if (['hideHeader', 'hideFooter', 'hideMasterPage', 'hideBorder', 'hideFill', 'hideEmptyLine'].includes(field)) {
        if (typeof value !== 'boolean') throw structuralError('HWPX_SECTION_PROPERTIES_INVALID', `${field} must be boolean.`);
      } else if (!Number.isInteger(value) || value < 0 || value > 0xFFFF_FFFF) {
        throw structuralError('HWPX_SECTION_PROPERTIES_INVALID', `${field} must be a nonnegative integer.`);
      }
    }
    const native = parseNativeResult(requireMethod(doc, 'setSectionDef')(
      sectionIndexValue, JSON.stringify(properties),
    ), 'setSectionDef');
    return {
      ...structuralResult(command, native, { kind: 'section', sectionIndex: sectionIndexValue }),
      expectedSection: { action, properties },
    };
  }
  if (action === 'endnoteShape') {
    const properties = requiredSectionProperties(command, action, ENDNOTE_SHAPE_FIELDS);
    const nativeProperties = completeEndnoteShapePatch(doc, sectionIndexValue, properties);
    const native = parseNativeResult(requireMethod(doc, 'applyEndnoteShape')(
      sectionIndexValue, JSON.stringify(nativeProperties),
    ), 'applyEndnoteShape');
    return {
      ...structuralResult(command, native, { kind: 'endnoteShape', sectionIndex: sectionIndexValue }),
      expectedSection: { action, properties },
    };
  }
  const paragraphIndex = boundedIndex(command.paragraphIndex, 'paragraphIndex');
  if (action === 'pageHide') {
    const properties = requiredSectionProperties(command, action, new Set([
      'hideHeader', 'hideFooter', 'hideMasterPage', 'hideBorder', 'hideFill', 'hidePageNum',
    ]));
    if (Object.values(properties).some(value => typeof value !== 'boolean')) {
      throw structuralError('HWPX_SECTION_PAGE_HIDE_INVALID', 'section.configure pageHide values must all be booleans.');
    }
    const native = parseNativeResult(requireMethod(doc, 'setPageHide')(
      sectionIndexValue, paragraphIndex,
      properties.hideHeader ?? false, properties.hideFooter ?? false, properties.hideMasterPage ?? false,
      properties.hideBorder ?? false, properties.hideFill ?? false, properties.hidePageNum ?? false,
    ), 'setPageHide');
    return {
      ...structuralResult(command, native, { kind: 'pageHide', sectionIndex: sectionIndexValue, paragraphIndex }),
      expectedSection: { action, properties },
    };
  }
  if (action === 'pageNumberStart') {
    const offset = boundedIndex(command.offset, 'offset', 0xFFFF_FFFF);
    const startNumber = positiveInteger(command.startNumber);
    if (startNumber === null || startNumber > 65535) {
      throw structuralError('HWPX_SECTION_PAGE_NUMBER_INVALID', 'section.configure pageNumberStart requires a startNumber from 1 through 65535.');
    }
    const native = parseNativeResult(requireMethod(doc, 'insertNewNumber')(
      sectionIndexValue, paragraphIndex, offset, startNumber,
    ), 'insertNewNumber');
    return {
      ...structuralResult(command, native, { kind: 'newNumber', sectionIndex: sectionIndexValue, paragraphIndex, startNumber }),
      expectedSection: { action, properties: { startNumber } },
    };
  }
  throw structuralError('HWPX_SECTION_ACTION_INVALID', `Unsupported section.configure action: ${action}.`);
}

function bookmarkControlTarget(command) {
  const target = resolveObjectTarget(command, 'bookmark');
  if (Array.isArray(target.cellPath)) {
    throw structuralError('HWPX_NESTED_BOOKMARK_UNSUPPORTED', 'bookmark.manage rename/delete currently requires a top-level bookmark control.');
  }
  return target;
}

function applyBookmarkManage(doc, command, context) {
  const action = String(command.action ?? '');
  if (action === 'create') {
    const name = typeof command.name === 'string' ? command.name.trim() : '';
    if (!name || name.length > 512) {
      throw structuralError('HWPX_BOOKMARK_NAME_INVALID', 'bookmark.manage create requires a nonblank name up to 512 characters.');
    }
    const target = resolveHwpxTextTarget(command);
    const paragraphLength = inspectedParagraphLength(doc, context, target);
    if (target.offset > paragraphLength) {
      throw structuralError('HWPX_TARGET_INVALID', 'bookmark.manage create offset exceeds the inspected paragraph length.', { target, paragraphLength });
    }
    const native = parseNativeResult(requireMethod(doc, 'addBookmark')(
      target.sectionIndex, target.paragraphIndex, target.offset, name,
    ), 'addBookmark');
    return {
      ...structuralResult(command, native, { kind: 'bookmark', sectionIndex: target.sectionIndex, paragraphIndex: target.paragraphIndex, name }),
      expectedBookmark: { action, name, sectionIndex: target.sectionIndex, paragraphIndex: target.paragraphIndex },
    };
  }
  const target = bookmarkControlTarget(command);
  if (action === 'rename') {
    const newName = typeof command.newName === 'string' ? command.newName.trim() : '';
    if (!newName || newName.length > 512) {
      throw structuralError('HWPX_BOOKMARK_NAME_INVALID', 'bookmark.manage rename requires a nonblank newName up to 512 characters.');
    }
    const native = parseNativeResult(requireMethod(doc, 'renameBookmark')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex, newName,
    ), 'renameBookmark');
    return {
      ...structuralResult(command, native, { kind: 'bookmark', ...target, name: newName }),
      expectedBookmark: { action, name: newName, sectionIndex: target.sectionIndex, paragraphIndex: target.paragraphIndex },
    };
  }
  if (action === 'delete') {
    const native = parseNativeResult(requireMethod(doc, 'deleteBookmark')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
    ), 'deleteBookmark');
    return {
      ...structuralResult(command, native, { ...target, kind: 'deletedBookmark' }),
      expectedBookmark: { action, sectionIndex: target.sectionIndex, paragraphIndex: target.paragraphIndex, controlIndex: target.controlIndex },
    };
  }
  throw structuralError('HWPX_BOOKMARK_ACTION_INVALID', `Unsupported bookmark.manage action: ${action}.`);
}

function normalizeCharacterStyle(doc, style) {
  return normalizeFormatProperties('character', style, {
    resolveFontId(name) {
      const findOrCreateFontId = requireMethod(doc, 'findOrCreateFontId');
      const fontId = findOrCreateFontId(name);
      if (!Number.isInteger(fontId) || fontId < 0 || fontId > 0xFFFF) {
        throw structuralError('HWPX_ENGINE_RESULT_INVALID', 'findOrCreateFontId returned an invalid font ID.', { fontId });
      }
      return fontId;
    },
  });
}

function normalizeParagraphStyle(style) {
  return normalizeFormatProperties('paragraph', style);
}

function splitNamedStyleProperties(doc, properties) {
  const charCandidate = {};
  const paraCandidate = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    try {
      normalizeFormatProperties('character', { [key]: value }, { resolveFontId: () => 0 });
      charCandidate[key] = value;
    } catch {}
    try {
      normalizeFormatProperties('paragraph', { [key]: value });
      paraCandidate[key] = value;
    } catch {}
  }
  const charProperties = Object.keys(charCandidate).length > 0
    ? normalizeCharacterStyle(doc, charCandidate)
    : {};
  const paraProperties = Object.keys(paraCandidate).length > 0
    ? normalizeParagraphStyle(paraCandidate)
    : {};
  if (Object.keys(charProperties).length === 0 && Object.keys(paraProperties).length === 0) {
    throw structuralError(
      'HWPX_STYLE_PROPERTIES_INVALID',
      'defineStyle properties must contain a supported character or paragraph property.',
    );
  }
  return { charProperties, paraProperties };
}

function applyDefineStyle(doc, command) {
  if (typeof command.name !== 'string' || command.name.trim().length === 0) {
    throw structuralError('HWPX_STYLE_NAME_REQUIRED', 'defineStyle requires a nonblank name.');
  }
  if (!['paragraph', 'character'].includes(command.kind)) {
    throw structuralError(
      'HWPX_STYLE_KIND_INVALID',
      'defineStyle kind must be paragraph or character.',
    );
  }
  const nextStyleId = command.nextStyleId === undefined
    ? 0
    : nonNegativeInteger(command.nextStyleId);
  if (nextStyleId === null || nextStyleId > 0xFF) {
    throw structuralError(
      'HWPX_STYLE_ID_INVALID',
      'defineStyle nextStyleId must be an integer from 0 through 255.',
      { nextStyleId: command.nextStyleId },
    );
  }
  const createStyle = requireMethod(doc, 'createStyle');
  const updateStyleShapes = requireMethod(doc, 'updateStyleShapes');
  const { charProperties, paraProperties } = splitNamedStyleProperties(
    doc,
    command.properties,
  );
  const styleId = createStyle(JSON.stringify({
    name: command.name.trim(),
    englishName: String(command.englishName ?? ''),
    type: command.kind === 'paragraph' ? 0 : 1,
    nextStyleId,
  }));
  if (!Number.isInteger(styleId) || styleId < 0 || styleId > 0xFF) {
    throw structuralError(
      'HWPX_ENGINE_RESULT_INVALID',
      'createStyle returned an invalid HWP u8 style ID.',
      { styleId },
    );
  }
  const shapesUpdated = updateStyleShapes(
    styleId,
    JSON.stringify(charProperties),
    JSON.stringify(paraProperties),
  );
  if (shapesUpdated !== true) {
    throw structuralError(
      'HWPX_ENGINE_RESULT_INVALID',
      'updateStyleShapes failed for the newly created style.',
      { styleId },
    );
  }
  return structuralResult(command, {
    styleId,
    shapesUpdated,
  }, {
    kind: 'style',
    styleId,
  }, [{
    kind: 'style',
    styleId,
  }]);
}

function resolveHwpxCellTarget(command, context) {
  const target = command.target ?? command.location ?? {};
  const direct = target.native && typeof target.native === 'object' ? target.native : {};
  let sectionIndex = firstSpecifiedInteger(
    target.sectionIndex,
    target.section,
    direct.sectionIndex,
    direct.section,
  );
  let paragraphIndex = firstSpecifiedInteger(
    target.paragraphIndex,
    target.para,
    direct.paragraphIndex,
    direct.paragraph,
    direct.para,
  );
  let controlIndex = firstSpecifiedInteger(
    target.controlIndex,
    target.control,
    target.controlIdx,
    direct.controlIndex,
    direct.control,
    direct.controlIdx,
  );
  let cellIndex = firstSpecifiedInteger(
    target.cellIndex,
    target.cell?.number,
    target.tableCell?.number,
    direct.cellIndex,
    direct.cell,
  );
  let cellParagraphIndex = firstSpecifiedInteger(
    target.cellParagraphIndex,
    target.cellParaIndex,
    target.cellPara,
    direct.cellParagraphIndex,
    direct.cellParaIndex,
    direct.cellPara,
    0,
  );
  const tableId = target.tableId;
  const table = tableId
    ? context?.before?.tables?.find(item => item?.id === tableId)
    : null;
  if (table) {
    const cell = table.cells?.find(item =>
      firstSpecifiedInteger(
        item?.native?.cellIndex,
        item?.cellIndex,
        item?.location?.cell?.number,
      ) === cellIndex);
    const native = cell?.native ?? {};
    sectionIndex = firstSpecifiedInteger(native.sectionIndex, native.section);
    paragraphIndex = firstSpecifiedInteger(
      native.paragraphIndex,
      native.paragraph,
      native.para,
    );
    controlIndex = firstSpecifiedInteger(
      native.controlIndex,
      native.control,
      native.controlIdx,
    );
    cellIndex = firstSpecifiedInteger(native.cellIndex, cellIndex);
    cellParagraphIndex = firstSpecifiedInteger(
      target.cellParagraphIndex,
      target.cellParaIndex,
      target.cellPara,
      direct.cellParagraphIndex,
      direct.cellParaIndex,
      direct.cellPara,
      native.cellParagraphIndex,
      native.cellParaIndex,
      cellParagraphIndex,
    );
  }
  if ([sectionIndex, paragraphIndex, controlIndex, cellIndex, cellParagraphIndex]
    .some(value => value === null)) {
    throw structuralError(
      'HWPX_CELL_TARGET_INVALID',
      'The HWPX cell target must resolve to native table and cell indices.',
      { target },
    );
  }
  return {
    kind: 'cell',
    sectionIndex,
    paragraphIndex,
    controlIndex,
    cellIndex,
    cellParagraphIndex,
  };
}

function isCellStyleTarget(command) {
  const target = command.target ?? command.location ?? {};
  return target.tableId !== undefined
    || target.cell !== undefined
    || target.tableCell !== undefined
    || target.cellIndex !== undefined
    || target.native?.cellIndex !== undefined;
}

function inspectedCellParagraphLength(doc, context, target) {
  if (typeof doc?.getCellParagraphLength === 'function') {
    const length = nonNegativeInteger(doc.getCellParagraphLength(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      target.cellParagraphIndex,
    ));
    if (length !== null) return length;
  }
  const table = context?.before?.tables?.find(item =>
    firstSpecifiedInteger(item?.native?.section, item?.section) === target.sectionIndex
    && firstSpecifiedInteger(item?.native?.paragraph, item?.para) === target.paragraphIndex
    && firstSpecifiedInteger(item?.native?.control, item?.control) === target.controlIndex);
  const cell = table?.cells?.find(item =>
    firstSpecifiedInteger(item?.native?.cellIndex, item?.cellIndex) === target.cellIndex);
  const paragraph = cell?.paragraphs?.[target.cellParagraphIndex];
  if (typeof paragraph?.text === 'string') return [...paragraph.text].length;
  const length = firstSpecifiedInteger(paragraph?.length, paragraph?.textLength);
  if (length !== null) return length;
  throw structuralError(
    'HWPX_RANGE_INSPECTION_REQUIRED',
    'A verified cell paragraph length is required for character formatting.',
    { target },
  );
}

function resolveStyleRange(doc, command, context, target) {
  const publicTarget = command.target ?? command.location ?? {};
  const native = publicTarget.native ?? {};
  const start = firstSpecifiedInteger(
    publicTarget.offset,
    publicTarget.charOffset,
    native.offset,
    native.charOffset,
    0,
  );
  const length = firstSpecifiedInteger(publicTarget.length, native.length);
  const paragraphLength = target.kind === 'cell'
    ? inspectedCellParagraphLength(doc, context, target)
    : inspectedParagraphLength(doc, context, target);
  const end = length === null ? paragraphLength : start + length;
  if (start === null || nonNegativeInteger(end) === null
    || start > paragraphLength || end > paragraphLength || end <= start) {
    throw structuralError(
      'HWPX_INVALID_RANGE',
      'The HWPX style range must be nonempty and stay inside the inspected paragraph.',
      { start, end, paragraphLength },
    );
  }
  return { start, end };
}

function applyExistingStyle(doc, command, context) {
  const styleId = nonNegativeInteger(command.styleId);
  if (styleId === null || styleId > 0xFF) {
    throw structuralError(
      'HWPX_STYLE_ID_INVALID',
      'applyStyle requires a style ID between 0 and 255.',
    );
  }
  if (isCellStyleTarget(command)) {
    const target = resolveHwpxCellTarget(command, context);
    const applyCellStyle = requireMethod(doc, 'applyCellStyle');
    const native = parseNativeResult(applyCellStyle(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      target.cellParagraphIndex,
      styleId,
    ), 'applyCellStyle');
    return structuralResult(command, native, target);
  }
  const target = resolveHwpxTextTarget(command, { offsetRequired: false });
  const applyStyle = requireMethod(doc, 'applyStyle');
  const native = parseNativeResult(
    applyStyle(target.sectionIndex, target.paragraphIndex, styleId),
    'applyStyle',
  );
  return structuralResult(command, native, publicParagraphTarget(
    target.sectionIndex,
    target.paragraphIndex,
  ));
}

function applyRunStyle(doc, command, context) {
  const cellTarget = isCellStyleTarget(command);
  const target = cellTarget
    ? resolveHwpxCellTarget(command, context)
    : resolveHwpxTextTarget(command, { offsetRequired: false });
  const methodName = cellTarget ? 'applyCharFormatInCell' : 'applyCharFormat';
  const applyFormat = requireMethod(doc, methodName);
  const range = resolveStyleRange(doc, command, context, target);
  const style = normalizeCharacterStyle(doc, command.style);
  const args = cellTarget
    ? [
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      target.cellParagraphIndex,
      range.start,
      range.end,
      JSON.stringify(style),
    ]
    : [
      target.sectionIndex,
      target.paragraphIndex,
      range.start,
      range.end,
      JSON.stringify(style),
    ];
  const native = parseNativeResult(applyFormat(...args), methodName);
  return {
    ...structuralResult(command, native, cellTarget
      ? target
      : publicParagraphTarget(target.sectionIndex, target.paragraphIndex, range.end)),
    expectedRunStyle: command.style,
    expectedRunRange: range,
  };
}

function applyParagraphStyle(doc, command, context) {
  const cellTarget = isCellStyleTarget(command);
  const target = cellTarget
    ? resolveHwpxCellTarget(command, context)
    : resolveHwpxTextTarget(command, { offsetRequired: false });
  const methodName = cellTarget ? 'applyParaFormatInCell' : 'applyParaFormat';
  const applyFormat = requireMethod(doc, methodName);
  const style = normalizeParagraphStyle(command.style);
  const args = cellTarget
    ? [
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      target.cellParagraphIndex,
      JSON.stringify(style),
    ]
    : [
      target.sectionIndex,
      target.paragraphIndex,
      JSON.stringify(style),
    ];
  const native = parseNativeResult(applyFormat(...args), methodName);
  return {
    ...structuralResult(command, native, cellTarget
      ? target
      : publicParagraphTarget(target.sectionIndex, target.paragraphIndex)),
    expectedFormat: { scope: 'paragraph', properties: style },
  };
}

function resolveObjectTarget(command, kind) {
  const target = command.target ?? command.location ?? {};
  const native = target.native && typeof target.native === 'object' ? target.native : target;
  const sectionIndex = firstSpecifiedInteger(native.sectionIndex, native.section, target.sectionIndex, target.section);
  const paragraphIndex = firstSpecifiedInteger(
    native.paragraphIndex, native.paragraph, native.para,
    target.paragraphIndex, target.paragraph, target.para,
  );
  const controlIndex = firstSpecifiedInteger(
    native.controlIndex, native.control, native.controlIdx,
    target.controlIndex, target.control, target.controlIdx,
  );
  if ([sectionIndex, paragraphIndex, controlIndex].some(value => value === null)) {
    throw structuralError('HWPX_OBJECT_TARGET_INVALID', `${kind} formatting requires inspected native section, paragraph, and control indices.`, { target });
  }
  const rawCellPath = native.cellPath ?? target.cellPath;
  const cellPath = Array.isArray(rawCellPath) ? rawCellPath.map((item, index) => {
    const controlIndexValue = firstSpecifiedInteger(item.controlIndex, item.controlIdx);
    const cellIndex = firstSpecifiedInteger(item.cellIndex, item.cellIdx);
    const cellParaIndex = firstSpecifiedInteger(item.cellParaIndex, item.cellParaIdx, 0);
    if ([controlIndexValue, cellIndex, cellParaIndex].some((value) => value === null)) {
      throw structuralError(
        'HWPX_OBJECT_TARGET_INVALID',
        `${kind} formatting cellPath[${index}] requires nonnegative control, cell, and cell-paragraph indices.`,
        { target },
      );
    }
    return { controlIndex: controlIndexValue, cellIndex, cellParaIndex };
  }) : null;
  return { kind, sectionIndex, paragraphIndex, controlIndex, ...(cellPath ? { cellPath } : {}) };
}

function applyObjectProperties(doc, command, scope, methodName) {
  const target = resolveObjectTarget(command, scope);
  const properties = normalizeFormatProperties(scope, command.properties);
  const nestedImage = scope === 'image' && Array.isArray(target.cellPath);
  const resolvedMethodName = nestedImage ? 'setCellPicturePropertiesByPath' : methodName;
  const method = requireMethod(doc, resolvedMethodName);
  const args = nestedImage
    ? [
      target.sectionIndex,
      target.paragraphIndex,
      JSON.stringify(target.cellPath),
      target.controlIndex,
      JSON.stringify(properties),
    ]
    : [target.sectionIndex, target.paragraphIndex, target.controlIndex, JSON.stringify(properties)];
  const native = parseNativeResult(method(...args), resolvedMethodName);
  return {
    ...structuralResult(command, native, target),
    expectedFormat: { scope, properties },
  };
}

function completeCellBorderFillPatch(doc, target, properties) {
  if (!Object.keys(properties).some(field => CELL_BORDER_FILL_PATCH_FIELDS.has(field))) {
    return properties;
  }
  const current = parseNativeObject(requireMethod(doc, 'getCellProperties')(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
    target.cellIndex,
  ), 'getCellProperties');
  const inherited = Object.fromEntries(CELL_BORDER_FILL_FIELDS
    .filter(field => current[field] !== undefined)
    .map(field => [field, current[field]]));
  if (!Number.isInteger(inherited.borderFillId) || inherited.borderFillId < 0) {
    throw structuralError(
      'HWPX_ENGINE_RESULT_INVALID',
      'getCellProperties omitted the current border/fill identity required for a sparse cell format patch.',
      { target, current },
    );
  }
  const changesFillAppearance = ['fillColor', 'patternColor', 'patternType']
    .some(field => properties[field] !== undefined);
  if (changesFillAppearance && properties.fillType === undefined && inherited.fillType !== 'solid') {
    inherited.fillType = 'solid';
  }
  return { ...inherited, ...properties };
}

function applyFormat(doc, command, context) {
  const scope = String(command.scope ?? '');
  if (scope === 'character') {
    return applyRunStyle(doc, { ...command, style: command.properties }, context);
  }
  if (scope === 'paragraph') {
    return applyParagraphStyle(doc, { ...command, style: command.properties }, context);
  }
  if (scope === 'cell') {
    const target = resolveHwpxCellTarget(command, context);
    const properties = normalizeFormatProperties(scope, command.properties);
    const nativeProperties = completeCellBorderFillPatch(doc, target, properties);
    const native = parseNativeResult(requireMethod(doc, 'setCellProperties')(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      JSON.stringify(nativeProperties),
    ), 'setCellProperties');
    return {
      ...structuralResult(command, native, target),
      expectedFormat: { scope, properties },
    };
  }
  if (scope === 'table') {
    const target = resolveHwpxTableTarget(command, context);
    const properties = normalizeFormatProperties(scope, command.properties);
    const native = parseNativeResult(requireMethod(doc, 'setTableProperties')(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      JSON.stringify(properties),
    ), 'setTableProperties');
    return {
      ...structuralResult(command, native, target),
      expectedFormat: { scope, properties },
    };
  }
  throw structuralError('HWPX_FORMAT_SCOPE_INVALID', `Unsupported format.apply scope: ${scope}.`);
}

function boundedIndex(value, label, maximum = 65535) {
  const result = nonNegativeInteger(value);
  if (result === null || result > maximum) {
    throw structuralError('HWPX_STRUCTURE_ARGUMENT_INVALID', `${label} must be an integer from 0 through ${maximum}.`, { value });
  }
  return result;
}

function applyTableStructure(doc, command, context) {
  const target = resolveHwpxTableTarget(command, context);
  const action = String(command.action ?? '');
  const args = [target.sectionIndex, target.paragraphIndex, target.controlIndex];
  let native;
  if (action === 'insertRow') {
    native = parseNativeResult(requireMethod(doc, 'insertTableRow')(
      ...args, boundedIndex(command.row, 'row'), command.side !== 'before',
    ), 'insertTableRow');
  } else if (action === 'insertColumn') {
    native = parseNativeResult(requireMethod(doc, 'insertTableColumn')(
      ...args, boundedIndex(command.column, 'column'), command.side !== 'before',
    ), 'insertTableColumn');
  } else if (action === 'deleteRow') {
    native = parseNativeResult(requireMethod(doc, 'deleteTableRow')(
      ...args, boundedIndex(command.row, 'row'),
    ), 'deleteTableRow');
  } else if (action === 'deleteColumn') {
    native = parseNativeResult(requireMethod(doc, 'deleteTableColumn')(
      ...args, boundedIndex(command.column, 'column'),
    ), 'deleteTableColumn');
  } else if (action === 'mergeCells') {
    native = parseNativeResult(requireMethod(doc, 'mergeTableCells')(
      ...args,
      boundedIndex(command.startRow, 'startRow'),
      boundedIndex(command.startColumn, 'startColumn'),
      boundedIndex(command.endRow, 'endRow'),
      boundedIndex(command.endColumn, 'endColumn'),
    ), 'mergeTableCells');
  } else if (action === 'splitCell') {
    native = parseNativeResult(requireMethod(doc, 'splitTableCellInto')(
      ...args,
      boundedIndex(command.row, 'row'),
      boundedIndex(command.column, 'column'),
      boundedIndex(command.rows ?? 1, 'rows'),
      boundedIndex(command.columns ?? 1, 'columns'),
      command.equalRowHeight !== false,
      command.mergeFirst === true,
    ), 'splitTableCellInto');
  } else if (action === 'splitTable') {
    native = parseNativeResult(requireMethod(doc, 'splitTable')(
      ...args, boundedIndex(command.atRow, 'atRow'),
    ), 'splitTable', ['frontRows', 'backParaIdx']);
    const objects = parseNativeArray(requireMethod(doc, 'getObjects')(), 'getObjects');
    const backControl = objects.find(item =>
      Number(item.para) === Number(native.backParaIdx) && item.kind === 'table');
    if (!backControl || nonNegativeInteger(backControl.controlIndex) === null) {
      throw structuralError('HWPX_TABLE_SPLIT_TARGET_MISSING', 'splitTable did not return an inspectable second table control.', { native, objects });
    }
    const created = {
      kind: 'table', sectionIndex: target.sectionIndex, paragraphIndex: native.backParaIdx,
      controlIndex: backControl.controlIndex,
    };
    const backDimensions = parseNativeObject(requireMethod(doc, 'getTableDimensions')(
      created.sectionIndex, created.paragraphIndex, created.controlIndex,
    ), 'getTableDimensions');
    return {
      ...structuralResult(command, native, target, [created]),
      expectedTableDimensions: parseNativeObject(requireMethod(doc, 'getTableDimensions')(...args), 'getTableDimensions'),
      expectedCreatedTableDimensions: { ...created, ...backDimensions },
    };
  } else if (action === 'attachNextTable') {
    native = parseNativeResult(requireMethod(doc, 'mergeTableWithNext')(...args), 'mergeTableWithNext', ['rowCount']);
    return {
      ...structuralResult(command, native, target),
      expectedTableDimensions: parseNativeObject(requireMethod(doc, 'getTableDimensions')(...args), 'getTableDimensions'),
    };
  } else if (action === 'deleteTable') {
    native = parseNativeResult(requireMethod(doc, 'deleteTableControl')(...args), 'deleteTableControl');
    return structuralResult(command, native, { ...target, kind: 'deletedTable' });
  } else {
    throw structuralError('HWPX_TABLE_STRUCTURE_ACTION_INVALID', `Unsupported table.structure action: ${action}.`);
  }
  return {
    ...structuralResult(command, native, target),
    expectedTableDimensions: {
      rowCount: native.rowCount,
      colCount: native.colCount,
      cellCount: native.cellCount,
    },
  };
}

function tableCellsInRequestedRange(doc, target, command) {
  const dimensions = parseNativeObject(requireMethod(doc, 'getTableDimensions')(
    target.sectionIndex, target.paragraphIndex, target.controlIndex,
  ), 'getTableDimensions');
  const startRow = boundedIndex(command.startRow ?? 0, 'startRow');
  const startColumn = boundedIndex(command.startColumn ?? 0, 'startColumn');
  const endRow = boundedIndex(command.endRow ?? Math.max(0, Number(dimensions.rowCount) - 1), 'endRow');
  const endColumn = boundedIndex(command.endColumn ?? Math.max(0, Number(dimensions.colCount) - 1), 'endColumn');
  if (startRow > endRow || startColumn > endColumn
    || endRow >= Number(dimensions.rowCount) || endColumn >= Number(dimensions.colCount)) {
    throw structuralError('HWPX_TABLE_RANGE_INVALID', 'The requested table range is outside the inspected table.', {
      dimensions, startRow, startColumn, endRow, endColumn,
    });
  }
  const cells = [];
  for (let cellIndex = 0; cellIndex < Number(dimensions.cellCount); cellIndex += 1) {
    const info = parseNativeObject(requireMethod(doc, 'getCellInfo')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex, cellIndex,
    ), 'getCellInfo');
    const lastRow = Number(info.row) + Math.max(1, Number(info.rowSpan || 1)) - 1;
    const lastColumn = Number(info.col) + Math.max(1, Number(info.colSpan || 1)) - 1;
    if (Number(info.row) >= startRow && lastRow <= endRow
      && Number(info.col) >= startColumn && lastColumn <= endColumn) {
      cells.push({ cellIndex, info });
    }
  }
  return { dimensions, startRow, startColumn, endRow, endColumn, cells };
}

function findTableCellIndex(doc, target, row, column) {
  const dimensions = parseNativeObject(requireMethod(doc, 'getTableDimensions')(
    target.sectionIndex, target.paragraphIndex, target.controlIndex,
  ), 'getTableDimensions');
  for (let cellIndex = 0; cellIndex < Number(dimensions.cellCount); cellIndex += 1) {
    const info = parseNativeObject(requireMethod(doc, 'getCellInfo')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex, cellIndex,
    ), 'getCellInfo');
    if (Number(info.row) === row && Number(info.col) === column) return cellIndex;
  }
  throw structuralError('HWPX_TABLE_RANGE_INVALID', 'The requested row and column do not identify a table cell.', { target, row, column });
}

function applyTableTransform(doc, command, context) {
  const target = resolveHwpxTableTarget(command, context);
  const action = String(command.action ?? '');
  const args = [target.sectionIndex, target.paragraphIndex, target.controlIndex];
  if (action === 'transpose') {
    const native = parseNativeResult(requireMethod(doc, 'transposeTableCellsInPlace')(...args), 'transposeTableCellsInPlace');
    return {
      ...structuralResult(command, native, target),
      expectedTableDimensions: {
        rowCount: native.targetRows,
        colCount: native.targetCols,
        cellCount: Number(native.targetRows) * Number(native.targetCols),
      },
    };
  }
  if (action === 'calculate') {
    const row = boundedIndex(command.row, 'row');
    const column = boundedIndex(command.column, 'column');
    const formula = String(command.formula ?? '').trim();
    if (!formula || formula.length > 2048) {
      throw structuralError('HWPX_TABLE_FORMULA_INVALID', 'table.transform calculate requires a formula up to 2048 characters.');
    }
    const writeResult = command.writeResult !== false;
    const native = parseNativeResult(requireMethod(doc, 'evaluateTableFormula')(
      ...args, row, column, formula, writeResult,
    ), 'evaluateTableFormula');
    const cellIndex = findTableCellIndex(doc, target, row, column);
    const formulaTarget = {
      kind: 'cell', ...target, cellIndex, cellParagraphIndex: 0,
    };
    return {
      ...structuralResult(command, native, formulaTarget),
      ...(writeResult ? { expectedCellText: String(native.result ?? '') } : {}),
    };
  }
  if (!['equalizeRowHeight', 'equalizeColumnWidth'].includes(action)) {
    throw structuralError('HWPX_TABLE_TRANSFORM_ACTION_INVALID', `Unsupported table.transform action: ${action}.`);
  }
  const range = tableCellsInRequestedRange(doc, target, command);
  if (range.cells.length < 2) {
    throw structuralError('HWPX_TABLE_RANGE_INVALID', `${action} requires at least two unmerged cells in the requested range.`);
  }
  if (range.cells.some(({ info }) => Number(info.rowSpan || 1) > 1 || Number(info.colSpan || 1) > 1)) {
    throw structuralError(
      'HWPX_TABLE_TRANSFORM_MERGED_RANGE_UNSUPPORTED',
      `${action} currently requires an unmerged rectangular cell range.`,
      { range: { startRow: range.startRow, startColumn: range.startColumn, endRow: range.endRow, endColumn: range.endColumn } },
    );
  }
  const bboxes = parseNativeArray(requireMethod(doc, 'getTableCellBboxes')(...args, 0), 'getTableCellBboxes');
  const bboxByCell = new Map(bboxes.map(item => [Number(item.cellIdx), item]));
  const propertiesByCell = new Map(range.cells.map(({ cellIndex }) => [cellIndex, parseNativeObject(
    requireMethod(doc, 'getCellProperties')(...args, cellIndex), 'getCellProperties',
  )]));
  const boxField = action === 'equalizeRowHeight' ? 'h' : 'w';
  const renderSizes = range.cells.map(({ cellIndex }) => Number(bboxByCell.get(cellIndex)?.[boxField]) * 75);
  if (renderSizes.some(size => !Number.isFinite(size) || size <= 0)) {
    throw structuralError('HWPX_TABLE_RENDER_MEASUREMENT_INVALID', `${action} could not obtain a positive rendered cell measurement.`, { range, bboxes });
  }
  const average = Math.round(renderSizes.reduce((sum, size) => sum + size, 0) / renderSizes.length);
  const updates = range.cells.map(({ cellIndex }, index) => action === 'equalizeRowHeight'
    ? { cellIdx: cellIndex, heightDelta: 0, localResize: true, renderHeight: average }
    : {
      cellIdx: cellIndex,
      widthDelta: average - Number(propertiesByCell.get(cellIndex)?.width || 0),
      localResize: true,
      renderWidth: average,
    });
  const native = parseNativeResult(requireMethod(doc, 'resizeTableCells')(
    ...args, JSON.stringify(updates),
  ), 'resizeTableCells');
  return structuralResult(command, native, target, [], {
    equalizedRange: { startRow: range.startRow, startColumn: range.startColumn, endRow: range.endRow, endColumn: range.endColumn, average },
  });
}

function applyParagraphStructure(doc, command) {
  const target = resolveHwpxTextTarget(command, { offsetRequired: false });
  const action = String(command.action ?? '');
  const offset = firstSpecifiedInteger(
    command.offset, command.target?.offset, command.target?.native?.offset, 0,
  );
  let native;
  if (action === 'split') {
    native = parseNativeResult(requireMethod(doc, 'splitParagraph')(
      target.sectionIndex, target.paragraphIndex, boundedIndex(offset, 'offset', 0xFFFF_FFFF),
    ), 'splitParagraph', ['paraIdx']);
    const created = publicParagraphTarget(target.sectionIndex, native.paraIdx);
    return structuralResult(command, native, created, [created]);
  }
  if (action === 'mergePrevious') {
    native = parseNativeResult(requireMethod(doc, 'mergeParagraph')(
      target.sectionIndex, target.paragraphIndex,
    ), 'mergeParagraph', ['paraIdx']);
    return structuralResult(command, native, publicParagraphTarget(target.sectionIndex, native.paraIdx));
  }
  const methodName = action === 'pageBreak' ? 'insertPageBreak'
    : action === 'columnBreak' ? 'insertColumnBreak'
      : null;
  if (!methodName) {
    throw structuralError('HWPX_PARAGRAPH_STRUCTURE_ACTION_INVALID', `Unsupported paragraph.structure action: ${action}.`);
  }
  native = parseNativeResult(requireMethod(doc, methodName)(
    target.sectionIndex, target.paragraphIndex, boundedIndex(offset, 'offset', 0xFFFF_FFFF),
  ), methodName);
  return structuralResult(command, native, publicParagraphTarget(target.sectionIndex, target.paragraphIndex));
}

function applyObjectFormat(doc, command) {
  const scope = String(command.scope ?? '');
  if (scope === 'image') return applyObjectProperties(doc, command, scope, 'setPictureProperties');
  if (scope === 'shape') return applyObjectProperties(doc, command, scope, 'setShapeProperties');
  if (scope === 'equation') {
    const target = resolveObjectTarget(command, scope);
    const properties = normalizeFormatProperties(scope, command.properties);
    if (Array.isArray(target.cellPath)) {
      throw structuralError('HWPX_NESTED_EQUATION_UNSUPPORTED', 'object.format equation does not yet support an equation nested in a table or text box.');
    }
    const native = parseNativeResult(requireMethod(doc, 'setEquationProperties')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex, -1, -1, JSON.stringify(properties),
    ), 'setEquationProperties');
    return {
      ...structuralResult(command, native, target),
      expectedFormat: { scope, properties },
    };
  }
  throw structuralError('HWPX_FORMAT_SCOPE_INVALID', `Unsupported object.format scope: ${scope}.`);
}

const SHAPE_TYPES = new Set([
  'line', 'rectangle', 'ellipse', 'polygon', 'arc',
  'connector-straight', 'connector-stroke', 'connector-arc',
  'connector-straight-arrow', 'connector-stroke-arrow', 'connector-arc-arrow',
]);

function applyObjectCreate(doc, command, context) {
  const target = resolveHwpxTextTarget(command);
  const paragraphLength = inspectedParagraphLength(doc, context, target);
  if (target.offset > paragraphLength) {
    throw structuralError('HWPX_TARGET_INVALID', 'object.create offset exceeds the inspected body paragraph length.', { target, paragraphLength });
  }
  const kind = String(command.kind ?? '');
  if (kind === 'equation') {
    const script = String(command.script ?? '').trim();
    const fontSize = positiveInteger(command.fontSize ?? 1000);
    const color = nonNegativeInteger(command.color ?? 0);
    if (!script || script.length > 4096 || fontSize === null || color === null) {
      throw structuralError('HWPX_EQUATION_CREATE_INVALID', 'object.create equation requires a nonblank script up to 4096 characters, positive fontSize, and packed color.');
    }
    const native = parseNativeResult(requireMethod(doc, 'insertEquation')(
      target.sectionIndex, target.paragraphIndex, target.offset, script, fontSize, color,
    ), 'insertEquation', ['paraIdx', 'controlIdx']);
    const createdTarget = {
      kind: 'equation', sectionIndex: target.sectionIndex,
      paragraphIndex: native.paraIdx, controlIndex: native.controlIdx,
    };
    return {
      ...structuralResult(command, native, createdTarget, [createdTarget]),
      expectedFormat: { scope: 'equation', properties: { script, fontSize, color } },
    };
  }
  if (!['shape', 'textBox'].includes(kind)) {
    throw structuralError('HWPX_OBJECT_KIND_INVALID', 'object.create kind must be shape, textBox, or equation.');
  }
  const shapeType = kind === 'textBox' ? 'textbox' : String(command.shapeType ?? 'rectangle');
  if (!SHAPE_TYPES.has(shapeType) && shapeType !== 'textbox') {
    throw structuralError('HWPX_SHAPE_TYPE_INVALID', `Unsupported shape type: ${shapeType}.`, { supported: [...SHAPE_TYPES] });
  }
  const width = positiveInteger(command.width ?? 18000);
  const height = positiveInteger(command.height ?? 9000);
  const horzOffset = nonNegativeInteger(command.horzOffset ?? 0);
  const vertOffset = nonNegativeInteger(command.vertOffset ?? 0);
  const treatAsChar = command.treatAsChar ?? kind === 'textBox';
  const textWrap = command.textWrap ?? 'InFrontOfText';
  if ([width, height, horzOffset, vertOffset].some(value => value === null)
    || typeof treatAsChar !== 'boolean'
    || !['Square', 'Tight', 'Through', 'TopAndBottom', 'BehindText', 'InFrontOfText'].includes(textWrap)
    || (command.lineFlipX !== undefined && typeof command.lineFlipX !== 'boolean')
    || (command.lineFlipY !== undefined && typeof command.lineFlipY !== 'boolean')) {
    throw structuralError('HWPX_SHAPE_CREATE_INVALID', 'object.create shape dimensions, offsets, wrapping, and flip flags are invalid.');
  }
  if (shapeType === 'polygon' && command.polygonPoints !== undefined
    && (!Array.isArray(command.polygonPoints) || command.polygonPoints.length < 3
      || command.polygonPoints.some(point => nonNegativeInteger(point?.x) === null || nonNegativeInteger(point?.y) === null))) {
    throw structuralError('HWPX_SHAPE_CREATE_INVALID', 'polygonPoints must contain at least three nonnegative {x,y} points.');
  }
  const native = parseNativeResult(requireMethod(doc, 'createShapeControl')(JSON.stringify({
    sectionIdx: target.sectionIndex, paraIdx: target.paragraphIndex, charOffset: target.offset,
    width, height, horzOffset, vertOffset, treatAsChar, textWrap, shapeType,
    lineFlipX: command.lineFlipX === true, lineFlipY: command.lineFlipY === true,
    ...(command.polygonPoints === undefined ? {} : { polygonPoints: command.polygonPoints }),
  })), 'createShapeControl', ['paraIdx', 'controlIdx']);
  const createdTarget = {
    kind: 'shape', sectionIndex: target.sectionIndex,
    paragraphIndex: native.paraIdx, controlIndex: native.controlIdx,
  };
  if (kind !== 'textBox' || command.text === undefined) {
    return structuralResult(command, native, createdTarget, [createdTarget]);
  }
  if (typeof command.text !== 'string' || command.text.length > 100_000) {
    throw structuralError('HWPX_TEXTBOX_TEXT_INVALID', 'object.create textBox text must be a string up to 100000 characters.');
  }
  const textNative = setTextBoxText(doc, createdTarget, command.text);
  return {
    ...structuralResult(command, { control: native, text: textNative }, createdTarget, [createdTarget]),
    expectedTextBoxText: command.text,
  };
}

function setTextBoxText(doc, target, text) {
  const getCount = requireMethod(doc, 'getCellParagraphCount');
  const getLength = requireMethod(doc, 'getCellParagraphLength');
  const deleteText = requireMethod(doc, 'deleteTextInCell');
  const mergeParagraph = requireMethod(doc, 'mergeParagraphInCell');
  const splitParagraph = requireMethod(doc, 'splitParagraphInCell');
  const insertText = requireMethod(doc, 'insertTextInCell');
  const args = [target.sectionIndex, target.paragraphIndex, target.controlIndex, 0];
  const paragraphCount = nonNegativeInteger(getCount(...args));
  if (paragraphCount === null || paragraphCount < 1) {
    throw structuralError('HWPX_TEXTBOX_TARGET_INVALID', 'The exact object target is not an editable text box.', { target });
  }
  for (let paragraphIndex = paragraphCount - 1; paragraphIndex >= 0; paragraphIndex -= 1) {
    const length = nonNegativeInteger(getLength(...args, paragraphIndex));
    if (length === null) throw structuralError('HWPX_ENGINE_RESULT_INVALID', 'The text box did not return a valid paragraph length.', { target, paragraphIndex });
    if (length > 0) parseNativeResult(deleteText(...args, paragraphIndex, 0, length), 'deleteTextInCell');
    if (paragraphIndex > 0) parseNativeResult(mergeParagraph(...args, paragraphIndex), 'mergeParagraphInCell');
  }
  const lines = text.split('\n');
  let lastNative = { ok: true, charOffset: 0 };
  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      const previousLength = nonNegativeInteger(getLength(...args, index - 1));
      lastNative = parseNativeResult(splitParagraph(...args, index - 1, previousLength), 'splitParagraphInCell');
    }
    if (line) lastNative = parseNativeResult(insertText(...args, index, 0, line), 'insertTextInCell', ['charOffset']);
  }
  return lastNative;
}

function applyObjectManage(doc, command) {
  const kind = String(command.kind ?? '');
  const action = String(command.action ?? '');
  if (action === 'group') {
    if (!['shape', 'object'].includes(kind) || !Array.isArray(command.targets) || command.targets.length < 2) {
      throw structuralError(
        'HWPX_OBJECT_GROUP_INVALID',
        'object.manage group requires kind=object (or legacy shape) and at least two exact inspected drawing targets.',
      );
    }
    const targets = command.targets.map((candidate, index) => {
      const target = resolveObjectTarget({ target: candidate }, 'object');
      if (Array.isArray(target.cellPath)) {
        throw structuralError('HWPX_NESTED_SHAPE_GROUP_UNSUPPORTED', 'Grouping shapes nested inside a table is not yet exposed by the native engine.', { index, target });
      }
      return target;
    });
    const sectionIndex = targets[0].sectionIndex;
    if (targets.some(target => target.sectionIndex !== sectionIndex)) {
      throw structuralError('HWPX_OBJECT_GROUP_INVALID', 'All grouped shapes must belong to the same inspected section.', { targets });
    }
    const native = parseNativeResult(requireMethod(doc, 'groupShapes')(JSON.stringify({
      sectionIdx: sectionIndex,
      targets: targets.map(target => ({ paraIdx: target.paragraphIndex, controlIdx: target.controlIndex })),
    })), 'groupShapes', ['paraIdx', 'controlIdx']);
    const createdTarget = {
      kind: 'shape', sectionIndex, paragraphIndex: native.paraIdx, controlIndex: native.controlIdx,
    };
    const properties = parseNativeObject(requireMethod(doc, 'getShapeProperties')(
      sectionIndex, native.paraIdx, native.controlIdx,
    ), 'getShapeProperties');
    if (properties.objectType !== 'group' || properties.childCount !== targets.length) {
      throw structuralError(
        'HWPX_OBJECT_GROUP_RESULT_INVALID',
        'RHWP grouping did not produce the expected native group object.',
        { targets, native, properties },
      );
    }
    return structuralResult(command, native, createdTarget, [createdTarget], {
      expectedObjectGroup: { childCount: targets.length },
    });
  }
  if (action === 'ungroup') {
    if (!['shape', 'object'].includes(kind)) {
      throw structuralError('HWPX_OBJECT_UNGROUP_INVALID', 'object.manage ungroup requires kind=object (or legacy shape) and one inspected native group target.');
    }
    const target = resolveObjectTarget(command, kind);
    if (Array.isArray(target.cellPath)) {
      throw structuralError('HWPX_NESTED_SHAPE_UNGROUP_UNSUPPORTED', 'Ungrouping a shape nested inside a table is not yet exposed by the native engine.', { target });
    }
    const before = parseNativeObject(requireMethod(doc, 'getShapeProperties')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
    ), 'getShapeProperties');
    if (before.objectType !== 'group' || !Number.isInteger(before.childCount) || before.childCount < 2) {
      throw structuralError('HWPX_OBJECT_UNGROUP_INVALID', 'The exact object target is not a native group containing at least two children.', { target, before });
    }
    const native = parseNativeResult(requireMethod(doc, 'ungroupShape')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
    ), 'ungroupShape');
    const objects = parseNativeArray(requireMethod(doc, 'getObjects')(), 'getObjects');
    const restored = objects.filter(item => Number(item.para) === target.paragraphIndex).length;
    if (restored < before.childCount) {
      throw structuralError(
        'HWPX_OBJECT_UNGROUP_RESULT_INVALID',
        'RHWP ungrouping did not restore the expected number of visible child controls.',
        { target, before, objects },
      );
    }
    return structuralResult(command, native, { ...target, kind: 'ungroupedObject' }, [], {
      expectedUngroupedChildCount: before.childCount,
    });
  }
  const target = resolveObjectTarget(command, kind === 'textBox' ? 'shape' : kind);
  if (action === 'setText') {
    if (kind !== 'textBox' || typeof command.text !== 'string' || command.text.length > 100_000) {
      throw structuralError('HWPX_TEXTBOX_TEXT_INVALID', 'object.manage setText requires kind=textBox and a text string up to 100000 characters.');
    }
    if (Array.isArray(target.cellPath)) {
      throw structuralError('HWPX_NESTED_TEXTBOX_UNSUPPORTED', 'object.manage setText does not yet support a text box nested inside a table.');
    }
    const native = setTextBoxText(doc, target, command.text);
    return { ...structuralResult(command, native, target), expectedTextBoxText: command.text };
  }
  if (action === 'arrange') {
    if (!['shape', 'textBox'].includes(kind) || Array.isArray(target.cellPath) || !['front', 'back', 'forward', 'backward'].includes(command.order)) {
      throw structuralError('HWPX_OBJECT_ARRANGE_INVALID', 'object.manage arrange requires a top-level shape or textBox and a valid order.');
    }
    const getShapeProperties = requireMethod(doc, 'getShapeProperties');
    const before = parseNativeObject(getShapeProperties(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
    ), 'getShapeProperties');
    const native = parseNativeResult(requireMethod(doc, 'changeShapeZOrder')(
      target.sectionIndex, target.paragraphIndex, target.controlIndex, command.order,
    ), 'changeShapeZOrder');
    const after = parseNativeObject(getShapeProperties(
      target.sectionIndex, target.paragraphIndex, target.controlIndex,
    ), 'getShapeProperties');
    if (before.zOrder !== undefined && before.zOrder === after.zOrder) {
      throw structuralError(
        'HWPX_OBJECT_ARRANGE_NOOP',
        'The requested object arrangement did not change the target z-order; choose a non-noop order or another target.',
        { target, order: command.order, beforeZOrder: before.zOrder, afterZOrder: after.zOrder },
      );
    }
    return {
      ...structuralResult(command, native, target),
      ...(after.zOrder === undefined ? {} : { expectedObjectZOrder: after.zOrder }),
    };
  }
  if (action === 'delete') {
    let methodName;
    let args;
    if (kind === 'image') {
      if (Array.isArray(target.cellPath)) {
        methodName = 'deleteCellPictureControlByPath';
        args = [target.sectionIndex, target.paragraphIndex, JSON.stringify(target.cellPath), target.controlIndex];
      } else {
        methodName = 'deletePictureControl';
        args = [target.sectionIndex, target.paragraphIndex, target.controlIndex];
      }
    } else if (['shape', 'textBox'].includes(kind)) {
      if (Array.isArray(target.cellPath)) throw structuralError('HWPX_NESTED_SHAPE_DELETE_UNSUPPORTED', 'Deleting a shape nested in a table is not yet exposed by the native engine.');
      methodName = 'deleteShapeControl';
      args = [target.sectionIndex, target.paragraphIndex, target.controlIndex];
    } else if (kind === 'equation') {
      if (Array.isArray(target.cellPath)) throw structuralError('HWPX_NESTED_EQUATION_UNSUPPORTED', 'Deleting an equation nested in a table or text box is not yet exposed by this command.');
      methodName = 'deleteEquationControl';
      args = [target.sectionIndex, target.paragraphIndex, target.controlIndex];
    } else {
      throw structuralError('HWPX_OBJECT_KIND_INVALID', 'object.manage delete requires image, shape, textBox, or equation kind.');
    }
    const objectsBefore = parseNativeArray(requireMethod(doc, 'getObjects')(), 'getObjects');
    const objectKind = kind === 'textBox' ? 'shape' : kind;
    const expectedObjectCount = objectsBefore.filter(item => item.kind === objectKind).length - 1;
    const native = parseNativeResult(requireMethod(doc, methodName)(...args), methodName);
    return {
      ...structuralResult(command, native, { ...target, kind: 'deletedObject', objectKind }),
      expectedObjectCount,
    };
  }
  throw structuralError('HWPX_OBJECT_MANAGE_ACTION_INVALID', `Unsupported object.manage action: ${action}.`);
}

function applyAutoFitTableCell(doc, command, context) {
  const target = resolveHwpxCellTarget(command, context);
  const getCellProperties = requireMethod(doc, 'getCellProperties');
  const getCellParagraphCount = requireMethod(doc, 'getCellParagraphCount');
  const getCellParagraphLength = requireMethod(doc, 'getCellParagraphLength');
  const getCursorRectInCell = requireMethod(doc, 'getCursorRectInCell');
  const getTableDimensions = requireMethod(doc, 'getTableDimensions');
  const getCellInfo = requireMethod(doc, 'getCellInfo');
  const resizeTableCells = requireMethod(doc, 'resizeTableCells');
  const cellProperties = parseNativeObject(getCellProperties(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
    target.cellIndex,
  ), 'getCellProperties');
  const paragraphCount = nonNegativeInteger(getCellParagraphCount(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
    target.cellIndex,
  ));
  if (!paragraphCount) {
    return structuralResult(command, { ok: true, unchanged: true }, target);
  }
  const firstRect = parseNativeObject(getCursorRectInCell(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
    target.cellIndex,
    0,
    0,
  ), 'getCursorRectInCell');
  const lastParagraph = paragraphCount - 1;
  const lastLength = nonNegativeInteger(getCellParagraphLength(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
    target.cellIndex,
    lastParagraph,
  ));
  const lastRect = parseNativeObject(getCursorRectInCell(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
    target.cellIndex,
    lastParagraph,
    lastLength,
  ), 'getCursorRectInCell');
  if (Number(firstRect.pageIndex) !== Number(lastRect.pageIndex)) {
    throw structuralError(
      'HWPX_AUTOFIT_MULTIPAGE_MEASUREMENT_UNSUPPORTED',
      'The cell content already spans renderer pages; split the content or table before auto-fitting.',
      { target, firstRect, lastRect },
    );
  }
  const hwpUnitsPerCssPixel = 75;
  const measuredHeight = Math.ceil((
    Number(lastRect.y) + Number(lastRect.height || 0) - Number(firstRect.y)
  ) * hwpUnitsPerCssPixel);
  if (!Number.isFinite(measuredHeight) || measuredHeight < 0) {
    throw structuralError(
      'HWPX_AUTOFIT_MEASUREMENT_INVALID',
      'The renderer returned invalid cursor geometry for automatic table-cell sizing.',
      { target, firstRect, lastRect },
    );
  }
  const padding = Number(cellProperties.paddingTop || 0) + Number(cellProperties.paddingBottom || 0);
  const extraPadding = Math.max(0, Number(command.extraPadding || 0));
  const currentHeight = Number(cellProperties.height || 0);
  const requestedMinimum = Math.max(0, Number(command.minHeight || 0));
  const desiredHeight = Math.max(currentHeight, requestedMinimum, measuredHeight + padding + extraPadding);
  const pageDef = typeof doc.getPageDef === 'function'
    ? (() => { try { return parseNativeObject(doc.getPageDef(target.sectionIndex), 'getPageDef'); } catch { return null; } })()
    : null;
  const pageContentHeight = pageDef
    ? Math.max(1, Number(pageDef.height || 0) - Number(pageDef.marginTop || 0) - Number(pageDef.marginBottom || 0))
    : null;
  const maximumHeight = command.maxHeight !== undefined
    ? Number(command.maxHeight)
    : Number.isFinite(pageContentHeight) ? Math.floor(pageContentHeight * 0.9) : null;
  if (Number.isFinite(maximumHeight) && desiredHeight > maximumHeight) {
    throw structuralError(
      'HWPX_AUTOFIT_PAGE_CONSTRAINT_EXCEEDED',
      'The measured cell requires a row taller than the allowed page-content constraint.',
      {
        target,
        desiredHeight,
        maximumHeight,
        pageContentHeight,
        guidance: 'Increase table width, reduce text, split the table, or explicitly raise maxHeight after review.',
      },
    );
  }
  const dimensions = parseNativeObject(getTableDimensions(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
  ), 'getTableDimensions');
  const targetInfo = parseNativeObject(getCellInfo(
    target.sectionIndex,
    target.paragraphIndex,
    target.controlIndex,
    target.cellIndex,
  ), 'getCellInfo');
  const updates = [];
  for (let cellIndex = 0; cellIndex < Number(dimensions.cellCount || 0); cellIndex += 1) {
    const info = parseNativeObject(getCellInfo(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      cellIndex,
    ), 'getCellInfo');
    if (Number(info.row) !== Number(targetInfo.row)) continue;
    const props = parseNativeObject(getCellProperties(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      cellIndex,
    ), 'getCellProperties');
    const heightDelta = desiredHeight - Number(props.height || 0);
    if (heightDelta > 0) updates.push({ cellIdx: cellIndex, heightDelta });
  }
  if (updates.length) {
    parseNativeResult(resizeTableCells(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      JSON.stringify(updates),
    ), 'resizeTableCells');
  }
  return {
    ...structuralResult(command, { ok: true, updates }, target),
    expectedCellHeight: desiredHeight,
    measuredContentHeight: measuredHeight,
    previousCellHeight: currentHeight,
    maximumCellHeight: maximumHeight,
  };
}

export const DOCUMENT_METADATA_FIELDS = [
  'title',
  'subject',
  'author',
  'keywords',
  'description',
];

export function normalizeDocumentMetadata(command) {
  const metadata = {};
  for (const field of DOCUMENT_METADATA_FIELDS) {
    if (command[field] !== undefined) {
      if (typeof command[field] !== 'string') {
        throw structuralError(
          'HWPX_METADATA_INVALID',
          `setDocumentMetadata ${field} must be a string.`,
        );
      }
      metadata[field] = command[field];
    }
  }
  if (Object.keys(metadata).length === 0) {
    throw structuralError(
      'HWPX_METADATA_INVALID',
      'setDocumentMetadata requires at least one metadata field.',
    );
  }
  return metadata;
}

function applyDocumentMetadata(doc, command, context = {}) {
  const metadata = normalizeDocumentMetadata(command);
  if (typeof context.applyPackageMetadata === 'function') {
    const native = context.applyPackageMetadata(metadata);
    return structuralResult(command, native, { kind: 'documentMetadata' });
  }
  const setDocumentMetadata = requireMethod(doc, 'setDocumentMetadata');
  const native = parseNativeResult(
    setDocumentMetadata(JSON.stringify(metadata)),
    'setDocumentMetadata',
    ['changed'],
  );
  return structuralResult(command, native, { kind: 'documentMetadata' });
}

function applyHwpxStructuralCommand(doc, command, context = {}) {
  switch (command?.op) {
    case 'insertText':
      return applyInsertText(doc, command, context);
    case 'deleteRange':
      return applyDeleteRange(doc, command, context);
    case 'appendParagraph':
      return applyAppendParagraph(doc, command, context);
    case 'table.create':
      return applyCreateTable(doc, command, context);
    case 'table.insertCaption':
      return applyInsertTableCaption(doc, command, context);
    case 'image.insertAfterParagraph':
      return applyInsertImage(doc, command, context);
    case 'image.insertInCell':
      return applyInsertImageInCell(doc, command, context);
    case 'setPageSetup':
      return applyPageSetup(doc, command);
    case 'setHeaderFooter':
      return applyHeaderFooter(doc, command);
    case 'insertFootnote':
      return applyInsertFootnote(doc, command, context);
    case 'note.insert':
      return applyNoteInsert(doc, command, context);
    case 'note.manage':
      return applyNoteManage(doc, command);
    case 'field.insert':
      return applyFieldInsert(doc, command, context);
    case 'field.manage':
      return applyFieldManage(doc, command);
    case 'defineStyle':
      return applyDefineStyle(doc, command);
    case 'applyStyle':
      return applyExistingStyle(doc, command, context);
    case 'setRunStyle':
      return applyRunStyle(doc, command, context);
    case 'setParagraphStyle':
      return applyParagraphStyle(doc, command, context);
    case 'format.apply':
      return applyFormat(doc, command, context);
    case 'object.format':
      return applyObjectFormat(doc, command);
    case 'table.structure':
      return applyTableStructure(doc, command, context);
    case 'table.transform':
      return applyTableTransform(doc, command, context);
    case 'paragraph.structure':
      return applyParagraphStructure(doc, command);
    case 'section.configure':
      return applySectionConfigure(doc, command);
    case 'bookmark.manage':
      return applyBookmarkManage(doc, command, context);
    case 'object.create':
      return applyObjectCreate(doc, command, context);
    case 'object.manage':
      return applyObjectManage(doc, command);
    case 'table.autoFit':
      return applyAutoFitTableCell(doc, command, context);
    case 'setDocumentMetadata':
      return applyDocumentMetadata(doc, command, context);
    default:
      throw structuralError(
        'HWPX_STRUCTURAL_OP_UNSUPPORTED',
        `Unsupported HWPX structural operation: ${String(command?.op ?? '<missing>')}.`,
        { op: command?.op },
      );
  }
}

export {
  applyHwpxStructuralCommand,
  resolveHwpxTextTarget,
  structuralError,
};
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
