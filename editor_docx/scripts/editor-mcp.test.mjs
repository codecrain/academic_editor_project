import assert from 'node:assert/strict';
import test from 'node:test';

import { handleEditorMcpJsonRpc } from './editor-mcp.mjs';

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
  assert.deepEqual(calls, [{
    name: 'editor_docx_open',
    args: { filename: 'valid.docx', bytesBase64: 'AQ==' },
  }]);
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
