import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const dictionaries = [
  {
    locale: 'en-US',
    directory: 'en',
    base: 'en_US',
    encoding: 'utf-8',
    minimumEntries: 49_000,
    root: 'color',
    derived: 'colors',
    typo: 'colro',
  },
  {
    locale: 'en-GB',
    directory: 'en',
    base: 'en_GB',
    encoding: 'utf-8',
    minimumEntries: 97_000,
    root: 'colour',
    derived: 'colours',
    typo: 'colur',
  },
  {
    locale: 'es-ES',
    directory: 'es',
    base: 'es_ES',
    encoding: 'utf-8',
    minimumEntries: 58_000,
    root: 'investigación',
    derived: 'investigaciones',
    typo: 'investigacíon',
  },
  {
    locale: 'fr-FR',
    directory: 'fr_FR',
    base: 'fr',
    encoding: 'utf-8',
    minimumEntries: 84_000,
    root: 'méthode',
    derived: 'méthodes',
    typo: 'méthdoe',
  },
  {
    locale: 'de-DE',
    directory: 'de',
    base: 'de_DE_frami',
    encoding: 'latin1',
    minimumEntries: 258_000,
    root: 'Wissenschaft',
    derived: 'Wissenschaften',
    typo: 'Wissenschafft',
  },
];

function dictionaryPath(spec, extension) {
  return path.join(
    repoRoot,
    'editor_docx',
    'engine',
    'dictionaries',
    spec.directory,
    `${spec.base}.${extension}`,
  );
}

function readDictionaryFile(filePath, encoding) {
  const bytes = readFileSync(filePath);
  return new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '').replace(/\r/g, '');
}

function parseFlags(rawFlags, mode) {
  if (!rawFlags) return [];
  if (mode === 'num') return rawFlags.split(',');
  const characters = Array.from(rawFlags);
  if (mode === 'long') {
    assert.equal(characters.length % 2, 0, `invalid long flag sequence: ${rawFlags}`);
    return Array.from({ length: characters.length / 2 }, (_, index) =>
      characters.slice(index * 2, index * 2 + 2).join(''),
    );
  }
  return characters;
}

function parseAffixRules(text) {
  const flagMode = text.match(/^FLAG\s+(\S+)/m)?.[1] ?? 'short';
  const rules = new Map();
  const crossProduct = new Map();

  for (const line of text.split('\n')) {
    const header = line.match(/^(PFX|SFX)\s+(\S+)\s+([YN])\s+(\d+)\s*$/);
    if (header) {
      crossProduct.set(`${header[1]}:${header[2]}`, header[3] === 'Y');
      continue;
    }

    const match = line.match(/^(PFX|SFX)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
    if (!match) continue;
    const [, kind, flag, strip, rawAddition, condition] = match;
    const addition = rawAddition.split('/')[0].replace(/^0$/, '');
    const key = `${kind}:${flag}`;
    const entries = rules.get(key) ?? [];
    entries.push({ kind, flag, strip: strip.replace(/^0$/, ''), addition, condition });
    rules.set(key, entries);
  }

  return { flagMode, rules, crossProduct };
}

function parseLemma(text, target, flagMode) {
  const lines = text.split('\n').filter((line) => line && !line.startsWith('#'));
  const declaredCount = Number.parseInt(lines[0], 10);
  const entries = lines.slice(1);
  const words = new Set();
  let targetToken = null;
  for (const entry of entries) {
    const token = entry.split(/[\t ]/, 1)[0];
    const word = token.split('/', 1)[0];
    words.add(word);
    if (word === target) targetToken = token;
  }
  assert.ok(targetToken, `dictionary lemma missing: ${target}`);
  const slash = targetToken.indexOf('/');
  const rawFlags = slash < 0 ? '' : targetToken.slice(slash + 1);
  return { declaredCount, entryCount: entries.length, flags: parseFlags(rawFlags, flagMode), words };
}

function applyRule(word, rule) {
  const condition = rule.condition === '.' ? '.' : rule.condition;
  if (rule.kind === 'SFX') {
    if (!new RegExp(`${condition}$`, 'u').test(word)) return null;
    if (rule.strip && !word.endsWith(rule.strip)) return null;
    return `${word.slice(0, word.length - rule.strip.length)}${rule.addition}`;
  }

  if (!new RegExp(`^${condition}`, 'u').test(word)) return null;
  if (rule.strip && !word.startsWith(rule.strip)) return null;
  return `${rule.addition}${word.slice(rule.strip.length)}`;
}

function generateAffixedForms(root, flags, affix) {
  const forms = new Set([root]);
  const prefixForms = [];
  const suffixForms = [];

  for (const flag of flags) {
    for (const kind of ['PFX', 'SFX']) {
      for (const rule of affix.rules.get(`${kind}:${flag}`) ?? []) {
        const form = applyRule(root, rule);
        if (!form) continue;
        forms.add(form);
        (kind === 'PFX' ? prefixForms : suffixForms).push({ form, flag });
      }
    }
  }

  // Hunspell permits a prefix/suffix cross-product only when both headers opt in.
  for (const prefix of prefixForms) {
    if (!affix.crossProduct.get(`PFX:${prefix.flag}`)) continue;
    for (const suffixFlag of flags) {
      if (!affix.crossProduct.get(`SFX:${suffixFlag}`)) continue;
      for (const rule of affix.rules.get(`SFX:${suffixFlag}`) ?? []) {
        const form = applyRule(prefix.form, rule);
        if (form) forms.add(form);
      }
    }
  }

  return forms;
}

for (const spec of dictionaries) {
  test(`${spec.locale} uses a registered, non-trivial Hunspell dictionary and affix rules`, () => {
    const affText = readDictionaryFile(dictionaryPath(spec, 'aff'), spec.encoding);
    const dicText = readDictionaryFile(dictionaryPath(spec, 'dic'), spec.encoding);
    const registry = readDictionaryFile(
      path.join(repoRoot, 'editor_docx', 'engine', 'dictionaries', spec.directory, 'dictionaries.xcu'),
      'utf-8',
    );

    assert.match(affText, /^SET\s+\S+/m);
    assert.match(registry, new RegExp(`%origin%/${spec.base}\\.aff %origin%/${spec.base}\\.dic`));
    assert.match(registry, new RegExp(`\\b${spec.locale}\\b`));

    const affix = parseAffixRules(affText);
    const lemma = parseLemma(dicText, spec.root, affix.flagMode);
    assert.ok(lemma.declaredCount >= spec.minimumEntries, `${spec.locale} dictionary header is too small`);
    assert.ok(lemma.entryCount >= spec.minimumEntries, `${spec.locale} dictionary body is too small`);
    assert.ok(
      Math.abs(lemma.declaredCount - lemma.entryCount) <= 100,
      `${spec.locale} dictionary header/body count drift is suspicious`,
    );

    const forms = generateAffixedForms(spec.root, lemma.flags, affix);
    assert.ok(forms.has(spec.root), `${spec.locale} root word was rejected`);
    assert.ok(forms.has(spec.derived), `${spec.locale} affix form was not generated: ${spec.derived}`);
    assert.ok(
      !lemma.words.has(spec.typo),
      `${spec.locale} deliberate typo exists in the base dictionary: ${spec.typo}`,
    );
    assert.ok(
      !forms.has(spec.typo),
      `${spec.locale} deliberate typo was generated from ${spec.root}: ${spec.typo}`,
    );
  });
}

test('browser exposes only the five verified spell-check locales', () => {
  const docstate = readFileSync(path.join(repoRoot, 'editor_docx', 'browser', 'src', 'docstate.ts'), 'utf8');
  const mapSource = readFileSync(path.join(repoRoot, 'editor_docx', 'browser', 'src', 'map', 'Map.js'), 'utf8');
  const menubar = readFileSync(path.join(repoRoot, 'editor_docx', 'browser', 'src', 'control', 'Control.Menubar.ts'), 'utf8');
  const notebookbar = readFileSync(path.join(repoRoot, 'editor_docx', 'browser', 'src', 'control', 'Control.NotebookbarWriter.js'), 'utf8');
  const locales = docstate.match(/favouriteLanguages:\s*\[([^\]]+)\]/)?.[1].match(/'[^']+'/g)?.map((item) => item.slice(1, -1));

  assert.deepEqual(locales, ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE']);
  assert.match(mapSource, /app\.favouriteLanguages\.indexOf\(code\) < 0/);
  assert.match(mapSource, /commandvalues command=\.uno:LanguageStatus/);
  assert.match(menubar, /\.uno:SpellOnline/);
  assert.match(notebookbar, /'command': '\.uno:SpellOnline'/);
});
