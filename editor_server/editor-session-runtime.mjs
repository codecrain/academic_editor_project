import os from 'node:os';
import { Worker } from 'node:worker_threads';

function defaultWorkerCount() {
  return Math.max(1, Number(os.availableParallelism?.() || os.cpus().length || 1));
}

function documentLane(documentId, laneCount) {
  let hash = 2166136261;
  for (const char of String(documentId)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % laneCount;
}

function workerError(payload = {}) {
  const error = new Error(payload.message || 'Editor session worker failed.');
  error.name = payload.name || 'Error';
  if (payload.code !== undefined) error.code = payload.code;
  if (payload.statusCode !== undefined) error.statusCode = payload.statusCode;
  if (payload.details !== undefined) error.details = payload.details;
  if (payload.stack) error.stack = payload.stack;
  return error;
}

class EditorSessionLane {
  constructor(workerUrl) {
    this.workerUrl = workerUrl;
    this.worker = null;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
  }

  #ensureWorker() {
    if (this.closed) throw new Error('Editor session runtime is closed.');
    if (this.worker) return this.worker;
    const worker = new Worker(this.workerUrl, { type: 'module' });
    worker.on('message', (message) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(workerError(message.error));
      else pending.resolve(message.result);
    });
    const rejectPending = (error) => {
      if (this.worker === worker) this.worker = null;
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
    worker.on('error', rejectPending);
    worker.on('exit', (code) => {
      if (!this.closed && this.worker === worker) {
        rejectPending(new Error(`Editor session worker exited unexpectedly with code ${code}.`));
      }
    });
    this.worker = worker;
    return worker;
  }

  call(documentId, operation, payload) {
    const worker = this.#ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, documentId, operation, payload });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async close() {
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
    const error = new Error('Editor session runtime closed before the operation completed.');
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

class WorkerBackedEditorSession {
  constructor(runtime, documentId, format, revision) {
    this.runtime = runtime;
    this.documentId = documentId;
    this.format = format;
    this.revision = Number(revision || 1);
  }

  readJson() { return this.runtime.call(this.documentId, 'readJson'); }
  targetMap() { return this.runtime.call(this.documentId, 'targetMap'); }
  inspectTargets(locations) { return this.runtime.call(this.documentId, 'inspectTargets', { locations }); }
  resolveText(query, match) { return this.runtime.call(this.documentId, 'resolveText', { query, match }); }
  objectInventory() { return this.runtime.call(this.documentId, 'objectInventory'); }
  qualityCheck(options) { return this.runtime.call(this.documentId, 'qualityCheck', { options }); }
  renderHwpxSvgPages(pages) { return this.runtime.call(this.documentId, 'renderHwpxSvgPages', { pages }); }

  async apply(commands) {
    const response = await this.runtime.call(this.documentId, 'apply', { commands });
    this.revision = Number(response.revision);
    return response.result;
  }

  async save() {
    const saved = await this.runtime.call(this.documentId, 'save');
    this.revision = Number(saved.revision);
    return { ...saved, bytes: Buffer.from(saved.bytes) };
  }

  close() { return this.runtime.call(this.documentId, 'close'); }
}

class EditorSessionWorkerPool {
  constructor(options = {}) {
    this.size = Math.max(1, Number(options.size || defaultWorkerCount()));
    const workerUrl = options.workerUrl || new URL('./editor-session-worker.mjs', import.meta.url);
    this.lanes = Array.from({ length: this.size }, () => new EditorSessionLane(workerUrl));
  }

  lane(documentId) {
    return this.lanes[documentLane(documentId, this.lanes.length)];
  }

  call(documentId, operation, payload = {}) {
    return this.lane(documentId).call(documentId, operation, payload);
  }

  async open(documentId, format, bytes, options = {}) {
    const opened = await this.call(documentId, 'open', {
      format,
      bytes: Buffer.from(bytes),
      options,
    });
    return {
      session: new WorkerBackedEditorSession(this, documentId, format, opened.revision),
      json: opened.json,
    };
  }

  renderHwpxBytes(documentId, bytes, pages) {
    return this.call(documentId, 'renderHwpxBytes', { bytes: Buffer.from(bytes), pages });
  }

  countDocxRevisionElements(documentId, bytes) {
    return this.call(documentId, 'countDocxRevisionElements', { bytes: Buffer.from(bytes) });
  }

  close() {
    return Promise.all(this.lanes.map((lane) => lane.close()));
  }
}

export {
  EditorSessionWorkerPool,
  WorkerBackedEditorSession,
  defaultWorkerCount,
  documentLane,
};
