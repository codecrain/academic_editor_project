import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const REQUIRED_NATIVE_SPELL_DICTIONARIES = Object.freeze([
  { locale: 'en-US', dictionary: 'en_US.dic', affix: 'en_US.aff', minimumEntries: 49_000 },
  { locale: 'en-GB', dictionary: 'en_GB.dic', affix: 'en_GB.aff', minimumEntries: 97_000 },
  { locale: 'es-ES', dictionary: 'es_ES.dic', affix: 'es_ES.aff', minimumEntries: 58_000 },
  { locale: 'fr-FR', dictionary: 'fr.dic', affix: 'fr.aff', minimumEntries: 84_000 },
  { locale: 'de-DE', dictionary: 'de_DE_frami.dic', affix: 'de_DE_frami.aff', minimumEntries: 258_000 },
]);

function collectFiles(root) {
  const filesByName = new Map();
  const pending = [root];

  while (pending.length) {
    const directory = pending.pop();
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (entry.isFile()) {
        const matches = filesByName.get(entry.name) ?? [];
        matches.push(absolute);
        filesByName.set(entry.name, matches);
      }
    }
  }

  return filesByName;
}

function declaredEntryCount(dictionaryPath) {
  const firstLine = readFileSync(dictionaryPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/, 1)[0]
    .trim();
  return Number.parseInt(firstLine, 10);
}

export function inspectNativeSpellcheckReadiness({ officeRoot = '/opt/collaboraoffice' } = {}) {
  if (!existsSync(officeRoot)) {
    const results = REQUIRED_NATIVE_SPELL_DICTIONARIES.map((spec) => ({
      ok: false,
      label: `spell dictionary ${spec.locale}`,
      detail: `office root missing: ${officeRoot}`,
    }));
    return { ok: false, results, dictionaries: [] };
  }

  const filesByName = collectFiles(officeRoot);
  const dictionaries = [];
  const results = REQUIRED_NATIVE_SPELL_DICTIONARIES.map((spec) => {
    const candidates = filesByName.get(spec.dictionary) ?? [];
    const match = candidates
      .map((dictionaryPath) => ({
        dictionaryPath,
        affixPath: path.join(path.dirname(dictionaryPath), spec.affix),
      }))
      .find((candidate) => existsSync(candidate.affixPath));

    if (!match) {
      return {
        ok: false,
        label: `spell dictionary ${spec.locale}`,
        detail: `${spec.dictionary} + ${spec.affix} not found`,
      };
    }

    const entries = declaredEntryCount(match.dictionaryPath);
    const ok = Number.isFinite(entries) && entries >= spec.minimumEntries;
    if (ok) {
      dictionaries.push({
        locale: spec.locale,
        entries,
        dictionary: path.relative(officeRoot, match.dictionaryPath).replaceAll('\\', '/'),
        affix: path.relative(officeRoot, match.affixPath).replaceAll('\\', '/'),
      });
    }
    return {
      ok,
      label: `spell dictionary ${spec.locale}`,
      detail: `${entries || 0} entries at ${match.dictionaryPath}`,
    };
  });

  return { ok: results.every((result) => result.ok), results, dictionaries };
}

export function assertNativeSpellcheckReadiness(options = {}) {
  const readiness = inspectNativeSpellcheckReadiness(options);
  if (!readiness.ok) {
    const failures = readiness.results
      .filter((result) => !result.ok)
      .map((result) => `${result.label}: ${result.detail}`)
      .join('; ');
    throw new Error(`Native spell-check readiness failed: ${failures}`);
  }
  return readiness;
}
