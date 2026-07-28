function objectSchema(properties, required = []) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const EDITOR_MCP_SCHEMA_FACTORY = Symbol.for('academic-editor.mcp-schema-factory');

function createEditorMcpTools({
  format,
  commandCategories,
  commandOps,
  includePdf = true,
  readViews = ['summary', 'blocks', 'tables'],
}) {
  const normalizedFormat = String(format || '').toLowerCase();
  if (!['docx', 'hwpx', 'pdf'].includes(normalizedFormat)) {
    throw new Error(`Unsupported editor MCP format: ${format}`);
  }
  const label = normalizedFormat.toUpperCase();
  const prefix = `editor_${normalizedFormat}`;
  const documentIdProperty = {
    type: 'string',
    minLength: 1,
    description: `Opaque document session ID returned by ${prefix}_open.`,
  };
  const baseRevisionProperty = {
    type: 'integer',
    minimum: 1,
    description: 'Exact revision returned by the preceding read or write. Stale revisions are rejected.',
  };
  const tools = [
    {
      name: `${prefix}_open`,
      description: `Open a ${label} in an isolated editor session. Application code should supply bytes; never ask a user or model to reproduce binary content.`,
      inputSchema: {
        ...objectSchema({
          filename: { type: 'string', minLength: 1 },
          bytesBase64: { type: 'string', minLength: 1, description: `Base64 ${label} bytes supplied by trusted application code.` },
          bytesRef: { type: 'string', minLength: 1, description: 'Server-local path. Allowed only for trusted same-host callers.' },
        }, ['filename']),
        oneOf: [{ required: ['bytesBase64'] }, { required: ['bytesRef'] }],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: `${prefix}_discard`,
      description: `Close and discard an isolated ${label} edit session without saving or creating an artifact. Safe to call again after the session is already gone.`,
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        baseRevision: baseRevisionProperty,
      }, ['documentId', 'baseRevision']),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: `${prefix}_read_json`,
      description: `Read a bounded, revision-stable projection of the current ${label}. Start with summary, then page the required view with the opaque nextCursor.`,
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        view: { type: 'string', enum: readViews, default: 'summary' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 40 },
        cursor: { type: ['string', 'null'], minLength: 1, maxLength: 2048, description: 'Opaque nextCursor returned by the preceding page. It is bound to the document revision and original query.' },
        textPreviewChars: { type: 'integer', minimum: 32, maximum: 512, default: 200 },
        cellPreviewLimit: { type: 'integer', minimum: 0, maximum: 12, default: 3 },
      }, ['documentId']),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: `${prefix}_target_map`,
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
      name: `${prefix}_target_find`,
      description: `Resolve visible text to a ${label} target. Inspect the returned location before writing.`,
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        query: { type: 'string', minLength: 1 },
        match: { type: ['object', 'null'], additionalProperties: true },
      }, ['documentId', 'query', 'match']),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: `${prefix}_target_inspect`,
      description: `Inspect one or more exact ${label} target locations immediately before applying commands.`,
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        locations: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: true } },
      }, ['documentId', 'locations']),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: `${prefix}_object_inventory`,
      description: 'List document objects such as images before object-level edits.',
      inputSchema: objectSchema({ documentId: documentIdProperty }, ['documentId']),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: `${prefix}_command_catalog`,
      description: `Discover every supported ${label} edit command, its exact required fields, precondition, aliases, and a valid example. Call this before ${prefix}_apply; filter by category or op when possible.`,
      inputSchema: objectSchema({
        category: { type: ['string', 'null'], enum: [...commandCategories, null], description: 'Optional command category filter.' },
        op: { type: ['string', 'null'], description: 'Optional canonical command or accepted alias.' },
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: `${prefix}_apply`,
      description: `Apply a catalog-validated ${label} command batch at the exact current revision. Call ${prefix}_command_catalog for the selected operations first and satisfy each reported precondition.`,
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        baseRevision: baseRevisionProperty,
        commands: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: [...commandOps], description: `Canonical op from ${prefix}_command_catalog.` },
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
      name: `${prefix}_render_pages`,
      description: `Render selected current ${label} pages for visual verification. Set includeBaseline to compare the original and edited pages. Omit pages to verify page 1, then use the returned pageCount for further pages.`,
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
      name: `${prefix}_quality_check`,
      description: 'Run structural and layout-risk checks at the exact current revision. Error-severity issues must be repaired; callers must review warnings.',
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        baseRevision: baseRevisionProperty,
      }, ['documentId', 'baseRevision']),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ...(includePdf ? [{
      name: `${prefix}_export_pdf`,
      description: `Export the current quality-checked ${label} revision to a verified PDF artifact without closing the edit session.`,
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        baseRevision: baseRevisionProperty,
        filename: { type: ['string', 'null'], minLength: 1 },
      }, ['documentId', 'baseRevision']),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }] : []),
    {
      name: `${prefix}_save_source`,
      description: `Finalize the isolated ${label} to a server-controlled opaque artifact after quality checks pass.`,
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        baseRevision: baseRevisionProperty,
        filename: { type: 'string', minLength: 1 },
      }, ['documentId', 'baseRevision', 'filename']),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: `${prefix}_save_checkpoint`,
      description: `Save the exact current ${label} revision as an unverified recovery artifact and close the session. This intentionally bypasses final quality acceptance and must never be presented as a verified result.`,
      inputSchema: objectSchema({
        documentId: documentIdProperty,
        baseRevision: baseRevisionProperty,
        filename: { type: 'string', minLength: 1 },
      }, ['documentId', 'baseRevision', 'filename']),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: `${prefix}_artifact_read`,
      description: `Read a finalized ${label} artifact by opaque ID. Intended for the authenticated application server after user approval.`,
      inputSchema: objectSchema({
        artifactId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' },
        expectedSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      }, ['artifactId', 'expectedSha256']),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: `${prefix}_artifact_delete`,
      description: `Delete a finalized ${label} artifact after the authenticated application server has applied it successfully.`,
      inputSchema: objectSchema({
        artifactId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' },
        expectedSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      }, ['artifactId', 'expectedSha256']),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
  return Object.freeze(tools.map((tool) => {
    const generatedTool = { ...tool };
    Object.defineProperty(generatedTool, EDITOR_MCP_SCHEMA_FACTORY, {
      value: 'editor-common-v1',
      enumerable: false,
    });
    return Object.freeze(generatedTool);
  }));
}

export {
  EDITOR_MCP_SCHEMA_FACTORY,
  createEditorMcpTools,
  objectSchema,
};
