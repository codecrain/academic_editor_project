import { createEditorMcpTools, objectSchema } from '../editor_common/editor-mcp-tool-factory.mjs';
import { docxAdapter } from './format-adapters/docx-adapter.mjs';
import { hwpxAdapter } from './format-adapters/hwpx-adapter.mjs';
import { pdfAdapter } from './format-adapters/pdf-adapter.mjs';
import {
  ACADEMIC_EDITOR_MCP_INSTRUCTIONS,
  HWPX_MCP_CONTRACT_VERSION,
  HWPX_MCP_INSPECT_VIEWS,
  HWPX_MCP_SAVE_MODES,
  HWPX_MCP_TOOL_NAMES,
} from './hwpx-mcp-contract.mjs';

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

const HWPX_DOCUMENT_ID = { type: 'string', minLength: 1, description: 'Opaque session ID returned by editor_hwpx_open.' };
const HWPX_REVISION = { type: 'integer', minimum: 1, description: 'Exact current revision. Stale writes are rejected.' };
const HWPX_READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const HWPX_STATE_CREATING = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const HWPX_VISUAL_POLICY = {
  type: ['object', 'null'],
  additionalProperties: false,
  description: 'Optional explicit editorial visual policy. Defaults to black text and submission-time image/color enforcement.',
  properties: {
    allowedTextColors: {
      type: 'array', maxItems: 16, uniqueItems: true,
      items: { type: 'string', pattern: '^#?[0-9a-fA-F]{6}$' },
    },
    failOnColoredText: { type: 'boolean' },
    failOnImageFlow: { type: 'boolean' },
    failOnSparsePages: { type: 'boolean' },
    minVerticalOccupancy: { type: 'number', minimum: 0, maximum: 1 },
    requireChapterPageBreak: { type: 'boolean' },
    requireHeadingKeepWithNext: { type: 'boolean' },
    headingPattern: { type: 'string', minLength: 1, maxLength: 256 },
    expectedBodyFont: { type: 'string', minLength: 1, maxLength: 128 },
    expectedBodyFontSizePt: { type: 'number', minimum: 0.1, maximum: 1000 },
    failOnStyleVariance: { type: 'boolean' },
  },
};

// HWPX has one canonical lifecycle surface.  The low-level HTTP routes and
// command catalog remain engine implementation details; MCP callers do not
// need separate read/map/find/inspect tools for the same state.
const HWPX_MCP_TOOLS = Object.freeze([
  {
    name: HWPX_MCP_TOOL_NAMES.open,
    description: 'Open exact HWP or HWPX bytes in an isolated revisioned session and return the canonical Browser presentation URL when loopback presentation is available.',
    inputSchema: {
      ...objectSchema({
        filename: { type: 'string', minLength: 1 },
        bytesBase64: { type: 'string', minLength: 1 },
        bytesRef: { type: 'string', minLength: 1 },
      }, ['filename']),
      oneOf: [{ required: ['bytesBase64'] }, { required: ['bytesRef'] }],
    },
    annotations: HWPX_STATE_CREATING,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.inspect,
    description: 'Read one coherent, bounded view of the current HWPX. Use summary first, then outline or targets; target, objects, quality, and catalog are available through the same contract.',
    inputSchema: objectSchema({
      documentId: HWPX_DOCUMENT_ID,
      view: { type: 'string', enum: [...HWPX_MCP_INSPECT_VIEWS] },
      baseRevision: HWPX_REVISION,
      kind: { type: ['string', 'null'], enum: ['paragraph', 'cell', null] },
      query: { type: ['string', 'null'], minLength: 1, maxLength: 2000 },
      match: { type: ['object', 'null'], additionalProperties: true },
      locations: { type: ['array', 'null'], minItems: 1, maxItems: 120, items: { type: 'object', additionalProperties: true } },
      tableId: { type: ['string', 'null'], minLength: 1, maxLength: 128 },
      page: { type: ['integer', 'null'], minimum: 1 },
      includeSvg: { type: 'boolean', default: false },
      profile: { type: 'string', enum: ['structural', 'submission'], default: 'structural' },
      visualPolicy: HWPX_VISUAL_POLICY,
      category: { type: ['string', 'null'], enum: [...hwpxAdapter.commandCategories, null] },
      op: { type: ['string', 'null'] },
      limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
      cursor: { type: ['string', 'null'], minLength: 1, maxLength: 2048 },
      textPreviewChars: { type: 'integer', minimum: 32, maximum: 512, default: 200 },
      cellPreviewLimit: { type: 'integer', minimum: 0, maximum: 12, default: 3 },
    }, ['documentId', 'view']),
    annotations: HWPX_READ_ONLY,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.edit,
    description: 'Apply one atomic batch of current-catalog commands to exact inspected targets at the current revision. Multi-paragraph cell formatting requires cellParagraphIndex; table.autoFit uses reopened pagination budgets. Returns receipts and the new revision; run editor_hwpx_review before saving.',
    inputSchema: objectSchema({
      documentId: HWPX_DOCUMENT_ID,
      baseRevision: HWPX_REVISION,
      commands: {
        type: 'array', minItems: 1, maxItems: 100,
        items: {
          type: 'object', additionalProperties: true,
          required: ['op', 'commandId'],
          properties: {
            op: { type: 'string', enum: [...hwpxAdapter.commandOps] },
            commandId: { type: 'string', minLength: 1, maxLength: 128 },
            assetRef: {
              type: 'object',
              additionalProperties: false,
              required: ['documentId', 'imageName'],
              properties: {
                documentId: HWPX_DOCUMENT_ID,
                imageName: { type: 'string', minLength: 1, maxLength: 512 },
              },
            },
            styleRef: {
              type: 'object',
              additionalProperties: false,
              required: ['documentId', 'location'],
              properties: {
                documentId: HWPX_DOCUMENT_ID,
                location: { type: 'object', additionalProperties: true },
                scope: { type: ['string', 'null'], enum: ['character', 'paragraph', 'cell', 'table', null] },
              },
            },
          },
        },
      },
      templatePolicy: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          protectedLocations: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: true } },
          requiredTableIds: { type: 'array', maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1 } },
          removableTableIds: { type: 'array', maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1 } },
          requiredImageNames: { type: 'array', maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1 } },
          replaceableImageNames: { type: 'array', maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1 } },
          requiredLocations: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: true } },
          instructionLocations: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: true } },
          freeformLocations: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: true } },
          allowedUnresolvedLocations: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: true } },
          repeatableTableIds: { type: 'array', maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1 } },
          conditionalTableIds: { type: 'array', maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1 } },
        },
      },
    }, ['documentId', 'baseRevision', 'commands']),
    annotations: HWPX_STATE_CREATING,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.review,
    description: 'Run current-revision structural, rendered clipping with exact target provenance, pagination, semantic, and visual review. Use profile=submission for submission-readiness gates; omit pages for all pages.',
    inputSchema: objectSchema({
      documentId: HWPX_DOCUMENT_ID,
      baseRevision: HWPX_REVISION,
      pages: { type: ['array', 'null'], minItems: 1, maxItems: 120, uniqueItems: true, items: { type: 'integer', minimum: 1 } },
      includeBaseline: { type: 'boolean', default: false },
      includeSvg: { type: 'boolean', default: false, description: 'Inline SVG is opt-in; the default returns bounded render metrics and SVG hashes.' },
      profile: { type: 'string', enum: ['structural', 'submission'], default: 'structural', description: 'submission additionally fails unresolved placeholders, dummy identifiers, required blanks, explicit instruction remnants, and risky floating-image flow.' },
      visualPolicy: HWPX_VISUAL_POLICY,
    }, ['documentId', 'baseRevision']),
    annotations: HWPX_READ_ONLY,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.save,
    description: 'Save the exact current revision. verified mode requires a clean current-revision review with the same profile and performs hash, reopen, quality, and full-render verification; checkpoint mode is recovery-only.',
    inputSchema: objectSchema({
      documentId: HWPX_DOCUMENT_ID,
      baseRevision: HWPX_REVISION,
      filename: { type: 'string', minLength: 1, maxLength: 255 },
      mode: { type: 'string', enum: [...HWPX_MCP_SAVE_MODES], default: 'verified' },
      profile: { type: 'string', enum: ['structural', 'submission'], default: 'structural' },
      visualPolicy: HWPX_VISUAL_POLICY,
    }, ['documentId', 'baseRevision', 'filename']),
    annotations: HWPX_STATE_CREATING,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.exportPdf,
    description: 'Export the current cleanly reviewed HWP/HWPX revision to a verified PDF artifact without closing the edit session.',
    inputSchema: objectSchema({ documentId: HWPX_DOCUMENT_ID, baseRevision: HWPX_REVISION, filename: { type: ['string', 'null'], minLength: 1 }, profile: { type: 'string', enum: ['structural', 'submission'], default: 'structural' }, visualPolicy: HWPX_VISUAL_POLICY }, ['documentId', 'baseRevision']),
    annotations: HWPX_STATE_CREATING,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.discard,
    description: 'Close and discard an isolated HWPX session without creating an artifact.',
    inputSchema: objectSchema({ documentId: HWPX_DOCUMENT_ID, baseRevision: HWPX_REVISION }, ['documentId', 'baseRevision']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: HWPX_MCP_TOOL_NAMES.artifactRead,
    description: 'Read an HWP, HWPX, or PDF artifact created by the HWP/HWPX lifecycle using its opaque ID and expected SHA-256.',
    inputSchema: objectSchema({ artifactId: { type: 'string', format: 'uuid' }, expectedSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, ['artifactId', 'expectedSha256']),
    annotations: HWPX_READ_ONLY,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.artifactDelete,
    description: 'Delete an HWPX artifact after its bytes and SHA-256 have been independently verified.',
    inputSchema: objectSchema({ artifactId: { type: 'string', format: 'uuid' }, expectedSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, ['artifactId', 'expectedSha256']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
]);

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

async function handleSingleEditorMcpRequest(message, options = {}) {
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
      serverInfo: options.serverInfo || { name: 'academic-editor-mcp', version: HWPX_MCP_CONTRACT_VERSION },
      instructions: ACADEMIC_EDITOR_MCP_INSTRUCTIONS,
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

async function handleEditorMcpJsonRpc(payload, options = {}) {
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
