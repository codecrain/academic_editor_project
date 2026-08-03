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

function countRevisionElements(bytes) {
  const session = new DocxApiSession(bytes);
  let insertions = 0;
  let deletions = 0;
  let formatting = 0;
  for (const [name, value] of session.entries) {
    if (!name.startsWith('word/') || !name.endsWith('.xml')) continue;
    const xml = value.toString('utf8');
    insertions += (xml.match(/<w:ins(?:\s|>)/g) || []).length;
    deletions += (xml.match(/<w:del(?:\s|>)/g) || []).length;
    formatting += (xml.match(/<w:\w+PrChange(?:\s|>)/g) || []).length;
  }
  return { insertions, deletions, formatting, total: insertions + deletions + formatting };
}

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
  countRevisionElements,
  renderPages: renderDocxWithUno,
  commandCatalog: getDocxCommandCatalog,
  validateCommands: validateDocxCommands,
  commandsNeedPrecondition,
  requiredInspectionTargets,
  stableTargetKey: stableDocxTargetKey,
});

export { docxAdapter };
