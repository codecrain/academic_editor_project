import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DOCX_COMMAND_CATALOG,
  DOCX_COMMAND_OPS,
  getDocxCommandCatalog,
  resolveDocxCommand,
  validateDocxCommands,
} from './docx-command-catalog.mjs';
import { DocxApiSession, createDocxBytes } from './docx-api-utils.mjs';
import { EDITOR_MCP_TOOLS } from './editor-mcp.mjs';

const EXECUTABLE_OPS = new Set([
  'table.writeCell',
  'text.replaceParagraph',
  'text.replace',
  'text.insert',
  'text.delete',
  'paragraph.append',
  'paragraph.applyNamedStyle',
  'style.setRunStyle',
  'style.setParagraphStyle',
  'table.create',
  'table.insertCaption',
  'style.applyText',
  'paragraph.applyStyle',
  'table.applyCellStyle',
  'layout.fitText',
  'defineStyle',
  'setPageSetup',
  'setHeaderFooter',
  'setDocumentMetadata',
  'insertFootnote',
  'image.replace',
  'image.generateAndReplace',
]);

test('DOCX command catalog is the complete unique public contract', () => {
  assert.equal(DOCX_COMMAND_CATALOG.length, 27);
  assert.equal(new Set(DOCX_COMMAND_OPS).size, DOCX_COMMAND_OPS.length);
  assert.deepEqual(getDocxCommandCatalog().commands, DOCX_COMMAND_CATALOG);

  for (const entry of DOCX_COMMAND_CATALOG) {
    assert.equal(resolveDocxCommand(entry.op), entry);
    assert.doesNotThrow(() => validateDocxCommands([entry.example]), entry.op);
    for (const alias of entry.aliases) {
      assert.equal(resolveDocxCommand(alias), entry, `${alias} did not resolve to ${entry.op}`);
    }
  }
});

test('every catalog command and alias normalizes through the production DOCX session', () => {
  const session = new DocxApiSession(createDocxBytes({
    paragraphs: ['Template paragraph', 'Target paragraph'],
    tables: [{ rows: [['A', 'B']] }],
    includeImage: true,
  }));

  for (const entry of DOCX_COMMAND_CATALOG) {
    for (const name of [entry.op, ...entry.aliases]) {
      const normalized = session.normalizeCommand({ ...entry.example, op: name });
      assert.ok(normalized.length > 0, `${name} normalized to no operations`);
      for (const operation of normalized) {
        assert.ok(EXECUTABLE_OPS.has(operation.op), `${name} normalized to unsupported ${operation.op}`);
      }
    }
  }
});

test('MCP exposes catalog discovery and derives apply op names from the same catalog', () => {
  const names = EDITOR_MCP_TOOLS.map((tool) => tool.name);
  assert.ok(names.includes('editor_docx_command_catalog'));
  assert.ok(names.indexOf('editor_docx_command_catalog') < names.indexOf('editor_docx_apply'));

  const apply = EDITOR_MCP_TOOLS.find((tool) => tool.name === 'editor_docx_apply');
  assert.deepEqual(apply.inputSchema.properties.commands.items.properties.op.enum, DOCX_COMMAND_OPS);
});

test('catalog validation rejects unknown and incomplete commands before mutation', () => {
  assert.throws(() => validateDocxCommands([{ op: 'not.real' }]), /Unsupported DOCX command/);
  assert.throws(() => validateDocxCommands([{ op: 'text.replaceParagraph', text: 'x' }]), /location/);
  assert.throws(() => validateDocxCommands([{
    op: 'table.applyCellStyle',
    target: { tableId: 'tbl_0', cell: { number: 0 } },
  }]), /at least one of/);
  assert.throws(() => validateDocxCommands([{ op: 'table.applyCellStyle', target: {}, cellStyle: { fill: '#FFFFFF' } }]), /target/);
  assert.throws(() => validateDocxCommands([{ op: 'setHeaderFooter' }]), /at least one of/);
});

test('catalog validation rejects semantically empty collections, invalid dimensions, and unstable targets', () => {
  assert.throws(() => validateDocxCommands([{ op: 'table.writeCells', cells: [] }]), /nonempty cells array|missing required/);
  assert.throws(() => validateDocxCommands([{
    op: 'table.writeCells',
    tableId: 'tbl_0',
    cells: [{ cell: { number: 0 } }],
  }]), /text string/);
  assert.throws(() => validateDocxCommands([{ op: 'table.create', rows: 0, cols: 2 }]), /positive integers/);
  assert.throws(() => validateDocxCommands([{ op: 'table.create', rows: 1.5, cols: 2 }]), /positive integers/);
  assert.throws(() => validateDocxCommands([{
    op: 'list.writeBullets',
    location: { paragraph: { number: 0 } },
    items: [],
  }]), /nonempty array|missing required/);
  assert.throws(() => validateDocxCommands([{
    op: 'list.applyNumbering',
    location: { paragraph: { number: 0 } },
    items: ['valid', '  '],
  }]), /nonempty strings/);
  assert.throws(() => validateDocxCommands([{
    op: 'style.applyText',
    target: { paragraph: { number: 1 } },
    styleSource: {},
  }]), /styleSource/);
  assert.throws(() => validateDocxCommands([{
    op: 'setRunStyle',
    target: { nodeId: 'p_1' },
    style: {},
  }]), /style/);
  assert.throws(() => validateDocxCommands([{
    op: 'defineStyle',
    style: {},
  }]), /style|styleId/);
});

test('catalog validation distinguishes intentional clearing from semantically empty control input', () => {
  assert.doesNotThrow(() => validateDocxCommands([{
    op: 'text.replaceParagraph',
    location: { paragraph: { number: 1 } },
    text: '',
  }]));
  assert.doesNotThrow(() => validateDocxCommands([{
    op: 'table.writeCell',
    location: { tableId: 'tbl_0', cell: { number: 0 } },
    text: '',
  }]));
  assert.doesNotThrow(() => validateDocxCommands([{
    op: 'table.writeCells',
    tableId: 'tbl_0',
    cells: [{ cell: { number: 0 }, text: '' }],
  }]));
  assert.doesNotThrow(() => validateDocxCommands([{ op: 'setDocumentMetadata', title: '' }]));
  assert.doesNotThrow(() => validateDocxCommands([{ op: 'setHeaderFooter', header: '', footer: '' }]));
  assert.throws(() => validateDocxCommands([{
    op: 'insertText',
    target: { nodeId: 'p_1' },
    text: '',
  }]), /text/);
});
