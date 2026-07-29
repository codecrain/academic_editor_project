import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PDF_COMMAND_OPS,
  commandsNeedPrecondition,
  getPdfCommandCatalog,
  requiredInspectionTargets,
  validatePdfCommands,
} from './pdf-command-catalog.mjs';

test('PDF command catalog and validator stay aligned', () => {
  assert.deepEqual(getPdfCommandCatalog().commands.map((entry) => entry.op), [...PDF_COMMAND_OPS]);
  const [{ command }] = validatePdfCommands([{ op: 'highlight.add', page: 1, x: 10, y: 20, width: 30, height: 12 }]);
  assert.equal(command.opacity, .42);
});

test('PDF object mutations require exact revision-bound target inspection', () => {
  const commands = [{
    op: 'text.replaceObject',
    page: 2,
    objectIndex: 4,
    objectId: 'pdf-object-2-4-text-deadbeef0000',
    expectedText: 'before',
    text: 'after',
  }];
  const entries = validatePdfCommands(commands);
  assert.equal(commandsNeedPrecondition(entries, 'target_inspect'), true);
  assert.deepEqual(requiredInspectionTargets(commands, entries), [{
    op: 'text.replaceObject',
    role: 'target',
    key: 'pdf:p2:pdf-object-2-4-text-deadbeef0000',
    location: { page: 2, objectId: 'pdf-object-2-4-text-deadbeef0000', objectIndex: 4 },
  }]);
});

test('PDF image commands accept only PNG and JPEG payloads', () => {
  assert.throws(() => validatePdfCommands([{
    op: 'image.add', page: 1, x: 0, y: 0, width: 20, height: 20, mimeType: 'image/svg+xml', bytesBase64: 'PHN2Zz4=',
  }]), /image\/png or image\/jpeg/);
});
