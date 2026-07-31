const DIRECT_IDENTIFIER_PATTERNS = Object.freeze([
  {
    kind: 'email',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  },
  {
    kind: 'residentRegistrationNumber',
    pattern: /\b\d{6}-?[1-8]\d{6}\b/gu,
  },
  {
    kind: 'phone',
    pattern: /(?<!\d)(?:\+?82[- ]?)?0\d{1,2}[- )]?\d{3,4}[- ]?\d{4}(?!\d)/gu,
  },
]);

function collectTextValues(value, target) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.text === 'string') target.push(value.text);
  for (const entry of Array.isArray(value) ? value : Object.values(value)) {
    if (entry && typeof entry === 'object') collectTextValues(entry, target);
  }
}

function visibleDocumentText(documentJson = {}) {
  const text = [];
  collectTextValues(documentJson.sections ?? [], text);
  collectTextValues(documentJson.tables ?? [], text);
  return text.join('\n');
}

function directIdentifierSet(text, definition) {
  const values = new Set();
  for (const match of String(text ?? '').matchAll(definition.pattern)) {
    values.add(match[0]);
  }
  return values;
}

function findIntroducedDirectIdentifiers(baselineText, currentText) {
  const introduced = [];
  for (const definition of DIRECT_IDENTIFIER_PATTERNS) {
    const baseline = directIdentifierSet(baselineText, definition);
    for (const value of directIdentifierSet(currentText, definition)) {
      if (!baseline.has(value)) introduced.push({ kind: definition.kind, value });
    }
  }
  return introduced.sort((left, right) => (
    left.kind.localeCompare(right.kind) || left.value.localeCompare(right.value)
  ));
}

export {
  DIRECT_IDENTIFIER_PATTERNS,
  findIntroducedDirectIdentifiers,
  visibleDocumentText,
};
