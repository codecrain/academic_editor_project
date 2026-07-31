import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createGatewayServer } from '../../../editor_server/editor-gateway.mjs';
import { inspectHwpxPackage } from '../../../editor_hwpx/scripts/hwpx-package-policy.mjs';
import {
  findIntroducedDirectIdentifiers,
  visibleDocumentText,
} from './evaluation-hard-gates.mjs';
import {
  extractAttachmentEvidence,
  verifyExtractedSourceFact,
} from './attachment-extractors.mjs';

const datasetRoot = path.resolve('evaluation/hwpx-agent-final-20-v1');
const datasetManifest = JSON.parse(await fs.readFile(path.join(datasetRoot, 'manifest.json'), 'utf8'));
const attachmentsPayload = JSON.parse(await fs.readFile(path.join(datasetRoot, 'attachments.json'), 'utf8'));
const attachmentById = new Map(attachmentsPayload.attachments.map((attachment) => [attachment.id, attachment]));
const scenarioLines = (await fs.readFile(path.join(datasetRoot, 'scenarios.jsonl'), 'utf8'))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
let scenarios = scenarioLines.map((line) => JSON.parse(line));

const argValue = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const onlyId = argValue('--id');
const limit = Number(argValue('--limit', '0'));
const renderMode = argValue('--render', 'full');
if (onlyId) scenarios = scenarios.filter((scenario) => scenario.id === onlyId);
if (Number.isInteger(limit) && limit > 0) scenarios = scenarios.slice(0, limit);
if (!scenarios.length) throw new Error('No evaluation scenarios selected.');
if (!['full', 'sample', 'none'].includes(renderMode)) {
  throw new Error('--render must be full, sample, or none.');
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const binaryEntryInventory = (bytes) => inspectHwpxPackage(bytes).entries
  .filter((entry) => /^BinData\//i.test(entry.name))
  .map(({ name, size, sha256: entrySha256 }) => ({ name, size, sha256: entrySha256 }))
  .sort((left, right) => left.name.localeCompare(right.name));
const resultsRoot = path.join(datasetRoot, 'results');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hwpx-public-sector-eval-'));
await fs.mkdir(resultsRoot, { recursive: true });

const server = createGatewayServer({
  host: '127.0.0.1',
  port: 0,
  publicOrigin: 'http://127.0.0.1',
  docxServiceRoot: '/docx',
  hwpxBasePath: '/hwpx/',
  docxRuntimeOrigin: 'http://127.0.0.1:9980',
  hwpxRuntimeOrigin: '',
  hwpxStaticRoot: '',
  wopiBaseUrl: 'http://127.0.0.1',
  sampleDocxPath: path.join(tempRoot, 'sample.docx'),
  enableSampleDocx: true,
});

const listen = () => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address()));
});
const close = () => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

const address = await listen();
const origin = `http://127.0.0.1:${address.port}`;
const activeSessions = new Map();
const attachmentEvidenceCache = new Map();

async function post(pathname, payload) {
  const response = await fetch(`${origin}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { ok: false, message: text };
  }
  if (!response.ok) {
    throw new Error(`${pathname} HTTP ${response.status}: ${json.message || text}`);
  }
  return json;
}

let mcpRequestId = 0;
async function mcp(name, args) {
  const response = await post('/mcp', {
    jsonrpc: '2.0',
    id: ++mcpRequestId,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  if (response?.result?.isError) {
    throw new Error(`MCP ${name}: ${response.result.structuredContent?.message || 'tool failed'}`);
  }
  return response?.result?.structuredContent ?? {};
}

const documentPath = (documentId, action) => `/v1/hwpx/documents/${encodeURIComponent(documentId)}/${action}`;

async function openBytes(filename, bytes) {
  const opened = await post('/v1/hwpx/documents/open', {
    filename,
    source: { bytesBase64: bytes.toString('base64') },
  });
  activeSessions.set(opened.documentId, opened.revision);
  return opened;
}

async function discard(documentId) {
  if (!documentId || !activeSessions.has(documentId)) return;
  try {
    await post(documentPath(documentId, 'documents/discard'), {
      baseRevision: activeSessions.get(documentId),
    });
  } finally {
    activeSessions.delete(documentId);
  }
}

function inspectionLocations(commands) {
  const locations = [];
  const add = (location) => {
    if (!location || typeof location !== 'object') return;
    const key = JSON.stringify(location);
    if (!locations.some((entry) => entry.key === key)) locations.push({ key, location });
  };
  for (const command of commands) {
    if (command.op === 'table.writeCells') {
      for (const cell of command.cells || []) {
        add({
          ...(cell.location || {}),
          tableId: cell.tableId || command.tableId || command.location?.tableId,
          cell: cell.cell || cell.location?.cell,
        });
        add(cell.styleSource || command.styleSource);
      }
      continue;
    }
    add(command.location);
    add(command.target);
    add(command.styleSource);
    add(command.source);
  }
  return locations.map((entry) => entry.location);
}

function objectCounts(inventory) {
  return {
    images: inventory.images?.length ?? 0,
    pictures: inventory.pictures?.length ?? 0,
    charts: inventory.charts?.length ?? 0,
    sections: inventory.sections?.length ?? 0,
    xmlFiles: inventory.xmlFiles?.length ?? 0,
    binaryFiles: inventory.binaryFiles?.length ?? 0,
  };
}

function normalizeComparableText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function hasPrefix(bytes, prefix) {
  return Buffer.from(prefix).every((value, index) => bytes[index] === value);
}

async function verifyScenarioAttachments(scenario) {
  const formats = new Set();
  const verified = [];
  const extractedByAttachment = new Map();
  for (const attachmentId of scenario.attachments) {
    const attachment = attachmentById.get(attachmentId);
    if (!attachment) throw new Error(`unknown attachment: ${attachmentId}`);
    const attachmentPath = path.join(datasetRoot, attachment.path);
    const bytes = await fs.readFile(attachmentPath);
    if (bytes.length !== attachment.byteLength) {
      throw new Error(`${attachmentId} byte length mismatch`);
    }
    if (sha256(bytes) !== attachment.sha256) {
      throw new Error(`${attachmentId} SHA-256 mismatch`);
    }
    const extension = path.extname(attachment.path).toLowerCase();
    formats.add(extension);
    if (['.hwpx', '.docx', '.xlsx'].includes(extension) && !hasPrefix(bytes, [0x50, 0x4b])) {
      throw new Error(`${attachmentId} is not an OPC/ZIP package`);
    }
    if (extension === '.hwp' && !hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
      throw new Error(`${attachmentId} is not an OLE HWP package`);
    }
    if (extension === '.pdf' && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error(`${attachmentId} is not a PDF`);
    }
    if (extension === '.png' && !hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47])) {
      throw new Error(`${attachmentId} is not a PNG`);
    }
    if (extension === '.jpg' && !hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
      throw new Error(`${attachmentId} is not a JPEG`);
    }
    let evidence = attachmentEvidenceCache.get(attachment.sha256);
    if (!evidence) {
      evidence = await extractAttachmentEvidence(attachment, bytes);
      attachmentEvidenceCache.set(attachment.sha256, evidence);
    }
    extractedByAttachment.set(attachmentId, evidence);
    verified.push({
      attachmentId,
      extension,
      byteLength: bytes.length,
      sha256: attachment.sha256,
      extraction: {
        format: evidence.format,
        summary: evidence.summary,
        totalTextChars: evidence.totalTextChars,
        truncated: evidence.truncated,
        loadStatus: evidence.loadStatus,
      },
    });
  }
  if (!formats.has('.hwpx') || formats.size < 4) {
    throw new Error(`${scenario.id} requires HWPX plus at least three other formats`);
  }
  for (const sourceFact of scenario.sourceFacts || []) {
    if (!scenario.attachments.includes(sourceFact.attachmentId)) {
      throw new Error(`${scenario.id} source fact attachment is not in the scenario`);
    }
    if (!String(sourceFact.locator ?? '').trim() || sourceFact.fact === undefined) {
      throw new Error(`${scenario.id} source fact is incomplete`);
    }
    const attachment = attachmentById.get(sourceFact.attachmentId);
    const verification = verifyExtractedSourceFact(
      sourceFact,
      extractedByAttachment.get(sourceFact.attachmentId),
      attachment,
    );
    if (!verification.ok) {
      throw new Error(
        `${scenario.id} source fact was not recovered from ${sourceFact.attachmentId}: ${verification.reason}`,
      );
    }
  }
  return {
    formatCount: formats.size,
    formats: [...formats].sort(),
    verified,
    extractedSourceFactCount: scenario.sourceFacts?.length ?? 0,
  };
}

function renderPagesForScenario(scenario, ordinal) {
  if (renderMode === 'none') return [];
  if (renderMode === 'sample' && ordinal % 10 !== 0 && scenario.mode !== 'generation') return [1];
  return scenario.oracle.renderChecks.pages;
}

const results = [];
const startedAt = new Date().toISOString();

try {
  for (const [ordinal, scenario] of scenarios.entries()) {
    const started = Date.now();
    const targetAttachment = attachmentById.get(scenario.target.attachmentId);
    const sourcePath = path.join(datasetRoot, targetAttachment.path);
    const sourceBytes = await fs.readFile(sourcePath);
    const outputPath = path.join(tempRoot, scenario.target.outputFilename);
    let sourceDocumentId = '';
    let reopenedDocumentId = '';
    let mcpDocumentId = '';
    let mcpRevision = 1;
    let mcpArtifact = null;
    const checks = {
      attachments: false,
      open: false,
      catalog: false,
      inspect: false,
      inventory: false,
      atomicApply: false,
      quality: false,
      render: renderMode === 'none',
      save: false,
      reopen: false,
      content: false,
      grounding: false,
      structure: false,
      style: false,
      binaryIdentity: false,
      privacy: false,
      mcp: false,
    };
    const failures = [];
    const details = {};

    try {
      details.attachments = await verifyScenarioAttachments(scenario);
      checks.attachments = true;
      const opened = await openBytes(path.basename(sourcePath), sourceBytes);
      sourceDocumentId = opened.documentId;
      checks.open = true;
      const baselineJson = await post(documentPath(sourceDocumentId, 'documents/read-json'), {});
      const baselineInventory = await post(documentPath(sourceDocumentId, 'object/inventory'), {});
      details.baseline = {
        revision: opened.revision,
        pageCount: baselineJson.pageCount,
        tableCount: baselineJson.tables?.length ?? 0,
        paragraphCount: baselineJson.sections?.reduce((sum, section) => sum + section.paragraphCount, 0) ?? 0,
        objects: objectCounts(baselineInventory),
        binaryFiles: [...(baselineInventory.binaryFiles || [])].sort(),
        binaryEntries: binaryEntryInventory(sourceBytes),
      };

      const catalogOps = [...new Set(scenario.oracle.commandTemplates.map((command) => command.op))];
      for (const op of catalogOps) {
        const catalog = await post(documentPath(sourceDocumentId, 'commands/catalog'), { op });
        if (catalog.commandCount !== 1) throw new Error(`catalog mismatch for ${op}`);
      }
      checks.catalog = true;

      const locations = inspectionLocations(scenario.oracle.commandTemplates);
      if (locations.length) {
        const inspected = await post(documentPath(sourceDocumentId, 'target/inspect'), { locations });
        if (inspected.targets.length !== locations.length) {
          throw new Error(`inspect returned ${inspected.targets.length}/${locations.length} targets`);
        }
      }
      checks.inspect = true;

      const needsInventory = scenario.oracle.commandTemplates.some((command) => (
        command.op.startsWith('image.') || command.op.startsWith('object.')
      ));
      if (needsInventory) {
        await post(documentPath(sourceDocumentId, 'object/inventory'), {});
      }
      checks.inventory = true;

      const applied = await post(documentPath(sourceDocumentId, 'commands/apply'), {
        baseRevision: opened.revision,
        commands: scenario.oracle.commandTemplates,
      });
      activeSessions.set(sourceDocumentId, applied.revision);
      checks.atomicApply = applied.revision === opened.revision + 1;
      if (!checks.atomicApply) failures.push(`revision did not advance exactly once: ${opened.revision} -> ${applied.revision}`);

      const quality = await post(documentPath(sourceDocumentId, 'quality/check'), {
        baseRevision: applied.revision,
      });
      checks.quality = quality.ok === true && !(quality.issues || []).some((issue) => issue.severity === 'error');
      details.qualityIssues = quality.issues || [];
      if (!checks.quality) failures.push('quality check reported an error');

      const pages = renderPagesForScenario(scenario, ordinal);
      if (pages.length) {
        const rendered = await post(documentPath(sourceDocumentId, 'quality/render-compare'), { pages });
        const baselinePages = rendered.baseline?.pages || [];
        const currentPages = rendered.current?.pages || [];
        checks.render = pages.every((page) => (
          baselinePages.some((renderedPage) => renderedPage.page === page && renderedPage.nonBlank)
          && currentPages.some((renderedPage) => renderedPage.page === page && renderedPage.nonBlank)
        ));
        details.render = {
          requestedPages: pages,
          baselineNonBlank: baselinePages.filter((page) => page.nonBlank).map((page) => page.page),
          currentNonBlank: currentPages.filter((page) => page.nonBlank).map((page) => page.page),
        };
        if (!checks.render) failures.push('one or more baseline/current rendered pages were blank or missing');
      }

      const saved = await post(documentPath(sourceDocumentId, 'documents/save-source'), {
        baseRevision: applied.revision,
        filename: scenario.target.outputFilename,
        outputPath,
      });
      const savedBytes = await fs.readFile(outputPath);
      checks.save = saved.sha256 === sha256(savedBytes) && savedBytes.length > 0;
      details.output = { sha256: saved.sha256, byteLength: savedBytes.length };
      if (!checks.save) failures.push('saved file hash or byte length mismatch');

      const reopened = await openBytes(scenario.target.outputFilename, savedBytes);
      reopenedDocumentId = reopened.documentId;
      checks.reopen = true;
      const currentJson = await post(documentPath(reopenedDocumentId, 'documents/read-json'), {});
      const currentInventory = await post(documentPath(reopenedDocumentId, 'object/inventory'), {});
      details.current = {
        pageCount: currentJson.pageCount,
        tableCount: currentJson.tables?.length ?? 0,
        paragraphCount: currentJson.sections?.reduce((sum, section) => sum + section.paragraphCount, 0) ?? 0,
        objects: objectCounts(currentInventory),
        binaryFiles: [...(currentInventory.binaryFiles || [])].sort(),
        binaryEntries: binaryEntryInventory(savedBytes),
      };

      const expectedChecks = [];
      for (const expected of scenario.oracle.expectedTargets) {
        try {
          const isCell = Boolean(expected.location?.tableId || expected.location?.cell || expected.location?.tableCell);
          const located = isCell
            ? await post(documentPath(reopenedDocumentId, 'target/inspect'), {
              locations: [expected.location],
            })
            : await post(documentPath(reopenedDocumentId, 'target/find'), {
              query: expected.text,
              match: { occurrence: 1, caseSensitive: true, includeCells: false },
            });
          const target = isCell ? located.targets[0] : located.target;
          const actual = target?.currentText ?? target?.text ?? '';
          expectedChecks.push({
            verificationId: expected.verificationId,
            factIds: expected.factIds || [],
            text: expected.text,
            actual,
            found: normalizeComparableText(actual) === normalizeComparableText(expected.text),
            kind: target?.kind,
            location: expected.location,
          });
        } catch (error) {
          expectedChecks.push({
            verificationId: expected.verificationId,
            factIds: expected.factIds || [],
            text: expected.text,
            found: false,
            location: expected.location,
            error: error.message,
          });
        }
      }
      checks.content = expectedChecks.every((check) => check.found);
      details.expectedTargets = expectedChecks;
      if (!checks.content) failures.push('one or more expected target texts were not found after reopen');

      const sourceFactById = new Map(
        scenario.sourceFacts.map(sourceFact => [sourceFact.factId, sourceFact]),
      );
      const expectedCheckById = new Map(
        expectedChecks.map(expectedCheck => [expectedCheck.verificationId, expectedCheck]),
      );
      const groundingChecks = scenario.factUsage.map(usage => {
        const sourceFact = sourceFactById.get(usage.factId);
        const expectedCheck = expectedCheckById.get(usage.expectedTargetId);
        const renderedText = normalizeComparableText(usage.renderedText);
        const locator = normalizeComparableText(sourceFact?.locator);
        const fact = normalizeComparableText(sourceFact?.fact);
        return {
          factId: usage.factId,
          expectedTargetId: usage.expectedTargetId,
          foundAfterReopen: expectedCheck?.found === true,
          locatorPresent: Boolean(locator) && renderedText.includes(locator),
          factPresent: Boolean(fact) && renderedText.includes(fact),
          actual: expectedCheck?.actual ?? '',
        };
      });
      checks.grounding = groundingChecks.length === scenario.sourceFacts.length
        && groundingChecks.every(check => (
          check.foundAfterReopen && check.locatorPresent && check.factPresent
        ));
      details.grounding = groundingChecks;
      if (!checks.grounding) {
        failures.push('one or more source facts were not grounded in a verified target after reopen');
      }

      const invariants = scenario.oracle.invariants;
      const pageDelta = Math.abs(details.current.pageCount - details.baseline.pageCount);
      const requestedBinaryChanges = new Set(
        scenario.oracle.commandTemplates
          .filter((command) => command.op === 'image.replace' || command.op === 'image.generateAndReplace')
          .map((command) => command.imageName)
          .filter(Boolean),
      );
      const currentBinaryByName = new Map(
        details.current.binaryEntries.map((entry) => [entry.name, entry]),
      );
      const unchangedBinaryEntries = details.baseline.binaryEntries
        .filter((entry) => !requestedBinaryChanges.has(entry.name))
        .every((entry) => {
          const current = currentBinaryByName.get(entry.name);
          return current?.size === entry.size && current.sha256 === entry.sha256;
        });
      const structurePredicates = [
        pageDelta <= invariants.maxPageCountDelta,
        !invariants.preserveTableCount || details.current.tableCount === details.baseline.tableCount,
        !invariants.preservePictureCount || details.current.objects.pictures === details.baseline.objects.pictures,
        !invariants.preserveImageCount || details.current.objects.images === details.baseline.objects.images,
        details.current.objects.sections === details.baseline.objects.sections,
        details.current.objects.xmlFiles === details.baseline.objects.xmlFiles,
        JSON.stringify(details.current.binaryFiles) === JSON.stringify(details.baseline.binaryFiles),
        unchangedBinaryEntries,
      ];
      checks.structure = structurePredicates.every(Boolean);
      checks.binaryIdentity = structurePredicates.at(-1);
      details.structure = { pageDelta, predicates: structurePredicates };
      if (!checks.structure) failures.push('one or more page/table/object/package invariants failed');
      if (!checks.binaryIdentity) failures.push('binary package entry identities changed');

      const introducedIdentifiers = findIntroducedDirectIdentifiers(
        visibleDocumentText(baselineJson),
        visibleDocumentText(currentJson),
      );
      checks.privacy = introducedIdentifiers.length === 0;
      details.introducedDirectIdentifiers = introducedIdentifiers;
      if (!checks.privacy) failures.push('output introduced direct personal identifiers not present in the source');

      const styleCommand = scenario.oracle.commandTemplates.find((command) => command.op === 'style.applyText');
      if (styleCommand) {
        const inspected = await post(documentPath(reopenedDocumentId, 'target/inspect'), {
          locations: [styleCommand.target, styleCommand.styleSource],
        });
        const targetStyle = inspected.targets[0]?.style;
        const sourceStyle = inspected.targets[1]?.style;
        const targetIds = {
          paraShapeId: targetStyle?.paragraph?.paraShapeId,
          charShapeId: targetStyle?.text?.charShapeId,
        };
        const sourceIds = {
          paraShapeId: sourceStyle?.paragraph?.paraShapeId,
          charShapeId: sourceStyle?.text?.charShapeId,
        };
        checks.style = Number.isInteger(targetIds.paraShapeId)
          && Number.isInteger(targetIds.charShapeId)
          && targetIds.paraShapeId === sourceIds.paraShapeId
          && targetIds.charShapeId === sourceIds.charShapeId;
        details.style = { targetIds, sourceIds };
      } else {
        checks.style = true;
      }
      if (!checks.style) failures.push('style clone fingerprint did not match after reopen');

      const mcpOpened = await mcp('editor_hwpx_open', {
        filename: path.basename(sourcePath),
        bytesBase64: sourceBytes.toString('base64'),
      });
      mcpDocumentId = mcpOpened.documentId;
      mcpRevision = mcpOpened.revision;
      for (const op of catalogOps) {
        const catalog = await mcp('editor_hwpx_command_catalog', { op });
        if (catalog.commandCount !== 1) throw new Error(`MCP catalog mismatch for ${op}`);
      }
      if (locations.length) {
        await mcp('editor_hwpx_target_inspect', {
          documentId: mcpDocumentId,
          locations,
        });
      }
      if (needsInventory) {
        await mcp('editor_hwpx_object_inventory', { documentId: mcpDocumentId });
      }
      const mcpApplied = await mcp('editor_hwpx_apply', {
        documentId: mcpDocumentId,
        baseRevision: mcpOpened.revision,
        commands: scenario.oracle.commandTemplates,
      });
      mcpRevision = mcpApplied.revision;
      const mcpQuality = await mcp('editor_hwpx_quality_check', {
        documentId: mcpDocumentId,
        baseRevision: mcpApplied.revision,
      });
      if (mcpQuality.ok !== true) throw new Error('MCP quality check did not pass');
      const mcpPages = renderPagesForScenario(scenario, ordinal);
      if (mcpPages.length) {
        const mcpRendered = await mcp('editor_hwpx_render_pages', {
          documentId: mcpDocumentId,
          baseRevision: mcpApplied.revision,
          pages: mcpPages,
          includeBaseline: true,
        });
        if (!mcpPages.every((page) => (
          mcpRendered.baseline?.pages?.some((entry) => entry.page === page && entry.nonBlank)
          && mcpRendered.current?.pages?.some((entry) => entry.page === page && entry.nonBlank)
        ))) {
          throw new Error('MCP render verification returned a blank or missing page');
        }
      }
      mcpArtifact = await mcp('editor_hwpx_save_source', {
        documentId: mcpDocumentId,
        baseRevision: mcpApplied.revision,
        filename: scenario.target.outputFilename,
      });
      mcpDocumentId = '';
      const mcpRead = await mcp('editor_hwpx_artifact_read', {
        artifactId: mcpArtifact.artifactId,
        expectedSha256: mcpArtifact.sha256,
      });
      const mcpSavedBytes = Buffer.from(mcpRead.bytesBase64, 'base64');
      if (!hasPrefix(mcpSavedBytes, [0x50, 0x4b]) || sha256(mcpSavedBytes) !== mcpArtifact.sha256) {
        throw new Error('MCP saved artifact failed HWPX signature or hash verification');
      }
      if (!mcpSavedBytes.equals(savedBytes) || mcpArtifact.sha256 !== saved.sha256) {
        throw new Error('REST and MCP produced different HWPX bytes for the same command batch');
      }
      await mcp('editor_hwpx_artifact_delete', {
        artifactId: mcpArtifact.artifactId,
        expectedSha256: mcpArtifact.sha256,
      });
      mcpArtifact = null;
      checks.mcp = true;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    } finally {
      if (mcpArtifact) {
        await mcp('editor_hwpx_artifact_delete', {
          artifactId: mcpArtifact.artifactId,
          expectedSha256: mcpArtifact.sha256,
        }).catch(() => undefined);
      }
      if (mcpDocumentId) {
        await mcp('editor_hwpx_discard', {
          documentId: mcpDocumentId,
          baseRevision: mcpRevision,
        }).catch(() => undefined);
      }
      await discard(reopenedDocumentId).catch(() => undefined);
      await discard(sourceDocumentId).catch(() => undefined);
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
    }

    const contentScore = checks.content && checks.grounding ? 35 : 0;
    const layoutScore = checks.render && checks.structure ? 20 : checks.structure ? 10 : 0;
    const styleScore = checks.style ? 15 : 0;
    const objectScore = checks.structure ? 10 : 0;
    const packageScore = checks.save && checks.reopen ? 10 : 0;
    const apiScore = checks.attachments && checks.open && checks.catalog
      && checks.inspect && checks.atomicApply && checks.quality ? 10 : 0;
    const totalScore = contentScore + layoutScore + styleScore + objectScore + packageScore + apiScore;
    const hardFailure = !checks.reopen || !checks.atomicApply || !checks.structure
      || !checks.grounding || !checks.binaryIdentity || !checks.privacy || !checks.mcp;
    const result = {
      scenarioId: scenario.id,
      mode: scenario.mode,
      domain: scenario.domain,
      passed: totalScore >= 85 && !hardFailure,
      totalScore,
      hardFailure,
      durationMs: Date.now() - started,
      checks,
      failures,
      details,
    };
    results.push(result);
    console.log(`${scenario.id} ${result.passed ? 'PASS' : 'FAIL'} ${totalScore} ${result.durationMs}ms${failures.length ? ` :: ${failures.join(' | ')}` : ''}`);
  }
} finally {
  for (const documentId of [...activeSessions.keys()]) {
    await discard(documentId).catch(() => undefined);
  }
  await close().catch(() => undefined);
  await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
}

const completedAt = new Date().toISOString();
const summary = {
  version: datasetManifest.version,
  startedAt,
  completedAt,
  renderMode,
  selectedScenarioCount: scenarios.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  averageScore: Number((results.reduce((sum, result) => sum + result.totalScore, 0) / results.length).toFixed(2)),
  durationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
  failuresByCheck: Object.fromEntries(Object.keys(results[0]?.checks || {}).map((key) => [
    key,
    results.filter((result) => !result.checks[key]).length,
  ])),
  failedScenarioIds: results.filter((result) => !result.passed).map((result) => result.scenarioId),
};

await fs.writeFile(path.join(resultsRoot, 'latest-results.jsonl'), `${results.map((result) => JSON.stringify(result)).join('\n')}\n`);
await fs.writeFile(path.join(resultsRoot, 'latest-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));

if (summary.failed > 0) process.exitCode = 1;
