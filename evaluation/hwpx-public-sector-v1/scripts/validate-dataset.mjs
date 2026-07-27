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
assert.ok(manifest.sourceFormats.length >= 9);
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
    new RegExp(`^${scenario.id}-F\\d{2}$`).test(fact.factId)
    && scenario.attachments.includes(fact.attachmentId)
    && String(fact.locator ?? '').trim()
    && fact.fact !== undefined
  )));
  validateHwpxCommands(scenario.oracle.commandTemplates);
  assert.ok(scenario.oracle.expectedTargets.length >= 3);
  assert.equal(scenario.factUsage.length, scenario.sourceFacts.length);
  const expectedTargetById = new Map(
    scenario.oracle.expectedTargets.map(target => [target.verificationId, target]),
  );
  assert.equal(expectedTargetById.size, scenario.oracle.expectedTargets.length);
  for (const sourceFact of scenario.sourceFacts) {
    const usages = scenario.factUsage.filter(usage => usage.factId === sourceFact.factId);
    assert.equal(usages.length, 1, `${scenario.id} ${sourceFact.factId} usage count`);
    const [usage] = usages;
    assert.match(usage.renderedText, new RegExp(escapeRegExp(sourceFact.locator)));
    assert.match(usage.renderedText, new RegExp(escapeRegExp(String(sourceFact.fact))));
    const expectedTarget = expectedTargetById.get(usage.expectedTargetId);
    assert.ok(expectedTarget, `${scenario.id} ${sourceFact.factId} expected target`);
    assert.ok(expectedTarget.factIds.includes(sourceFact.factId));
    assert.equal(expectedTarget.text, usage.renderedText);
  }

  const gold = JSON.parse(await fs.readFile(path.join(root, 'gold', `${scenario.id}.json`), 'utf8'));
  assert.equal(gold.scenarioId, scenario.id);
  assert.deepEqual(gold.answerContract.oracle, scenario.oracle);
  assert.deepEqual(gold.answerContract.sourceFacts, scenario.sourceFacts);
  assert.deepEqual(gold.answerContract.factUsage, scenario.factUsage);
  assert.equal(gold.answerContract.adjudication.passThreshold, 85);
  assert.equal(gold.answerContract.adjudication.hardFailureOverridesScore, true);
}

for (const scenario of scenarios.slice(60, 70)) {
  const refFact = scenario.sourceFacts.find(fact => fact.locator === '기본현황(경합형태별현황)!#REF!');
  assert.equal(refFact?.fact, '#REF! 오류 68개; 대표 셀 J7, AA7', scenario.id);
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
