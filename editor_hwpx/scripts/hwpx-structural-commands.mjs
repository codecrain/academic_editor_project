function structuralError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function nonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function firstInteger(...values) {
  for (const value of values) {
    const number = nonNegativeInteger(value);
    if (number !== null) return number;
  }
  return null;
}

function parseNativeResult(value, method) {
  let parsed;
  try {
    parsed = value && typeof value === 'object'
      ? value
      : JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || parsed.ok === false) {
      throw new Error('result is not successful');
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

function resolveHwpxTextTarget(value) {
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
    0,
  );
  const length = firstInteger(target.length, native.length);

  if (sectionIndex === null || paragraphIndex === null || offset === null) {
    throw structuralError(
      'HWPX_TARGET_INVALID',
      'The HWPX text target must identify sectionIndex, paragraphIndex, and a nonnegative offset.',
      { target },
    );
  }
  return {
    sectionIndex,
    paragraphIndex,
    offset,
    ...(length === null ? {} : { length }),
  };
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

function applyInsertText(doc, command) {
  if (typeof command.text !== 'string' || command.text.length === 0) {
    throw structuralError('HWPX_TEXT_REQUIRED', 'insertText requires a nonempty text string.');
  }
  const target = resolveHwpxTextTarget(command);
  const insertText = requireMethod(doc, 'insertText');
  const native = parseNativeResult(insertText(
    target.sectionIndex,
    target.paragraphIndex,
    target.offset,
    command.text,
  ), 'insertText');
  const newOffset = firstInteger(native.charOffset, target.offset + [...command.text].length);
  return structuralResult(
    command,
    native,
    publicParagraphTarget(target.sectionIndex, target.paragraphIndex, newOffset),
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

function applyDeleteRange(doc, command) {
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

  const deleteRange = requireMethod(doc, 'deleteRange');
  const native = parseNativeResult(deleteRange(
    start.sectionIndex,
    start.paragraphIndex,
    start.offset,
    end.paragraphIndex,
    end.offset,
  ), 'deleteRange');
  const paragraphIndex = firstInteger(native.paraIdx, start.paragraphIndex);
  const offset = firstInteger(native.charOffset, start.offset);
  return structuralResult(
    command,
    native,
    publicParagraphTarget(start.sectionIndex, paragraphIndex, offset),
  );
}

function applyAppendParagraph(doc, command) {
  if (typeof command.text !== 'string') {
    throw structuralError('HWPX_TEXT_REQUIRED', 'appendParagraph requires a text string.');
  }
  const target = resolveHwpxTextTarget(command);
  const insertParagraph = requireMethod(doc, 'insertParagraph');
  const insertText = requireMethod(doc, 'insertText');
  const requestedParagraphIndex = target.paragraphIndex + 1;
  const paragraphNative = parseNativeResult(
    insertParagraph(target.sectionIndex, requestedParagraphIndex),
    'insertParagraph',
  );
  const paragraphIndex = firstInteger(paragraphNative.paraIdx, requestedParagraphIndex);
  const textNative = parseNativeResult(
    insertText(target.sectionIndex, paragraphIndex, 0, command.text),
    'insertText',
  );
  const offset = firstInteger(textNative.charOffset, [...command.text].length);
  const createdTarget = {
    kind: 'paragraph',
    sectionIndex: target.sectionIndex,
    paragraphIndex,
  };
  return structuralResult(
    command,
    { paragraph: paragraphNative, text: textNative },
    { ...createdTarget, offset },
    [createdTarget],
  );
}

function applyHwpxStructuralCommand(doc, command, _context = {}) {
  switch (command?.op) {
    case 'insertText':
      return applyInsertText(doc, command);
    case 'deleteRange':
      return applyDeleteRange(doc, command);
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
