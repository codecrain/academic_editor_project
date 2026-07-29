import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { EditorDocumentStore } from '../editor_docx/scripts/editor-document-store.mjs';

import {
  createGatewayServer,
  discardApiSessionState,
  extendFrameAncestors,
  isDocxRootPath,
  isDocxRuntimePath,
  isHwpxPath,
  isImagePath,
  normalizeBasePath,
  normalizeServiceRoot,
  renderDocxPage,
  resolveDocxActionPath,
  resolveStaticPath,
  sanitizeEditorHtml,
} from './editor-gateway.mjs';
import { createDocxBytes, getDocumentXml } from '../editor_docx/scripts/docx-api-utils.mjs';

const FAKE_PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF\n');
const FAKE_WEBP_BYTES = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary');

function fakeDocxRenderer(_bytes, options = {}) {
  const selectedPages = options.pages === 'none'
    ? []
    : options.pages === 'all'
      ? [1, 2, 3]
      : [...options.pages];
  return Promise.resolve({
    ok: true,
    renderer: 'test-uno-webp',
    pageCount: 3,
    selectedPages,
    settings: { format: 'webp', quality: 20, maxWidth: 1700, maxHeight: 1700, background: 'white', metadata: 'stripped' },
    pdf: {
      mimeType: 'application/pdf',
      bytes: FAKE_PDF_BYTES,
      byteLength: FAKE_PDF_BYTES.length,
      sha256: createHash('sha256').update(FAKE_PDF_BYTES).digest('hex'),
    },
    pages: selectedPages.map((page) => ({
      page,
      format: 'webp',
      mimeType: 'image/webp',
      width: 1314,
      height: 1700,
      quality: 20,
      bytes: FAKE_WEBP_BYTES,
      byteLength: FAKE_WEBP_BYTES.length,
      sha256: createHash('sha256').update(FAKE_WEBP_BYTES).digest('hex'),
    })),
  });
}

function fakeHwpxPdfRenderer(bytes) {
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString('hex'), '504b');
  return Promise.resolve({
    bytes: FAKE_PDF_BYTES,
    byteLength: FAKE_PDF_BYTES.length,
    sha256: createHash('sha256').update(FAKE_PDF_BYTES).digest('hex'),
    pageCount: 1,
    renderer: 'rhwp-native',
  });
}

function listen(server, port = 0) {
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server.address()));
  });
}

async function reservePort() {
  const probe = net.createServer();
  const address = await listen(probe);
  assert.equal(typeof address, 'object');
  await close(probe);
  return address.port;
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function requestWebSocketUpgrade(port, pathname, extraHeaders = []) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let response = '';
    let settled = false;

    function finish(error) {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    }

    socket.setTimeout(5000, () => finish(new Error('websocket upgrade timed out')));
    socket.once('error', finish);
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.includes('\r\n\r\n')) {
        finish();
      }
    });
    socket.once('connect', () => {
      socket.write(
        [
          `GET ${pathname} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Version: 13',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          `Origin: http://127.0.0.1:${port}`,
          ...extraHeaders,
          '',
          '',
        ].join('\r\n'),
      );
    });
  });
}

test('gateway normalizes public editor subpaths', () => {
  assert.equal(normalizeServiceRoot('docx/'), '/docx');
  assert.equal(normalizeServiceRoot('/docx/'), '/docx');
  assert.equal(normalizeBasePath('hwpx'), '/hwpx/');
  assert.equal(normalizeBasePath('/hwpx/'), '/hwpx/');
});

test('gateway routes DOCX root, runtime, and HWPX paths separately', () => {
  assert.equal(isDocxRootPath('/docx', '/docx'), true);
  assert.equal(isDocxRootPath('/docx/', '/docx'), true);
  assert.equal(isDocxRuntimePath('/docx/browser/hash/cool.html', '/docx'), true);
  assert.equal(isDocxRuntimePath('/docx/hosting/discovery', '/docx'), true);
  assert.equal(isDocxRuntimePath('/browser/hash/branding.css', '/docx'), true);
  assert.equal(isDocxRuntimePath('/cool/ws', '/docx'), true);
  assert.equal(isHwpxPath('/hwpx/', '/hwpx/'), true);
  assert.equal(isHwpxPath('/hwpx/assets/index.js', '/hwpx/'), true);
  assert.equal(isHwpxPath('/docx/browser/hash/cool.html', '/hwpx/'), false);
  assert.equal(isImagePath('/image/', '/image/'), true);
  assert.equal(isImagePath('/image/dist/bundle.js', '/image/'), true);
  assert.equal(isImagePath('/hwpx/', '/image/'), false);
});

test('discardApiSessionState releases the isolated session and its lock idempotently', () => {
  const documentId = 'doc_discard-test';
  const state = {
    apiDocuments: new Map([[documentId, { id: documentId }]]),
    mcpDocumentLocks: new Map([[documentId, Promise.resolve()]]),
  };

  assert.equal(discardApiSessionState(state, documentId), true);
  assert.equal(state.apiDocuments.has(documentId), false);
  assert.equal(state.mcpDocumentLocks.has(documentId), false);
  assert.equal(discardApiSessionState(state, documentId), false);
});

test('gateway exposes MCP tools/list and a guarded isolated DOCX candidate workflow', async () => {
  const server = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: 'http://127.0.0.1:9',
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: false,
    docxRenderer: fakeDocxRenderer,
  });
  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let savedPath = '';
  const artifactPath = (artifactId, extension = 'docx') => path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '.build',
    'gateway-api-documents',
    `${artifactId}.${extension}`,
  );

  const mcp = async (id, method, params = {}) => {
    const response = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };

  try {
    const initialized = await mcp(1, 'initialize', { protocolVersion: '2025-06-18' });
    assert.equal(initialized.result.serverInfo.name, 'academic-editor-mcp');
    assert.match(initialized.result.instructions, /discard/);

    const listed = await mcp(2, 'tools/list');
    const names = listed.result.tools.map((tool) => tool.name);
    assert.deepEqual(names, [
      'editor_docx_open',
      'editor_docx_discard',
      'editor_docx_read_json',
      'editor_docx_target_map',
      'editor_docx_target_find',
      'editor_docx_target_inspect',
      'editor_docx_object_inventory',
      'editor_docx_command_catalog',
      'editor_docx_apply',
      'editor_docx_render_pages',
      'editor_docx_quality_check',
      'editor_docx_export_pdf',
      'editor_docx_save_source',
      'editor_docx_save_checkpoint',
      'editor_docx_artifact_read',
      'editor_docx_artifact_delete',
      'editor_hwpx_open',
      'editor_hwpx_discard',
      'editor_hwpx_read_json',
      'editor_hwpx_target_map',
      'editor_hwpx_target_find',
      'editor_hwpx_target_inspect',
      'editor_hwpx_object_inventory',
      'editor_hwpx_command_catalog',
      'editor_hwpx_apply',
      'editor_hwpx_render_pages',
      'editor_hwpx_quality_check',
      'editor_hwpx_export_pdf',
      'editor_hwpx_save_source',
      'editor_hwpx_save_checkpoint',
      'editor_hwpx_artifact_read',
      'editor_hwpx_artifact_delete',
      'editor_image_open',
      'editor_image_session_read',
      'editor_image_session_result_read',
      'editor_image_session_save',
      'editor_image_session_delete',
    ]);
    const discardTool = listed.result.tools.find((tool) => tool.name === 'editor_docx_discard');
    assert.deepEqual(discardTool.inputSchema.required, ['documentId', 'baseRevision']);
    assert.deepEqual(discardTool.annotations, {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });

    const malformedOpen = await mcp(205, 'tools/call', {
      name: 'editor_docx_open',
      arguments: {
        filename: 'must-not-open-fallback.docx',
        source: { bytesBase64: createDocxBytes().toString('base64') },
      },
    });
    assert.equal(malformedOpen.result.isError, true);
    assert.equal(malformedOpen.result.structuredContent.code, 'invalid_tool_arguments');
    assert.equal(malformedOpen.result.structuredContent.documentId, undefined);

    const malformedDirectOpen = await fetch(`${origin}/v1/docx/documents/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'must-not-open-sample.docx', source: {} }),
    });
    assert.equal(malformedDirectOpen.status, 400);
    const malformedDirectPayload = await malformedDirectOpen.json();
    assert.equal(malformedDirectPayload.ok, false);
    assert.match(malformedDirectPayload.message, /exactly one/);
    assert.equal(malformedDirectPayload.documentId, undefined);

    const checkpointOpen = await mcp(206, 'tools/call', {
      name: 'editor_docx_open',
      arguments: {
        filename: 'mcp-checkpoint.docx',
        bytesBase64: createDocxBytes({ paragraphs: ['Unverified recovery state'] }).toString('base64'),
      },
    });
    const checkpointDocument = checkpointOpen.result.structuredContent;
    const checkpointSave = await mcp(207, 'tools/call', {
      name: 'editor_docx_save_checkpoint',
      arguments: {
        documentId: checkpointDocument.documentId,
        baseRevision: checkpointDocument.revision,
        filename: 'mcp-checkpoint-output.docx',
      },
    });
    assert.equal(checkpointSave.result.isError, false);
    assert.equal(checkpointSave.result.structuredContent.checkpoint, true);
    assert.equal(checkpointSave.result.structuredContent.verified, false);
    assert.equal(checkpointSave.result.structuredContent.sessionClosed, true);
    const checkpointRead = await mcp(208, 'tools/call', {
      name: 'editor_docx_artifact_read',
      arguments: {
        artifactId: checkpointSave.result.structuredContent.artifactId,
        expectedSha256: checkpointSave.result.structuredContent.sha256,
      },
    });
    assert.equal(checkpointRead.result.isError, false);
    const checkpointDelete = await mcp(209, 'tools/call', {
      name: 'editor_docx_artifact_delete',
      arguments: {
        artifactId: checkpointSave.result.structuredContent.artifactId,
        expectedSha256: checkpointSave.result.structuredContent.sha256,
      },
    });
    assert.equal(checkpointDelete.result.structuredContent.deleted, true);

    const exactOpenCall = await mcp(300, 'tools/call', {
      name: 'editor_docx_open',
      arguments: {
        filename: 'mcp-exact-targets.docx',
        bytesBase64: createDocxBytes({
          paragraphs: ['Source paragraph', 'Target paragraph'],
          tables: [{ rows: [['Cell zero', 'Cell one']] }],
          includeImage: true,
        }).toString('base64'),
      },
    });
    const exactDocument = exactOpenCall.result.structuredContent;
    const exactParagraphMapCall = await mcp(301, 'tools/call', {
      name: 'editor_docx_target_map',
      arguments: { documentId: exactDocument.documentId },
    });
    const exactCellMapCall = await mcp(30101, 'tools/call', {
      name: 'editor_docx_target_map',
      arguments: { documentId: exactDocument.documentId, kind: 'cell' },
    });
    const paragraph0 = exactParagraphMapCall.result.structuredContent.targets[0].location;
    const paragraph1 = exactParagraphMapCall.result.structuredContent.targets[1].location;
    const cell0 = exactCellMapCall.result.structuredContent.targets[0].location;
    const cell1 = exactCellMapCall.result.structuredContent.targets[1].location;

    const invalidDimensions = await mcp(3011, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 1,
        commands: [{ op: 'table.create', rows: 0, cols: 2 }],
      },
    });
    assert.equal(invalidDimensions.result.isError, true);
    assert.match(invalidDimensions.result.structuredContent.message, /positive integers/);

    const exactInventory = await mcp(3012, 'tools/call', {
      name: 'editor_docx_object_inventory',
      arguments: { documentId: exactDocument.documentId },
    });
    const exactImageName = exactInventory.result.structuredContent.images[0].name;
    const damagedMedia = await mcp(3013, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 1,
        commands: [
          { op: 'setDocumentMetadata', title: 'must roll back' },
          { op: 'image.replace', imageName: exactImageName, bytesBase64: Buffer.from([1, 2, 3]).toString('base64') },
        ],
      },
    });
    assert.equal(damagedMedia.result.isError, true);
    assert.match(damagedMedia.result.structuredContent.message, /recognized, complete image signature/);
    const unchangedAfterMediaFailure = await mcp(3014, 'tools/call', {
      name: 'editor_docx_read_json',
      arguments: { documentId: exactDocument.documentId },
    });
    assert.equal(unchangedAfterMediaFailure.result.structuredContent.revision, 1);

    await mcp(302, 'tools/call', {
      name: 'editor_docx_target_inspect',
      arguments: { documentId: exactDocument.documentId, locations: [paragraph0] },
    });
    const unknownStyle = await mcp(3021, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 1,
        commands: [{ op: 'applyStyle', target: { nodeId: 'p_0' }, styleId: 'MissingStyle' }],
      },
    });
    assert.equal(unknownStyle.result.isError, true);
    assert.match(unknownStyle.result.structuredContent.message, /styleId does not exist/);
    const uninspectedTarget = await mcp(303, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 1,
        commands: [{ op: 'text.replaceParagraph', location: paragraph1, text: 'Must be rejected' }],
      },
    });
    assert.equal(uninspectedTarget.result.isError, true);
    assert.match(uninspectedTarget.result.structuredContent.message, /inspection_required.*paragraph:0:1/);

    const uninspectedSource = await mcp(304, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 1,
        commands: [{ op: 'style.applyText', target: paragraph0, styleSource: paragraph1, text: 'Styled target' }],
      },
    });
    assert.equal(uninspectedSource.result.isError, true);
    assert.match(uninspectedSource.result.structuredContent.message, /styleSource=paragraph:0:1/);

    await mcp(305, 'tools/call', {
      name: 'editor_docx_target_inspect',
      arguments: { documentId: exactDocument.documentId, locations: [paragraph1] },
    });
    const exactStyleApply = await mcp(306, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 1,
        commands: [{ op: 'style.applyText', target: paragraph0, styleSource: paragraph1, text: 'Styled target' }],
      },
    });
    assert.equal(exactStyleApply.result.isError, false, JSON.stringify(exactStyleApply.result.structuredContent));
    assert.equal(exactStyleApply.result.structuredContent.revision, 2);

    const clearedAfterRevision = await mcp(3061, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 2,
        commands: [{ op: 'text.replaceParagraph', location: paragraph0, text: 'Must inspect revision 2' }],
      },
    });
    assert.equal(clearedAfterRevision.result.isError, true);
    assert.match(clearedAfterRevision.result.structuredContent.message, /inspection_required/);

    await mcp(307, 'tools/call', {
      name: 'editor_docx_target_inspect',
      arguments: { documentId: exactDocument.documentId, locations: [cell0] },
    });
    const partialBatch = await mcp(308, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 2,
        commands: [{
          op: 'table.writeCells',
          tableId: 'tbl_0',
          cells: [{ cell: { number: 0 }, text: 'A' }, { cell: { number: 1 }, text: 'B' }],
        }],
      },
    });
    assert.equal(partialBatch.result.isError, true);
    assert.match(partialBatch.result.structuredContent.message, /cells\[1\]=table:tbl_0\/cell:1/);

    await mcp(309, 'tools/call', {
      name: 'editor_docx_target_inspect',
      arguments: { documentId: exactDocument.documentId, locations: [cell1] },
    });
    const completeBatch = await mcp(310, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: exactDocument.documentId,
        baseRevision: 2,
        commands: [{
          op: 'table.writeCells',
          tableId: 'tbl_0',
          cells: [{ cell: { number: 0 }, text: 'A' }, { cell: { number: 1 }, text: 'B' }],
        }],
      },
    });
    assert.equal(completeBatch.result.isError, false, JSON.stringify(completeBatch.result.structuredContent));
    assert.equal(completeBatch.result.structuredContent.revision, 3);
    const exactDiscard = await mcp(311, 'tools/call', {
      name: 'editor_docx_discard',
      arguments: { documentId: exactDocument.documentId, baseRevision: 3 },
    });
    assert.equal(exactDiscard.result.structuredContent.deleted, true);

    const baselineRiskOpenCall = await mcp(211, 'tools/call', {
      name: 'editor_docx_open',
      arguments: {
        filename: 'mcp-baseline-risk.docx',
        bytesBase64: createDocxBytes({
          tables: [{ rows: [[{ text: '12345678901234', cellStyle: { width: 800 } }]] }],
        }).toString('base64'),
      },
    });
    const baselineRisk = baselineRiskOpenCall.result.structuredContent;
    const baselineRiskQuality = await mcp(212, 'tools/call', {
      name: 'editor_docx_quality_check',
      arguments: { documentId: baselineRisk.documentId, baseRevision: baselineRisk.revision },
    });
    const baselineRiskIssue = baselineRiskQuality.result.structuredContent.issues
      .find((issue) => issue.code === 'cell-line-overflow-risk');
    assert.equal(baselineRiskIssue.severity, 'info');
    assert.equal(baselineRiskIssue.preexisting, true);
    assert.equal(baselineRiskIssue.baselineSeverity, 'warning');

    const baselineRiskSave = await mcp(213, 'tools/call', {
      name: 'editor_docx_save_source',
      arguments: {
        documentId: baselineRisk.documentId,
        baseRevision: baselineRisk.revision,
        filename: 'mcp-baseline-risk-output.docx',
      },
    });
    assert.equal(baselineRiskSave.result.isError, false, JSON.stringify(baselineRiskSave.result.structuredContent));
    savedPath = artifactPath(baselineRiskSave.result.structuredContent.artifactId);
    const baselineRiskDelete = await mcp(214, 'tools/call', {
      name: 'editor_docx_artifact_delete',
      arguments: {
        artifactId: baselineRiskSave.result.structuredContent.artifactId,
        expectedSha256: baselineRiskSave.result.structuredContent.sha256,
      },
    });
    assert.equal(baselineRiskDelete.result.structuredContent.deleted, true);
    savedPath = '';

    const assertCapacityRegressionBlocksSave = async ({ idBase, baselineText, editedText }) => {
      const openedCall = await mcp(idBase, 'tools/call', {
        name: 'editor_docx_open',
        arguments: {
          filename: `mcp-capacity-regression-${idBase}.docx`,
          bytesBase64: createDocxBytes({
            tables: [{ rows: [[{ text: baselineText, cellStyle: { width: 800 } }]] }],
          }).toString('base64'),
        },
      });
      const opened = openedCall.result.structuredContent;
      const targetMap = await mcp(idBase + 1, 'tools/call', {
        name: 'editor_docx_target_map',
        arguments: { documentId: opened.documentId, kind: 'cell' },
      });
      const location = targetMap.result.structuredContent.targets[0].location;
      await mcp(idBase + 2, 'tools/call', {
        name: 'editor_docx_target_inspect',
        arguments: { documentId: opened.documentId, locations: [location] },
      });
      const applied = await mcp(idBase + 3, 'tools/call', {
        name: 'editor_docx_apply',
        arguments: {
          documentId: opened.documentId,
          baseRevision: opened.revision,
          commands: [{ op: 'table.writeCell', location, text: editedText }],
        },
      });
      assert.equal(applied.result.isError, false, JSON.stringify(applied.result.structuredContent));
      const revision = applied.result.structuredContent.revision;
      const quality = await mcp(idBase + 4, 'tools/call', {
        name: 'editor_docx_quality_check',
        arguments: { documentId: opened.documentId, baseRevision: revision },
      });
      const blockingIssue = quality.result.structuredContent.issues
        .find((issue) => issue.code === 'cell-line-overflow-risk');
      assert.equal(blockingIssue.severity, 'warning');
      assert.equal(blockingIssue.preexisting, undefined);
      const blockedSave = await mcp(idBase + 5, 'tools/call', {
        name: 'editor_docx_save_source',
        arguments: { documentId: opened.documentId, baseRevision: revision, filename: `blocked-${idBase}.docx` },
      });
      assert.equal(blockedSave.result.isError, true);
      assert.match(blockedSave.result.structuredContent.message, /quality_check_required/);
      const discarded = await mcp(idBase + 6, 'tools/call', {
        name: 'editor_docx_discard',
        arguments: { documentId: opened.documentId, baseRevision: revision },
      });
      assert.equal(discarded.result.structuredContent.deleted, true);
    };

    await assertCapacityRegressionBlocksSave({
      idBase: 220,
      baselineText: '12345678901234',
      editedText: '12345678901234567890',
    });
    await assertCapacityRegressionBlocksSave({
      idBase: 230,
      baselineText: 'Short',
      editedText: '12345678901234567890',
    });

    const abandonedOpenCall = await mcp(21, 'tools/call', {
      name: 'editor_docx_open',
      arguments: {
        filename: 'mcp-abandoned.docx',
        bytesBase64: createDocxBytes({ tables: [{ rows: [['Discard me']] }] }).toString('base64'),
      },
    });
    const abandoned = abandonedOpenCall.result.structuredContent;
    const abandonedMapCall = await mcp(22, 'tools/call', {
      name: 'editor_docx_target_map',
      arguments: { documentId: abandoned.documentId },
    });
    const abandonedLocation = abandonedMapCall.result.structuredContent.targets[0].location;
    await mcp(23, 'tools/call', {
      name: 'editor_docx_target_inspect',
      arguments: { documentId: abandoned.documentId, locations: [abandonedLocation] },
    });
    await mcp(24, 'tools/call', {
      name: 'editor_docx_object_inventory',
      arguments: { documentId: abandoned.documentId },
    });
    await mcp(25, 'tools/call', {
      name: 'editor_docx_quality_check',
      arguments: { documentId: abandoned.documentId, baseRevision: abandoned.revision },
    });

    const discardCall = await mcp(26, 'tools/call', {
      name: 'editor_docx_discard',
      arguments: { documentId: abandoned.documentId, baseRevision: abandoned.revision },
    });
    assert.equal(discardCall.result.isError, false);
    assert.deepEqual(discardCall.result.structuredContent, {
      ok: true,
      status: 'completed',
      documentId: abandoned.documentId,
      deleted: true,
      sessionClosed: true,
      artifactCreated: false,
    });
    assert.equal(discardCall.result.structuredContent.artifactId, undefined);

    const discardedReadCall = await mcp(27, 'tools/call', {
      name: 'editor_docx_read_json',
      arguments: { documentId: abandoned.documentId },
    });
    assert.equal(discardedReadCall.result.isError, true);
    assert.match(discardedReadCall.result.structuredContent.message, /Document session not found/);

    const repeatedDiscardCall = await mcp(28, 'tools/call', {
      name: 'editor_docx_discard',
      arguments: { documentId: abandoned.documentId, baseRevision: abandoned.revision },
    });
    assert.equal(repeatedDiscardCall.result.isError, false);
    assert.equal(repeatedDiscardCall.result.structuredContent.status, 'completed');
    assert.equal(repeatedDiscardCall.result.structuredContent.deleted, false);
    assert.equal(repeatedDiscardCall.result.structuredContent.artifactCreated, false);
    assert.equal(repeatedDiscardCall.result.structuredContent.artifactId, undefined);

    const openedCall = await mcp(3, 'tools/call', {
      name: 'editor_docx_open',
      arguments: {
        filename: 'mcp-smoke.docx',
        bytesBase64: createDocxBytes({ tables: [{ rows: [['Styled cell']] }] }).toString('base64'),
      },
    });
    const opened = openedCall.result.structuredContent;
    assert.equal(opened.ok, true);
    assert.equal(opened.revision, 1);

    const readCall = await mcp(4, 'tools/call', {
      name: 'editor_docx_read_json',
      arguments: { documentId: opened.documentId },
    });
    assert.equal(readCall.result.structuredContent.revision, 1);

    const catalogCall = await mcp(41, 'tools/call', {
      name: 'editor_docx_command_catalog',
      arguments: { category: 'package' },
    });
    assert.equal(catalogCall.result.isError, false);
    assert.ok(catalogCall.result.structuredContent.commands.some((entry) => entry.op === 'setHeaderFooter'));

    const metadataCall = await mcp(42, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: opened.documentId,
        baseRevision: 1,
        commands: [{ op: 'setDocumentMetadata', title: 'MCP contract' }],
      },
    });
    assert.equal(metadataCall.result.isError, false, JSON.stringify(metadataCall.result.structuredContent));
    assert.equal(metadataCall.result.structuredContent.revision, 2);

    const targetMapCall = await mcp(43, 'tools/call', {
      name: 'editor_docx_target_map',
      arguments: { documentId: opened.documentId },
    });
    const cellTargetMapCall = await mcp(431, 'tools/call', {
      name: 'editor_docx_target_map',
      arguments: { documentId: opened.documentId, kind: 'cell' },
    });
    const paragraphLocation = targetMapCall.result.structuredContent.targets[0].location;
    const cellLocation = cellTargetMapCall.result.structuredContent.targets[0].location;
    const inspectCall = await mcp(44, 'tools/call', {
      name: 'editor_docx_target_inspect',
      arguments: { documentId: opened.documentId, locations: [paragraphLocation, cellLocation] },
    });
    assert.equal(inspectCall.result.structuredContent.revision, 2);

    const applyCall = await mcp(45, 'tools/call', {
      name: 'editor_docx_apply',
      arguments: {
        documentId: opened.documentId,
        baseRevision: 2,
        commands: [
          { op: 'text.replaceParagraph', location: paragraphLocation, text: 'Edited through catalog-aware MCP' },
          { op: 'table.applyCellStyle', target: cellLocation, cellStyle: { fill: '#FFF2CC' } },
        ],
      },
    });
    assert.equal(applyCall.result.isError, false);
    assert.equal(applyCall.result.structuredContent.revision, 3);

    const editedReadCall = await mcp(46, 'tools/call', {
      name: 'editor_docx_read_json',
      arguments: { documentId: opened.documentId, view: 'blocks' },
    });
    assert.match(JSON.stringify(editedReadCall.result.structuredContent), /Edited through catalog-aware MCP/);

    const renderCall = await mcp(47, 'tools/call', {
      name: 'editor_docx_render_pages',
      arguments: { documentId: opened.documentId, baseRevision: 3, pages: [1, 3], includeBaseline: false },
    });
    assert.equal(renderCall.result.isError, false);
    assert.deepEqual(renderCall.result.structuredContent.selectedPages, [1, 3]);
    assert.match(renderCall.result.structuredContent.pages[0].bytesBase64, /^[A-Za-z0-9+/]+=*$/);
    assert.equal(renderCall.result.content[0].text.includes(renderCall.result.structuredContent.pages[0].bytesBase64), false);
    assert.match(renderCall.result.content[0].text, /omitted/);

    const compareCall = await mcp(48, 'tools/call', {
      name: 'editor_docx_render_pages',
      arguments: { documentId: opened.documentId, baseRevision: 3, pages: [1], includeBaseline: true },
    });
    assert.equal(compareCall.result.isError, false);
    assert.equal(compareCall.result.structuredContent.visualComparisonRequired, true);
    assert.equal(compareCall.result.structuredContent.baseline.pages.length, 1);
    assert.equal(compareCall.result.structuredContent.current.pages.length, 1);

    const directPageResponse = await fetch(`${origin}/v1/docx/documents/${opened.documentId}/pages/render-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 2 }),
    });
    assert.equal(directPageResponse.status, 200);
    const directPage = await directPageResponse.json();
    assert.equal(directPage.page.page, 2);
    assert.equal(directPage.renderer, 'test-uno-webp');

    const directAllResponse = await fetch(`${origin}/v1/docx/documents/${opened.documentId}/pages/render-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(directAllResponse.status, 200);
    const directAll = await directAllResponse.json();
    assert.deepEqual(directAll.selectedPages, [1, 2, 3]);

    const prematurePdf = await mcp(49, 'tools/call', {
      name: 'editor_docx_export_pdf',
      arguments: { documentId: opened.documentId, baseRevision: 3, filename: 'premature.pdf' },
    });
    assert.equal(prematurePdf.result.isError, true);
    assert.match(prematurePdf.result.structuredContent.message, /quality_check_required/);

    const prematureSave = await mcp(5, 'tools/call', {
      name: 'editor_docx_save_source',
      arguments: { documentId: opened.documentId, baseRevision: 3, filename: 'mcp-premature.docx' },
    });
    assert.equal(prematureSave.result.isError, true);
    assert.match(prematureSave.result.structuredContent.message, /quality_check_required/);

    const qualityCall = await mcp(6, 'tools/call', {
      name: 'editor_docx_quality_check',
      arguments: { documentId: opened.documentId, baseRevision: 3 },
    });
    assert.equal(qualityCall.result.structuredContent.ok, true);
    assert.ok(qualityCall.result.structuredContent.issues.some((issue) => issue.severity === 'info'));

    const pdfCall = await mcp(61, 'tools/call', {
      name: 'editor_docx_export_pdf',
      arguments: { documentId: opened.documentId, baseRevision: 3, filename: 'mcp-smoke-output.pdf' },
    });
    assert.equal(pdfCall.result.isError, false, JSON.stringify(pdfCall.result.structuredContent));
    assert.equal(pdfCall.result.structuredContent.mimeType, 'application/pdf');
    assert.match(pdfCall.result.structuredContent.artifactId, /^[0-9a-f-]{36}$/);
    const pdfArtifactCall = await mcp(62, 'tools/call', {
      name: 'editor_docx_artifact_read',
      arguments: {
        artifactId: pdfCall.result.structuredContent.artifactId,
        expectedSha256: pdfCall.result.structuredContent.sha256,
      },
    });
    assert.equal(pdfArtifactCall.result.isError, false);
    assert.equal(Buffer.from(pdfArtifactCall.result.structuredContent.bytesBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
    assert.equal(pdfArtifactCall.result.structuredContent.mimeType, 'application/pdf');
    const pdfDeleteCall = await mcp(63, 'tools/call', {
      name: 'editor_docx_artifact_delete',
      arguments: {
        artifactId: pdfCall.result.structuredContent.artifactId,
        expectedSha256: pdfCall.result.structuredContent.sha256,
      },
    });
    assert.equal(pdfDeleteCall.result.structuredContent.deleted, true);

    const saveCall = await mcp(7, 'tools/call', {
      name: 'editor_docx_save_source',
      arguments: { documentId: opened.documentId, baseRevision: 3, filename: 'mcp-smoke-output.docx' },
    });
    assert.equal(saveCall.result.isError, false);
    assert.match(saveCall.result.structuredContent.sha256, /^[a-f0-9]{64}$/);
    assert.match(saveCall.result.structuredContent.artifactId, /^[0-9a-f-]{36}$/);
    assert.equal(saveCall.result.structuredContent.bytesRef, undefined);
    assert.equal(saveCall.result.structuredContent.sessionClosed, true);
    savedPath = artifactPath(saveCall.result.structuredContent.artifactId);

    const closedSessionRead = await mcp(71, 'tools/call', {
      name: 'editor_docx_read_json',
      arguments: { documentId: opened.documentId },
    });
    assert.equal(closedSessionRead.result.isError, true);
    assert.match(closedSessionRead.result.structuredContent.message, /Document session not found/);

    const artifactCall = await mcp(8, 'tools/call', {
      name: 'editor_docx_artifact_read',
      arguments: {
        artifactId: saveCall.result.structuredContent.artifactId,
        expectedSha256: saveCall.result.structuredContent.sha256,
      },
    });
    assert.equal(artifactCall.result.isError, false);
    assert.match(artifactCall.result.structuredContent.bytesBase64, /^[A-Za-z0-9+/]+=*$/);
    assert.equal(artifactCall.result.structuredContent.sha256, saveCall.result.structuredContent.sha256);
    assert.equal(artifactCall.result.content[0].text.includes(artifactCall.result.structuredContent.bytesBase64), false);
    assert.match(artifactCall.result.content[0].text, /omitted/);

    const deleteCall = await mcp(9, 'tools/call', {
      name: 'editor_docx_artifact_delete',
      arguments: {
        artifactId: saveCall.result.structuredContent.artifactId,
        expectedSha256: saveCall.result.structuredContent.sha256,
      },
    });
    assert.equal(deleteCall.result.structuredContent.deleted, true);
    savedPath = '';
  } finally {
    await close(server);
    if (savedPath) {
      await rm(savedPath, { force: true });
    }
  }
});

test('MCP read and target streams stay bounded, complete, opaque, and revision-bound', async () => {
  const server = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: 'http://127.0.0.1:9',
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: false,
    docxRenderer: fakeDocxRenderer,
  });
  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let requestId = 10_000;
  const mcp = async (name, argumentsValue) => {
    const response = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId++,
        method: 'tools/call',
        params: { name, arguments: argumentsValue },
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const assertBounded = (response) => {
    assert.ok(
      Buffer.byteLength(JSON.stringify(response), 'utf8') <= 24 * 1024,
      `MCP response exceeded 24 KiB: ${Buffer.byteLength(JSON.stringify(response), 'utf8')}`,
    );
  };

  try {
    const sourceBytes = createDocxBytes({
      paragraphs: Array.from({ length: 220 }, (_, index) => `Paragraph ${index}: ${'\\"'.repeat(320)}`),
      tables: [
        { rows: Array.from({ length: 24 }, (_, row) => [`A${row} ${'\\"'.repeat(160)}`, `B${row} ${'\\"'.repeat(160)}`]) },
        { rows: Array.from({ length: 18 }, (_, row) => [`C${row} ${'\\"'.repeat(160)}`, `D${row} ${'\\"'.repeat(160)}`]) },
      ],
    });
    const openedCall = await mcp('editor_docx_open', {
      filename: 'bounded-stream.docx',
      bytesBase64: sourceBytes.toString('base64'),
    });
    const opened = openedCall.result.structuredContent;
    assert.equal(opened.pageCount, opened.pageCountEstimate);
    assert.equal(opened.pageCountSource, 'paragraph-heuristic');
    assert.equal(opened.pageCountIsEstimate, true);

    const summaryCall = await mcp('editor_docx_read_json', { documentId: opened.documentId });
    const summary = summaryCall.result.structuredContent;
    assert.equal(summary.view, 'summary');
    assert.equal(summary.total, 1);
    assert.equal(summary.returned, 1);
    assert.equal(summary.nextCursor, null);
    assert.equal(summary.items[0].tableCount, 2);
    assert.equal(summary.items[0].pageCount, summary.items[0].pageCountEstimate);
    assert.equal(summary.items[0].pageCountSource, 'paragraph-heuristic');
    assert.equal(summary.items[0].pageCountIsEstimate, true);
    assert.equal(summary.blocks, undefined);
    assert.equal(summary.sections, undefined);
    assertBounded(summaryCall);

    const firstBlocksCall = await mcp('editor_docx_read_json', {
      documentId: opened.documentId,
      view: 'blocks',
      limit: 100,
      textPreviewChars: 512,
    });
    const firstBlocks = firstBlocksCall.result.structuredContent;
    assert.equal(firstBlocks.view, 'blocks');
    assert.ok(firstBlocks.returned > 0 && firstBlocks.returned < 100);
    assert.match(firstBlocks.nextCursor, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(firstBlocks.items[0].textPreview.length, 512);
    assert.equal(firstBlocks.items[0].textTruncated, true);
    assertBounded(firstBlocksCall);

    const blockIds = [];
    let blockCursor = null;
    let blockTotal = 0;
    do {
      const call = await mcp('editor_docx_read_json', blockCursor
        ? { documentId: opened.documentId, cursor: blockCursor }
        : { documentId: opened.documentId, view: 'blocks', limit: 100, textPreviewChars: 512 });
      assert.equal(call.result.isError, false, JSON.stringify(call.result.structuredContent));
      assertBounded(call);
      const page = call.result.structuredContent;
      blockTotal = page.total;
      blockIds.push(...page.items.map((item) => item.id));
      blockCursor = page.nextCursor;
    } while (blockCursor);
    assert.equal(blockIds.length, blockTotal);
    assert.equal(new Set(blockIds).size, blockTotal);

    const tableCall = await mcp('editor_docx_read_json', {
      documentId: opened.documentId,
      view: 'tables',
      limit: 100,
      textPreviewChars: 64,
      cellPreviewLimit: 2,
    });
    const tablePage = tableCall.result.structuredContent;
    assert.equal(tablePage.total, 2);
    assert.ok(tablePage.items.every((table) => table.cells.length === 2 && table.cellPreviewTruncated));
    assertBounded(tableCall);

    const maximumTablePreviewCall = await mcp('editor_docx_read_json', {
      documentId: opened.documentId,
      view: 'tables',
      limit: 100,
      textPreviewChars: 512,
      cellPreviewLimit: 12,
    });
    const maximumTablePreview = maximumTablePreviewCall.result.structuredContent;
    assert.ok(maximumTablePreview.items.every((table) => table.cells.length >= 1 && table.cells.length <= 12));
    assert.ok(maximumTablePreview.items.every((table) => table.cellPreviewReturned === table.cells.length));
    assert.ok(maximumTablePreview.items.every((table) => table.cellPreviewTruncated));
    assertBounded(maximumTablePreviewCall);

    const paragraphLocations = [];
    let paragraphCursor = null;
    let paragraphTotal = 0;
    do {
      const call = await mcp('editor_docx_target_map', paragraphCursor
        ? { documentId: opened.documentId, cursor: paragraphCursor }
        : { documentId: opened.documentId, kind: 'paragraph', limit: 120 });
      assert.equal(call.result.isError, false, JSON.stringify(call.result.structuredContent));
      assertBounded(call);
      const page = call.result.structuredContent;
      assert.equal(page.editableTargets, undefined);
      assert.equal(page.locations, undefined);
      paragraphTotal = page.total;
      paragraphLocations.push(...page.targets.map((target) => JSON.stringify(target.location)));
      paragraphCursor = page.nextCursor;
    } while (paragraphCursor);
    assert.equal(paragraphLocations.length, paragraphTotal);
    assert.equal(new Set(paragraphLocations).size, paragraphTotal);

    const filteredCellsCall = await mcp('editor_docx_target_map', {
      documentId: opened.documentId,
      kind: 'cell',
      tableId: 'tbl_1',
      limit: 120,
    });
    const filteredCells = filteredCellsCall.result.structuredContent;
    assert.equal(filteredCells.kind, 'cell');
    assert.equal(filteredCells.tableId, 'tbl_1');
    assert.ok(filteredCells.total > 0);
    assert.equal(filteredCells.returned, filteredCells.total);
    assert.equal(filteredCells.nextCursor, null);
    assert.ok(filteredCells.targets.every((target) => target.location.tableId === 'tbl_1'));
    assert.ok(filteredCells.targets.every((target) => target.styleFingerprint === undefined));
    assert.ok(filteredCells.targets.every((target) => target.capacity === undefined));
    assertBounded(filteredCellsCall);

    const mismatchCall = await mcp('editor_docx_read_json', {
      documentId: opened.documentId,
      cursor: firstBlocks.nextCursor,
      view: 'tables',
    });
    assert.equal(mismatchCall.result.isError, true);
    assert.match(mismatchCall.result.structuredContent.message, /cursor_query_mismatch/);

    const cursorParts = firstBlocks.nextCursor.split('.');
    cursorParts[2] = `${cursorParts[2][0] === 'A' ? 'B' : 'A'}${cursorParts[2].slice(1)}`;
    const tamperedCall = await mcp('editor_docx_read_json', {
      documentId: opened.documentId,
      cursor: cursorParts.join('.'),
    });
    assert.equal(tamperedCall.result.isError, true);
    assert.match(tamperedCall.result.structuredContent.message, /invalid_cursor/);

    const legacyMapResponse = await fetch(`${origin}/v1/docx/documents/${opened.documentId}/target/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(legacyMapResponse.status, 200);
    const legacyMap = await legacyMapResponse.json();
    assert.ok(legacyMap.editableTargets.paragraphs.length > 0);
    assert.deepEqual(legacyMap.editableTargets, legacyMap.locations);

    const referenceTarget = { range: { start: { nodeId: 'p_0', offset: 0 } } };
    const inspectedReferenceTarget = await mcp('editor_docx_target_inspect', {
      documentId: opened.documentId,
      locations: [referenceTarget],
    });
    assert.equal(inspectedReferenceTarget.result.isError, false);

    const appliedCall = await mcp('editor_docx_apply', {
      documentId: opened.documentId,
      baseRevision: opened.revision,
      commands: [
        { op: 'setDocumentMetadata', title: 'revision two' },
        {
          op: 'reference.insert',
          target: referenceTarget,
          occurrenceId: '01K123456789ABCDEFGHJKMNPQ',
          displayText: '[1]',
          tooltip: 'Registered source',
        },
      ],
    });
    assert.equal(appliedCall.result.isError, false, JSON.stringify(appliedCall.result.structuredContent));
    assert.equal(appliedCall.result.structuredContent.revision, 2);

    const referenceCall = await mcp('editor_docx_read_json', {
      documentId: opened.documentId,
      view: 'references',
      limit: 100,
    });
    const referencePage = referenceCall.result.structuredContent;
    assert.equal(referencePage.revision, 2);
    assert.equal(referencePage.total, 1);
    assert.equal(referencePage.items[0].occurrenceId, '01K123456789ABCDEFGHJKMNPQ');
    assert.equal(referencePage.items[0].tooltip, 'Registered source');
    assertBounded(referenceCall);

    const staleCall = await mcp('editor_docx_read_json', {
      documentId: opened.documentId,
      cursor: firstBlocks.nextCursor,
    });
    assert.equal(staleCall.result.isError, true);
    assert.match(staleCall.result.structuredContent.message, /stale_cursor.*revision 1.*revision 2/);

    const discarded = await mcp('editor_docx_discard', { documentId: opened.documentId, baseRevision: 2 });
    assert.equal(discarded.result.structuredContent.sessionClosed, true);
  } finally {
    await close(server);
  }
});

test('gateway requires Bearer auth for MCP and editor API when bound beyond loopback', async () => {
  const server = createGatewayServer({
    host: '0.0.0.0',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: 'http://127.0.0.1:9',
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: false,
    internalBearerToken: 'mcp-test-token',
  });
  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const unauthorized = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mcp-test-token' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
    });
    assert.equal(authorized.status, 200);
    assert.deepEqual((await authorized.json()).result, {});

    const apiUnauthorized = await fetch(`${origin}/v1/docx/documents/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'blocked.docx', source: { bytesBase64: 'AA==' } }),
    });
    assert.equal(apiUnauthorized.status, 401);
  } finally {
    await close(server);
  }
});

test('gateway resolves DOCX action URL from discovery XML', () => {
  const path = resolveDocxActionPath(
    '<wopi-discovery><net-zone><app name="writer"><action name="edit" ext="docx" urlsrc="http://127.0.0.1:9980/docx/browser/abc/cool.html?"/></app></net-zone></wopi-discovery>',
    '/docx',
  );
  assert.equal(path, '/docx/browser/abc/cool.html');
});

test('gateway DOCX page embeds the editor URL directly', () => {
  const html = renderDocxPage('http://127.0.0.1:11004/docx/browser/abc/cool.html?WOPISrc=x');
  assert.match(html, /<iframe/);
  assert.match(html, /<title>Academic DOCX Editor<\/title>/);
  assert.match(html, /Academic DOCX Editor for opening, editing, and saving DOCX documents/);
  assert.match(html, /DOCX editor/);
  assert.doesNotMatch(html, /class="top"/);
  assert.doesNotMatch(html, />HWPX</);
  assert.match(html, /height: 100%/);
  assert.match(html, /WOPISrc=x/);
  assert.match(html, /rel="icon" href="data:,"/);
  assert.match(html, /event\.source === window\.parent/);
  assert.match(html, /event\.source === editorFrame\?\.contentWindow/);
  assert.match(html, /event\.origin !== parentOrigin/);
  assert.match(html, /editorFrame\.contentWindow\.postMessage/);
});

test('gateway signed DOCX wrapper bridges only the trusted parent and nested editor origins', () => {
  const html = renderDocxPage('https://editor.example/docx/browser/cool.html', {
    access_token: 'token',
    access_token_ttl: '123',
  });
  assert.match(html, /document\.referrer \? new URL\(document\.referrer\)\.origin/);
  assert.match(html, /event\.origin !== parentOrigin/);
  assert.match(html, /event\.origin === window\.location\.origin/);
  assert.match(html, /window\.parent\.postMessage\(event\.data, parentOrigin\)/);
  assert.doesNotMatch(html, /postMessage\(event\.data, ['"]\*['"]\)/);
});

test('gateway strips upstream branding from proxied editor HTML', () => {
  const html = sanitizeEditorHtml(
    '<input type="hidden" id="init-product-branding-url" value="https://www.collaboraonline.com" />' +
      '<h1>Collabora Online Development Edition</h1>' +
      '<img src="collabora-office-white.svg">',
  );

  assert.doesNotMatch(html, /collabora/i);
  assert.match(html, /Document Editor/);
  assert.match(html, /document-editor-white\.svg/);
  assert.match(html, /id="init-product-branding-url" value=""/);
});

test('gateway extends upstream frame ancestors with configured ServiceV2 origins', () => {
  const policy = "default-src 'none'; frame-ancestors editor.example:*; img-src 'self';";
  const extended = extendFrameAncestors(policy, [
    'http://127.0.0.1:11002',
    'https://code-dev-v2.tlooto.com',
  ]);

  assert.match(
    extended,
    /frame-ancestors editor\.example:\* http:\/\/127\.0\.0\.1:11002 https:\/\/code-dev-v2\.tlooto\.com;/,
  );
  assert.match(extended, /img-src 'self'/);
});

test('gateway forwards DOCX websocket upgrades with public proxy headers', async () => {
  let capturedRequest = null;
  const upstream = http.createServer();
  upstream.on('upgrade', (request, socket) => {
    capturedRequest = {
      url: request.url,
      headers: request.headers,
    };
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.end();
  });

  const upstreamAddress = await listen(upstream);
  assert.equal(typeof upstreamAddress, 'object');

  const gateway = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: `http://127.0.0.1:${upstreamAddress.port}`,
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: true,
  });
  const gatewayAddress = await listen(gateway);
  assert.equal(typeof gatewayAddress, 'object');

  try {
    const response = await requestWebSocketUpgrade(gatewayAddress.port, '/cool/ws?WOPISrc=x', [
      'Sec-WebSocket-Extensions: permessage-deflate',
    ]);
    assert.match(response, /101 Switching Protocols/);
    assert.equal(capturedRequest?.url, '/docx/cool/ws?WOPISrc=x');
    assert.equal(capturedRequest?.headers.host, `127.0.0.1:${gatewayAddress.port}`);
    assert.equal(capturedRequest?.headers.origin, `http://127.0.0.1:${gatewayAddress.port}`);
    assert.equal(capturedRequest?.headers['x-forwarded-host'], `127.0.0.1:${gatewayAddress.port}`);
    assert.equal(capturedRequest?.headers['x-forwarded-proto'], 'http');
    assert.equal(capturedRequest?.headers['sec-websocket-extensions'], undefined);
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('gateway prefixes root DOCX runtime HTTP requests with the service root', async () => {
  let capturedRequest = null;
  const upstream = http.createServer((request, response) => {
    capturedRequest = {
      url: request.url,
      headers: request.headers,
    };
    response.writeHead(204);
    response.end();
  });

  const upstreamAddress = await listen(upstream);
  assert.equal(typeof upstreamAddress, 'object');

  const gateway = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: `http://127.0.0.1:${upstreamAddress.port}`,
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: true,
  });
  const gatewayAddress = await listen(gateway);
  assert.equal(typeof gatewayAddress, 'object');

  try {
    const response = await fetch(`http://127.0.0.1:${gatewayAddress.port}/browser/hash/branding.css`, {
      headers: {
        'X-Forwarded-Host': 'localhost:11002',
        'X-Forwarded-Proto': 'http',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(capturedRequest?.url, '/docx/browser/hash/branding.css');
    assert.equal(capturedRequest?.headers.host, 'localhost:11002');
    assert.equal(capturedRequest?.headers['x-forwarded-host'], 'localhost:11002');
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('gateway replaces only missing optional DOCX runtime assets after an upstream 404', async () => {
  const requestedPaths = [];
  const upstream = http.createServer((request, response) => {
    requestedPaths.push(request.url);
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('missing upstream asset');
  });

  const upstreamAddress = await listen(upstream);
  assert.equal(typeof upstreamAddress, 'object');

  const gateway = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: `http://127.0.0.1:${upstreamAddress.port}`,
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: true,
  });
  const gatewayAddress = await listen(gateway);
  assert.equal(typeof gatewayAddress, 'object');

  const assets = [
    ['branding.css', 'text/css', /branding stylesheet/],
    ['branding.js', 'text/javascript', /branding script/],
    ['branding-desktop.css', 'text/css', /desktop branding stylesheet/],
    ['images/lc_sr20006.svg', 'image/svg+xml', /^<svg /],
    ['images/lc_validatesidebara11y.svg', 'image/svg+xml', /^<svg /],
    ['images/lc_validatedialogsa11y.svg', 'image/svg+xml', /^<svg /],
  ];

  try {
    for (const [assetPath, contentType, bodyPattern] of assets) {
      const response = await fetch(
        `http://127.0.0.1:${gatewayAddress.port}/docx/browser/version-hash/${assetPath}`,
      );
      assert.equal(response.status, 200);
      assert.equal((response.headers.get('content-type') ?? '').startsWith(contentType), true);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-editor-optional-asset-fallback'), 'upstream-404');
      assert.match(await response.text(), bodyPattern);
    }

    assert.deepEqual(requestedPaths, assets.map(([assetPath]) => `/docx/browser/version-hash/${assetPath}`));
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('gateway preserves configured branding assets and unrelated upstream 404 responses', async () => {
  const upstream = http.createServer((request, response) => {
    if (request.url === '/docx/browser/version-hash/branding.css') {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      response.end('.custom-brand { color: rebeccapurple; }');
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('required asset missing');
  });

  const upstreamAddress = await listen(upstream);
  assert.equal(typeof upstreamAddress, 'object');

  const gateway = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: `http://127.0.0.1:${upstreamAddress.port}`,
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: true,
  });
  const gatewayAddress = await listen(gateway);
  assert.equal(typeof gatewayAddress, 'object');

  try {
    const configuredBranding = await fetch(
      `http://127.0.0.1:${gatewayAddress.port}/docx/browser/version-hash/branding.css`,
    );
    assert.equal(configuredBranding.status, 200);
    assert.equal(configuredBranding.headers.get('x-editor-optional-asset-fallback'), null);
    assert.equal(await configuredBranding.text(), '.custom-brand { color: rebeccapurple; }');

    const requiredAsset = await fetch(
      `http://127.0.0.1:${gatewayAddress.port}/docx/browser/version-hash/required-runtime.js`,
    );
    assert.equal(requiredAsset.status, 404);
    assert.equal(requiredAsset.headers.get('x-editor-optional-asset-fallback'), null);
    assert.equal(await requiredAsset.text(), 'required asset missing');
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('gateway preserves forwarded public host for proxied DOCX websocket upgrades', async () => {
  let capturedRequest = null;
  const upstream = http.createServer();
  upstream.on('upgrade', (request, socket) => {
    capturedRequest = {
      url: request.url,
      headers: request.headers,
    };
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.end();
  });

  const upstreamAddress = await listen(upstream);
  assert.equal(typeof upstreamAddress, 'object');

  const gateway = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1:11004',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: `http://127.0.0.1:${upstreamAddress.port}`,
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1:11004',
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: true,
  });
  const gatewayAddress = await listen(gateway);
  assert.equal(typeof gatewayAddress, 'object');

  try {
    const response = await requestWebSocketUpgrade(gatewayAddress.port, '/docx/cool/ws?WOPISrc=x', [
      'X-Forwarded-Host: localhost:11002',
      'X-Forwarded-Proto: http',
    ]);
    assert.match(response, /101 Switching Protocols/);
    assert.equal(capturedRequest?.url, '/docx/cool/ws?WOPISrc=x');
    assert.equal(capturedRequest?.headers.host, 'localhost:11002');
    assert.equal(capturedRequest?.headers.origin, 'http://localhost:11002');
    assert.equal(capturedRequest?.headers['x-forwarded-host'], 'localhost:11002');
    assert.equal(capturedRequest?.headers['x-forwarded-proto'], 'http');
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('gateway owns persistent document sessions and keeps document IDs isolated', async () => {
  const upstream = http.createServer((request, response) => {
    if (request.url === '/docx/hosting/discovery') {
      response.writeHead(200, { 'Content-Type': 'text/xml' });
      response.end('<wopi-discovery><net-zone><app name="writer"><action ext="docx" urlsrc="http://runtime/browser/hash/cool.html?" /></app></net-zone></wopi-discovery>');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const upstreamAddress = await listen(upstream);
  assert.equal(typeof upstreamAddress, 'object');

  const documentRoot = await mkdtemp(path.join(tmpdir(), 'academic-editor-documents-'));
  const documentStore = new EditorDocumentStore({
    root: documentRoot,
    tokenSecret: 'gateway-test-token-secret-with-at-least-32-characters',
    tokenTtlMs: 60_000,
  });
  await documentStore.init();
  const gatewayPort = await reservePort();
  const gatewayOrigin = `http://127.0.0.1:${gatewayPort}`;
  const server = createGatewayServer({
    host: '127.0.0.1',
    port: gatewayPort,
    publicOrigin: gatewayOrigin,
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: `http://127.0.0.1:${upstreamAddress.port}`,
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: gatewayOrigin,
    sampleDocxPath: path.join(tmpdir(), 'sample.docx'),
    enableSampleDocx: false,
    allowedWopiOrigins: new Set([gatewayOrigin]),
    frameAncestorOrigins: ['https://code-dev-v2.tlooto.com'],
    internalBearerToken: 'gateway-test-api-key-with-24-characters',
    documentStore,
  });
  const address = await listen(server, gatewayPort);
  assert.equal(typeof address, 'object');
  const apiHeaders = { Authorization: 'Bearer gateway-test-api-key-with-24-characters' };

  try {
    const createDocument = async (title, initialText) => {
      const response = await fetch(`${gatewayOrigin}/api/documents`, {
        method: 'POST',
        headers: { ...apiHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, initialText }),
      });
      assert.equal(response.status, 201);
      return response.json();
    };
    const first = await createDocument('First', 'alpha');
    const second = await createDocument('Second', 'beta');
    assert.notEqual(first.documentId, second.documentId);

    const createSession = async (documentId) => {
      const response = await fetch(`${gatewayOrigin}/api/documents/${documentId}/session`, { method: 'POST', headers: apiHeaders });
      assert.equal(response.status, 200);
      return response.json();
    };
    const firstSession = await createSession(first.documentId);
    const secondSession = await createSession(second.documentId);
    assert.notEqual(firstSession.formParameters.access_token, secondSession.formParameters.access_token);
    assert.match(firstSession.formParameters.wopi_src, new RegExp(first.documentId));

    const openFirst = await fetch(firstSession.actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(firstSession.formParameters),
    });
    assert.equal(openFirst.status, 200);
    assert.equal(
      openFirst.headers.get('content-security-policy'),
      "frame-ancestors 'self' https://code-dev-v2.tlooto.com;",
    );
    const firstHtml = await openFirst.text();
    assert.match(firstHtml, new RegExp(first.documentId));
    assert.doesNotMatch(firstHtml, new RegExp(second.documentId));

    const unsignedGet = await fetch(firstSession.actionUrl);
    assert.equal(unsignedGet.status, 405);
    const mismatched = await fetch(firstSession.actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...secondSession.formParameters,
        wopi_src: `${gatewayOrigin}/docx/wopi/files/${first.documentId}`,
      }),
    });
    assert.equal(mismatched.status, 400);

    const wopiUrl = new URL(firstSession.formParameters.wopi_src);
    wopiUrl.searchParams.set('access_token', firstSession.formParameters.access_token);
    const info = await fetch(wopiUrl);
    assert.equal(info.status, 200);
    const infoPayload = await info.json();
    assert.equal(infoPayload.BaseFileName, 'First.docx');
    const lock = await fetch(wopiUrl, {
      method: 'POST',
      headers: { 'X-WOPI-Override': 'LOCK', 'X-WOPI-Lock': 'lock-first' },
    });
    assert.equal(lock.status, 200);
    const unmodifiedSave = await fetch(`${wopiUrl.origin}${wopiUrl.pathname}/contents${wopiUrl.search}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'X-WOPI-Lock': 'lock-first',
        'X-COOL-WOPI-IsModifiedByUser': 'false',
      },
      body: createDocxBytes({ paragraphs: ['engine normalization must not replace alpha'] }),
    });
    assert.equal(unmodifiedSave.status, 200);
    assert.equal(unmodifiedSave.headers.get('x-wopi-itemversion'), infoPayload.Version);
    const preservedDownload = await fetch(`${gatewayOrigin}/api/documents/${first.documentId}/download`, { headers: apiHeaders });
    const preservedDocumentXml = getDocumentXml(Buffer.from(await preservedDownload.arrayBuffer()));
    assert.match(preservedDocumentXml, /alpha/);
    assert.doesNotMatch(
      preservedDocumentXml,
      /engine normalization must not replace alpha/,
    );
    const save = await fetch(`${wopiUrl.origin}${wopiUrl.pathname}/contents${wopiUrl.search}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'X-WOPI-Lock': 'lock-first',
        'X-COOL-WOPI-IsModifiedByUser': 'true',
      },
      body: createDocxBytes({ paragraphs: ['changed first'] }),
    });
    assert.equal(save.status, 200);

    const firstDownload = await fetch(`${gatewayOrigin}/api/documents/${first.documentId}/download`, { headers: apiHeaders });
    const secondDownload = await fetch(`${gatewayOrigin}/api/documents/${second.documentId}/download`, { headers: apiHeaders });
    assert.match(getDocumentXml(Buffer.from(await firstDownload.arrayBuffer())), /changed first/);
    assert.match(getDocumentXml(Buffer.from(await secondDownload.arrayBuffer())), /beta/);

    const callMcp = async (id, name, args) => {
      const response = await fetch(`${gatewayOrigin}/mcp`, {
        method: 'POST',
        headers: {
          ...apiHeaders,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
      });
      assert.equal(response.status, 200);
      return (await response.json()).result.structuredContent;
    };
    const liveOpened = await callMcp(500, 'editor_docx_open', {
      filename: 'live-preview.docx',
      bytesBase64: createDocxBytes({ paragraphs: ['live before'] }).toString('base64'),
    });
    assert.equal(liveOpened.liveEditorSession.documentId, liveOpened.documentId);
    assert.equal(liveOpened.liveEditorSession.readOnly, true);
    const liveOpenResponse = await fetch(liveOpened.liveEditorSession.actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(liveOpened.liveEditorSession.formParameters),
    });
    assert.equal(liveOpenResponse.status, 200);
    const liveWopiUrl = new URL(liveOpened.liveEditorSession.formParameters.wopi_src);
    liveWopiUrl.searchParams.set('access_token', liveOpened.liveEditorSession.formParameters.access_token);
    const liveInfo = await fetch(liveWopiUrl);
    assert.equal(liveInfo.status, 200);
    const liveInfoPayload = await liveInfo.json();
    assert.equal(liveInfoPayload.ReadOnly, true);
    assert.equal(liveInfoPayload.UserCanWrite, false);
    const liveBefore = await fetch(`${liveWopiUrl.origin}${liveWopiUrl.pathname}/contents${liveWopiUrl.search}`);
    assert.match(getDocumentXml(Buffer.from(await liveBefore.arrayBuffer())), /live before/);
    const liveApplied = await callMcp(501, 'editor_docx_apply', {
      documentId: liveOpened.documentId,
      baseRevision: 1,
      commands: [{ op: 'appendParagraph', text: 'live after' }],
    });
    assert.equal(liveApplied.revision, 2);
    const liveAfter = await fetch(`${liveWopiUrl.origin}${liveWopiUrl.pathname}/contents${liveWopiUrl.search}`);
    assert.equal(liveAfter.headers.get('x-wopi-itemversion'), '2');
    assert.match(getDocumentXml(Buffer.from(await liveAfter.arrayBuffer())), /live after/);
    const liveWrite = await fetch(`${liveWopiUrl.origin}${liveWopiUrl.pathname}/contents${liveWopiUrl.search}`, {
      method: 'POST',
      body: createDocxBytes({ paragraphs: ['must not write'] }),
    });
    assert.equal(liveWrite.status, 405);
    await callMcp(502, 'editor_docx_discard', {
      documentId: liveOpened.documentId,
      baseRevision: liveApplied.revision,
    });

    const unauthorized = await fetch(`${gatewayOrigin}/api/documents/${first.documentId}`);
    assert.equal(unauthorized.status, 401);
    const deleted = await fetch(`${gatewayOrigin}/api/documents/${first.documentId}`, { method: 'DELETE', headers: apiHeaders });
    assert.equal(deleted.status, 204);
    const missing = await fetch(`${gatewayOrigin}/api/documents/${first.documentId}`, { headers: apiHeaders });
    assert.equal(missing.status, 404);

    const root = await fetch(`${gatewayOrigin}/docx/`);
    assert.equal(root.status, 404);
  } finally {
    await close(server);
    await close(upstream);
    await rm(documentRoot, { recursive: true, force: true });
  }
});

test('gateway serves HWPX static assets on the public /hwpx path', async () => {
  const staticRoot = await mkdtemp(path.join(tmpdir(), 'academic-editor-hwpx-'));
  await mkdir(path.join(staticRoot, 'assets'), { recursive: true });
  await writeFile(path.join(staticRoot, 'index.html'), '<!doctype html><div id="studio-root"></div>');
  await writeFile(path.join(staticRoot, 'assets', 'app.js'), 'console.log("hwpx");');

  const server = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: 'http://127.0.0.1:9980',
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: staticRoot,
    wopiBaseUrl: 'http://127.0.0.1',
    sampleDocxPath: path.join(staticRoot, 'sample.docx'),
    enableSampleDocx: true,
  });

  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const html = await fetch(`${origin}/hwpx/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /studio-root/);

    const script = await fetch(`${origin}/hwpx/assets/app.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /hwpx/);
  } finally {
    await close(server);
    await rm(staticRoot, { recursive: true, force: true });
  }
});

test('gateway serves the local image studio with external network access blocked', async () => {
  const staticRoot = await mkdtemp(path.join(tmpdir(), 'academic-editor-image-'));
  await mkdir(path.join(staticRoot, 'dist'), { recursive: true });
  await writeFile(path.join(staticRoot, 'index.html'), [
    '<!doctype html>',
    '<title>miniPaint - image editor</title>',
    '<a class="logo" href="#">miniPaint</a>',
    '<script src="dist/bundle.js"></script>',
  ].join(''));
  await writeFile(path.join(staticRoot, 'dist', 'bundle.js'), 'window.imageStudioReady = true;');

  const server = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    imageBasePath: '/image/',
    docxRuntimeOrigin: 'http://127.0.0.1:9980',
    hwpxRuntimeOrigin: '',
    imageStaticRoot: staticRoot,
    wopiBaseUrl: 'http://127.0.0.1',
    sampleDocxPath: path.join(staticRoot, 'sample.docx'),
    enableSampleDocx: true,
  });

  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const html = await fetch(`${origin}/image/`);
    assert.equal(html.status, 200);
    assert.equal(html.headers.get('content-security-policy'), "default-src 'self' blob: data:; connect-src 'self'; font-src 'self' data:; img-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:");
    assert.equal(html.headers.get('referrer-policy'), 'no-referrer');
    assert.match(await html.text(), /Tlooto Image Studio/);

    const script = await fetch(`${origin}/image/dist/bundle.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /imageStudioReady/);
  } finally {
    await close(server);
    await rm(staticRoot, { recursive: true, force: true });
  }
});

test('gateway opens and saves a capability-scoped local image session', async () => {
  const staticRoot = path.resolve('editor_image', 'vendor', 'minipaint');
  const integrationRoot = path.resolve('editor_image');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1WQAAAABJRU5ErkJggg==', 'base64');
  const gatewayPort = await reservePort();
  const origin = `http://127.0.0.1:${gatewayPort}`;
  const server = createGatewayServer({
    host: '127.0.0.1',
    port: gatewayPort,
    publicOrigin: origin,
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    imageBasePath: '/image/',
    docxRuntimeOrigin: '',
    hwpxRuntimeOrigin: '',
    imageStaticRoot: staticRoot,
    imageIntegrationRoot: integrationRoot,
    imageSessionMaxBytes: 1024,
    wopiBaseUrl: 'http://127.0.0.1',
    enableSampleDocx: false,
  });
  const address = await listen(server, gatewayPort);
  assert.equal(typeof address, 'object');

  try {
    const created = await fetch(`${origin}/api/image-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'figure', bytesBase64: png.toString('base64') }),
    });
    assert.equal(created.status, 201);
    const session = await created.json();
    assert.match(session.editorUrl, /\/image\/\?image=\/api\/image-sessions\//);

    const source = await fetch(session.sourceUrl);
    assert.equal(source.status, 200);
    assert.equal(Buffer.compare(Buffer.from(await source.arrayBuffer()), png), 0);
    const denied = await fetch(session.sourceUrl.replace(/\/[A-Za-z0-9_-]{20,}\/source$/, '/invalid-token/source'));
    assert.equal(denied.status, 404);

    const page = await fetch(session.editorUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /tlooto-image-studio\.js/);
    const hostScript = await fetch(`${origin}/image/tlooto-image-studio.js`);
    assert.equal(hostScript.status, 200);
    assert.match(await hostScript.text(), /Save image/);

    const saved = await fetch(session.exportUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bytesBase64: png.toString('base64') }),
    });
    assert.equal(saved.status, 200);
    const result = await saved.json();
    const downloaded = await fetch(result.downloadUrl);
    assert.equal(downloaded.status, 200);
    assert.equal(Buffer.compare(Buffer.from(await downloaded.arrayBuffer()), png), 0);

    const mcpOpen = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'editor_image_open', arguments: { filename: 'mcp-figure.png', bytesBase64: png.toString('base64') } } }),
    });
    assert.equal(mcpOpen.status, 200);
    const opened = (await mcpOpen.json()).result.structuredContent;
    assert.equal(opened.ok, true);
    assert.match(opened.editorUrl, /\/image\/\?image=\/api\/image-sessions\//);
    const mcpRead = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'editor_image_session_read', arguments: { sessionId: opened.sessionId, token: opened.token } } }),
    });
    assert.equal((await mcpRead.json()).result.structuredContent.source.mimeType, 'image/png');
    const mcpSave = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'editor_image_session_save', arguments: { sessionId: opened.sessionId, token: opened.token, bytesBase64: png.toString('base64') } } }),
    });
    assert.equal((await mcpSave.json()).result.structuredContent.byteLength, png.length);
    const mcpResult = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'editor_image_session_result_read', arguments: { sessionId: opened.sessionId, token: opened.token } } }),
    });
    const resultRead = (await mcpResult.json()).result.structuredContent;
    assert.equal(resultRead.bytesBase64, png.toString('base64'));
    assert.match(resultRead.sha256, /^[a-f0-9]{64}$/);
  } finally {
    await close(server);
  }
});

test('gateway exposes HWPX document API bridge for open, inspect, command, render, and save', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'academic-editor-api-'));
  const outputPath = path.join(tempRoot, 'bridge-smoke.hwpx');
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
    hwpxPdfRenderer: fakeHwpxPdfRenderer,
  });
  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const sourcePath = path.resolve('editor_hwpx/samples/hwpx/ref/ref_text.hwpx');

  async function post(pathname, payload) {
    const response = await fetch(`${origin}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    assert.equal(response.ok, true, `${pathname}: ${JSON.stringify(json)}`);
    return json;
  }

  try {
    const opened = await post('/v1/hwpx/documents/open', {
      source: { bytesRef: sourcePath },
      filename: 'ref_text.hwpx',
    });
    assert.equal(opened.ok, true);
    assert.equal(opened.fmt, 'hwpx');

    const docxOpened = await post('/v1/docx/documents/open', {
      source: { bytesBase64: createDocxBytes({ paragraphs: ['DOCX isolation fixture'] }).toString('base64') },
      filename: 'isolation.docx',
    });
    const hwpxIdOnDocxRoute = await fetch(
      `${origin}/v1/docx/documents/${opened.documentId}/documents/read-json`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    const docxIdOnHwpxRoute = await fetch(
      `${origin}/v1/hwpx/documents/${docxOpened.documentId}/documents/read-json`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    assert.equal(hwpxIdOnDocxRoute.status, 404);
    assert.equal(docxIdOnHwpxRoute.status, 404);

    const structure = await post(`/v1/hwpx/documents/${opened.documentId}/documents/read-json`, {});
    assert.equal(structure.sourceFormat, 'hwpx');
    const firstParagraph = structure.sections[0].paragraphs.find((paragraph) => paragraph.text.trim().length > 0);
    assert.ok(firstParagraph);

    const location = { paragraph: { section: firstParagraph.section, number: firstParagraph.para } };
    const commandPayload = {
      commands: [{
        commandId: 'gateway-smoke-replace',
        op: 'text.replaceParagraph',
        location,
        text: `${firstParagraph.text} API bridge`,
      }],
    };
    const staleApply = await fetch(`${origin}/v1/hwpx/documents/${opened.documentId}/commands/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...commandPayload, baseRevision: 999 }),
    });
    assert.equal(staleApply.status, 409);
    assert.equal((await staleApply.json()).code, 'stale_revision');

    const uninspectedApply = await fetch(`${origin}/v1/hwpx/documents/${opened.documentId}/commands/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...commandPayload, baseRevision: opened.revision }),
    });
    assert.equal(uninspectedApply.status, 409);
    assert.equal((await uninspectedApply.json()).code, 'inspection_required');

    for (const [fmt, documentId, prematurePath] of [
      ['hwpx', opened.documentId, path.join(tempRoot, 'premature.hwpx')],
      ['docx', docxOpened.documentId, path.join(tempRoot, 'premature.docx')],
    ]) {
      const prematureSave = await fetch(`${origin}/v1/${fmt}/documents/${documentId}/documents/save-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRevision: 1, outputPath: prematurePath }),
      });
      assert.equal(prematureSave.status, 409);
      assert.equal((await prematureSave.json()).code, 'quality_check_required');
    }

    const inspected = await post(`/v1/hwpx/documents/${opened.documentId}/target/inspect`, { locations: [location] });
    assert.equal(inspected.targets.length, 1);

    const command = await post(`/v1/hwpx/documents/${opened.documentId}/commands/apply`, {
      ...commandPayload,
      baseRevision: opened.revision,
    });
    assert.equal(command.revision, 2);

    const quality = await post(`/v1/hwpx/documents/${opened.documentId}/quality/check`, { baseRevision: command.revision });
    assert.equal(quality.ok, true);
    assert.equal(quality.pageCount, structure.pageCount);

    const rendered = await post(`/v1/hwpx/documents/${opened.documentId}/pages/render-all`, { pages: [1] });
    assert.equal(rendered.renderer, 'rhwp-svg');
    assert.equal(rendered.pages[0].nonBlank, true);

    const renderedPage = await post(`/v1/hwpx/documents/${opened.documentId}/pages/render-page`, { page: 1 });
    assert.equal(renderedPage.renderer, 'rhwp-svg');
    assert.equal(renderedPage.page.page, 1);
    assert.equal(renderedPage.page.nonBlank, true);
    assert.equal(renderedPage.pages.length, 1);

    const exported = await post(`/v1/hwpx/documents/${opened.documentId}/documents/export-pdf`, {
      baseRevision: command.revision,
    });
    assert.equal(exported.renderer, 'rhwp-native');
    assert.equal(exported.mimeType, 'application/pdf');
    assert.equal(Buffer.from(exported.bytesBase64, 'base64').compare(FAKE_PDF_BYTES), 0);

    const saved = await post(`/v1/hwpx/documents/${opened.documentId}/documents/save-source`, {
      outputPath,
      filename: 'bridge-smoke.hwpx',
      baseRevision: command.revision,
    });
    assert.equal(saved.ok, true);
    assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  } finally {
    await close(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('gateway exposes guarded HWPX MCP open, inspect, apply, render, save, read, and delete workflow', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'academic-editor-hwpx-mcp-'));
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
    hwpxPdfRenderer: fakeHwpxPdfRenderer,
  });
  const address = await listen(server);
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const sourceBytes = await readFile(path.resolve('editor_hwpx/samples/hwpx/ref/ref_text.hwpx'));

  async function mcp(id, name, argumentsValue) {
    const response = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: argumentsValue },
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  }

  let artifact;
  let pdfArtifact;
  try {
    const catalog = await mcp(1, 'editor_hwpx_command_catalog', { op: 'text.replaceParagraph' });
    assert.equal(catalog.result.isError, false);
    assert.equal(catalog.result.structuredContent.commands[0].op, 'text.replaceParagraph');

    const openedCall = await mcp(2, 'editor_hwpx_open', {
      filename: 'ref_text.hwpx',
      bytesBase64: sourceBytes.toString('base64'),
    });
    assert.equal(openedCall.result.isError, false, JSON.stringify(openedCall.result.structuredContent));
    const opened = openedCall.result.structuredContent;

    const structureCall = await mcp(3, 'editor_hwpx_read_json', {
      documentId: opened.documentId,
      view: 'blocks',
      limit: 20,
    });
    assert.equal(structureCall.result.isError, false);
    const firstBlock = structureCall.result.structuredContent.items.find((item) => item.textLength > 0);
    assert.ok(firstBlock);

    const inspectCall = await mcp(4, 'editor_hwpx_target_inspect', {
      documentId: opened.documentId,
      locations: [firstBlock.location],
    });
    assert.equal(inspectCall.result.isError, false, JSON.stringify(inspectCall.result.structuredContent));

    const applyCall = await mcp(5, 'editor_hwpx_apply', {
      documentId: opened.documentId,
      baseRevision: opened.revision,
      commands: [{
        op: 'text.replaceParagraph',
        location: firstBlock.location,
        text: 'HWPX MCP 원자적 수정 검증',
      }],
    });
    assert.equal(applyCall.result.isError, false, JSON.stringify(applyCall.result.structuredContent));
    const revision = applyCall.result.structuredContent.revision;

    const qualityCall = await mcp(6, 'editor_hwpx_quality_check', {
      documentId: opened.documentId,
      baseRevision: revision,
    });
    assert.equal(qualityCall.result.isError, false);
    assert.equal(qualityCall.result.structuredContent.ok, true);

    const renderCall = await mcp(7, 'editor_hwpx_render_pages', {
      documentId: opened.documentId,
      baseRevision: revision,
      pages: [1],
      includeBaseline: true,
    });
    assert.equal(renderCall.result.isError, false);
    assert.equal(renderCall.result.structuredContent.baseline.pages[0].nonBlank, true);
    assert.equal(renderCall.result.structuredContent.current.pages[0].nonBlank, true);

    const exportCall = await mcp(8, 'editor_hwpx_export_pdf', {
      documentId: opened.documentId,
      baseRevision: revision,
      filename: 'hwpx-mcp-output.pdf',
    });
    assert.equal(exportCall.result.isError, false, JSON.stringify(exportCall.result.structuredContent));
    pdfArtifact = exportCall.result.structuredContent;
    assert.equal(pdfArtifact.renderer, 'rhwp-native');

    const pdfReadCall = await mcp(9, 'editor_hwpx_artifact_read', {
      artifactId: pdfArtifact.artifactId,
      expectedSha256: pdfArtifact.sha256,
    });
    assert.equal(pdfReadCall.result.isError, false);
    assert.equal(pdfReadCall.result.structuredContent.mimeType, 'application/pdf');
    assert.equal(Buffer.from(pdfReadCall.result.structuredContent.bytesBase64, 'base64').compare(FAKE_PDF_BYTES), 0);

    const pdfDeleteCall = await mcp(10, 'editor_hwpx_artifact_delete', {
      artifactId: pdfArtifact.artifactId,
      expectedSha256: pdfArtifact.sha256,
    });
    assert.equal(pdfDeleteCall.result.isError, false);
    pdfArtifact = null;

    const saveCall = await mcp(11, 'editor_hwpx_save_source', {
      documentId: opened.documentId,
      baseRevision: revision,
      filename: 'hwpx-mcp-output.hwpx',
    });
    assert.equal(saveCall.result.isError, false, JSON.stringify(saveCall.result.structuredContent));
    artifact = saveCall.result.structuredContent;

    const readCall = await mcp(12, 'editor_hwpx_artifact_read', {
      artifactId: artifact.artifactId,
      expectedSha256: artifact.sha256,
    });
    assert.equal(readCall.result.isError, false);
    assert.equal(readCall.result.structuredContent.mimeType, 'application/vnd.hancom.hwpx');
    assert.equal(
      Buffer.from(readCall.result.structuredContent.bytesBase64, 'base64').subarray(0, 2).toString('hex'),
      '504b',
    );

    const deleteCall = await mcp(13, 'editor_hwpx_artifact_delete', {
      artifactId: artifact.artifactId,
      expectedSha256: artifact.sha256,
    });
    assert.equal(deleteCall.result.isError, false);
    assert.equal(deleteCall.result.structuredContent.deleted, true);
    artifact = null;
  } finally {
    if (pdfArtifact) {
      await mcp(14, 'editor_hwpx_artifact_delete', {
        artifactId: pdfArtifact.artifactId,
        expectedSha256: pdfArtifact.sha256,
      }).catch(() => undefined);
    }
    if (artifact) {
      await mcp(15, 'editor_hwpx_artifact_delete', {
        artifactId: artifact.artifactId,
        expectedSha256: artifact.sha256,
      }).catch(() => undefined);
    }
    await close(server);
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('gateway prevents HWPX static path traversal', () => {
  const staticRoot = path.join(tmpdir(), 'academic-editor-static-root');
  assert.equal(resolveStaticPath(staticRoot, '/hwpx/', '/hwpx/../secret.txt'), '');
});
