import assert from 'node:assert/strict';
import test from 'node:test';

import { DocxActivityHub, activityDetail, activitySummary } from './docx-activity.mjs';

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
  assert.equal(activitySummary('editor_hwpx_edit', { commands: [{}] }), '');
  assert.equal(
    activityDetail('editor_docx_apply', {
      commands: [
        {
          op: 'text.replaceParagraph',
          location: { paragraph: { section: 0, number: 3 } },
          text: 'private replacement text',
        },
        {
          op: 'table.writeCells',
          tableId: 'tbl_1',
          cells: [{ cell: { number: 0 }, text: 'secret' }, { cell: { number: 1 }, text: 'secret' }],
        },
      ],
    }),
    'Replacing paragraph text in paragraph 4; Updating table cells (2) in table 2',
  );
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
    hub.snapshot('doc-1', 22_001).events.map((event) => [event.label, event.status]),
    [['Checking document quality', 'running']],
  );
  assert.equal(messages[0].type, 'snapshot');
  assert.equal(messages.some((message) => message.event?.status === 'failed'), true);
  unsubscribe();
});

test('DOCX activity hub expires each event after seven seconds and caps subscribers', () => {
  const hub = new DocxActivityHub({ eventTtlMs: 7_000, maxSubscribers: 1 });
  const unsubscribe = hub.subscribe('doc-2', () => {}, 1_000);
  assert.throws(() => hub.subscribe('doc-2', () => {}), /Too many activity subscribers/);
  hub.complete('doc-2', 'First', 1_000);
  hub.complete('doc-2', 'Second', 4_000);
  assert.deepEqual(hub.snapshot('doc-2', 7_999).events.map((event) => event.label), ['First', 'Second']);
  assert.deepEqual(hub.snapshot('doc-2', 8_000).events.map((event) => event.label), ['Second']);
  assert.deepEqual(hub.snapshot('doc-2', 11_000).events.map((event) => event.label), []);
  unsubscribe();
});
