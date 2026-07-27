import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { validateHwpxCommands } from '../../../editor_hwpx/scripts/hwpx-command-catalog.mjs';

const root = path.resolve('evaluation/hwpx-public-sector-v1');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const attachmentPayload = JSON.parse(await fs.readFile(path.join(root, 'attachments.json'), 'utf8'));
const scenarios = (await fs.readFile(path.join(root, 'scenarios.jsonl'), 'utf8'))
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line));
const attachmentById = new Map(attachmentPayload.attachments.map((attachment) => [attachment.id, attachment]));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

assert.equal(manifest.version, '1.0.0');
assert.equal(scenarios.length, 100);
assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, 100);
assert.equal(scenarios.filter((scenario) => scenario.mode === 'edit').length, 90);
assert.equal(scenarios.filter((scenario) => scenario.mode === 'generation').length, 10);
assert.equal(attachmentPayload.attachmentCount, attachmentPayload.attachments.length);
assert.equal(attachmentPayload.attachments.length, 13);

for (const attachment of attachmentPayload.attachments) {
  const bytes = await fs.readFile(path.join(root, attachment.path));
  assert.equal(bytes.length, attachment.byteLength, `${attachment.id} byte length`);
  assert.equal(sha256(bytes), attachment.sha256, `${attachment.id} SHA-256`);
  assert.ok(attachment.origin?.kind);
  assert.ok(attachment.license);
}

for (const [index, scenario] of scenarios.entries()) {
  assert.equal(scenario.id, `HWPX-PS-${String(index + 1).padStart(3, '0')}`);
  assert.equal(scenario.difficulty, 'expert');
  assert.ok(scenario.question.length >= 100 && scenario.question.length <= 1000);
  assert.ok(scenario.attachments.includes(scenario.target.attachmentId));
  assert.ok(scenario.attachments.every((attachmentId) => attachmentById.has(attachmentId)));
  const formats = new Set(scenario.attachments.map((attachmentId) => (
    path.extname(attachmentById.get(attachmentId).path).toLowerCase()
  )));
  assert.ok(formats.has('.hwpx'));
  assert.ok(formats.size >= 4);
  assert.ok(scenario.sourceFacts.length >= 4);
  assert.ok(scenario.sourceFacts.every((fact) => (
    scenario.attachments.includes(fact.attachmentId)
    && String(fact.locator ?? '').trim()
    && fact.fact !== undefined
  )));
  validateHwpxCommands(scenario.oracle.commandTemplates);
  assert.ok(scenario.oracle.expectedTargets.length >= 3);

  const gold = JSON.parse(await fs.readFile(path.join(root, 'gold', `${scenario.id}.json`), 'utf8'));
  assert.equal(gold.scenarioId, scenario.id);
  assert.deepEqual(gold.answerContract.oracle, scenario.oracle);
  assert.deepEqual(gold.answerContract.sourceFacts, scenario.sourceFacts);
  assert.equal(gold.answerContract.adjudication.passThreshold, 85);
  assert.equal(gold.answerContract.adjudication.hardFailureOverridesScore, true);
}

console.log(JSON.stringify({
  ok: true,
  scenarios: scenarios.length,
  edit: scenarios.filter((scenario) => scenario.mode === 'edit').length,
  generation: scenarios.filter((scenario) => scenario.mode === 'generation').length,
  attachments: attachmentPayload.attachments.length,
  minQuestionLength: Math.min(...scenarios.map((scenario) => scenario.question.length)),
  maxQuestionLength: Math.max(...scenarios.map((scenario) => scenario.question.length)),
}));
