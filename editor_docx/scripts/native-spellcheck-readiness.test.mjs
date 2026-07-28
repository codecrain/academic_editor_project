import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertNativeSpellcheckReadiness,
  inspectNativeSpellcheckReadiness,
} from './native-spellcheck-readiness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(__dirname, '..', 'engine');

test('native spell readiness finds all five full dictionaries and affix files', () => {
  const readiness = assertNativeSpellcheckReadiness({ officeRoot: engineRoot });
  assert.deepEqual(
    readiness.dictionaries.map((entry) => entry.locale).sort(),
    ['de-DE', 'en-GB', 'en-US', 'es-ES', 'fr-FR'],
  );
});

test('native spell readiness fails closed when the office engine is absent', () => {
  const readiness = inspectNativeSpellcheckReadiness({
    officeRoot: path.join(engineRoot, 'missing-office-root'),
  });
  assert.equal(readiness.ok, false);
  assert.equal(readiness.results.length, 5);
  assert.ok(readiness.results.every((result) => !result.ok));
});
