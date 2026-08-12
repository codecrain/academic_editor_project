import { parentPort } from 'node:worker_threads';

import { analyzeSvgCellClipping, analyzeSvgPageMetrics, svgHasVisibleContent } from './svg-render-evidence.mjs';

const sessions = new Map();
const documentQueues = new Map();
const adapterPromises = new Map();

export function compactOpenSnapshot(json, revision) {
  const tables = json.tables || [];
  const objectGraph = json.objectGraph || {};
  return {
    revision: Number(json.revision || revision || 1),
    sourceFormat: json.sourceFormat,
    pageCount: json.pageCount,
    sectionCount: json.sections?.length || 0,
    paragraphCount: (json.sections || []).reduce((sum, section) => sum + Number(section.paragraphCount || section.paragraphs?.length || 0), 0),
    blockCount: json.blocks?.length || 0,
    tableCount: tables.length,
    cellCount: tables.reduce((sum, table) => sum + Number(table.cells?.length || table.dims?.cellCount || 0), 0),
    objectCounts: {
      images: objectGraph.images?.length || 0,
      pictures: objectGraph.pictures?.length || 0,
      charts: objectGraph.charts?.length || 0,
    },
    sections: (json.sections || []).map((section) => ({
      section: section.section,
      paragraphCount: Number(section.paragraphCount || section.paragraphs?.length || 0),
      paragraphs: (section.paragraphs || []).map((paragraph) => ({
        id: paragraph.id,
        section: paragraph.section,
        para: paragraph.para,
        styleFingerprint: paragraph.styleFingerprint ?? null,
        hierarchy: paragraph.hierarchy ?? null,
      })),
    })),
    tables: tables.map((table) => ({
      id: table.id,
      section: table.section,
      para: table.para,
      dims: table.dims,
      cells: (table.cells || []).map((cell) => ({
        id: cell.id,
        row: cell.row,
        col: cell.col,
        cellIndex: cell.cellIndex,
        styleFingerprint: cell.styleFingerprint ?? null,
      })),
    })),
    objectGraph: {
      images: (objectGraph.images || []).map((image) => ({
        name: image.name,
        mimeType: image.mimeType,
        byteLength: image.byteLength,
        sha256: image.sha256,
      })),
      pictures: (objectGraph.pictures || []).map((picture) => ({
        id: picture.id,
        name: picture.name,
        imageName: picture.imageName,
        properties: picture.properties ?? null,
      })),
      charts: (objectGraph.charts || []).map((chart) => ({
        id: chart.id,
        name: chart.name,
      })),
    },
    fields: Array.isArray(json.fields) ? json.fields : [],
    warningCount: Array.isArray(json.warnings) ? json.warnings.length : Number(json.warnings?.count || 0),
  };
}

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
      nonBlank: svgHasVisibleContent(svg),
      layout: {
        ...analyzeSvgCellClipping(svg),
        pageMetrics: analyzeSvgPageMetrics(svg),
      },
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
    const json = await session.readJson();
    return {
      revision: session.revision,
      json: payload.format === 'hwpx' ? compactOpenSnapshot(json, session.revision) : json,
    };
  }
  if (operation === 'renderHwpxBytes') {
    const hwpxAdapter = await loadAdapter('hwpx');
    const session = await hwpxAdapter.createSession(Buffer.from(payload.bytes));
    const pageCount = Math.max(1, Number((await session.readJson()).pageCount) || 1);
    const requestedPages = (payload.pages || []).map(Number).filter((page) => Number.isFinite(page) && page > 0);
    const pages = requestedPages.filter((page) => page <= pageCount);
    return {
      pageCount,
      pages: renderHwpxSvgPages(session, pages),
      unavailablePages: requestedPages.filter((page) => page > pageCount),
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
  if (operation === 'semanticSnapshot') {
    return typeof session.semanticSnapshot === 'function' ? session.semanticSnapshot() : session.readJson();
  }
  if (operation === 'targetMap') return session.targetMap();
  if (operation === 'outlinePage') {
    const map = await session.targetMap();
    const source = payload.kind === 'paragraph'
      ? (map.paragraphs || [])
      : payload.kind === 'cell'
        ? (map.cells || [])
        : [...(map.paragraphs || []), ...(map.cells || [])];
    const ordered = source
      .filter((target) => !payload.tableId || target.location?.tableId === payload.tableId)
      .filter((target) => target?.flow)
      .sort((left, right) => (
        Number(left.flow.section || 0) - Number(right.flow.section || 0)
        || Number(left.flow.paragraph || 0) - Number(right.flow.paragraph || 0)
        || Number(left.flow.order || 0) - Number(right.flow.order || 0)
      ));
    const offset = Math.max(0, Number(payload.offset || 0));
    const limit = Math.max(1, Number(payload.limit || 60));
    const textPreviewChars = Math.min(512, Math.max(32, Number(payload.textPreviewChars || 200)));
    const selected = ordered.slice(offset, offset + limit);
    const items = selected.map((source) => {
      const target = session.inspectTarget(source.location);
      const text = String(target.currentText || '');
      return {
        targetId: target.id,
        kind: target.kind,
        flow: target.flow,
        pageHint: target.pageHint ?? null,
        text: text.slice(0, textPreviewChars),
        textLength: target.textLength ?? text.length,
        textTruncated: text.length > textPreviewChars,
        styleFingerprint: target.styleFingerprint?.hash ? { hash: target.styleFingerprint.hash } : null,
        hierarchy: target.hierarchy ?? null,
        cellParagraphCount: target.kind === 'cell' ? Number(target.cell?.paragraphs?.length || 0) : undefined,
        pictureCount: target.kind === 'cell' ? Number(target.cell?.pictureCount || 0) : undefined,
        allowedActions: Array.isArray(target.allowedActions) ? [...target.allowedActions] : [],
        layout: target.layout ? { capacity: target.layout.capacity ?? null, bbox: target.layout.bbox ?? null } : null,
        location: target.location,
      };
    });
    return { total: ordered.length, offset, textPreviewChars, items };
  }
  if (operation === 'styleProfile') {
    const json = await session.readJson();
    const groups = new Map();
    const add = (scope, fingerprint, example) => {
      const hash = fingerprint?.hash;
      if (!hash) return;
      const key = `${scope}:${hash}`;
      const group = groups.get(key) ?? { scope, styleFingerprint: fingerprint, count: 0, examples: [] };
      group.count += 1;
      if (group.examples.length < 5) group.examples.push(example);
      groups.set(key, group);
    };
    for (const section of json.sections || []) {
      for (const paragraph of section.paragraphs || []) {
        add('body-paragraph', paragraph.styleFingerprint, {
          targetId: paragraph.id,
          location: { paragraph: { section: paragraph.section, number: paragraph.para } },
          text: String(paragraph.text || '').slice(0, 160),
          hierarchy: paragraph.hierarchy ?? null,
        });
      }
    }
    for (const table of json.tables || []) {
      for (const cell of table.cells || []) {
        for (const paragraph of cell.paragraphs || []) {
          add('cell-paragraph', paragraph.styleFingerprint, {
            targetId: `${cell.id}_p${paragraph.index}`,
            location: cell.location,
            cellParagraphIndex: paragraph.index,
            text: String(paragraph.text || '').slice(0, 160),
            hierarchy: paragraph.hierarchy ?? null,
          });
        }
      }
    }
    const items = [...groups.values()].sort((left, right) => right.count - left.count
      || left.scope.localeCompare(right.scope));
    const offset = Math.max(0, Number(payload.offset || 0));
    const limit = Math.max(1, Number(payload.limit || 60));
    return { total: items.length, offset, items: items.slice(offset, offset + limit) };
  }
  if (operation === 'inspectTargets') {
    return (payload.locations || []).map((location) => session.inspectTarget(location));
  }
  if (operation === 'resolveText') return session.resolveText(payload.query, payload.match || {});
  if (operation === 'objectInventory') return session.objectInventory();
  if (operation === 'readAsset') {
    const asset = session.readAsset(payload.imageName);
    return { ...asset, bytes: Buffer.from(asset.bytes) };
  }
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
