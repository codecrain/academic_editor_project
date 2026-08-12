import { createHash } from 'node:crypto';

import { normalizeFormatProperties } from './hwpx-format-contract.mjs';

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
  const applyStyle = command.styleSource === undefined
    ? null
    : requireMethod(doc, 'applyStyle');
  const applyParaFormat = command.styleSource === undefined
    ? null
    : requireMethod(doc, 'applyParaFormat');
  const applyCharFormat = command.styleSource === undefined || command.text.length === 0
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
  const paragraphNative = parseNativeResult(
    insertParagraph(target.sectionIndex, requestedParagraphIndex),
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
  const paragraphFormatNative = styleSource === null
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
    insertText(target.sectionIndex, paragraphIndex, 0, command.text),
    'insertText',
    ['charOffset'],
  );
  const characterFormatNative = characterStyle === null
    ? null
    : parseNativeResult(
      applyCharFormat(
        target.sectionIndex,
        paragraphIndex,
        0,
        [...command.text].length,
        JSON.stringify(characterStyle),
      ),
      'applyCharFormat',
    );
  const createdTarget = {
    kind: 'paragraph',
    sectionIndex: target.sectionIndex,
    paragraphIndex,
  };
  return {
    ...structuralResult(
    command,
    {
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
    },
    { ...createdTarget, offset: textNative.charOffset },
    [createdTarget],
    ),
    expectedText: command.text,
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
      { tableId, cellNumber, cellBounds },
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

function applyHeaderFooter(doc, command) {
  if (!['header', 'footer'].includes(command.type)) {
    throw structuralError(
      'HWPX_HEADER_FOOTER_TYPE_INVALID',
      'setHeaderFooter type must be header or footer.',
      { type: command.type },
    );
  }
  if (typeof command.text !== 'string') {
    throw structuralError(
      'HWPX_HEADER_FOOTER_TEXT_REQUIRED',
      'setHeaderFooter requires a text string.',
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
  return {
    ...structuralResult(command, {
      replaced,
      control: controlNative,
      text: textNative,
      alignment: alignNative,
    }, {
      kind: 'headerFooter',
      sectionIndex,
      paragraphIndex: controlNative.paraIndex,
      controlIndex: controlNative.controlIndex,
      type: command.type,
      applyTo: applyToName,
    }),
    expectedHeaderFooterText: command.text,
    expectedHeaderFooterAlign: align,
  };
}

function applyInsertFootnote(doc, command, context) {
  if (typeof command.text !== 'string' || command.text.trim().length === 0) {
    throw structuralError(
      'HWPX_FOOTNOTE_TEXT_REQUIRED',
      'insertFootnote requires a nonblank footnote body.',
    );
  }
  const target = resolveHwpxTextTarget(command);
  const paragraphLength = inspectedParagraphLength(doc, context, target);
  if (target.offset > paragraphLength) {
    throw structuralError(
      'HWPX_TARGET_INVALID',
      'insertFootnote offset exceeds the inspected HWPX paragraph length.',
      { target, paragraphLength },
    );
  }
  const insertFootnote = requireMethod(doc, 'insertFootnote');
  const insertTextInFootnote = requireMethod(doc, 'insertTextInFootnote');
  const controlNative = parseNativeResult(
    insertFootnote(target.sectionIndex, target.paragraphIndex, target.offset),
    'insertFootnote',
    ['paraIdx', 'controlIdx', 'footnoteNumber'],
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
  const createdTarget = {
    kind: 'footnote',
    sectionIndex: target.sectionIndex,
    paragraphIndex: controlNative.paraIdx,
    controlIndex: controlNative.controlIdx,
    footnoteNumber: controlNative.footnoteNumber,
  };
  return {
    ...structuralResult(command, {
      control: controlNative,
      text: textNative,
    }, createdTarget, [createdTarget]),
    expectedFootnoteText: command.text,
  };
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
    const native = parseNativeResult(requireMethod(doc, 'setCellProperties')(
      target.sectionIndex,
      target.paragraphIndex,
      target.controlIndex,
      target.cellIndex,
      JSON.stringify(properties),
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
  throw structuralError('HWPX_FORMAT_SCOPE_INVALID', `Unsupported object.format scope: ${scope}.`);
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
    case 'paragraph.structure':
      return applyParagraphStructure(doc, command);
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
