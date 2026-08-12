import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EDITOR_MCP_TOOLS,
  handleEditorMcpJsonRpc,
  HWPX_MCP_TOOLS,
  IMAGE_MCP_TOOLS,
  PDF_MCP_TOOLS,
} from './editor-mcp.mjs';
import { EDITOR_MCP_SCHEMA_FACTORY } from '../editor_common/editor-mcp-tool-factory.mjs';
import { PDF_COMMAND_OPS } from '../editor_pdf/scripts/pdf-command-catalog.mjs';
import { HWPX_COMMAND_CATALOG, getHwpxCommandCatalog } from '../editor_hwpx/scripts/hwpx-command-catalog.mjs';
import {
  ACADEMIC_EDITOR_MCP_INSTRUCTIONS,
  HWPX_MCP_CONTRACT,
  HWPX_MCP_CONTRACT_VERSION,
} from './hwpx-mcp-contract.mjs';

test('MCP validates advertised input schemas before executing a tool', async () => {
  const calls = [];
  const request = (id, argumentsValue) => handleEditorMcpJsonRpc({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'editor_docx_open', arguments: argumentsValue },
  }, {
    executeTool: async (name, args) => {
      calls.push({ name, args });
      return { ok: true, documentId: 'doc_test' };
    },
  });

  const nestedSource = await request(1, {
    filename: 'wrong-shape.docx',
    source: { bytesBase64: 'AQ==' },
  });
  assert.equal(nestedSource.result.isError, true);
  assert.equal(nestedSource.result.structuredContent.code, 'invalid_tool_arguments');
  assert.match(nestedSource.result.structuredContent.message, /bytesBase64|source|exactly one/);
  assert.equal(calls.length, 0);

  const bothSources = await request(2, {
    filename: 'ambiguous.docx',
    bytesBase64: 'AQ==',
    bytesRef: 'C:/tmp/ambiguous.docx',
  });
  assert.equal(bothSources.result.isError, true);
  assert.match(bothSources.result.structuredContent.message, /exactly one/);
  assert.equal(calls.length, 0);

  const valid = await request(3, {
    filename: 'valid.docx',
    bytesBase64: 'AQ==',
  });
  assert.equal(valid.result.isError, false);
  assert.equal(valid.result.structuredContent.documentId, 'doc_test');

  const invalidStoredDocument = await request(4, {
    filename: 'invalid-stored.docx',
    storedDocumentId: 'not-a-persisted-document-id',
  });
  assert.equal(invalidStoredDocument.result.isError, true);
  assert.equal(calls.length, 1);

  const storedDocumentId = '12345678-1234-4234-8234-123456789abc';
  const validStoredDocument = await request(5, {
    filename: 'stored.docx',
    storedDocumentId,
  });
  assert.equal(validStoredDocument.result.isError, false);
  assert.equal(validStoredDocument.result.structuredContent.documentId, 'doc_test');
  assert.deepEqual(calls, [
    {
      name: 'editor_docx_open',
      args: { filename: 'valid.docx', bytesBase64: 'AQ==' },
    },
    {
      name: 'editor_docx_open',
      args: { filename: 'stored.docx', storedDocumentId },
    },
  ]);

  const hwpxOpen = HWPX_MCP_TOOLS.find((tool) => tool.name === 'editor_hwpx_open');
  assert.equal(hwpxOpen.inputSchema.properties.storedDocumentId, undefined);
});

test('MCP advertises and validates capability-scoped Image Studio tools', async () => {
  assert.deepEqual(IMAGE_MCP_TOOLS.map((tool) => tool.name), [
    'editor_image_open', 'editor_image_session_read', 'editor_image_session_result_read',
    'editor_image_session_save', 'editor_image_session_project_save',
    'editor_image_session_project_read', 'editor_image_session_delete',
  ]);
  const invalid = await handleEditorMcpJsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'editor_image_open', arguments: { filename: 'sample.png' } } }, { executeTool: async () => ({ ok: true }) });
  assert.equal(invalid.result.isError, true);
  const valid = await handleEditorMcpJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'editor_image_open', arguments: { filename: 'sample.png', bytesBase64: 'iVBORw0KGgo=' } } }, { executeTool: async (name, args) => ({ ok: true, name, args }) });
  assert.equal(valid.result.isError, false);
  assert.equal(valid.result.structuredContent.name, 'editor_image_open');
});

test('MCP rejects additional properties and invalid nested array values', async () => {
  let executed = false;
  const call = (name, args) => handleEditorMcpJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  }, {
    executeTool: async () => {
      executed = true;
      return { ok: true };
    },
  });

  const extra = await call('editor_docx_discard', { documentId: 'doc_1', force: true });
  assert.equal(extra.result.structuredContent.code, 'invalid_tool_arguments');
  const invalidPages = await call('editor_docx_render_pages', {
    documentId: 'doc_1',
    baseRevision: 1,
    pages: [1, 1],
  });
  assert.equal(invalidPages.result.structuredContent.code, 'invalid_tool_arguments');
  assert.equal(executed, false);
});

test('MCP enforces bounded pagination arguments before gateway execution', async () => {
  const calls = [];
  const call = (name, args) => handleEditorMcpJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  }, {
    executeTool: async (toolName, toolArgs) => {
      calls.push({ toolName, toolArgs });
      return { ok: true };
    },
  });

  const readOverLimit = await call('editor_docx_read_json', {
    documentId: 'doc_1',
    view: 'blocks',
    limit: 101,
  });
  assert.equal(readOverLimit.result.structuredContent.code, 'invalid_tool_arguments');
  assert.match(readOverLimit.result.structuredContent.message, /less than or equal to 100/);

  const previewOverLimit = await call('editor_docx_read_json', {
    documentId: 'doc_1',
    textPreviewChars: 513,
  });
  assert.equal(previewOverLimit.result.structuredContent.code, 'invalid_tool_arguments');

  const cellsOverLimit = await call('editor_docx_read_json', {
    documentId: 'doc_1',
    cellPreviewLimit: 13,
  });
  assert.equal(cellsOverLimit.result.structuredContent.code, 'invalid_tool_arguments');

  const targetOverLimit = await call('editor_docx_target_map', {
    documentId: 'doc_1',
    kind: 'cell',
    limit: 121,
  });
  assert.equal(targetOverLimit.result.structuredContent.code, 'invalid_tool_arguments');

  const longCursor = await call('editor_docx_read_json', {
    documentId: 'doc_1',
    cursor: 'x'.repeat(2049),
  });
  assert.equal(longCursor.result.structuredContent.code, 'invalid_tool_arguments');
  assert.match(longCursor.result.structuredContent.message, /at most 2048/);
  assert.equal(calls.length, 0);

  const valid = await call('editor_docx_target_map', {
    documentId: 'doc_1',
    kind: 'cell',
    tableId: 'tbl_2',
    limit: 120,
  });
  assert.equal(valid.result.isError, false);
  assert.equal(calls.length, 1);
});

test('MCP advertises one canonical HWPX lifecycle with the HWPX command enum', async () => {
  const listed = await handleEditorMcpJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  }, {
    executeTool: async () => ({ ok: true }),
  });
  const tools = new Map(listed.result.tools.map((tool) => [tool.name, tool]));
  assert.deepEqual(
    [...tools.keys()].filter((name) => name.startsWith('editor_hwpx_')),
    HWPX_MCP_CONTRACT.tools,
  );
  const opEnum = tools.get('editor_hwpx_edit').inputSchema.properties.commands.items.properties.op.enum;
  assert.ok(opEnum.includes('text.replaceParagraph'));
  assert.ok(opEnum.includes('object.replaceTextBoxText'));
  assert.ok(opEnum.includes('setDocumentMetadata'));
  assert.ok(opEnum.includes('table.autoFit'));
  assert.deepEqual(
    tools.get('editor_hwpx_inspect').inputSchema.properties.view.enum,
    ['summary', 'outline', 'styles', 'targets', 'target', 'objects', 'template', 'page', 'quality', 'catalog'],
  );
  assert.equal(tools.has('editor_hwpx_semantic_context'), false);
  assert.equal(tools.has('editor_hwpx_commit_plan'), false);
  assert.deepEqual(opEnum, HWPX_MCP_CONTRACT.commandOps);
  assert.deepEqual(tools.get('editor_hwpx_save').inputSchema.properties.mode.enum, HWPX_MCP_CONTRACT.saveModes);
  assert.equal(tools.get('editor_hwpx_open').annotations.readOnlyHint, false);
  assert.equal(tools.get('editor_hwpx_export_pdf').annotations.readOnlyHint, false);
});

test('MCP initialize publishes the current HWPX lifecycle instead of removed tool guidance', async () => {
  const initialized = await handleEditorMcpJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18' },
  });
  assert.equal(initialized.result.serverInfo.name, 'academic-editor-mcp');
  assert.equal(initialized.result.serverInfo.version, HWPX_MCP_CONTRACT_VERSION);
  assert.equal(initialized.result.instructions, ACADEMIC_EDITOR_MCP_INSTRUCTIONS);
  for (const toolName of HWPX_MCP_CONTRACT.lifecycle) {
    assert.match(initialized.result.instructions, new RegExp(`\\b${toolName}\\b`));
  }
  assert.match(initialized.result.instructions, /browserPresentation\.url/);
  assert.doesNotMatch(
    initialized.result.instructions,
    /editor_hwpx_(?:read_json|target_map|target_find|target_inspect|object_inventory|command_catalog|apply|quality_check|render_pages|save_source|save_checkpoint)/,
  );
});

test('HWPX catalog human guidance names only the compact inspection API', () => {
  const guidance = HWPX_COMMAND_CATALOG.map(({ description, fields, notes }) => ({ description, fields, notes }));
  assert.doesNotMatch(JSON.stringify(guidance), /\btarget_(?:map|find|inspect)\b/);
  assert.match(JSON.stringify(guidance), /editor_hwpx_inspect/);
  const published = JSON.stringify(getHwpxCommandCatalog());
  assert.doesNotMatch(published, /"precondition":"(?:target_inspect|object_inventory)"/);
  assert.match(published, /editor_hwpx_inspect\(view=\\"(?:target|objects)\\"\)/);
});

test('HWPX MCP schema is owned by the HWPX environment and contains no DOCX contract text', () => {
  assert.ok(HWPX_MCP_TOOLS.length > 0);
  assert.ok(HWPX_MCP_TOOLS.every((tool) => tool.name.startsWith('editor_hwpx_')));
  assert.ok(HWPX_MCP_TOOLS.some((tool) => tool.name === 'editor_hwpx_export_pdf'));
  assert.doesNotMatch(JSON.stringify(HWPX_MCP_TOOLS), /editor_docx|DOCX/);
});

test('DOCX and PDF retain the common factory while HWPX uses its compact lifecycle contract', () => {
  const byFormat = (format) => new Map(
    EDITOR_MCP_TOOLS
      .filter((tool) => tool.name.startsWith(`editor_${format}_`))
      .map((tool) => [tool.name.slice(`editor_${format}_`.length), tool]),
  );
  const docx = byFormat('docx');
  const hwpx = byFormat('hwpx');
  const pdf = byFormat('pdf');

  assert.equal(docx.size, 17);
  assert.equal(hwpx.size, 9);
  assert.equal(pdf.size, 16);
  assert.ok(docx.has('prepare_review'));
  const commonDocx = new Map([...docx].filter(([suffix]) => suffix !== 'prepare_review'));
  assert.deepEqual([...commonDocx.keys()].sort(), [...pdf.keys()].sort());

  for (const [suffix, docxTool] of commonDocx) {
    const pdfTool = pdf.get(suffix);
    assert.equal(docxTool[EDITOR_MCP_SCHEMA_FACTORY], 'editor-common-v1', `${docxTool.name} must use the common factory`);
    assert.equal(pdfTool[EDITOR_MCP_SCHEMA_FACTORY], 'editor-common-v1', `${pdfTool.name} must use the common factory`);
    const docxProperties = Object.keys(docxTool.inputSchema.properties || {}).sort();
    if (suffix === 'open') {
      assert.equal(pdfTool.inputSchema.properties.storedDocumentId, undefined);
    } else {
      assert.deepEqual(
        docxProperties,
        Object.keys(pdfTool.inputSchema.properties || {}).sort(),
        `${suffix} DOCX/PDF properties must stay transport-compatible`,
      );
    }
  }
  assert.equal(docx.get('prepare_review')?.annotations?.destructiveHint, false);
  assert.deepEqual([...hwpx.keys()], [
    'open', 'inspect', 'edit', 'review', 'save', 'export_pdf', 'discard', 'artifact_read', 'artifact_delete',
  ]);
  assert.ok([...hwpx.values()].every((tool) => tool[EDITOR_MCP_SCHEMA_FACTORY] === undefined));
});

test('PDF MCP advertises every implemented PDF edit operation', () => {
  assert.ok(PDF_MCP_TOOLS.every((tool) => tool.name.startsWith('editor_pdf_')));
  const apply = PDF_MCP_TOOLS.find((tool) => tool.name === 'editor_pdf_apply');
  assert.deepEqual(apply.inputSchema.properties.commands.items.properties.op.enum, [...PDF_COMMAND_OPS]);
  const schemaText = JSON.stringify(PDF_MCP_TOOLS);
  for (const op of ['text.replaceObject', 'image.replaceObject', 'object.transform', 'object.delete']) {
    assert.match(schemaText, new RegExp(op.replace('.', '\\.')));
  }
});
