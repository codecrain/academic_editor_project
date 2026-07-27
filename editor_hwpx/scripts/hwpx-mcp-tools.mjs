import { createEditorMcpTools } from '../../editor_common/editor-mcp-tool-factory.mjs';
import {
  HWPX_COMMAND_CATEGORIES,
  HWPX_COMMAND_OPS,
} from './hwpx-command-catalog.mjs';

const HWPX_MCP_TOOLS = createEditorMcpTools({
  format: 'hwpx',
  commandCategories: HWPX_COMMAND_CATEGORIES,
  commandOps: HWPX_COMMAND_OPS,
  includePdf: true,
});

export { HWPX_MCP_TOOLS };
