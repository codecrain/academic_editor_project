import { randomUUID } from 'node:crypto';

const DEFAULT_IDLE_MS = 10_000;
const DEFAULT_RETENTION_MS = 5 * 60_000;
const DEFAULT_MAX_EVENTS = 8;
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

function cloneEvent(event) {
  return {
    id: event.id,
    operationId: event.operationId,
    label: event.label,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

class DocxActivityHub {
  constructor(options = {}) {
    this.idleMs = Number(options.idleMs || DEFAULT_IDLE_MS);
    this.retentionMs = Number(options.retentionMs || DEFAULT_RETENTION_MS);
    this.maxEvents = Number(options.maxEvents || DEFAULT_MAX_EVENTS);
    this.maxSubscribers = Number(options.maxSubscribers || DEFAULT_MAX_SUBSCRIBERS);
    this.documents = new Map();
  }

  begin(documentId, label, now = Date.now()) {
    if (!documentId || !label) return null;
    const document = this.#document(documentId, now);
    if (!document.operationId || now - document.lastActivityAt >= this.idleMs) {
      document.operationId = randomUUID();
      document.events = [];
    }
    const event = {
      id: randomUUID(),
      operationId: document.operationId,
      label,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };
    document.events.push(event);
    document.events = document.events.slice(-this.maxEvents);
    document.lastActivityAt = now;
    this.#broadcast(document, { type: 'activity', operationId: document.operationId, event: cloneEvent(event) });
    return { documentId, operationId: document.operationId, eventId: event.id };
  }

  finish(handle, status = 'completed', now = Date.now()) {
    if (!handle) return;
    const document = this.documents.get(handle.documentId);
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

  snapshot(documentId) {
    const document = this.documents.get(documentId);
    if (!document) {
      return { type: 'snapshot', operationId: '', lastActivityAt: 0, events: [] };
    }
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
    subscriber(this.snapshot(documentId));
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
}

export {
  DEFAULT_IDLE_MS,
  DocxActivityHub,
  activitySummary,
};
