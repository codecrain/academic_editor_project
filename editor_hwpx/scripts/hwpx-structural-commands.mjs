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

function parseNativeResult(value, method, requiredU32Fields = []) {
  let parsed;
  try {
    parsed = value && typeof value === 'object'
      ? value
      : JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.ok !== true) {
      throw new Error('result is not successful');
    }
    for (const field of requiredU32Fields) {
      if (typeof parsed[field] !== 'number' || nonNegativeInteger(parsed[field]) === null) {
        throw new Error(`${field} is not a valid u32`);
      }
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
  const sectionIndex = firstInteger(
    target.sectionIndex,
    target.section,
    paragraph.sectionIndex,
    paragraph.section,
    native.sectionIndex,
    native.section,
  );
  const paragraphIndex = firstInteger(
    target.paragraphIndex,
    target.para,
    paragraph.paragraphIndex,
    paragraph.number,
    paragraph.index,
    native.paragraphIndex,
    native.paragraph,
    native.para,
  );
  const offset = firstInteger(
    target.offset,
    target.charOffset,
    native.offset,
    native.charOffset,
  );
  const length = firstInteger(target.length, native.length);

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

function structuralResult(command, native, target, createdTargets = []) {
  return {
    op: command.op,
    changed: 1,
    target,
    createdTargets,
    native,
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
    end: { ...start, offset: start.offset + start.length },
  };
}

function applyDeleteRange(doc, command, context) {
  const { start, end } = resolveDeleteRange(command);
  const sameParagraph = start.sectionIndex === end.sectionIndex
    && start.paragraphIndex === end.paragraphIndex;
  if (!sameParagraph || end.offset <= start.offset) {
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

function applyAppendParagraph(doc, command) {
  if (typeof command.text !== 'string') {
    throw structuralError('HWPX_TEXT_REQUIRED', 'appendParagraph requires a text string.');
  }
  const target = resolveHwpxTextTarget(command, { offsetRequired: false });
  const insertParagraph = requireMethod(doc, 'insertParagraph');
  const insertText = requireMethod(doc, 'insertText');
  const requestedParagraphIndex = target.paragraphIndex + 1;
  const paragraphNative = parseNativeResult(
    insertParagraph(target.sectionIndex, requestedParagraphIndex),
    'insertParagraph',
    ['paraIdx'],
  );
  const paragraphIndex = paragraphNative.paraIdx;
  const textNative = parseNativeResult(
    insertText(target.sectionIndex, paragraphIndex, 0, command.text),
    'insertText',
    ['charOffset'],
  );
  const createdTarget = {
    kind: 'paragraph',
    sectionIndex: target.sectionIndex,
    paragraphIndex,
  };
  return structuralResult(
    command,
    { paragraph: paragraphNative, text: textNative },
    { ...createdTarget, offset: textNative.charOffset },
    [createdTarget],
  );
}

function applyHwpxStructuralCommand(doc, command, context = {}) {
  switch (command?.op) {
    case 'insertText':
      return applyInsertText(doc, command, context);
    case 'deleteRange':
      return applyDeleteRange(doc, command, context);
    case 'appendParagraph':
      return applyAppendParagraph(doc, command);
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
