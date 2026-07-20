import {
  DOCX_COMMAND_CATEGORIES,
  DOCX_COMMAND_OPS,
} from './docx-command-catalog.mjs';

const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26']);
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

const objectSchema = (properties, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const documentIdProperty = {
  type: 'string',
  minLength: 1,
  description: 'Opaque document session ID returned by editor_docx_open.',
};

const baseRevisionProperty = {
  type: 'integer',
  minimum: 1,
  description: 'Exact revision returned by the preceding read or write. Stale revisions are rejected.',
};

const EDITOR_MCP_TOOLS = Object.freeze([
  {
    name: 'editor_docx_open',
    description: 'Open a DOCX in an isolated editor session. Application code should supply bytes; never ask a user or model to reproduce binary content.',
    inputSchema: {
      ...objectSchema({
        filename: { type: 'string', minLength: 1 },
        bytesBase64: { type: 'string', minLength: 1, description: 'Base64 DOCX bytes supplied by trusted application code.' },
        bytesRef: { type: 'string', minLength: 1, description: 'Server-local path. Allowed only for trusted same-host callers.' },
      }, ['filename']),
      oneOf: [{ required: ['bytesBase64'] }, { required: ['bytesRef'] }],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'editor_docx_discard',
    description: 'Close and discard an isolated DOCX edit session without saving or creating an artifact. Safe to call again after the session is already gone.',
    inputSchema: objectSchema({ documentId: documentIdProperty }, ['documentId']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_read_json',
    description: 'Read a bounded, revision-stable projection of the current DOCX. Start with summary, then page blocks or tables with the opaque nextCursor.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      view: { type: 'string', enum: ['summary', 'blocks', 'tables'], default: 'summary' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 40 },
      cursor: { type: ['string', 'null'], minLength: 1, maxLength: 2048, description: 'Opaque nextCursor returned by the preceding page. It is bound to the document revision and original query.' },
      textPreviewChars: { type: 'integer', minimum: 32, maximum: 512, default: 200 },
      cellPreviewLimit: { type: 'integer', minimum: 0, maximum: 12, default: 3 },
    }, ['documentId']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_target_map',
    description: 'Page one bounded stream of stable editable paragraph or table-cell targets at the current revision. The response has one targets array and no duplicate aliases.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      kind: { type: 'string', enum: ['paragraph', 'cell'], default: 'paragraph' },
      limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
      cursor: { type: ['string', 'null'], minLength: 1, maxLength: 2048, description: 'Opaque nextCursor returned by the preceding page. It is bound to the document revision and original query.' },
      tableId: { type: ['string', 'null'], minLength: 1, maxLength: 128, description: 'Optional cell-stream filter. Valid only when kind=cell.' },
    }, ['documentId']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_target_find',
    description: 'Resolve visible text to a DOCX target. Inspect the returned location before writing.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      query: { type: 'string', minLength: 1 },
      match: { type: ['object', 'null'], additionalProperties: true },
    }, ['documentId', 'query', 'match']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_target_inspect',
    description: 'Inspect one or more exact DOCX target locations immediately before applying commands.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      locations: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: true } },
    }, ['documentId', 'locations']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_object_inventory',
    description: 'List document objects such as images before object-level edits.',
    inputSchema: objectSchema({ documentId: documentIdProperty }, ['documentId']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_command_catalog',
    description: 'Discover every supported DOCX edit command, its exact required fields, precondition, aliases, and a valid example. Call this before editor_docx_apply; filter by category or op when possible.',
    inputSchema: objectSchema({
      category: { type: ['string', 'null'], enum: [...DOCX_COMMAND_CATEGORIES, null], description: 'Optional command category filter.' },
      op: { type: ['string', 'null'], description: 'Optional canonical command or accepted alias.' },
    }, []),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_apply',
    description: 'Apply a catalog-validated DOCX command batch at the exact current revision. Call editor_docx_command_catalog for the selected operations first and satisfy each reported precondition.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      baseRevision: baseRevisionProperty,
      commands: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: DOCX_COMMAND_OPS, description: 'Canonical op from editor_docx_command_catalog.' },
            commandId: { type: 'string', minLength: 1 },
          },
          required: ['op'],
          additionalProperties: true,
        },
      },
    }, ['documentId', 'baseRevision', 'commands']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'editor_docx_render_pages',
    description: 'Render selected current DOCX pages as real WebP images for visual verification. Set includeBaseline to compare the original and edited pages. Omit pages to verify page 1, then use the returned pageCount for further pages.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      baseRevision: baseRevisionProperty,
      pages: {
        type: ['array', 'null'],
        minItems: 1,
        maxItems: 12,
        uniqueItems: true,
        items: { type: 'integer', minimum: 1 },
      },
      includeBaseline: { type: 'boolean', default: false },
    }, ['documentId', 'baseRevision']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_quality_check',
    description: 'Run structural and layout-risk checks at the exact current revision. Issues must be repaired before finalization.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      baseRevision: baseRevisionProperty,
    }, ['documentId', 'baseRevision']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_export_pdf',
    description: 'Export the current clean quality-checked DOCX revision to a verified PDF artifact without closing the edit session.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      baseRevision: baseRevisionProperty,
      filename: { type: ['string', 'null'], minLength: 1 },
    }, ['documentId', 'baseRevision']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'editor_docx_save_source',
    description: 'Finalize the isolated DOCX to a server-controlled opaque artifact after quality checks pass.',
    inputSchema: objectSchema({
      documentId: documentIdProperty,
      baseRevision: baseRevisionProperty,
      filename: { type: 'string', minLength: 1 },
    }, ['documentId', 'baseRevision', 'filename']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'editor_docx_artifact_read',
    description: 'Read a finalized DOCX artifact by opaque ID. Intended for the authenticated application server after user approval.',
    inputSchema: objectSchema({
      artifactId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' },
      expectedSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    }, ['artifactId', 'expectedSha256']),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'editor_docx_artifact_delete',
    description: 'Delete a finalized DOCX artifact after the authenticated application server has applied it successfully.',
    inputSchema: objectSchema({
      artifactId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' },
      expectedSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    }, ['artifactId', 'expectedSha256']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
]);

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
      return jsonRpcResult(id, toolResult({ ok: false, code: 'tool_execution_failed', message: messageText }, true));
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
  EDITOR_MCP_TOOLS,
  handleEditorMcpJsonRpc,
  normalizeProtocolVersion,
  redactBinaryFields,
  validateJsonSchema,
};
