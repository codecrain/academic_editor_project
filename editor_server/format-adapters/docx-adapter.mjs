import {
  createDocxBytes,
  DocxApiSession,
  getDocumentVisibleText,
} from '../../editor_docx/scripts/docx-api-utils.mjs';
import {
  DOCX_COMMAND_CATEGORIES,
  DOCX_COMMAND_OPS,
  commandsNeedPrecondition,
  getDocxCommandCatalog,
  requiredInspectionTargets,
  stableDocxTargetKey,
  validateDocxCommands,
} from '../../editor_docx/scripts/docx-command-catalog.mjs';
import { renderDocxWithUno } from '../../editor_docx/scripts/docx-renderer.mjs';
import {
  DEFAULT_EDITOR_TOKEN_TTL_MS,
  EditorDocumentStore,
} from '../../editor_docx/scripts/editor-document-store.mjs';

const docxAdapter = Object.freeze({
  format: 'docx',
  extension: 'docx',
  commandCategories: DOCX_COMMAND_CATEGORIES,
  commandOps: DOCX_COMMAND_OPS,
  documentStoreClass: EditorDocumentStore,
  defaultDocumentTokenTtlMs: DEFAULT_EDITOR_TOKEN_TTL_MS,
  createBlankBytes: createDocxBytes,
  createSession(bytes) {
    return new DocxApiSession(bytes);
  },
  createRawSession(bytes) {
    return new DocxApiSession(bytes);
  },
  visibleText: getDocumentVisibleText,
  renderPages: renderDocxWithUno,
  commandCatalog: getDocxCommandCatalog,
  validateCommands: validateDocxCommands,
  commandsNeedPrecondition,
  requiredInspectionTargets,
  stableTargetKey: stableDocxTargetKey,
});

export { docxAdapter };
