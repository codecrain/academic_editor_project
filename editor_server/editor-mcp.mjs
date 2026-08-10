import { createEditorMcpTools } from '../editor_common/editor-mcp-tool-factory.mjs';
import { docxAdapter } from './format-adapters/docx-adapter.mjs';
import { hwpxAdapter } from './format-adapters/hwpx-adapter.mjs';
import { pdfAdapter } from './format-adapters/pdf-adapter.mjs';

const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26']);
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

const DOCX_MCP_TOOLS = Object.freeze([...createEditorMcpTools({
  format: 'docx',
  commandCategories: docxAdapter.commandCategories,
  commandOps: docxAdapter.commandOps,
  readViews: ['summary', 'blocks', 'tables', 'references'],
}), {
  name: 'editor_docx_prepare_review',
  description: 'Create a verified review package after quality checks: a clean candidate, a DOCX redline against the question-start snapshot, and a bounded human-readable change manifest. Approval commits the candidate snapshot; rejection restores the full baseline snapshot.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'baseRevision', 'filename'],
    properties: {
      documentId: { type: 'string', minLength: 1 },
      baseRevision: { type: 'integer', minimum: 1 },
      filename: { type: 'string', minLength: 1 },
    },
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}]);

function hwpxRequirementVariant(action, properties, required) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'statement', 'action', 'targetId', ...required],
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 128 },
      statement: { type: 'string', minLength: 1, maxLength: 1000 },
      action: { type: 'string', enum: [action] },
      targetId: { type: 'string', minLength: 1, maxLength: 256 },
      ...properties,
    },
  };
}

const HWPX_SEMANTIC_REQUIREMENT_SCHEMA = Object.freeze({
  oneOf: [
    hwpxRequirementVariant('replace_text', {
      text: { type: 'string', maxLength: 20000 },
    }, ['text']),
    hwpxRequirementVariant('replace_joined_text', {
      parts: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string', maxLength: 20000 } },
      separator: { type: 'string', enum: ['newline', 'tab'] },
    }, ['parts', 'separator']),
    hwpxRequirementVariant('replace_fragment', {
      oldText: { type: 'string', minLength: 1, maxLength: 20000 },
      newText: { type: 'string', maxLength: 20000 },
    }, ['oldText', 'newText']),
    hwpxRequirementVariant('select_checkbox', {
      optionText: { type: 'string', minLength: 1, maxLength: 1000 },
    }, ['optionText']),
    hwpxRequirementVariant('insert_image_after', {
      bytesBase64: { type: 'string', minLength: 4 },
      mimeType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/gif', 'image/bmp'] },
      caption: { type: 'string', minLength: 1, maxLength: 1000 },
      altText: { type: 'string', minLength: 1, maxLength: 1000 },
    }, ['bytesBase64', 'mimeType']),
    hwpxRequirementVariant('copy_text_style', {
      sourceTargetId: { type: 'string', minLength: 1, maxLength: 256 },
    }, ['sourceTargetId']),
    hwpxRequirementVariant('copy_cell_style', {
      sourceTargetId: { type: 'string', minLength: 1, maxLength: 256 },
    }, ['sourceTargetId']),
  ],
});

const HWPX_MCP_TOOLS = Object.freeze([...createEditorMcpTools({
  format: 'hwpx',
  commandCategories: hwpxAdapter.commandCategories,
  commandOps: hwpxAdapter.commandOps,
}), {
  name: 'editor_hwpx_semantic_context',
  description: 'Read one revision-bound semantic HWPX target page for planning. Follow nextCursor unchanged until complete; it exposes stable target IDs, visible text, style fingerprints, layout facts, table-cell adjacency, and inferred formField label/value target pairs, never raw package coordinates.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId'],
    properties: {
      documentId: { type: 'string', minLength: 1 },
      kind: { type: ['string', 'null'], enum: ['paragraph', 'cell', null] },
      limit: { type: 'integer', minimum: 1, maximum: 120 },
      cursor: { type: ['string', 'null'], minLength: 1, maxLength: 2048 },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, {
  name: 'editor_hwpx_apply_plan',
  description: 'Validate and atomically apply one bounded typed HWPX edit batch without closing the session. Returns current-revision receipts, preservation, quality, and full-page render evidence so the calling editor agent can re-read and decide whether another batch is needed.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'baseRevision', 'requirements'],
    properties: {
      documentId: { type: 'string', minLength: 1 },
      baseRevision: { type: 'integer', minimum: 1 },
      requirements: { type: 'array', minItems: 1, maxItems: 40, items: HWPX_SEMANTIC_REQUIREMENT_SCHEMA },
      preserveUnmentioned: { type: 'boolean' },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, {
  name: 'editor_hwpx_commit_plan',
  description: 'Validate, atomically execute, preserve-check, quality-check, render, and finalize one complete typed HWPX plan. Every user requirement must be represented once. Any failure discards the isolated session and produces no artifact.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'baseRevision', 'requirements', 'filename'],
    properties: {
      documentId: { type: 'string', minLength: 1 },
      baseRevision: { type: 'integer', minimum: 1 },
      requirements: { type: 'array', minItems: 1, maxItems: 40, items: HWPX_SEMANTIC_REQUIREMENT_SCHEMA },
      filename: { type: 'string', minLength: 1, maxLength: 255 },
      preserveUnmentioned: { type: 'boolean' },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}]);

const PDF_MCP_TOOLS = createEditorMcpTools({
  format: 'pdf',
  commandCategories: pdfAdapter.commandCategories,
  commandOps: pdfAdapter.commandOps,
});

const imageSessionProperties = {
  sessionId: { type: 'string', pattern: '^img_[0-9a-f-]+$' },
  token: { type: 'string', minLength: 20 },
};
const IMAGE_MCP_TOOLS = Object.freeze([
  { name: 'editor_image_open', description: 'Open trusted local PNG/JPEG/GIF/WebP bytes in Image Studio.', inputSchema: { type: 'object', additionalProperties: false, required: ['filename', 'bytesBase64'], properties: { filename: { type: 'string', minLength: 1, maxLength: 128 }, bytesBase64: { type: 'string', minLength: 4 } } } },
  { name: 'editor_image_session_read', description: 'Read Image Studio session metadata and capability-scoped URLs.', inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId', 'token'], properties: imageSessionProperties } },
  { name: 'editor_image_session_result_read', description: 'Read saved image bytes and SHA-256 for document insertion.', inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId', 'token'], properties: imageSessionProperties } },
  { name: 'editor_image_session_save', description: 'Save trusted local PNG/JPEG/GIF/WebP bytes as the session result.', inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId', 'token', 'bytesBase64'], properties: { ...imageSessionProperties, bytesBase64: { type: 'string', minLength: 4 } } } },
  { name: 'editor_image_session_project_save', description: 'Save the editable layered Image Studio JSON project without flattening its layers.', inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId', 'token', 'bytesBase64'], properties: { ...imageSessionProperties, bytesBase64: { type: 'string', minLength: 4 } } } },
  { name: 'editor_image_session_project_read', description: 'Read the saved editable layered project bytes and SHA-256 from an active Image Studio session.', inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId', 'token'], properties: imageSessionProperties } },
  { name: 'editor_image_session_delete', description: 'Discard an Image Studio session and its in-memory bytes.', inputSchema: { type: 'object', additionalProperties: false, required: ['sessionId', 'token'], properties: imageSessionProperties } },
]);

const EDITOR_MCP_TOOLS = Object.freeze([...DOCX_MCP_TOOLS, ...HWPX_MCP_TOOLS, ...PDF_MCP_TOOLS, ...IMAGE_MCP_TOOLS]);

const toolByName = new Map(EDITOR_MCP_TOOLS.map((tool) => [tool.name, tool]));

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function normalizeProtocolVersion(value) {
  const requested = String(value || '').trim();
  return SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : DEFAULT_PROTOCOL_VERSION;
}

function redactBinaryFields(value, key = '') {
  if (key === 'bytesBase64' && typeof value === 'string') {
    return `[omitted ${value.length} base64 characters]`;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactBinaryFields(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactBinaryFields(entryValue, entryKey),
    ]));
  }
  return value;
}

function toolResult(payload, isError = false) {
  const structuredContent = payload && typeof payload === 'object' ? payload : { value: payload };
  const textContent = redactBinaryFields(structuredContent);
  return {
    content: [{ type: 'text', text: JSON.stringify(textContent) }],
    structuredContent,
    isError,
  };
}

function schemaValueMatchesType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function schemaValuesEqual(left, right) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

function validateJsonSchema(value, schema = {}, path = '$') {
  const issues = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some((type) => schemaValueMatchesType(value, type))) {
    return [`${path} must be ${types.join(' or ')}`];
  }
  if (schema.enum && !schema.enum.some((candidate) => schemaValuesEqual(candidate, value))) {
    issues.push(`${path} must be one of the declared enum values`);
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => validateJsonSchema(value, candidate, path).length === 0).length;
    if (matches !== 1) {
      issues.push(`${path} must match exactly one of the declared alternatives`);
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        issues.push(`${path}.${required} is required`);
      }
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          issues.push(`${path}.${key} is not allowed`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        issues.push(...validateJsonSchema(value[key], propertySchema, `${path}.${key}`));
      }
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push(`${path} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push(`${path} must contain at most ${schema.maxItems} item(s)`);
    }
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      issues.push(`${path} must contain unique items`);
    }
    if (schema.items) {
      value.forEach((item, index) => issues.push(...validateJsonSchema(item, schema.items, `${path}[${index}]`)));
    }
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push(`${path} must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push(`${path} does not match the required pattern`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push(`${path} must contain at most ${schema.maxLength} character(s)`);
    }
  }
  if (typeof value === 'number' && Number.isFinite(value) && schema.minimum !== undefined && value < schema.minimum) {
    issues.push(`${path} must be greater than or equal to ${schema.minimum}`);
  }
  if (typeof value === 'number' && Number.isFinite(value) && schema.maximum !== undefined && value > schema.maximum) {
    issues.push(`${path} must be less than or equal to ${schema.maximum}`);
  }
  return issues;
}

async function handleSingleEditorMcpRequest(message, options) {
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return jsonRpcError(message?.id, -32600, 'Invalid JSON-RPC request.');
  }

  const { id, method, params = {} } = message;
  if (method.startsWith('notifications/')) {
    return null;
  }
  if (id === undefined || id === null) {
    return null;
  }

  if (method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: normalizeProtocolVersion(params.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: options.serverInfo || { name: 'academic-editor-mcp', version: '1.0.0' },
      instructions: 'Use command_catalog, read-json, and the command-specific inspection precondition before every write. Re-read, run quality_check, visually verify real rendered pages, then export or save_source. Call discard if the edit is cancelled or cannot be finalized.',
    });
  }
  if (method === 'ping') {
    return jsonRpcResult(id, {});
  }
  if (method === 'tools/list') {
    return jsonRpcResult(id, { tools: EDITOR_MCP_TOOLS });
  }
  if (method === 'tools/call') {
    const name = String(params.name || '');
    const tool = toolByName.get(name);
    if (!tool) {
      return jsonRpcResult(id, toolResult({ ok: false, code: 'unknown_tool', message: `Unknown editor MCP tool: ${name}` }, true));
    }
    const args = params.arguments ?? {};
    const argumentIssues = validateJsonSchema(args, tool.inputSchema);
    if (argumentIssues.length) {
      return jsonRpcResult(id, toolResult({
        ok: false,
        code: 'invalid_tool_arguments',
        message: `Invalid arguments for ${name}: ${argumentIssues.join('; ')}`,
        issues: argumentIssues,
      }, true));
    }
    try {
      const result = await options.executeTool(name, args);
      return jsonRpcResult(id, toolResult(result, false));
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return jsonRpcResult(id, toolResult({
        ok: false,
        code: typeof error?.code === 'string' ? error.code : 'tool_execution_failed',
        message: messageText,
        ...(error?.details === undefined ? {} : { details: error.details }),
      }, true));
    }
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

async function handleEditorMcpJsonRpc(payload, options) {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return jsonRpcError(null, -32600, 'JSON-RPC batch must not be empty.');
    }
    const responses = (await Promise.all(payload.map((message) => handleSingleEditorMcpRequest(message, options))))
      .filter(Boolean);
    return responses.length ? responses : null;
  }
  return handleSingleEditorMcpRequest(payload, options);
}

export {
  DEFAULT_PROTOCOL_VERSION,
  DOCX_MCP_TOOLS,
  EDITOR_MCP_TOOLS,
  HWPX_MCP_TOOLS,
  IMAGE_MCP_TOOLS,
  PDF_MCP_TOOLS,
  handleEditorMcpJsonRpc,
  normalizeProtocolVersion,
  redactBinaryFields,
  validateJsonSchema,
};
