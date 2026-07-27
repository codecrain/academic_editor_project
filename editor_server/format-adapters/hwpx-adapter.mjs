import { HwpxApiSession, initHwpxRuntime } from '../../editor_hwpx/scripts/hwpx-api-utils.mjs';
import {
  HWPX_COMMAND_CATEGORIES,
  HWPX_COMMAND_OPS,
  commandsNeedPrecondition,
  getHwpxCommandCatalog,
  requiredInspectionTargets,
  stableHwpxTargetKey,
  validateHwpxCommands,
} from '../../editor_hwpx/scripts/hwpx-command-catalog.mjs';
import { renderHwpxPdf } from '../../editor_hwpx/scripts/hwpx-native-pdf.mjs';

const hwpxAdapter = Object.freeze({
  format: 'hwpx',
  extension: 'hwpx',
  commandCategories: HWPX_COMMAND_CATEGORIES,
  commandOps: HWPX_COMMAND_OPS,
  async createSession(bytes, options = {}) {
    await initHwpxRuntime();
    return new HwpxApiSession(bytes, {
      saveMode: options.saveStrategy || options.strategy || 'preserve-package',
    });
  },
  createRawSession(bytes) {
    return new HwpxApiSession(bytes);
  },
  renderPages: renderHwpxPdf,
  commandCatalog: getHwpxCommandCatalog,
  validateCommands: validateHwpxCommands,
  commandsNeedPrecondition,
  requiredInspectionTargets,
  stableTargetKey: stableHwpxTargetKey,
});

export { hwpxAdapter };
