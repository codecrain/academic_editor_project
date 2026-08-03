import { parentPort } from 'node:worker_threads';

const sessions = new Map();
const documentQueues = new Map();
const adapterPromises = new Map();

function loadAdapter(format) {
  const normalized = String(format || '').toLowerCase();
  if (!adapterPromises.has(normalized)) {
    const modulePath = normalized === 'docx'
      ? './format-adapters/docx-adapter.mjs'
      : normalized === 'hwpx'
        ? './format-adapters/hwpx-adapter.mjs'
        : normalized === 'pdf'
          ? './format-adapters/pdf-adapter.mjs'
          : '';
    if (!modulePath) throw new Error(`unsupported format: ${format}`);
    adapterPromises.set(normalized, import(modulePath).then((module) => module[`${normalized}Adapter`]));
  }
  return adapterPromises.get(normalized);
}

function requireSession(documentId) {
  const entry = sessions.get(documentId);
  if (!entry) throw new Error(`Editor session not found: ${documentId}`);
  return entry;
}

function renderHwpxSvgPages(session, pages) {
  if (typeof session.doc?.renderPageSvg !== 'function') return [];
  return pages.map((page) => {
    const pageNumber = Math.max(1, Number(page) || 1);
    const svg = session.doc.renderPageSvg(pageNumber - 1);
    return {
      page: pageNumber,
      format: 'svg',
      nonBlank: String(svg || '').length > 80,
      svg,
    };
  });
}

async function execute(message) {
  const { documentId, operation, payload = {} } = message;
  if (operation === 'open') {
    const adapter = await loadAdapter(payload.format);
    const session = await adapter.createSession(Buffer.from(payload.bytes), payload.options || {});
    sessions.set(documentId, { adapter, session });
    return { revision: session.revision, json: await session.readJson() };
  }
  if (operation === 'renderHwpxBytes') {
    const hwpxAdapter = await loadAdapter('hwpx');
    const session = await hwpxAdapter.createSession(Buffer.from(payload.bytes));
    return {
      pageCount: (await session.readJson()).pageCount ?? 1,
      pages: renderHwpxSvgPages(session, payload.pages || []),
    };
  }
  if (operation === 'countDocxRevisionElements') {
    const docxAdapter = await loadAdapter('docx');
    return docxAdapter.countRevisionElements(Buffer.from(payload.bytes));
  }
  if (operation === 'close') {
    return { deleted: sessions.delete(documentId) };
  }

  const { session } = requireSession(documentId);
  if (operation === 'readJson') return session.readJson();
  if (operation === 'targetMap') return session.targetMap();
  if (operation === 'inspectTargets') {
    return (payload.locations || []).map((location) => session.inspectTarget(location));
  }
  if (operation === 'resolveText') return session.resolveText(payload.query, payload.match || {});
  if (operation === 'objectInventory') return session.objectInventory();
  if (operation === 'apply') {
    const result = await session.apply(payload.commands || []);
    return { result, revision: session.revision };
  }
  if (operation === 'save') {
    const saved = await session.save();
    return { ...saved, bytes: Buffer.from(saved.bytes) };
  }
  if (operation === 'qualityCheck') return session.qualityCheck(payload.options || {});
  if (operation === 'renderHwpxSvgPages') return renderHwpxSvgPages(session, payload.pages || []);
  throw new Error(`Unsupported editor session operation: ${operation}`);
}

function enqueue(documentId, operation) {
  const previous = documentQueues.get(documentId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  documentQueues.set(documentId, current);
  return current.finally(() => {
    if (documentQueues.get(documentId) === current) documentQueues.delete(documentId);
  });
}

parentPort.on('message', (message) => {
  enqueue(message.documentId, () => execute(message)).then(
    (result) => parentPort.postMessage({ id: message.id, result }),
    (error) => parentPort.postMessage({
      id: message.id,
      error: {
        name: error?.name || 'Error',
        message: error instanceof Error ? error.message : String(error),
        code: error?.code,
        statusCode: error?.statusCode,
        details: error?.details,
        stack: error?.stack,
      },
    }),
  );
});
