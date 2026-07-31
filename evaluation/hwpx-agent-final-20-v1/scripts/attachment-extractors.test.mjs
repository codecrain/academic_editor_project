import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  extractAttachmentEvidence,
  verifyExtractedSourceFact,
} from './attachment-extractors.mjs';

const datasetRoot = path.resolve('evaluation/hwpx-agent-final-20-v1');

async function loadDataset() {
  const attachmentPayload = JSON.parse(
    await fs.readFile(path.join(datasetRoot, 'attachments.json'), 'utf8'),
  );
  const scenarios = (await fs.readFile(path.join(datasetRoot, 'scenarios.jsonl'), 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  return {
    attachments: attachmentPayload.attachments,
    scenarios,
  };
}

test('real heterogeneous attachments expose bounded extracted evidence', async () => {
  const { attachments } = await loadDataset();
  const formats = new Set();

  for (const attachment of attachments) {
    const bytes = await fs.readFile(path.join(datasetRoot, attachment.path));
    const evidence = await extractAttachmentEvidence(attachment, bytes, {
      maxTextChars: 120_000,
    });
    formats.add(evidence.format);
    assert.equal(evidence.attachmentId, attachment.id);
    assert.ok(evidence.byteLength > 0);
    assert.ok(evidence.summary.length > 0);
    assert.ok(evidence.text.length <= 120_000);
    assert.equal(evidence.truncated, evidence.totalTextChars > evidence.text.length);
  }

  assert.deepEqual([...formats].sort(), [
    'csv',
    'docx',
    'hwp',
    'hwpx',
    'jpeg',
    'pdf',
    'png',
    'txt',
    'xlsx',
  ]);
});

test('every hidden source fact is recoverable from the actual attachment bytes', async () => {
  const { attachments, scenarios } = await loadDataset();
  const attachmentById = new Map(attachments.map(attachment => [attachment.id, attachment]));
  const uniqueFacts = new Map();
  for (const scenario of scenarios) {
    for (const fact of scenario.sourceFacts) {
      uniqueFacts.set(JSON.stringify(fact), fact);
    }
  }
  const evidenceByAttachment = new Map();

  for (const fact of uniqueFacts.values()) {
    const attachment = attachmentById.get(fact.attachmentId);
    if (!evidenceByAttachment.has(attachment.id)) {
      const bytes = await fs.readFile(path.join(datasetRoot, attachment.path));
      evidenceByAttachment.set(
        attachment.id,
        await extractAttachmentEvidence(attachment, bytes, { maxTextChars: 200_000 }),
      );
    }
    const verification = verifyExtractedSourceFact(
      fact,
      evidenceByAttachment.get(attachment.id),
      attachment,
    );
    assert.equal(verification.ok, true, `${fact.attachmentId} ${fact.locator}: ${verification.reason}`);
  }
});

test('XLSX extraction preserves formulas separately from displayed values', async () => {
  const { attachments } = await loadDataset();
  const attachment = attachments.find(item => item.id === 'source-mpva-veterans-xlsx');
  const bytes = await fs.readFile(path.join(datasetRoot, attachment.path));
  const evidence = await extractAttachmentEvidence(attachment, bytes);

  assert.equal(evidence.cells['참전(총괄)!B8'].value, 184580);
  assert.ok(Object.values(evidence.cells).some(cell => typeof cell.formula === 'string'));
});

test('every source fact is explicitly grounded in a reopen-verifiable result target and gold oracle', async () => {
  const { scenarios } = await loadDataset();

  for (const scenario of scenarios) {
    const expectedTargetById = new Map(
      scenario.oracle.expectedTargets.map(target => [target.verificationId, target]),
    );
    assert.ok(Array.isArray(scenario.factUsage), `${scenario.id} factUsage`);
    assert.equal(
      scenario.factUsage.length,
      scenario.sourceFacts.length,
      `${scenario.id} must use every source fact exactly once`,
    );

    for (const sourceFact of scenario.sourceFacts) {
      assert.equal(typeof sourceFact.factId, 'string', `${scenario.id} factId`);
      assert.match(sourceFact.factId, new RegExp(`^${scenario.id}-F\\d{2}$`));
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

    const gold = JSON.parse(
      await fs.readFile(path.join(datasetRoot, 'gold', `${scenario.id}.json`), 'utf8'),
    );
    assert.deepEqual(gold.answerContract.factUsage, scenario.factUsage);
    assert.deepEqual(gold.answerContract.sourceFacts, scenario.sourceFacts);
    assert.deepEqual(gold.answerContract.oracle, scenario.oracle);
  }
});

test('selected formula-error trap cases ground the actual beneficiaries workbook REF error count and representative cells', async () => {
  const { attachments, scenarios } = await loadDataset();
  const attachment = attachments.find(item => item.id === 'source-mpva-beneficiaries-xlsx');
  const bytes = await fs.readFile(path.join(datasetRoot, attachment.path));
  const evidence = await extractAttachmentEvidence(attachment, bytes);
  const refCells = Object.entries(evidence.cells)
    .filter(([, cell]) => cell.value === '#REF!' || cell.formula === '#REF!')
    .map(([locator]) => locator);

  assert.equal(refCells.length, 68);
  assert.ok(refCells.includes('기본현황(경합형태별현황)!J7'));
  assert.ok(refCells.includes('기본현황(경합형태별현황)!AA7'));

  for (const scenario of scenarios.filter(item => item.tags.includes('formula-error-trap'))) {
    const refFact = scenario.sourceFacts.find(fact => fact.locator === '기본현황(경합형태별현황)!#REF!');
    assert.ok(refFact, `${scenario.id} REF source fact`);
    assert.equal(refFact.fact, '#REF! 오류 68개; 대표 셀 J7, AA7', scenario.id);
    const usage = scenario.factUsage.find(item => item.factId === refFact.factId);
    const expectedTarget = scenario.oracle.expectedTargets.find(
      target => target.verificationId === usage.expectedTargetId,
    );
    assert.match(expectedTarget.text, /#REF! 오류 68개; 대표 셀 J7, AA7/);
  }
});

test('page growth allowance stays strict except at the briefing fixture page-boundary target', async () => {
  const { scenarios } = await loadDataset();
  for (const scenario of scenarios.filter(item => item.mode === 'edit')) {
    const insertion = scenario.oracle.commandTemplates.find(
      command => command.op === 'text.insertAfterParagraph',
    );
    assert.ok(insertion, `${scenario.id} must insert its grounding paragraphs`);
    const isPageBoundaryTarget =
      insertion.location.paragraph.section === 0
      && insertion.location.paragraph.number === 32;
    assert.equal(
      scenario.oracle.invariants.maxPageCountDelta,
      isPageBoundaryTarget ? 2 : 1,
      `${scenario.id} page allowance must match its exact insertion target`,
    );
  }
});
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
