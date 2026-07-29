import assert from 'node:assert/strict';
import test from 'node:test';

import { PDF_COMMAND_OPS, getPdfCommandCatalog, validatePdfCommands } from './pdf-command-catalog.mjs';

test('PDF command catalog and validator stay aligned', () => {
  assert.deepEqual(getPdfCommandCatalog().commands.map((entry) => entry.op), [...PDF_COMMAND_OPS]);
  const [{ command }] = validatePdfCommands([{ op: 'highlight.add', page: 1, x: 10, y: 20, width: 30, height: 12 }]);
  assert.equal(command.opacity, .42);
});

test('PDF image commands accept only PNG and JPEG payloads', () => {
  assert.throws(() => validatePdfCommands([{
    op: 'image.add', page: 1, x: 0, y: 0, width: 20, height: 20, mimeType: 'image/svg+xml', bytesBase64: 'PHN2Zz4=',
  }]), /image\/png or image\/jpeg/);
});
