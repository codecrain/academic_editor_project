import { hwpxAdapter } from './format-adapters/hwpx-adapter.mjs';

const HWPX_MCP_CONTRACT_VERSION = hwpxAdapter.commandCatalog().version;

const HWPX_MCP_TOOL_NAMES = Object.freeze({
  open: 'editor_hwpx_open',
  inspect: 'editor_hwpx_inspect',
  edit: 'editor_hwpx_edit',
  review: 'editor_hwpx_review',
  save: 'editor_hwpx_save',
  exportPdf: 'editor_hwpx_export_pdf',
  discard: 'editor_hwpx_discard',
  artifactRead: 'editor_hwpx_artifact_read',
  artifactDelete: 'editor_hwpx_artifact_delete',
});

const HWPX_MCP_INSPECT_VIEWS = Object.freeze([
  'summary',
  'outline',
  'styles',
  'target',
  'objects',
  'template',
  'page',
  'quality',
  'catalog',
  'search',
  'fields',
  'security',
  'history',
  'capabilities',
]);

const HWPX_MCP_SAVE_MODES = Object.freeze(['verified', 'checkpoint']);

const HWPX_MCP_LIFECYCLE = Object.freeze([
  HWPX_MCP_TOOL_NAMES.open,
  HWPX_MCP_TOOL_NAMES.inspect,
  HWPX_MCP_TOOL_NAMES.edit,
  HWPX_MCP_TOOL_NAMES.review,
  HWPX_MCP_TOOL_NAMES.save,
]);

const ACADEMIC_EDITOR_MCP_INSTRUCTIONS = [
  'Academic Editor MCP is revision-bound. For HWP/HWPX use editor_hwpx_open, inspect summary and capabilities, inspect every exact target, object, or field inventory needed by the edit, apply one atomic editor_hwpx_edit batch at the exact current revision, inspect history and changed targets, run editor_hwpx_review over every page, and finish with editor_hwpx_save(mode="verified"). Read and hash the artifact, then delete it; discard every unfinished session.',
  'When editor_hwpx_open returns browserPresentation.url, open that exact loopback URL as a read-only presentation and reload the same page after each successful revision-changing edit.',
  'The nine lifecycle tools are the complete public HWP/HWPX surface. Discover fine-grained commands and integrated search, field, security, history, and verification controls through editor_hwpx_inspect instead of inventing additional tool names or command properties.',
  'For binary HWP and HWPX table.writeCell, preserve each newline-delimited paragraph with paragraphTemplateIndices when paragraph roles differ. Character or paragraph formatting of a multi-paragraph cell must specify cellParagraphIndex; ambiguous cell-wide paragraph formatting fails closed.',
  'table.autoFit is guarded by reopened document-level pagination budgets. Keep maxPageGrowth, maxBlankPageGrowth, and maxLowOccupancyGrowth conservative, and use render-cell-clip targetId/tableId/location provenance for exact repair instead of parsing clip IDs heuristically.',
  'Use inspect(template) suggestions only as evidence, submit explicit templatePolicy roles, and use review(profile="submission", visualPolicy={...}) before presenting a form or application as submission-ready; visualPolicy is the only place to declare allowed text colors, image flow, sparse-page, heading-flow, and body-style expectations.',
  'For DOCX and PDF use their format-specific catalog, exact target inspection, atomic current-revision write, quality/render verification, and verified artifact lifecycle.',
].join(' ');

const HWPX_MCP_CONTRACT = Object.freeze({
  version: HWPX_MCP_CONTRACT_VERSION,
  toolNames: HWPX_MCP_TOOL_NAMES,
  tools: Object.freeze(Object.values(HWPX_MCP_TOOL_NAMES)),
  inspectViews: HWPX_MCP_INSPECT_VIEWS,
  saveModes: HWPX_MCP_SAVE_MODES,
  lifecycle: HWPX_MCP_LIFECYCLE,
  commandCategories: Object.freeze([...hwpxAdapter.commandCategories]),
  commandOps: Object.freeze([...hwpxAdapter.commandOps]),
  instructions: ACADEMIC_EDITOR_MCP_INSTRUCTIONS,
});

export {
  ACADEMIC_EDITOR_MCP_INSTRUCTIONS,
  HWPX_MCP_CONTRACT,
  HWPX_MCP_CONTRACT_VERSION,
  HWPX_MCP_INSPECT_VIEWS,
  HWPX_MCP_LIFECYCLE,
  HWPX_MCP_SAVE_MODES,
  HWPX_MCP_TOOL_NAMES,
};
