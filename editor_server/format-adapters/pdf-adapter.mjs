import { PdfApiSession } from '../../editor_pdf/scripts/pdf-api-utils.mjs';
import {
  PDF_COMMAND_CATEGORIES,
  PDF_COMMAND_OPS,
  commandsNeedPrecondition,
  getPdfCommandCatalog,
  requiredInspectionTargets,
  stablePdfTargetKey,
  validatePdfCommands,
} from '../../editor_pdf/scripts/pdf-command-catalog.mjs';
import { renderPdfPages } from '../../editor_pdf/scripts/pdf-renderer.mjs';

const pdfAdapter = Object.freeze({
  format: 'pdf',
  extension: 'pdf',
  commandCategories: PDF_COMMAND_CATEGORIES,
  commandOps: PDF_COMMAND_OPS,
  createSession(bytes) {
    return PdfApiSession.create(bytes);
  },
  createRawSession(bytes) {
    return PdfApiSession.create(bytes);
  },
  renderPages: renderPdfPages,
  commandCatalog: getPdfCommandCatalog,
  validateCommands: validatePdfCommands,
  commandsNeedPrecondition,
  requiredInspectionTargets,
  stableTargetKey: stablePdfTargetKey,
});

export { pdfAdapter };
