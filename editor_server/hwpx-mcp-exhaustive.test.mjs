import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createGatewayServer } from './editor-gateway.mjs';
import { HWPX_COMMAND_OPS } from '../editor_hwpx/scripts/hwpx-command-catalog.mjs';
import { createZip, readZip } from '../editor_hwpx/scripts/hwpx-api-utils.mjs';
import { HWPX_MCP_CONTRACT } from './hwpx-mcp-contract.mjs';

const FIXTURES = Object.freeze({
  blank: path.resolve('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'),
  basicTable: path.resolve('editor_hwpx/samples/hwpx/basic-table-01.hwpx'),
  body: path.resolve('editor_hwpx/samples/test-image.hwpx'),
  esg: path.resolve('editor_hwpx/samples/api-fixtures/esg-original.hwpx'),
  briefing: path.resolve('evaluation/hwpx-agent-final-20-v1/attachments/source/moe-2025-briefing.hwpx'),
  hwpBody: path.resolve('editor_hwpx/samples/re-align-left-hancom.hwp'),
  hwpField: path.resolve('editor_hwpx/samples/field-01-memo.hwp'),
  hwpTable: path.resolve('editor_hwpx/samples/table-001.hwp'),
  hwpSimpleTable: path.resolve('editor_hwpx/samples/table-ipc.hwp'),
  hwpShape: path.resolve('editor_hwpx/samples/shape-001.hwp'),
});

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXsAAAAASUVORK5CYII=';
const FAKE_PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF\n');

function fakeHwpxPdfRenderer(bytes) {
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString('hex'), '504b');
  return Promise.resolve({
    bytes: FAKE_PDF_BYTES,
    byteLength: FAKE_PDF_BYTES.length,
    sha256: createHash('sha256').update(FAKE_PDF_BYTES).digest('hex'),
    pageCount: 1,
    renderer: 'rhwp-native',
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address())));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function makeTextBoxFixture(sourceBytes, text = 'RED TEAM TEXT BOX') {
  const entries = readZip(sourceBytes);
  const sectionName = 'Contents/section0.xml';
  const xml = entries.get(sectionName).toString('utf8');
  const start = xml.indexOf('<hp:rect');
  const end = xml.indexOf('</hp:rect>', start) + '</hp:rect>'.length;
  assert.ok(start >= 0 && end > start);
  let first = true;
  const rect = xml.slice(start, end).replace(
    /(<hp:t\b[^>]*>)[\s\S]*?(<\/hp:t>)/g,
    (_whole, open, close) => `${open}${first ? (first = false, text) : ''}${close}`,
  );
  entries.set(sectionName, Buffer.from(`${xml.slice(0, start)}${rect}${xml.slice(end)}`, 'utf8'));
  return createZip([...entries.entries()]);
}

test('actual MCP exhaustively executes every HWPX tool, inspect view, and command operation', { timeout: 180_000 }, async () => {
  const fixtureBytes = Object.fromEntries(await Promise.all(
    Object.entries(FIXTURES).map(async ([name, filename]) => [name, await readFile(filename)]),
  ));
  fixtureBytes.textBox = makeTextBoxFixture(fixtureBytes.briefing);

  const server = createGatewayServer({
    host: '127.0.0.1',
    port: 0,
    publicOrigin: 'http://127.0.0.1',
    docxServiceRoot: '/docx',
    hwpxBasePath: '/hwpx/',
    docxRuntimeOrigin: 'http://127.0.0.1:9980',
    hwpxRuntimeOrigin: '',
    hwpxStaticRoot: '',
    wopiBaseUrl: 'http://127.0.0.1',
    sampleDocxPath: path.resolve('editor_hwpx/samples/hwpx/blank_hwpx.hwpx'),
    enableSampleDocx: false,
    hwpxPdfRenderer: fakeHwpxPdfRenderer,
  });
  const address = await listen(server);
  const origin = `http://127.0.0.1:${address.port}`;
  let requestId = 90_000;
  const coveredTools = new Set();
  const coveredViews = new Set();
  const coveredOps = new Set();
  const active = new Map();
  const artifacts = new Map();

  const rpc = async (method, params = {}) => {
    const response = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const callRaw = async (name, args) => {
    coveredTools.add(name);
    return rpc('tools/call', { name, arguments: args });
  };
  const call = async (name, args) => {
    const response = await callRaw(name, args);
    assert.equal(response.result?.isError, false, JSON.stringify(response.result?.structuredContent));
    return response.result.structuredContent;
  };
  const expectError = async (name, args, code) => {
    const response = await callRaw(name, args);
    assert.equal(response.result?.isError, true, JSON.stringify(response.result?.structuredContent));
    if (code) assert.equal(response.result.structuredContent.code, code);
    return response.result.structuredContent;
  };
  const open = async (fixture, filename = `${fixture}.hwpx`) => {
    const opened = await call('editor_hwpx_open', {
      filename,
      bytesBase64: fixtureBytes[fixture].toString('base64'),
    });
    const state = { documentId: opened.documentId, revision: opened.revision, closed: false };
    active.set(state.documentId, state);
    return state;
  };
  const inspect = async (state, view, args = {}) => {
    coveredViews.add(view);
    return call('editor_hwpx_inspect', { documentId: state.documentId, view, ...args });
  };
  const inspectTargets = async (state, locations) => inspect(state, 'target', { locations });
  const discard = async (state) => {
    if (state.closed) return;
    await call('editor_hwpx_discard', { documentId: state.documentId, baseRevision: state.revision });
    state.closed = true;
    active.delete(state.documentId);
  };
  const edit = async (state, commands, args = {}) => {
    const normalized = commands.map((command, index) => ({
      commandId: command.commandId ?? `red-team-${command.op.replace(/[^a-z0-9]+/gi, '-')}-${index + 1}`,
      ...command,
    }));
    const before = state.revision;
    const edited = await call('editor_hwpx_edit', {
      documentId: state.documentId,
      baseRevision: before,
      commands: normalized,
      ...args,
    });
    normalized.forEach((command) => coveredOps.add(command.op));
    state.revision = edited.revision;
    assert.ok(state.revision > before, `${normalized.map((item) => item.op).join(',')} must advance revision`);
    const history = await inspect(state, 'history');
    assert.equal(history.entries.at(-1).revisionAfter, state.revision);
    assert.notEqual(history.entries.at(-1).digestBefore, history.entries.at(-1).digestAfter);
    return edited;
  };
  const withDoc = async (fixture, fn, filename) => {
    const state = await open(fixture, filename);
    try {
      return await fn(state);
    } finally {
      await discard(state);
    }
  };
  const outlineItems = (state, kind, limit = 120) => inspect(state, 'outline', { kind, limit }).then((value) => value.items);

  try {
    const initialized = await rpc('initialize', { protocolVersion: '2025-06-18' });
    assert.equal(initialized.result.serverInfo.version, HWPX_MCP_CONTRACT.version);
    const listed = await rpc('tools/list');
    assert.deepEqual(
      listed.result.tools.map((item) => item.name).filter((name) => name.startsWith('editor_hwpx_')),
      HWPX_MCP_CONTRACT.tools,
    );

    await withDoc('blank', async (state) => {
      const target = (await outlineItems(state, 'paragraph'))[0];
      await inspectTargets(state, [target.location]);
      const inserted = await edit(state, [{ op: 'field.insert', target: { native: { section: target.location.paragraph.section, para: target.location.paragraph.number, offset: 0, length: 0 } }, guide: 'Applicant name', name: 'mcp_applicant', editable: true }]);
      const fields = await inspect(state, 'fields');
      const fieldId = inserted.results[0].target.fieldId;
      assert.ok(fields.fields.some((field) => field.fieldId === fieldId));
      const managed = await edit(state, [{ op: 'field.manage', action: 'update', fieldId, guide: 'Applicant legal name', memo: 'Use the registered legal name', name: 'mcp_legal_applicant', editable: false }]);
      assert.equal(managed.results[0].expectedField.name, 'mcp_legal_applicant');
    });
    await withDoc('blank', async (state) => {
      const target = (await outlineItems(state, 'paragraph'))[0];
      await inspectTargets(state, [target.location]);
      const inserted = await edit(state, [{ op: 'note.insert', target: { native: { section: target.location.paragraph.section, para: target.location.paragraph.number, offset: 0, length: 0 } }, kind: 'endnote', text: 'MCP endnote body' }]);
      const created = inserted.results[0].target;
      const noteTarget = { native: { section: created.sectionIndex, para: created.paragraphIndex, control: created.controlIndex } };
      await inspectTargets(state, [noteTarget]);
      const managed = await edit(state, [{ op: 'note.manage', action: 'replaceText', target: noteTarget, text: 'MCP revised endnote\nSecond evidence paragraph' }]);
      assert.equal(managed.results[0].expectedNoteText, 'MCP revised endnote\nSecond evidence paragraph');
    });
    await withDoc('blank', async (state) => {
      const target = (await outlineItems(state, 'paragraph'))[0];
      await inspectTargets(state, [target.location]);
      await edit(state, [{ op: 'bookmark.manage', action: 'create', target: { native: { section: target.location.paragraph.section, para: target.location.paragraph.number, offset: 0, length: 0 } }, name: 'mcp_audit_start' }]);
    });
    await withDoc('basicTable', async (state) => {
      const target = (await outlineItems(state, 'cell'))[0];
      await inspectTargets(state, [target.location]);
      const calculated = await edit(state, [{ op: 'table.transform', target: target.location, action: 'calculate', row: 0, column: 0, formula: '=1+2', writeResult: true }]);
      assert.equal(calculated.results[0].expectedCellText, '3');
    });
    await withDoc('blank', async (state) => {
      await edit(state, [{ op: 'section.configure', sectionIndex: 0, action: 'columns', properties: { count: 2, type: 'normal', sameWidth: true, spacing: 2268 } }]);
    });
    await withDoc('blank', async (state) => {
      const target = (await outlineItems(state, 'paragraph'))[0];
      await inspectTargets(state, [target.location]);
      const created = await edit(state, [{ op: 'object.create', target: { native: { section: target.location.paragraph.section, para: target.location.paragraph.number, offset: 0, length: 0 } }, kind: 'shape', shapeType: 'rectangle', width: 18000, height: 9000 }]);
      const createdTarget = created.results[0].target;
      await inspectTargets(state, [target.location]);
      await edit(state, [{ op: 'object.create', target: { native: { section: target.location.paragraph.section, para: target.location.paragraph.number, offset: 0, length: 0 } }, kind: 'shape', shapeType: 'ellipse', width: 16000, height: 8000 }]);
      await inspectTargets(state, [target.location]);
      const objects = await inspect(state, 'objects');
      assert.ok(objects.shapes.some(item => item.native?.control === createdTarget.controlIndex));
      await edit(state, [{ op: 'object.manage', action: 'arrange', kind: 'shape', order: 'front', target: { native: { section: createdTarget.sectionIndex, para: createdTarget.paragraphIndex, control: createdTarget.controlIndex } } }]);
    });

    await withDoc('briefing', async (state) => {
      const outline = await inspect(state, 'outline', { limit: 1 });
      assert.ok(outline.items.length === 1);
      if (outline.nextCursor) {
        const next = await inspect(state, 'outline', { limit: 1, cursor: outline.nextCursor });
        assert.ok(next.items.length === 1);
      }
      const paragraphs = await outlineItems(state, 'paragraph', 20);
      const paragraph = paragraphs.find((item) => item.textLength > 0);
      assert.ok(paragraph);
      await inspectTargets(state, [paragraph.location]);
      await inspect(state, 'summary');
      await inspect(state, 'styles', { limit: 20 });
      const objects = await inspect(state, 'objects');
      assert.ok(objects.pictures.some((item) => item.native?.cellPath));
      assert.ok(objects.shapes.some((item) => item.native));
      await inspect(state, 'template');
      const page = await inspect(state, 'page', { page: 1, includeSvg: true });
      assert.equal(createHash('sha256').update(page.render.svg).digest('hex'), page.render.svgSha256);
      await inspect(state, 'quality');
      const catalog = await inspect(state, 'catalog');
      assert.deepEqual(catalog.commands.map((item) => item.op), [...HWPX_COMMAND_OPS]);
      for (const imageOp of ['image.replace', 'image.insertAfterParagraph', 'image.replaceInCell', 'image.insertInCell']) {
        const imageCommand = catalog.commands.find((item) => item.op === imageOp);
        assert.deepEqual(imageCommand.anyOf, [['bytesBase64', 'assetRef']]);
        assert.equal(Object.hasOwn(imageCommand.fields, 'filePath'), false);
        assert.equal(Object.hasOwn(imageCommand.fields, 'bytes'), false);
      }
      await inspect(state, 'search', { query: paragraph.text.slice(0, 5) });
      await inspect(state, 'fields');
      await inspect(state, 'security');
      await inspect(state, 'history');
      await inspect(state, 'capabilities');
    });

    const textScenario = async (op, build, fixture = 'body') => withDoc(fixture, async (state) => {
      const paragraphs = await outlineItems(state, 'paragraph');
      const command = await build(state, paragraphs.filter((item) => item.kind === 'paragraph'));
      await edit(state, [command]);
    });
    await textScenario('text.replaceParagraph', async (state, paragraphs) => {
      const target = paragraphs.find((item) => item.textLength > 0); await inspectTargets(state, [target.location]);
      return { op: 'text.replaceParagraph', location: target.location, text: '문단 전체 교체 검증' };
    });
    await textScenario('text.insertAfterParagraph', async (state, paragraphs) => {
      const target = paragraphs.find((item) => item.textLength > 0); await inspectTargets(state, [target.location]);
      return { op: 'text.insertAfterParagraph', location: target.location, text: '첫 문단\n둘째 문단' };
    });
    await textScenario('text.replace', async (state, paragraphs) => {
      const target = paragraphs.find((item) => item.textLength >= 4); await inspectTargets(state, [target.location]);
      return { op: 'text.replace', target: { native: { section: 0, para: target.location.paragraph.number, offset: 1, length: 2 } }, text: '검증' };
    });
    await textScenario('text.replaceTracked', async (state, paragraphs) => {
      const target = paragraphs.find((item) => item.textLength >= 2); await inspectTargets(state, [target.location]);
      return { op: 'text.replaceTracked', target: { native: { section: 0, para: target.location.paragraph.number, offset: 0, length: 1 } }, text: '추적', author: '레드팀', date: '2026-08-12T00:00:00Z' };
    });
    await textScenario('insertText', async (state, paragraphs) => {
      const target = paragraphs[0]; await inspectTargets(state, [target.location]);
      return { op: 'insertText', target: { native: { section: 0, para: target.location.paragraph.number, offset: 0, length: 0 } }, text: '삽입' };
    }, 'blank');
    await textScenario('deleteRange', async (state, paragraphs) => {
      const target = paragraphs.find((item) => item.textLength >= 2); await inspectTargets(state, [target.location]);
      return { op: 'deleteRange', target: { native: { section: 0, para: target.location.paragraph.number, offset: 0, length: 1 } } };
    });
    await textScenario('appendParagraph', async (state, paragraphs) => {
      const target = paragraphs.find((item) => item.textLength > 0); const source = paragraphs.find((item) => item !== target && item.textLength > 0) ?? target;
      await inspectTargets(state, [target.location, source.location]);
      return { op: 'appendParagraph', target: target.location, styleSource: source.location, text: '복제 서식 문단' };
    });
    await textScenario('text.deleteParagraphs', async (state, paragraphs) => {
      const locations = paragraphs.filter((item) => item.textLength > 0).slice(-2).map((item) => item.location);
      await inspectTargets(state, locations); return { op: 'text.deleteParagraphs', locations };
    }, 'briefing');

    await withDoc('hwpField', async (state) => {
      const inventory = await inspect(state, 'fields');
      await edit(state, [{ op: 'field.setValues', values: inventory.fields.slice(0, 2).map((field, index) => ({ fieldId: field.fieldId, value: `필드-${index + 1}` })) }]);
    }, 'fields.hwp');

    const tableScenario = async (build, fixture = 'esg') => withDoc(fixture, async (state) => {
      const cells = await outlineItems(state, 'cell');
      const command = await build(state, cells);
      await edit(state, [command]);
    }, fixture.startsWith('hwp') ? `${fixture}.hwp` : undefined);
    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[0].location]); return { op: 'table.writeCell', location: cells[0].location, text: '단일 셀' }; });
    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[0].location, cells[1].location]); return { op: 'table.writeCell', location: cells[1].location, styleSource: cells[0].location, text: '서식\n복제', paragraphTemplateIndices: [0, 0] }; });
    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[0].location, cells[1].location]); return { op: 'table.writeCells', tableId: cells[0].location.tableId, cells: [{ cell: cells[0].location.cell, text: '가' }, { cell: cells[1].location.cell, text: '나' }] }; });
    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[0].location, cells[1].location]); return { op: 'table.applyCellStyle', target: cells[1].location, styleSource: cells[0].location }; });
    await tableScenario(async (state, cells) => { const tableCells = cells.filter((item) => item.location.tableId === cells[0].location.tableId); await inspectTargets(state, [tableCells[0].location]); return { op: 'table.insertRows', target: tableCells[0].location, rowIndex: 1, count: 1, templateRow: 0, clearText: true }; });
    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[0].location]); return { op: 'table.setSize', target: cells[0].location, height: 54321 }; });
    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[1].location]); return { op: 'table.setCellSize', target: cells[1].location, width: 12345, height: 6789 }; });
    await tableScenario(async (state, cells) => {
      const target = cells.find((item) => item.textLength > 0) ?? cells[0];
      await inspectTargets(state, [target.location]);
      await edit(state, [{ op: 'table.writeCell', location: target.location, text: Array.from({ length: 10 }, (_, index) => `자동 맞춤 ${index + 1}`).join('\n') }]);
      await inspectTargets(state, [target.location]);
      return { op: 'table.autoFit', target: target.location, extraPadding: 200, maxPageGrowth: 1, maxBlankPageGrowth: 0, maxLowOccupancyGrowth: 1 };
    });
    await textScenario('table.create', async (state, paragraphs) => { const target = paragraphs[0]; await inspectTargets(state, [target.location]); return { op: 'table.create', target: target.location, rows: 2, columns: 3, cellTexts: ['A', 'B', 'C', 'D', 'E', 'F'], caption: '생성 표' }; }, 'blank');
    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[0].location]); return { op: 'table.insertCaption', target: cells[0].location, text: '표 캡션', position: 'before' }; }, 'hwpTable');

    for (const variant of [
      { action: 'insertRow', row: 0, side: 'after' },
      { action: 'deleteRow', row: 0 },
      { action: 'insertColumn', column: 0, side: 'after' },
      { action: 'deleteColumn', column: 0 },
      { action: 'mergeCells', startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 },
      { action: 'splitCell', row: 0, column: 0, rows: 1, columns: 2 },
    ]) {
      await tableScenario(async (state, cells) => {
        const target = cells[0].location;
        await inspectTargets(state, [cells[0].location]);
        return { op: 'table.structure', target, ...variant };
      }, variant.action === 'mergeCells' || variant.action === 'splitCell' ? 'hwpSimpleTable' : 'hwpTable');
    }
    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[0].location]); return { op: 'table.structure', target: cells[0].location, action: 'deleteTable' }; });

    await tableScenario(async (state, cells) => { await inspectTargets(state, [cells[0].location, cells[1].location]); return { op: 'style.applyText', target: cells[1].location, styleSource: cells[0].location, text: '스타일 적용' }; });
    await textScenario('style.applyText', async (state, paragraphs) => {
      const candidates = paragraphs.filter((item) => item.textLength > 0);
      const source = candidates[0];
      const target = candidates.find((item) => item.styleFingerprint?.hash !== source.styleFingerprint?.hash);
      assert.ok(target, 'style.applyText without text requires two measurably different paragraph styles');
      await inspectTargets(state, [source.location, target.location]);
      return { op: 'style.applyText', styleSource: source.location, target: target.location };
    }, 'briefing');
    await withDoc('blank', async (state) => {
      const paragraphs = await outlineItems(state, 'paragraph');
      const target = paragraphs[0]; await inspectTargets(state, [target.location]);
      const defined = await edit(state, [{ op: 'defineStyle', name: 'MCP 적용 스타일', kind: 'paragraph', properties: { bold: true, align: 'center' } }]);
      await inspectTargets(state, [target.location]);
      await edit(state, [{ op: 'applyStyle', target: target.location, styleId: defined.results[0].target.styleId }]);
    });
    await textScenario('setRunStyle', async (state, paragraphs) => { const target = paragraphs.find((item) => item.textLength >= 2); await inspectTargets(state, [target.location]); return { op: 'setRunStyle', target: { native: { section: 0, para: target.location.paragraph.number, offset: 0, length: 2 } }, style: { bold: true, italic: true, fontSizePt: 13 } }; });
    await textScenario('setParagraphStyle', async (state, paragraphs) => { const target = paragraphs.find((item) => item.textLength > 0); await inspectTargets(state, [target.location]); return { op: 'setParagraphStyle', target: target.location, style: { align: 'right', lineSpacing: 180 } }; });

    for (const [scope, fixture, properties] of [
      ['character', 'body', { bold: true, color: '#123456', fontSizePt: 12.5 }],
      ['paragraph', 'hwpBody', { alignment: 'center', lineSpacingType: 'Percent', lineSpacing: 175, keepWithNext: true }],
      ['cell', 'hwpTable', { paddingLeft: 210, verticalAlign: 'center', isHeader: true }],
      ['table', 'hwpTable', { cellSpacing: 120, repeatHeader: true }],
    ]) {
      await withDoc(fixture, async (state) => {
        const items = await outlineItems(state, scope === 'cell' || scope === 'table' ? 'cell' : 'paragraph');
        const item = items.find((value) => value.textLength > 0) ?? items[0]; await inspectTargets(state, [item.location]);
        const target = scope === 'character'
          ? { native: { section: 0, para: item.location.paragraph.number, offset: 0, length: 1 } }
          : item.location;
        await edit(state, [{ op: 'format.apply', scope, target, properties }]);
      }, fixture.startsWith('hwp') ? `${fixture}.hwp` : undefined);
    }

    await withDoc('basicTable', async (state) => {
      const target = (await outlineItems(state, 'cell'))[0];
      assert.ok(target);
      const before = (await inspectTargets(state, [target.location])).targets[0];
      const beforeCell = before.style?.cell;
      assert.ok(beforeCell?.borderLeft && beforeCell?.borderRight && beforeCell?.borderTop && beforeCell?.borderBottom);
      await edit(state, [{
        op: 'format.apply', scope: 'cell', target: target.location,
        properties: { applyInnerMargin: true, fieldName: 'mcp-audit-field', editableInForm: true },
      }]);
      await inspectTargets(state, [target.location]);
      await edit(state, [{
        op: 'format.apply', scope: 'cell', target: target.location,
        properties: { fillColor: '#fff2cc' },
      }]);
      const changed = (await inspectTargets(state, [target.location])).targets[0].style?.cell;
      assert.equal(changed.applyInnerMargin, true);
      assert.equal(changed.fieldName, 'mcp-audit-field');
      assert.equal(changed.editableInForm, true);
      assert.equal(changed.fillType, 'solid');
      assert.equal(changed.fillColor, '#fff2cc');
      for (const side of ['borderLeft', 'borderRight', 'borderTop', 'borderBottom']) {
        assert.deepEqual(changed[side], beforeCell[side]);
      }
      const review = await call('editor_hwpx_review', { documentId: state.documentId, baseRevision: state.revision });
      assert.equal(review.ok, true, JSON.stringify(review));
      const saved = await call('editor_hwpx_save', {
        documentId: state.documentId,
        baseRevision: state.revision,
        filename: 'mcp-cell-format-roundtrip.hwpx',
        mode: 'verified',
      });
      state.closed = true;
      active.delete(state.documentId);
      artifacts.set(saved.artifactId, saved);
      const bytes = await call('editor_hwpx_artifact_read', {
        artifactId: saved.artifactId,
        expectedSha256: saved.sha256,
      });
      const reopened = await call('editor_hwpx_open', {
        filename: 'mcp-cell-format-roundtrip.hwpx',
        bytesBase64: bytes.bytesBase64,
      });
      const reopenedState = { documentId: reopened.documentId, revision: reopened.revision, closed: false };
      active.set(reopenedState.documentId, reopenedState);
      const reopenedCell = (await inspectTargets(reopenedState, [target.location])).targets[0].style?.cell;
      assert.equal(reopenedCell.applyInnerMargin, true);
      assert.equal(reopenedCell.fieldName, 'mcp-audit-field');
      assert.equal(reopenedCell.editableInForm, true);
      assert.equal(reopenedCell.fillType, 'solid');
      assert.equal(reopenedCell.fillColor, '#fff2cc');
      for (const side of ['borderLeft', 'borderRight', 'borderTop', 'borderBottom']) {
        assert.deepEqual(reopenedCell[side], beforeCell[side]);
      }
      await discard(reopenedState);
      await call('editor_hwpx_artifact_delete', { artifactId: saved.artifactId, expectedSha256: saved.sha256 });
      artifacts.delete(saved.artifactId);
    });

    for (const action of ['split', 'pageBreak', 'columnBreak']) {
      await withDoc('blank', async (state) => {
        const target = (await outlineItems(state, 'paragraph'))[0]; await inspectTargets(state, [target.location]);
        await edit(state, [{ op: 'insertText', target: { native: { section: 0, para: 0, offset: 0, length: 0 } }, text: 'ABCDEF' }]);
        await inspectTargets(state, [target.location]);
        await edit(state, [{ op: 'paragraph.structure', action, target: { native: { section: 0, para: 0, offset: 3, length: 0 } }, offset: 3 }]);
      });
    }
    await withDoc('blank', async (state) => {
      let target = (await outlineItems(state, 'paragraph'))[0]; await inspectTargets(state, [target.location]);
      await edit(state, [{ op: 'insertText', target: { native: { section: 0, para: 0, offset: 0, length: 0 } }, text: 'A' }]);
      target = (await outlineItems(state, 'paragraph'))[0]; await inspectTargets(state, [target.location]);
      await edit(state, [{ op: 'appendParagraph', target: target.location, text: 'B' }]);
      const paragraphs = await outlineItems(state, 'paragraph'); await inspectTargets(state, [paragraphs[1].location]);
      await edit(state, [{ op: 'paragraph.structure', action: 'mergePrevious', target: { native: { section: 0, para: 1, offset: 0, length: 0 } } }]);
    });

    await withDoc('briefing', async (state) => {
      const objects = await inspect(state, 'objects');
      const pngImage = objects.images.find((item) => item.name.endsWith('.png'));
      await edit(state, [{ op: 'image.replace', imageName: pngImage.name, bytesBase64: TINY_PNG_BASE64 }]);
    });
    await textScenario('image.insertAfterParagraph', async (state, paragraphs) => { const target = paragraphs[0]; await inspectTargets(state, [target.location]); return { op: 'image.insertAfterParagraph', target: target.location, bytesBase64: TINY_PNG_BASE64, mimeType: 'image/png', altText: '레드팀', caption: '삽입 이미지' }; }, 'blank');
    await withDoc('briefing', async (state) => {
      const cells = await outlineItems(state, 'cell'); const target = cells.find((item) => item.pictureCount === 1);
      await inspectTargets(state, [target.location]); await edit(state, [{ op: 'image.replaceInCell', target: target.location, bytesBase64: TINY_PNG_BASE64, mimeType: 'image/png' }]);
    });
    await withDoc('briefing', async (state) => {
      const cells = await outlineItems(state, 'cell'); const target = cells.find((item) => item.pictureCount === 0);
      assert.ok(target);
      await inspectTargets(state, [target.location]);
      await edit(state, [{ op: 'image.insertInCell', target: target.location, targetParagraphIndex: 0, bytesBase64: TINY_PNG_BASE64, mimeType: 'image/png', altText: '셀 서명' }]);
      const inspected = await inspectTargets(state, [target.location]);
      assert.equal(inspected.targets[0].cell.pictureCount, 1);
    });
    await withDoc('hwpTable', async (state) => {
      const cells = await outlineItems(state, 'cell'); const target = cells.find((item) => item.pictureCount === 0);
      assert.ok(target);
      const before = await inspect(state, 'objects');
      await inspectTargets(state, [target.location]);
      const result = await edit(state, [{ op: 'image.insertInCell', target: target.location, targetParagraphIndex: 0, bytesBase64: TINY_PNG_BASE64, mimeType: 'image/png', altText: 'HWP 셀 서명' }]);
      assert.equal(result.results[0].placementMode, 'cell-anchored-overlay');
      const after = await inspect(state, 'objects');
      assert.equal(after.pictures.length, before.pictures.length + 1);
    }, 'cell-signature.hwp');
    await withDoc('briefing', async (state) => {
      const objects = await inspect(state, 'objects'); const cells = await outlineItems(state, 'cell'); const target = cells.find((item) => item.pictureCount === 0);
      await inspectTargets(state, [target.location]); await edit(state, [{ op: 'image.cloneToCell', target: target.location, sourcePictureId: objects.pictures[0].id, targetParagraphIndex: 0 }]);
    });
    await withDoc('briefing', async (state) => {
      const objects = await inspect(state, 'objects'); const pngImage = objects.images.find((item) => item.name.endsWith('.png'));
      await edit(state, [{ op: 'image.generateAndReplace', imageName: pngImage.name, generator: { width: 64, height: 32, values: [1, 4, 9, 16] } }]);
    });

    const assetSource = await open('briefing', 'asset-source.hwpx');
    const assetTarget = await open('blank', 'asset-target.hwpx');
    try {
      const sourceObjects = await inspect(assetSource, 'objects');
      const sourceImage = sourceObjects.images.find((item) => item.name.endsWith('.png'));
      const targetParagraph = (await outlineItems(assetTarget, 'paragraph'))[0];
      assert.ok(sourceImage?.name);
      await inspectTargets(assetTarget, [targetParagraph.location]);
      const transferred = await edit(assetTarget, [{
        commandId: 'cross-document-asset',
        op: 'image.insertAfterParagraph',
        target: targetParagraph.location,
        assetRef: { documentId: assetSource.documentId, imageName: sourceImage.name },
        altText: '교차 문서 자산',
      }]);
      assert.deepEqual(transferred.resourceTransfers?.map((item) => item.type), ['asset']);
      assert.equal(transferred.resourceTransfers[0].sourceDocumentId, assetSource.documentId);
      assert.equal(transferred.resourceTransfers[0].targetDocumentId, assetTarget.documentId);
      assert.equal(transferred.resourceTransfers[0].imageName, sourceImage.name);
      assert.match(transferred.resourceTransfers[0].sha256, /^[a-f0-9]{64}$/);
    } finally {
      await discard(assetTarget);
      await discard(assetSource);
    }

    const referenceTemplate = await open('blank', 'reference-template.hwpx');
    const referenceFinal = await open('briefing', 'reference-final.hwpx');
    const targetTemplate = await open('blank', 'target-template.hwpx');
    const candidate = await open('blank', 'candidate.hwpx');
    try {
      await expectError('editor_hwpx_review', {
        documentId: candidate.documentId,
        baseRevision: candidate.revision,
        referenceComparison: {
          referenceTemplateDocumentId: referenceTemplate.documentId,
          referenceFinalDocumentId: referenceTemplate.documentId,
          targetTemplateDocumentId: targetTemplate.documentId,
        },
      }, 'reference_comparison_document_invalid');
      const comparison = await call('editor_hwpx_review', {
        documentId: candidate.documentId,
        baseRevision: candidate.revision,
        referenceComparison: {
          referenceTemplateDocumentId: referenceTemplate.documentId,
          referenceFinalDocumentId: referenceFinal.documentId,
          targetTemplateDocumentId: targetTemplate.documentId,
        },
      });
      assert.equal(comparison.ok, false);
      assert.equal(comparison.quality.referenceComparison.ok, false);
      assert.ok(comparison.quality.referenceComparison.failed.length > 0);
      assert.equal(comparison.quality.referenceComparison.metrics.referenceFinal.pageCount, 11);
      assert.equal(comparison.quality.referenceComparison.metrics.candidate.pageCount, 1);
    } finally {
      await discard(candidate);
      await discard(targetTemplate);
      await discard(referenceFinal);
      await discard(referenceTemplate);
    }

    const styleSource = await open('briefing', 'style-source.hwpx');
    const styleTarget = await open('blank', 'style-target.hwpx');
    try {
      const targetParagraph = (await outlineItems(styleTarget, 'paragraph'))[0];
      const sourceParagraph = (await outlineItems(styleSource, 'paragraph')).find((item) => (
        item.textLength > 0 && item.styleFingerprint?.hash !== targetParagraph.styleFingerprint?.hash
      ));
      assert.ok(sourceParagraph, 'styleRef requires a measurably different source paragraph style');
      await inspectTargets(styleSource, [sourceParagraph.location]);
      await inspectTargets(styleTarget, [targetParagraph.location]);
      const transferred = await edit(styleTarget, [{
        commandId: 'cross-document-style',
        op: 'format.apply',
        scope: 'paragraph',
        target: targetParagraph.location,
        styleRef: {
          documentId: styleSource.documentId,
          location: sourceParagraph.location,
          scope: 'paragraph',
        },
      }]);
      assert.deepEqual(transferred.resourceTransfers?.map((item) => item.type), ['style']);
      assert.equal(transferred.resourceTransfers[0].sourceDocumentId, styleSource.documentId);
      assert.equal(transferred.resourceTransfers[0].targetDocumentId, styleTarget.documentId);
      assert.equal(transferred.resourceTransfers[0].scope, 'paragraph');
    } finally {
      await discard(styleTarget);
      await discard(styleSource);
    }

    await withDoc('blank', async (state) => { await edit(state, [{ op: 'setDocumentMetadata', title: 'MCP 전수 검증', author: '레드팀', keywords: 'MCP,HWPX' }]); });
    for (const kind of ['paragraph', 'character']) await withDoc('blank', async (state) => { await edit(state, [{ op: 'defineStyle', name: `MCP-${kind}`, kind, properties: { bold: true, fontSizePt: 12 } }]); });
    for (const orientation of ['portrait', 'landscape']) await withDoc('blank', async (state) => { await edit(state, [{ op: 'setPageSetup', sectionIndex: 0, width: orientation === 'portrait' ? 59528 : 84189, height: orientation === 'portrait' ? 84189 : 59528, orientation, margins: { top: 5669, right: 5669, bottom: 5669, left: 5669 } }]); });
    for (const variant of [
      { type: 'header', applyTo: 'both', align: 'center' },
      { type: 'footer', applyTo: 'odd', align: 'right' },
      { type: 'footer', applyTo: 'even', align: 'left' },
    ]) await withDoc('blank', async (state) => { await edit(state, [{ op: 'setHeaderFooter', target: { sectionIndex: 0 }, text: JSON.stringify(variant), ...variant }]); });
    await withDoc('blank', async (state) => {
      const target = (await outlineItems(state, 'paragraph'))[0]; await inspectTargets(state, [target.location]);
      await edit(state, [{ op: 'insertText', target: { native: { section: 0, para: 0, offset: 0, length: 0 } }, text: '각주 기준' }]);
      await inspectTargets(state, [target.location]); await edit(state, [{ op: 'insertFootnote', target: { native: { section: 0, para: 0, offset: 2, length: 0 } }, text: '검증 각주' }]);
    });

    await withDoc('briefing', async (state) => {
      const objects = await inspect(state, 'objects'); const picture = objects.pictures.find((item) => item.native?.cellPath);
      await edit(state, [{ op: 'object.format', scope: 'image', target: { native: picture.native }, properties: { width: picture.properties.width + 100 } }]);
    });
    await withDoc('hwpShape', async (state) => {
      const objects = await inspect(state, 'objects'); const shape = objects.shapes[0];
      await edit(state, [{ op: 'object.format', scope: 'shape', target: { native: shape.native }, properties: { rotationAngle: 900 } }]);
    }, 'shape.hwp');
    await withDoc('textBox', async (state) => {
      const objects = await inspect(state, 'objects'); assert.equal(objects.textBoxes[0].text, 'RED TEAM TEXT BOX');
      await edit(state, [{ op: 'object.replaceTextBoxText', replacements: [{ find: 'RED TEAM TEXT BOX', replaceWith: '교체된 텍스트박스' }] }]);
      const changed = await inspect(state, 'objects'); assert.equal(changed.textBoxes[0].text, '교체된 텍스트박스');
      await edit(state, [{ op: 'object.deleteTextBoxByText', texts: ['교체된 텍스트박스'] }]);
      const deleted = await inspect(state, 'objects'); assert.equal(deleted.textBoxes.length, 0);
    });

    await withDoc('body', async (state) => {
      const paragraph = (await outlineItems(state, 'paragraph')).find((item) => item.textLength >= 2);
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [{ commandId: 'legacy-alias', op: 'replaceText', target: paragraph.location, text: '거절' }],
      }, 'invalid_tool_arguments');
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [{ commandId: 'missing-inspection', op: 'text.replaceParagraph', location: paragraph.location, text: '거절' }],
      }, 'inspection_required');
      await inspectTargets(state, [paragraph.location]);
      const edited = await edit(state, [{ op: 'text.replaceParagraph', location: paragraph.location, text: '원자성 기준' }]);
      const revision = state.revision;
      const historyBefore = await inspect(state, 'history');
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: revision - 1,
        commands: [{ commandId: 'stale-revision', op: 'text.replaceParagraph', location: paragraph.location, text: '거절' }],
      });
      await inspectTargets(state, [paragraph.location]);
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: revision,
        commands: [
          { commandId: 'duplicate-id', op: 'text.replaceParagraph', location: paragraph.location, text: '첫 명령' },
          { commandId: 'duplicate-id', op: 'text.replaceParagraph', location: paragraph.location, text: '둘째 명령' },
        ],
      }, 'duplicate_command_id');
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: revision,
        commands: [
          { commandId: 'tracked-mixed-1', op: 'text.replaceTracked', target: { native: { section: 0, para: paragraph.location.paragraph.number, offset: 0, length: 1 } }, text: '추적', author: '레드팀' },
          { commandId: 'tracked-mixed-2', op: 'text.replaceParagraph', location: paragraph.location, text: '혼합' },
        ],
      }, 'HWPX_TRACKED_CHANGE_BATCH_UNSUPPORTED');
      const historyAfter = await inspect(state, 'history');
      assert.equal(state.revision, revision);
      assert.equal(historyAfter.entries.length, historyBefore.entries.length);
      assert.equal(edited.revision, revision);
    });
    await withDoc('esg', async (state) => {
      const cells = await outlineItems(state, 'cell');
      const multiParagraph = cells.find((item) => item.paragraphCount > 1 || item.text.includes('\n'));
      assert.ok(multiParagraph);
      await inspectTargets(state, [multiParagraph.location]);
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [{ commandId: 'ambiguous-cell-format', op: 'format.apply', scope: 'paragraph', target: multiParagraph.location, properties: { alignment: 'center' } }],
      }, 'HWPX_CELL_PARAGRAPH_INDEX_REQUIRED');
      await inspectTargets(state, [cells[0].location]);
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [
          { commandId: 'location-changing', op: 'table.insertRows', target: cells[0].location, rowIndex: 1, count: 1, templateRow: 0 },
          { commandId: 'invalid-follow-up', op: 'table.writeCell', location: cells[0].location, text: '혼합 금지' },
        ],
      }, 'HWPX_LOCATION_CHANGING_BATCH_UNSUPPORTED');
    });
    await withDoc('hwpField', async (state) => {
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [{ commandId: 'field-without-inventory', op: 'field.setValues', values: [{ fieldId: 1584999796, value: '거절' }] }],
      }, 'field_inventory_required');
    }, 'field-negative.hwp');
    await withDoc('briefing', async (state) => {
      const paragraph = (await outlineItems(state, 'paragraph')).find((item) => item.textLength > 0);
      await inspectTargets(state, [paragraph.location]);
      const historyBeforeLocalPath = await inspect(state, 'history');
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [{ commandId: 'server-local-path', op: 'image.insertAfterParagraph', target: paragraph.location, filePath: FIXTURES.briefing }],
      });
      const historyAfterLocalPath = await inspect(state, 'history');
      assert.equal(historyAfterLocalPath.entries.length, historyBeforeLocalPath.entries.length);
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        templatePolicy: { protectedLocations: [paragraph.location] },
        commands: [{ commandId: 'protected-region', op: 'text.replaceParagraph', location: paragraph.location, text: '거절' }],
      }, 'template_protected_region');
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [{ commandId: 'object-without-inventory', op: 'object.format', scope: 'image', target: { native: { section: 0, paragraph: 74, control: 0 } }, properties: { width: 1000 } }],
      }, 'object_inventory_required');
      await inspect(state, 'objects');
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [{ commandId: 'missing-textbox', op: 'object.replaceTextBoxText', replacements: [{ find: '존재하지 않는 텍스트박스', replaceWith: '거절' }] }],
      }, 'HWPX_TEXTBOX_NOT_FOUND');
      await inspectTargets(state, [paragraph.location]);
      await expectError('editor_hwpx_edit', {
        documentId: state.documentId,
        baseRevision: state.revision,
        commands: [{ commandId: 'mime-conflict', op: 'image.insertAfterParagraph', target: paragraph.location, bytesBase64: TINY_PNG_BASE64, mimeType: 'image/jpeg' }],
      }, 'HWPX_IMAGE_MIME_MISMATCH');
      await expectError('editor_hwpx_save', {
        documentId: state.documentId,
        baseRevision: state.revision,
        filename: 'review-required.hwpx',
        mode: 'verified',
      }, 'quality_check_required');
    });

    await withDoc('body', async (state) => {
      const paragraph = (await outlineItems(state, 'paragraph')).find((item) => item.textLength > 0);
      await inspectTargets(state, [paragraph.location]);
      await edit(state, [{ op: 'text.replaceParagraph', location: paragraph.location, text: '최종 수명주기 검증' }]);
      const review = await call('editor_hwpx_review', { documentId: state.documentId, baseRevision: state.revision });
      assert.equal(review.ok, true);
      const exported = await call('editor_hwpx_export_pdf', { documentId: state.documentId, baseRevision: state.revision, filename: 'red-team.pdf' });
      artifacts.set(exported.artifactId, exported);
      const pdf = await call('editor_hwpx_artifact_read', { artifactId: exported.artifactId, expectedSha256: exported.sha256 });
      assert.equal(Buffer.from(pdf.bytesBase64, 'base64').subarray(0, 4).toString(), '%PDF');
      const wrongPdfHash = `${exported.sha256[0] === '0' ? '1' : '0'}${exported.sha256.slice(1)}`;
      await expectError('editor_hwpx_artifact_read', { artifactId: exported.artifactId, expectedSha256: wrongPdfHash }, 'artifact_hash_mismatch');
      await expectError('editor_hwpx_artifact_delete', { artifactId: exported.artifactId, expectedSha256: wrongPdfHash }, 'artifact_hash_mismatch');
      await call('editor_hwpx_artifact_delete', { artifactId: exported.artifactId, expectedSha256: exported.sha256 }); artifacts.delete(exported.artifactId);
      const saved = await call('editor_hwpx_save', { documentId: state.documentId, baseRevision: state.revision, filename: 'red-team.hwpx', mode: 'verified' });
      state.closed = true; active.delete(state.documentId); artifacts.set(saved.artifactId, saved);
      const bytes = await call('editor_hwpx_artifact_read', { artifactId: saved.artifactId, expectedSha256: saved.sha256 });
      assert.equal(Buffer.from(bytes.bytesBase64, 'base64').subarray(0, 2).toString(), 'PK');
      await call('editor_hwpx_artifact_delete', { artifactId: saved.artifactId, expectedSha256: saved.sha256 }); artifacts.delete(saved.artifactId);
    });
    await withDoc('blank', async (state) => {
      const checkpoint = await call('editor_hwpx_save', { documentId: state.documentId, baseRevision: state.revision, filename: 'checkpoint.hwpx', mode: 'checkpoint' });
      state.closed = true; active.delete(state.documentId); artifacts.set(checkpoint.artifactId, checkpoint);
      await call('editor_hwpx_artifact_delete', { artifactId: checkpoint.artifactId, expectedSha256: checkpoint.sha256 }); artifacts.delete(checkpoint.artifactId);
    });

    assert.deepEqual([...coveredOps].sort(), [...HWPX_COMMAND_OPS].sort());
    assert.deepEqual([...coveredViews].sort(), [...HWPX_MCP_CONTRACT.inspectViews].sort());
    assert.deepEqual([...coveredTools].sort(), [...HWPX_MCP_CONTRACT.tools].sort());
  } finally {
    for (const state of active.values()) {
      await callRaw('editor_hwpx_discard', { documentId: state.documentId, baseRevision: state.revision }).catch(() => undefined);
    }
    for (const artifact of artifacts.values()) {
      await callRaw('editor_hwpx_artifact_delete', { artifactId: artifact.artifactId, expectedSha256: artifact.sha256 }).catch(() => undefined);
    }
    await close(server);
  }
});
