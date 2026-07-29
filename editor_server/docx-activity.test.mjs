import assert from 'node:assert/strict';
import test from 'node:test';

import { DocxActivityHub, activitySummary } from './docx-activity.mjs';

test('DOCX activity summaries expose bounded factual descriptions only', () => {
  assert.equal(
    activitySummary('editor_docx_apply', {
      documentId: 'doc-secret',
      commands: [{ op: 'replaceText', text: 'private manuscript text' }],
    }),
    'Applying 1 document change',
  );
  assert.equal(activitySummary('editor_docx_render_pages', { pages: [1, 2, 2] }), 'Rendering 2 pages');
  assert.equal(activitySummary('editor_docx_target_find', { query: 'confidential query' }), 'Locating requested content');
  assert.equal(activitySummary('editor_hwpx_apply', { commands: [{}] }), '');
});

test('DOCX activity hub groups active calls and starts a new operation after ten idle seconds', () => {
  const hub = new DocxActivityHub({ idleMs: 10_000 });
  const messages = [];
  const unsubscribe = hub.subscribe('doc-1', (payload) => messages.push(payload), 1_000);
  const first = hub.begin('doc-1', 'Reading document structure', 2_000);
  hub.finish(first, 'completed', 2_100);
  const second = hub.begin('doc-1', 'Mapping editable document regions', 11_999);
  hub.finish(second, 'failed', 12_000);
  const third = hub.begin('doc-1', 'Checking document quality', 22_001);

  assert.equal(first.operationId, second.operationId);
  assert.notEqual(second.operationId, third.operationId);
  assert.deepEqual(
    hub.snapshot('doc-1').events.map((event) => [event.label, event.status]),
    [['Checking document quality', 'running']],
  );
  assert.equal(messages[0].type, 'snapshot');
  assert.equal(messages.some((message) => message.event?.status === 'failed'), true);
  unsubscribe();
});

test('DOCX activity hub caps retained events and subscriber count', () => {
  const hub = new DocxActivityHub({ maxEvents: 2, maxSubscribers: 1 });
  const unsubscribe = hub.subscribe('doc-2', () => {});
  assert.throws(() => hub.subscribe('doc-2', () => {}), /Too many activity subscribers/);
  hub.complete('doc-2', 'First');
  hub.complete('doc-2', 'Second');
  hub.complete('doc-2', 'Third');
  assert.deepEqual(hub.snapshot('doc-2').events.map((event) => event.label), ['Second', 'Third']);
  unsubscribe();
});
