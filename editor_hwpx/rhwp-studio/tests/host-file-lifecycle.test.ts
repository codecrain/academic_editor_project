import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HOST_CONTROLLED_FILE_COMMANDS,
  isEmbeddedWindow,
  isHostControlledFileCommand,
} from '../src/command/host-file-lifecycle.ts';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const menuBarCss = readFileSync(new URL('../src/styles/menu-bar.css', import.meta.url), 'utf8');

test('embedded Studio owns no local file lifecycle commands', () => {
  for (const commandId of [
    'file:new-doc',
    'file:open',
    'file:open-recent',
    'file:clear-recent',
    'file:save',
    'file:save-as-hwp',
    'file:save-as-hwpx',
  ]) {
    assert.equal(isHostControlledFileCommand(commandId), true, commandId);
    assert.equal(HOST_CONTROLLED_FILE_COMMANDS.has(commandId), true, commandId);
  }
  assert.equal(isHostControlledFileCommand('file:save-as'), false);
});

test('host lifecycle policy is based on iframe ownership, not URL guessing', () => {
  const topLevelWindow = {} as { parent: unknown };
  topLevelWindow.parent = topLevelWindow;
  assert.equal(isEmbeddedWindow(topLevelWindow), false);
  assert.equal(isEmbeddedWindow({ parent: topLevelWindow }), true);
});

test('host-owned file menu entries are hidden only in embedded mode', () => {
  for (const commandId of ['file:new-doc', 'file:open', 'file:save', 'file:save-as-hwp', 'file:save-as-hwpx']) {
    const entry = new RegExp(`data-cmd="${commandId}"[^>]*data-host-file-lifecycle`);
    assert.match(indexHtml, entry, commandId);
  }
  assert.match(indexHtml, /data-recent[^>]*data-host-file-lifecycle/);
  assert.match(menuBarCss, /html\[data-host-controlled-file-lifecycle="true"\][\s\S]*data-host-file-lifecycle/);
});
