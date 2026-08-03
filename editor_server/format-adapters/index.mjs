import { docxAdapter } from './docx-adapter.mjs';
import { hwpxAdapter } from './hwpx-adapter.mjs';
import { pdfAdapter } from './pdf-adapter.mjs';

const formatAdapters = new Map([
  [docxAdapter.format, docxAdapter],
  [hwpxAdapter.format, hwpxAdapter],
  [pdfAdapter.format, pdfAdapter],
]);

function getFormatAdapter(format) {
  const adapter = formatAdapters.get(String(format || '').toLowerCase());
  if (!adapter) throw new Error(`unsupported format: ${format}`);
  return adapter;
}

export {
  docxAdapter,
  formatAdapters,
  getFormatAdapter,
  hwpxAdapter,
  pdfAdapter,
};
