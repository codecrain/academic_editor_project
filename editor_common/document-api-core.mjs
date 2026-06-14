export const REQUIRED_SESSION_METHODS = Object.freeze([
  'readJson',
  'analyze',
  'targetMap',
  'inspectTarget',
  'resolveText',
  'fitText',
  'styleFingerprint',
  'objectInventory',
  'apply',
  'qualityCheck',
  'save',
]);

export const CANONICAL_COMMANDS = Object.freeze([
  'text.replaceParagraph',
  'text.replace',
  'table.writeCell',
  'table.writeCells',
  'table.writeRichCell',
  'table.applyCellStyle',
  'style.applyText',
  'paragraph.applyStyle',
  'style.clone',
  'list.writeBullets',
  'list.applyNumbering',
  'layout.fitText',
  'image.replace',
  'image.generateAndReplace',
  'object.replaceTextBoxText',
  'object.deleteTextBoxByText',
]);

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashString(text) {
  let hash = 2166136261;
  for (const char of String(text ?? '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function commandName(command = {}) {
  if (command.op) {
    return command.op;
  }
  if (command.command) {
    return command.command;
  }
  if (command.group && command.action) {
    return `${command.group}.${command.action}`;
  }
  return command.type ?? command.name ?? '';
}

export function commandKey(command = {}) {
  return String(commandName(command)).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function commandId(command = {}, fallbackIndex = 0) {
  return command.commandId ?? command.opId ?? command.id ?? `command-${fallbackIndex + 1}`;
}

export function commandText(command = {}) {
  return command.text ?? command.newText ?? command.value ?? command.content?.text ?? '';
}

export function commandLocation(command = {}) {
  return command.location ?? command.target ?? command.to ?? {};
}

export function normalizeCellReference(cell = {}) {
  return {
    number: cell.number ?? cell.cellIndex ?? cell.index,
    cellIndex: cell.cellIndex ?? cell.index ?? cell.number,
    row: cell.row,
    column: cell.column ?? cell.col,
    col: cell.col ?? cell.column,
  };
}

export function normalizeParagraphLocation(location = {}) {
  const paragraph = location.paragraph ?? location.native ?? location;
  return {
    section: paragraph.section ?? 0,
    paragraph: paragraph.paragraph ?? paragraph.para ?? paragraph.number ?? paragraph.index,
    para: paragraph.para ?? paragraph.paragraph ?? paragraph.number ?? paragraph.index,
    number: paragraph.number ?? paragraph.paragraph ?? paragraph.para ?? paragraph.index,
  };
}

export function buildListText(items, options = {}) {
  const marker = options.marker ?? '-';
  const values = Array.isArray(items) ? items : String(items ?? '').split('\n').filter(Boolean);
  const startAt = Number(options.startAt ?? options.start ?? 1);
  const suffix = options.suffix ?? '.';
  return values.map((item, index) => {
    const prefix = options.numbered ? `${Number.isFinite(startAt) ? startAt + index : index + 1}${suffix}` : marker;
    return `${prefix} ${String(item).trim()}`;
  }).join('\n');
}

export function wrapLine(line, maxCharsPerLine) {
  const source = String(line ?? '');
  if (!maxCharsPerLine || source.length <= maxCharsPerLine) {
    return [source];
  }
  const lines = [];
  let current = '';
  for (const token of source.split(/(\s+)/)) {
    if (!token) {
      continue;
    }
    if ((current + token).length <= maxCharsPerLine) {
      current += token;
      continue;
    }
    if (current.trim()) {
      lines.push(current.trimEnd());
      current = '';
    }
    if (token.trim().length > maxCharsPerLine) {
      for (let i = 0; i < token.length; i += maxCharsPerLine) {
        lines.push(token.slice(i, i + maxCharsPerLine));
      }
    } else {
      current = token.trimStart();
    }
  }
  if (current.trim()) {
    lines.push(current.trimEnd());
  }
  return lines.length ? lines : [''];
}

export function fitTextToCapacity(text, capacity, options = {}) {
  const source = String(text ?? '');
  const maxCharsPerLine = options.maxCharsPerLine ?? capacity?.maxCharsPerLine;
  const maxLines = options.maxLines ?? capacity?.maxLines;
  if (!maxCharsPerLine && !maxLines && !capacity?.recommendedChars) {
    return { text: source, changed: false, truncated: false, capacity };
  }

  const lines = source.split('\n').flatMap((line) => wrapLine(line, maxCharsPerLine));
  let nextLines = lines;
  let truncated = false;
  if (options.truncate !== false && maxLines && lines.length > maxLines) {
    nextLines = lines.slice(0, maxLines);
    truncated = true;
    if (options.ellipsis !== false && nextLines.length) {
      const last = nextLines[nextLines.length - 1];
      const limit = maxCharsPerLine ? Math.max(1, maxCharsPerLine - 3) : last.length;
      nextLines[nextLines.length - 1] = `${last.slice(0, limit)}...`;
    }
  }

  const nextText = nextLines.join('\n');
  return {
    text: nextText,
    changed: nextText !== source,
    truncated,
    originalLength: source.length,
    fittedLength: nextText.length,
    lineCount: nextLines.length,
    capacity,
  };
}

export function inspectSessionSurface(session) {
  const missingMethods = REQUIRED_SESSION_METHODS.filter((method) => typeof session?.[method] !== 'function');
  return {
    ok: missingMethods.length === 0,
    missingMethods,
  };
}

export function validateReadJsonShape(json) {
  const issues = [];
  if (!json || typeof json !== 'object') {
    issues.push('readJson result must be an object');
    return { ok: false, issues };
  }
  if (!json.sourceFormat) {
    issues.push('sourceFormat is required');
  }
  if (!Array.isArray(json.blocks)) {
    issues.push('blocks must be an array');
  }
  if (!Array.isArray(json.tables)) {
    issues.push('tables must be an array');
  }
  if (!json.editableTargets || !Array.isArray(json.editableTargets.paragraphs) || !Array.isArray(json.editableTargets.cells)) {
    issues.push('editableTargets.paragraphs and editableTargets.cells are required arrays');
  }
  if (!json.objectGraph || !Array.isArray(json.objectGraph.images)) {
    issues.push('objectGraph.images is required');
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}

export function firstEditableCellLocation(json) {
  return json?.editableTargets?.cells?.[0]?.location ?? json?.tables?.[0]?.cells?.[0]?.location ?? null;
}

export function firstEditableParagraphLocation(json) {
  const editableLocation = json?.editableTargets?.paragraphs?.[0]?.location;
  if (editableLocation) {
    return editableLocation;
  }
  const native = json?.blocks?.[0]?.native;
  if (!native) {
    return null;
  }
  return {
    paragraph: {
      section: native.section ?? 0,
      number: native.paragraph ?? native.para ?? 0,
    },
  };
}

export function assertQualityReportShape(report) {
  const issues = [];
  if (!report || typeof report !== 'object') {
    return { ok: false, issues: ['quality report must be an object'] };
  }
  if (typeof report.ok !== 'boolean') {
    issues.push('quality report requires boolean ok');
  }
  if (typeof report.paragraphCount !== 'number') {
    issues.push('quality report requires numeric paragraphCount');
  }
  if (typeof report.tableCount !== 'number') {
    issues.push('quality report requires numeric tableCount');
  }
  if (!report.objectSummary || typeof report.objectSummary.imageCount !== 'number') {
    issues.push('quality report requires objectSummary.imageCount');
  }
  if (!Array.isArray(report.issues)) {
    issues.push('quality report requires issues array');
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}
