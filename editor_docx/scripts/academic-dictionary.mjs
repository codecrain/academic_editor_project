import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ACADEMIC_DICTIONARY_SOURCE_FILENAME = 'tlooto-academic-en-US.dic';
// Collabora activates this reserved shared-wordbook name through its bundled
// ActiveDictionaries configuration. Arbitrary additional en-US filenames are
// discovered but remain inactive.
export const ACADEMIC_DICTIONARY_INSTALLED_FILENAME = 'standard.dic';
export const DEFAULT_ACADEMIC_DICTIONARY_SOURCE = fileURLToPath(
  new URL(`../assets/dictionaries/${ACADEMIC_DICTIONARY_SOURCE_FILENAME}`, import.meta.url),
);
export const DEFAULT_REVIEWED_ACADEMIC_TERMS_SOURCE = fileURLToPath(
  new URL('../assets/dictionaries/reviewed-academic-terms.txt', import.meta.url),
);

export const REQUIRED_ACADEMIC_WORDS = Object.freeze([
  'auditability',
  'benchmarked',
  'confounder',
  'endogeneity',
  'explainability',
  'finetuning',
  'interpretability',
  'operationalized',
  'pretraining',
  'replicability',
  'reproducibility',
  'scientometric',
  'underspecified',
]);

export const KNOWN_ACADEMIC_TYPOS = Object.freeze([
  'accountabilty',
  'auditabilty',
  'benchmakred',
  'bibliometirc',
  'confouder',
  'eligiblity',
  'endogenity',
  'epistmic',
  'explainabilty',
  'finetunig',
  'generalisabilty',
  'goverance',
  'heterogenity',
  'interpretabilty',
  'multmodal',
  'operationalizd',
  'preregisterd',
  'pretrainng',
  'replicabilty',
  'reproducable',
  'reproducibilty',
  'systmatic',
  'worklfow',
]);

export function parseAcademicDictionary(content) {
  const lines = String(content).replaceAll('\r\n', '\n').split('\n');
  if (lines[0] !== 'OOoUserDict1' || lines[1] !== 'lang: en-US' ||
      lines[2] !== 'type: positive' || lines[3] !== '---') {
    throw new Error('Academic dictionary must use the OOoUserDict1 en-US positive-wordbook header.');
  }

  const entries = lines.slice(4).filter((line) => line !== '');
  if (entries.length === 0) {
    throw new Error('Academic dictionary has no entries.');
  }
  if (entries.some((entry) => entry.trim() !== entry)) {
    throw new Error('Academic dictionary entries must not have surrounding whitespace.');
  }

  const uniqueEntries = new Set(entries);
  if (uniqueEntries.size !== entries.length) {
    throw new Error('Academic dictionary contains duplicate entries.');
  }

  for (const requiredWord of REQUIRED_ACADEMIC_WORDS) {
    if (!uniqueEntries.has(requiredWord)) {
      throw new Error(`Academic dictionary is missing required word: ${requiredWord}`);
    }
  }
  for (const typo of KNOWN_ACADEMIC_TYPOS) {
    if (uniqueEntries.has(typo)) {
      throw new Error(`Academic dictionary must not accept known typo: ${typo}`);
    }
  }

  return { entries, uniqueEntries };
}

export function parseReviewedAcademicTerms(content) {
  const entries = String(content)
    .replaceAll('\r\n', '\n')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'));
  if (entries.length === 0) {
    throw new Error('Reviewed academic term list has no entries.');
  }
  if (entries.some((entry) => entry.trim() !== entry || /\s/.test(entry))) {
    throw new Error('Reviewed academic terms must be one whitespace-free entry per line.');
  }
  if (new Set(entries).size !== entries.length) {
    throw new Error('Reviewed academic term list contains duplicate entries.');
  }
  return entries;
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function validateAcademicDictionaryFile(sourcePath = DEFAULT_ACADEMIC_DICTIONARY_SOURCE) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Academic dictionary is missing: ${sourcePath}`);
  }
  const parsed = parseAcademicDictionary(readFileSync(sourcePath, 'utf8'));
  const reviewedTerms = parseReviewedAcademicTerms(
    readFileSync(DEFAULT_REVIEWED_ACADEMIC_TERMS_SOURCE, 'utf8'),
  );
  for (const reviewedTerm of reviewedTerms) {
    if (!parsed.uniqueEntries.has(reviewedTerm)) {
      throw new Error(`Academic dictionary is missing reviewed term: ${reviewedTerm}`);
    }
  }
  return {
    sourcePath,
    count: parsed.entries.length,
    reviewedTermCount: reviewedTerms.length,
    sha256: sha256File(sourcePath),
  };
}

export function resolveSystemplateDictionaryPath(systemplateDir, installedPath) {
  const normalizedInstalledPath = path.resolve(installedPath);
  return path.join(
    systemplateDir,
    path.relative(path.parse(normalizedInstalledPath).root, normalizedInstalledPath),
  );
}

export function assertAcademicDictionarySynced({
  sourcePath = DEFAULT_ACADEMIC_DICTIONARY_SOURCE,
  officeDir = '/opt/collaboraoffice',
  systemplateDir,
}) {
  const source = validateAcademicDictionaryFile(sourcePath);
  const installedPath = path.join(
    officeDir,
    'share',
    'wordbook',
    ACADEMIC_DICTIONARY_INSTALLED_FILENAME,
  );
  const systemplatePath = resolveSystemplateDictionaryPath(systemplateDir, installedPath);

  for (const [label, targetPath] of [
    ['native office', installedPath],
    ['native systemplate', systemplatePath],
  ]) {
    if (!existsSync(targetPath)) {
      throw new Error(`Academic dictionary is missing from ${label}: ${targetPath}`);
    }
    if (sha256File(targetPath) !== source.sha256) {
      throw new Error(
        `Academic dictionary is stale in ${label}: ${targetPath}. ` +
        'Run the native editor deployment to synchronize it.',
      );
    }
  }

  return { ...source, installedPath, systemplatePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourcePath = process.argv[2] || DEFAULT_ACADEMIC_DICTIONARY_SOURCE;
  process.stdout.write(`${JSON.stringify(validateAcademicDictionaryFile(sourcePath))}\n`);
}
