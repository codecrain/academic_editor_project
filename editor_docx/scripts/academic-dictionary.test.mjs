import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ACADEMIC_DICTIONARY_INSTALLED_FILENAME,
  DEFAULT_ACADEMIC_DICTIONARY_SOURCE,
  DEFAULT_REVIEWED_ACADEMIC_TERMS_SOURCE,
  KNOWN_ACADEMIC_TYPOS,
  REQUIRED_ACADEMIC_WORDS,
  assertAcademicDictionarySynced,
  parseAcademicDictionary,
  parseReviewedAcademicTerms,
  resolveSystemplateDictionaryPath,
  validateAcademicDictionaryFile,
} from './academic-dictionary.mjs';

test('repository academic wordbook is bounded and rejects the typo regression set', () => {
  const validation = validateAcademicDictionaryFile();
  const parsed = parseAcademicDictionary(
    readFileSync(DEFAULT_ACADEMIC_DICTIONARY_SOURCE, 'utf8'),
  );
  const reviewedTerms = parseReviewedAcademicTerms(
    readFileSync(DEFAULT_REVIEWED_ACADEMIC_TERMS_SOURCE, 'utf8'),
  );

  assert.equal(validation.count, 3_490);
  assert.equal(reviewedTerms.length, 618);
  assert.equal(validation.reviewedTermCount, reviewedTerms.length);
  assert.ok(validation.count < 5_000, 'wordbook must stay a bounded overlay');
  assert.ok(reviewedTerms.length >= 400, 'reviewed academic coverage unexpectedly shrank');
  for (const word of REQUIRED_ACADEMIC_WORDS) {
    assert.equal(parsed.uniqueEntries.has(word), true, word);
  }
  for (const typo of KNOWN_ACADEMIC_TYPOS) {
    assert.equal(parsed.uniqueEntries.has(typo), false, typo);
  }
  for (const term of ['doi.org', 'Crossref', 'ORCID', 'PRISMA', 'meta-analysis', 'ChatGPT']) {
    assert.equal(parsed.uniqueEntries.has(term), true, term);
  }
});

test('parser rejects an invalid header and duplicate entries', () => {
  assert.throws(
    () => parseAcademicDictionary('word\n'),
    /OOoUserDict1/,
  );
  assert.throws(
    () => parseAcademicDictionary(
      'OOoUserDict1\nlang: en-US\ntype: positive\n---\nauditability\nauditability\n',
    ),
    /duplicate/,
  );
  assert.throws(
    () => parseReviewedAcademicTerms('doi\ndoi\n'),
    /duplicate/,
  );
  assert.throws(
    () => parseReviewedAcademicTerms('systematic review\n'),
    /whitespace-free/,
  );
});

test('sync assertion compares repository, office, and systemplate copies', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'academic-dictionary-'));
  try {
    const officeDir = path.join(root, 'office');
    const systemplateDir = path.join(root, 'systemplate');
    const installedPath = path.join(
      officeDir,
      'share',
      'wordbook',
      ACADEMIC_DICTIONARY_INSTALLED_FILENAME,
    );
    const systemplatePath = resolveSystemplateDictionaryPath(systemplateDir, installedPath);
    mkdirSync(path.dirname(installedPath), { recursive: true });
    mkdirSync(path.dirname(systemplatePath), { recursive: true });
    copyFileSync(DEFAULT_ACADEMIC_DICTIONARY_SOURCE, installedPath);
    copyFileSync(DEFAULT_ACADEMIC_DICTIONARY_SOURCE, systemplatePath);

    const synced = assertAcademicDictionarySynced({
      officeDir,
      sourcePath: DEFAULT_ACADEMIC_DICTIONARY_SOURCE,
      systemplateDir,
    });
    assert.equal(synced.count, 3_490);

    writeFileSync(systemplatePath, 'stale', 'utf8');
    assert.throws(
      () => assertAcademicDictionarySynced({
        officeDir,
        sourcePath: DEFAULT_ACADEMIC_DICTIONARY_SOURCE,
        systemplateDir,
      }),
      /stale in native systemplate/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
