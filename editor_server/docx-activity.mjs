import { randomUUID } from 'node:crypto';

const DEFAULT_IDLE_MS = 10_000;
const DEFAULT_EVENT_TTL_MS = 7_000;
const DEFAULT_RETENTION_MS = 5 * 60_000;
const DEFAULT_MAX_SUBSCRIBERS = 20;

function activitySummary(name, args = {}) {
  const commandCount = Array.isArray(args.commands) ? args.commands.length : 0;
  const pageCount = Array.isArray(args.pages) && args.pages.length ? new Set(args.pages).size : 1;
  const summaries = {
    editor_docx_apply: commandCount === 1
      ? 'Applying 1 document change'
      : `Applying ${commandCount || 'document'} changes`,
    editor_docx_command_catalog: 'Checking available edit commands',
    editor_docx_discard: 'Closing the editing session',
    editor_docx_export_pdf: 'Exporting the document as PDF',
    editor_docx_object_inventory: 'Inspecting document objects',
    editor_docx_open: 'Opening the DOCX document',
    editor_docx_prepare_review: 'Preparing tracked changes for review',
    editor_docx_quality_check: 'Checking document quality',
    editor_docx_read_json: 'Reading document structure',
    editor_docx_render_pages: pageCount === 1 ? 'Rendering 1 page' : `Rendering ${pageCount} pages`,
    editor_docx_save_checkpoint: 'Saving a document checkpoint',
    editor_docx_save_source: 'Finalizing the edited DOCX',
    editor_docx_target_find: 'Locating requested content',
    editor_docx_target_inspect: 'Inspecting selected content',
    editor_docx_target_map: 'Mapping editable document regions',
  };
  return summaries[name] || '';
}

function displayNumber(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed + 1 : null;
}

function namedNumber(value, prefix) {
  const match = String(value || '').match(new RegExp(`^${prefix}[_-]?(\\d+)$`, 'i'));
  return match ? Number(match[1]) + 1 : null;
}

function commandTarget(command = {}) {
  const target = command.location || command.target || {};
  const paragraph = target.paragraph || {};
  const native = target.native || {};
  const rangeStart = target.range?.start || {};
  const paragraphNumber = displayNumber(paragraph.number ?? paragraph.para ?? native.para)
    ?? namedNumber(target.nodeId ?? rangeStart.nodeId, 'p');
  const tableNumber = namedNumber(target.tableId ?? command.tableId, 'tbl');
  const cellNumber = displayNumber(target.cell?.number ?? target.cellIndex ?? command.cell?.number);
  if (tableNumber && cellNumber) return `table ${tableNumber}, cell ${cellNumber}`;
  if (tableNumber) return `table ${tableNumber}`;
  if (paragraphNumber) return `paragraph ${paragraphNumber}`;
  if (command.imageName) return `image ${String(command.imageName).split(/[\\/]/).at(-1)}`;
  if (command.section === 'all') return 'all sections';
  const sectionNumber = displayNumber(command.section);
  if (sectionNumber) return `section ${sectionNumber}`;
  return 'the document';
}

function commandAction(op) {
  const actions = {
    'text.replaceParagraph': 'Replacing paragraph text',
    'text.replace': 'Replacing text',
    'text.replaceTracked': 'Replacing text with tracked changes',
    insertText: 'Inserting text',
    deleteRange: 'Deleting text',
    appendParagraph: 'Adding a paragraph',
    'reference.insert': 'Adding a document reference',
    'reference.remove': 'Removing a document reference',
    'table.writeCell': 'Updating a table cell',
    'table.writeRichCell': 'Updating a styled table cell',
    'table.writeCells': 'Updating table cells',
    'table.applyCellStyle': 'Applying table cell formatting',
    'table.create': 'Creating a table',
    'table.insertCaption': 'Adding a table caption',
    'style.applyText': 'Updating text and formatting',
    'paragraph.applyStyle': 'Applying paragraph formatting',
    'style.clone': 'Cloning formatting',
    applyStyle: 'Applying a named style',
    setRunStyle: 'Updating character formatting',
    setParagraphStyle: 'Updating paragraph formatting',
    'list.writeBullets': 'Writing a bulleted list',
    'list.applyNumbering': 'Writing a numbered list',
    'layout.fitText': 'Fitting text to its layout',
    'image.replace': 'Replacing an image',
    'image.insertAfterParagraph': 'Inserting an image',
    'image.generateAndReplace': 'Regenerating an image',
    setDocumentMetadata: 'Updating document metadata',
    defineStyle: 'Defining a document style',
    setPageSetup: 'Updating page setup',
    setHeaderFooter: 'Updating headers or footers',
    insertFootnote: 'Adding a footnote',
  };
  if (actions[op]) return actions[op];
  const words = String(op || 'document change')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function commandDescription(command = {}) {
  const action = commandAction(String(command.op || ''));
  if (command.op === 'appendParagraph' || command.op === 'table.create' || command.op === 'setDocumentMetadata'
    || command.op === 'defineStyle' || command.op === 'setHeaderFooter') {
    return action;
  }
  if (command.op === 'table.writeCells') {
    const count = Array.isArray(command.cells) ? command.cells.length : 0;
    const table = commandTarget(command);
    return count ? `${action} (${count}) in ${table}` : `${action} in ${table}`;
  }
  return `${action} in ${commandTarget(command)}`;
}

function commandReviewMode(command = {}) {
  const op = String(command.op || '');
  const textRedlineOperations = new Set([
    'text.replaceParagraph',
    'text.replace',
    'text.replaceTracked',
    'insertText',
    'deleteRange',
    'appendParagraph',
    'table.writeCell',
    'table.writeRichCell',
    'table.writeCells',
    'table.create',
    'table.insertCaption',
    'list.writeBullets',
    'list.applyNumbering',
    'insertFootnote',
    'reference.insert',
    'reference.remove',
  ]);
  return textRedlineOperations.has(op) ? 'docx-redline' : 'snapshot-rollback';
}

function activityDetail(name, args = {}) {
  if (name === 'editor_docx_apply') {
    const commands = Array.isArray(args.commands) ? args.commands : [];
    const visible = commands.slice(0, 4).map(commandDescription);
    if (commands.length > visible.length) visible.push(`+${commands.length - visible.length} more`);
    return visible.join('; ');
  }
  if (name === 'editor_docx_render_pages') {
    const pages = Array.isArray(args.pages) ? [...new Set(args.pages.map(Number).filter(Number.isInteger))] : [];
    return pages.length ? `Pages ${pages.join(', ')}` : 'Page 1';
  }
  if (name === 'editor_docx_quality_check' && Number.isInteger(Number(args.baseRevision))) {
    return `Revision ${Number(args.baseRevision)}`;
  }
  if (name === 'editor_docx_target_inspect' && Array.isArray(args.locations)) {
    return `${args.locations.length} selected target${args.locations.length === 1 ? '' : 's'}`;
  }
  return '';
}

function activityDescriptor(name, args = {}) {
  const label = activitySummary(name, args);
  return label ? { label, detail: activityDetail(name, args) } : null;
}

function cloneEvent(event) {
  return {
    id: event.id,
    operationId: event.operationId,
    label: event.label,
    detail: event.detail,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

class DocxActivityHub {
  constructor(options = {}) {
    this.idleMs = Number(options.idleMs || DEFAULT_IDLE_MS);
    this.eventTtlMs = Number(options.eventTtlMs || DEFAULT_EVENT_TTL_MS);
    this.retentionMs = Number(options.retentionMs || DEFAULT_RETENTION_MS);
    this.maxSubscribers = Number(options.maxSubscribers || DEFAULT_MAX_SUBSCRIBERS);
    this.documents = new Map();
  }

  begin(documentId, activity, now = Date.now()) {
    const descriptor = typeof activity === 'string' ? { label: activity, detail: '' } : activity;
    if (!documentId || !descriptor?.label) return null;
    const document = this.#document(documentId, now);
    this.#pruneEvents(document, now);
    if (!document.operationId || now - document.lastActivityAt >= this.idleMs) {
      document.operationId = randomUUID();
      document.events = [];
    }
    const event = {
      id: randomUUID(),
      operationId: document.operationId,
      label: descriptor.label,
      detail: String(descriptor.detail || ''),
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };
    document.events.push(event);
    document.lastActivityAt = now;
    this.#broadcast(document, { type: 'activity', operationId: document.operationId, event: cloneEvent(event) });
    return { documentId, operationId: document.operationId, eventId: event.id };
  }

  finish(handle, status = 'completed', now = Date.now()) {
    if (!handle) return;
    const document = this.documents.get(handle.documentId);
    if (document) this.#pruneEvents(document, now);
    const event = document?.events.find((candidate) => candidate.id === handle.eventId);
    if (!document || !event) return;
    event.status = status === 'failed' ? 'failed' : 'completed';
    event.updatedAt = now;
    document.lastActivityAt = now;
    this.#broadcast(document, { type: 'activity', operationId: document.operationId, event: cloneEvent(event) });
  }

  complete(documentId, label, now = Date.now()) {
    const handle = this.begin(documentId, label, now);
    this.finish(handle, 'completed', now);
    return handle;
  }

  snapshot(documentId, now = Date.now()) {
    const document = this.documents.get(documentId);
    if (!document) {
      return { type: 'snapshot', operationId: '', lastActivityAt: 0, events: [] };
    }
    this.#pruneEvents(document, now);
    return {
      type: 'snapshot',
      operationId: document.operationId,
      lastActivityAt: document.lastActivityAt,
      events: document.events.map(cloneEvent),
    };
  }

  subscribe(documentId, subscriber, now = Date.now()) {
    const document = this.#document(documentId, now);
    if (document.subscribers.size >= this.maxSubscribers) {
      throw new Error('Too many activity subscribers for this document');
    }
    document.subscribers.add(subscriber);
    subscriber(this.snapshot(documentId, now));
    return () => {
      document.subscribers.delete(subscriber);
      this.prune();
    };
  }

  prune(now = Date.now()) {
    for (const [documentId, document] of this.documents) {
      if (!document.subscribers.size && now - document.lastActivityAt >= this.retentionMs) {
        this.documents.delete(documentId);
      }
    }
  }

  #document(documentId, now) {
    this.prune(now);
    let document = this.documents.get(documentId);
    if (!document) {
      document = {
        operationId: '',
        lastActivityAt: 0,
        events: [],
        subscribers: new Set(),
      };
      this.documents.set(documentId, document);
    }
    return document;
  }

  #broadcast(document, payload) {
    for (const subscriber of [...document.subscribers]) {
      try {
        subscriber(payload);
      } catch {
        document.subscribers.delete(subscriber);
      }
    }
  }

  #pruneEvents(document, now) {
    document.events = document.events.filter((event) => now - event.createdAt < this.eventTtlMs);
  }
}

export {
  DEFAULT_EVENT_TTL_MS,
  DEFAULT_IDLE_MS,
  DocxActivityHub,
  activityDescriptor,
  activityDetail,
  activitySummary,
  commandDescription,
  commandReviewMode,
};
