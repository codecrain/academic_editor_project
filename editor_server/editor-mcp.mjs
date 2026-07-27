import {
  DOCX_COMMAND_CATEGORIES,
  DOCX_COMMAND_OPS,
} from '../editor_docx/scripts/docx-command-catalog.mjs';
import { HWPX_MCP_TOOLS } from '../editor_hwpx/scripts/hwpx-mcp-tools.mjs';
import { createEditorMcpTools } from '../editor_common/editor-mcp-tool-factory.mjs';

const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26']);
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

const DOCX_MCP_TOOLS = createEditorMcpTools({
  format: 'docx',
  commandCategories: DOCX_COMMAND_CATEGORIES,
  commandOps: DOCX_COMMAND_OPS,
});

const EDITOR_MCP_TOOLS = Object.freeze([...DOCX_MCP_TOOLS, ...HWPX_MCP_TOOLS]);

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
  DOCX_MCP_TOOLS,
  EDITOR_MCP_TOOLS,
  handleEditorMcpJsonRpc,
  normalizeProtocolVersion,
  redactBinaryFields,
  validateJsonSchema,
};
