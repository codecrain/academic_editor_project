import { createEditorMcpTools, objectSchema } from '../editor_common/editor-mcp-tool-factory.mjs';
import { docxAdapter } from './format-adapters/docx-adapter.mjs';
import { hwpxAdapter } from './format-adapters/hwpx-adapter.mjs';
import { pdfAdapter } from './format-adapters/pdf-adapter.mjs';
import {
  ACADEMIC_EDITOR_MCP_INSTRUCTIONS,
  HWPX_MCP_CONTRACT_VERSION,
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
const HWPX_EXPECTATIONS = {
  type: ['object', 'null'],
  additionalProperties: false,
  description: 'Optional deterministic document expectations evaluated during review and repeated after verified save/export.',
  properties: {
    pageCount: { type: 'integer', minimum: 1 },
    minPages: { type: 'integer', minimum: 1 },
    maxPages: { type: 'integer', minimum: 1 },
    minCharacters: { type: 'integer', minimum: 0 },
    minTables: { type: 'integer', minimum: 0 },
    tableCount: { type: 'integer', minimum: 0 },
    minParagraphs: { type: 'integer', minimum: 0 },
    minPictures: { type: 'integer', minimum: 0 },
    sourceFormat: { type: 'string', enum: ['hwp', 'hwpx'] },
    contains: { type: 'array', maxItems: 50, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 1000 } },
    notContains: { type: 'array', maxItems: 50, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 1000 } },
    fields: {
      type: 'array', maxItems: 100,
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'value'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 512 },
          occurrence: { type: ['integer', 'null'], minimum: 0 },
          value: { type: 'string', maxLength: 100000 },
        },
      },
    },
  },
};
const HWPX_SECURITY_POLICY = {
  type: ['object', 'null'],
  additionalProperties: false,
  description: 'Native-document security evidence policy for hidden text, prompt-injection signals, and Unicode deception.',
  properties: {
    includeFields: { type: 'boolean', default: true },
    minInjectionConfidence: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
    failOnHiddenText: { type: 'boolean', default: false },
    failOnPromptInjection: { type: 'boolean', default: false },
    failOnUnicodeDeception: { type: 'boolean', default: false },
  },
};

const HWPX_ASSET_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['documentId', 'imageName'],
  properties: {
    documentId: HWPX_DOCUMENT_ID,
    imageName: { type: 'string', minLength: 1, maxLength: 512 },
  },
};
const HWPX_STYLE_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['documentId', 'location', 'scope'],
  properties: {
    documentId: HWPX_DOCUMENT_ID,
    location: { type: 'object', additionalProperties: true },
    scope: { type: 'string', enum: ['character', 'paragraph', 'cell', 'table'] },
  },
};
const HWPX_STABLE_LOCATION = {
  type: 'object',
  additionalProperties: false,
  properties: {
    paragraph: {
      type: 'object',
      additionalProperties: false,
      required: ['section', 'number'],
      properties: {
        section: { type: 'integer', minimum: 0 },
        number: { type: 'integer', minimum: 0 },
      },
    },
    tableId: { type: 'string', minLength: 1, maxLength: 128 },
    cell: {
      type: 'object',
      additionalProperties: false,
      required: ['number'],
      properties: {
        number: { type: 'integer', minimum: 0 },
        row: { type: 'integer', minimum: 0 },
        column: { type: 'integer', minimum: 0 },
      },
    },
  },
  oneOf: [
    { required: ['paragraph'] },
    { required: ['tableId', 'cell'] },
  ],
};

function hwpxCommandPropertySchema(entry, field) {
  if (field === 'op') return { type: 'string', enum: [entry.op] };
  if (field === 'commandId') {
    return {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      description: 'Unique stable ID within this atomic batch.',
    };
  }
  if (field === 'assetRef') return HWPX_ASSET_REF;
  if (field === 'styleRef') return HWPX_STYLE_REF;
  if (field === 'location' || field === 'styleSource') return HWPX_STABLE_LOCATION;
  if (field === 'locations') {
    return { type: 'array', minItems: 1, items: HWPX_STABLE_LOCATION };
  }
  const example = entry.example?.[field];
  const exampleType = (() => {
    if (Array.isArray(example)) return { type: 'array' };
    if (example && typeof example === 'object') return { type: 'object', additionalProperties: true };
    if (typeof example === 'string') return { type: 'string' };
    if (typeof example === 'boolean') return { type: 'boolean' };
    if (typeof example === 'number') return { type: Number.isInteger(example) ? 'integer' : 'number' };
    return {};
  })();
  return {
    ...exampleType,
    ...(example !== undefined ? { examples: [example] } : {}),
  };
}

const HWPX_EDIT_COMMAND_SCHEMAS = Object.freeze(
  hwpxAdapter.commandCatalog({ sourceFormat: 'hwpx' }).commands.map((entry) => {
    const fields = [...new Set([
      ...Object.keys(entry.fields || {}),
      ...(entry.required || []),
      ...(entry.optional || []),
      ...(entry.anyOf || []).flat(),
    ])];
    return {
      type: 'object',
      description: `${entry.description} Required fields: ${entry.required.join(', ')}. Allowed fields: ${fields.join(', ')}. Precondition: ${entry.precondition}.`,
      examples: [{ ...entry.example, commandId: `example-${entry.op.replaceAll('.', '-')}` }],
      additionalProperties: false,
      required: [...entry.required],
      properties: Object.fromEntries(
        fields.map((field) => [field, hwpxCommandPropertySchema(entry, field)]),
      ),
      ...((entry.anyOf?.[0]?.length || 0) > 0
        ? { anyOf: entry.anyOf[0].map((field) => ({ required: [field] })) }
        : {}),
    };
  }),
);

function hwpxInspectSchema(view, properties = {}, required = [], example = {}) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['documentId', 'view', ...required],
    properties: {
      documentId: HWPX_DOCUMENT_ID,
      view: { type: 'string', enum: [view] },
      baseRevision: HWPX_REVISION,
      ...properties,
    },
    examples: [{ documentId: 'doc_from_editor_hwpx_open', view, baseRevision: 1, ...example }],
  };
}

const HWPX_INSPECT_SCHEMAS = Object.freeze([
  hwpxInspectSchema('summary', {
    cursor: { type: 'string', minLength: 1, maxLength: 2048 },
    limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
    textPreviewChars: { type: 'integer', minimum: 32, maximum: 512, default: 200 },
    cellPreviewLimit: { type: 'integer', minimum: 0, maximum: 12, default: 3 },
  }),
  hwpxInspectSchema('outline', {
    kind: { type: 'string', enum: ['paragraph', 'cell'] },
    cursor: { type: 'string', minLength: 1, maxLength: 2048 },
    limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
    textPreviewChars: { type: 'integer', minimum: 32, maximum: 512, default: 200 },
  }),
  hwpxInspectSchema('styles', {
    cursor: { type: 'string', minLength: 1, maxLength: 2048 },
    limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
  }),
  hwpxInspectSchema('target', {
    query: { type: 'string', minLength: 1, maxLength: 2000 },
    match: { type: 'object', additionalProperties: true },
    locations: { type: 'array', minItems: 1, maxItems: 120, items: HWPX_STABLE_LOCATION },
  }, [], { locations: [{ tableId: 'tbl_0', cell: { number: 1 } }] }),
  hwpxInspectSchema('objects'),
  hwpxInspectSchema('template'),
  hwpxInspectSchema('page', {
    page: { type: 'integer', minimum: 1 },
    kind: { type: 'string', enum: ['paragraph', 'cell'] },
    includeSvg: { type: 'boolean', default: false },
    limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
    textPreviewChars: { type: 'integer', minimum: 32, maximum: 512, default: 200 },
  }, ['page'], { page: 1 }),
  hwpxInspectSchema('quality', {
    expectations: HWPX_EXPECTATIONS,
    securityPolicy: HWPX_SECURITY_POLICY,
  }),
  hwpxInspectSchema('catalog', {
    op: { type: 'string', enum: [...hwpxAdapter.commandOps] },
  }, ['op'], { op: 'table.writeCell' }),
  hwpxInspectSchema('search', {
    query: { type: 'string', minLength: 1, maxLength: 2000 },
    match: { type: 'object', additionalProperties: true },
    limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
  }, ['query'], { query: 'search text' }),
  hwpxInspectSchema('fields', {
    query: { type: 'string', minLength: 1, maxLength: 2000 },
    limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
  }),
  hwpxInspectSchema('security', { securityPolicy: HWPX_SECURITY_POLICY }),
  hwpxInspectSchema('history', {
    limit: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
  }),
  hwpxInspectSchema('capabilities', {
    category: { type: 'string', enum: [...hwpxAdapter.commandCategories] },
    op: { type: 'string', enum: [...hwpxAdapter.commandOps] },
  }),
].map((schema) => {
  if (schema.properties.view.enum[0] !== 'target') return schema;
  return {
    ...schema,
    anyOf: [{ required: ['locations'] }, { required: ['query'] }],
  };
}));

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
    description: 'Read one coherent, bounded view of the current HWPX. Choose one complete input alternative from the schema; page requires page, target requires locations or query, search requires query, and catalog requires an exact op.',
    inputSchema: {
      oneOf: HWPX_INSPECT_SCHEMAS,
    },
    annotations: HWPX_READ_ONLY,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.edit,
    description: 'Apply one atomic batch of current-catalog commands to exact targets inspected at the same current revision. Always include the current documentId and baseRevision. Location fields are JSON objects, never quoted object text. Multi-paragraph cell formatting requires cellParagraphIndex; table.autoFit uses reopened pagination budgets. Returns receipts and the new revision; run editor_hwpx_review before saving.',
    inputSchema: objectSchema({
      documentId: HWPX_DOCUMENT_ID,
      baseRevision: HWPX_REVISION,
      commands: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        description: 'Current-catalog commands. Every commandId must be unique, and the same operation cannot write the same exact destination twice within one atomic batch. Combine each destination into one final command.',
        items: { oneOf: HWPX_EDIT_COMMAND_SCHEMAS },
      },
      preservationPolicy: {
        type: ['object', 'null'],
        additionalProperties: false,
        description: 'Optional exact caller-selected preservation guard. Unlisted content remains editable and no semantic role is inferred.',
        properties: {
          protectedLocations: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: true } },
          preserveTableIds: { type: 'array', maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1 } },
          preserveImageNames: { type: 'array', maxItems: 500, uniqueItems: true, items: { type: 'string', minLength: 1 } },
        },
      },
    }, ['documentId', 'baseRevision', 'commands']),
    annotations: HWPX_STATE_CREATING,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.review,
    description: 'Run current-revision structural and full rendered-layout verification. Returns objective page, font, color, image, occupancy, and clipping evidence without judging document meaning or submission readiness.',
    inputSchema: objectSchema({
      documentId: HWPX_DOCUMENT_ID,
      baseRevision: HWPX_REVISION,
      pages: { type: ['array', 'null'], minItems: 1, maxItems: 120, uniqueItems: true, items: { type: 'integer', minimum: 1 } },
      includeBaseline: { type: 'boolean', default: false },
      includeSvg: { type: 'boolean', default: false, description: 'Inline SVG is opt-in; the default returns bounded render metrics and SVG hashes.' },
      expectations: HWPX_EXPECTATIONS,
      securityPolicy: HWPX_SECURITY_POLICY,
    }, ['documentId', 'baseRevision']),
    annotations: HWPX_READ_ONLY,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.save,
    description: 'Save the exact current revision. verified mode requires a clean current-revision structural review with the same deterministic expectations/security policy and performs hash, reopen, quality, and full-render verification; checkpoint mode is recovery-only.',
    inputSchema: objectSchema({
      documentId: HWPX_DOCUMENT_ID,
      baseRevision: HWPX_REVISION,
      filename: { type: 'string', minLength: 1, maxLength: 255 },
      mode: { type: 'string', enum: [...HWPX_MCP_SAVE_MODES], default: 'verified' },
      expectations: HWPX_EXPECTATIONS,
      securityPolicy: HWPX_SECURITY_POLICY,
    }, ['documentId', 'baseRevision', 'filename']),
    annotations: HWPX_STATE_CREATING,
  },
  {
    name: HWPX_MCP_TOOL_NAMES.exportPdf,
    description: 'Export the current cleanly reviewed HWP/HWPX revision to a verified PDF artifact without closing the edit session.',
    inputSchema: objectSchema({ documentId: HWPX_DOCUMENT_ID, baseRevision: HWPX_REVISION, filename: { type: ['string', 'null'], minLength: 1 }, expectations: HWPX_EXPECTATIONS, securityPolicy: HWPX_SECURITY_POLICY }, ['documentId', 'baseRevision']),
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

function schemaDiscriminatorScore(value, schema) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.entries(schema.properties ?? {}).reduce((score, [key, property]) => {
    if (!Object.hasOwn(value, key) || !Array.isArray(property.enum)) return score;
    return score + (property.enum.some((candidate) => schemaValuesEqual(candidate, value[key])) ? 1 : 0);
  }, 0);
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
    const alternatives = schema.oneOf.map((candidate) => validateJsonSchema(value, candidate, path));
    const matches = alternatives.filter((candidateIssues) => candidateIssues.length === 0).length;
    if (matches !== 1) {
      issues.push(`${path} must match exactly one of the declared alternatives`);
      if (matches === 0 && alternatives.length) {
        const ranked = alternatives.map((candidateIssues, index) => ({
          candidateIssues,
          discriminatorScore: schemaDiscriminatorScore(value, schema.oneOf[index]),
        })).sort((left, right) => (
          right.discriminatorScore - left.discriminatorScore
          || left.candidateIssues.length - right.candidateIssues.length
        ));
        const closest = ranked[0].candidateIssues;
        issues.push(...closest);
      }
    }
  }
  if (schema.anyOf) {
    const alternatives = schema.anyOf.map((candidate) => validateJsonSchema(value, candidate, path));
    const matches = alternatives.some((candidateIssues) => candidateIssues.length === 0);
    if (!matches) {
      issues.push(`${path} must match at least one of the declared alternatives`);
      issues.push(...alternatives.flat());
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
