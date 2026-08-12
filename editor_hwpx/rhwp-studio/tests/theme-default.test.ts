import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath: string): string {
  return readFileSync(path.join(studioRoot, relativePath), 'utf8');
}

test('HWPX editor defaults to light independently of browser color preference', () => {
  const html = source('index.html');
  const initializer = source('public/theme-init.js');
  const settings = source('src/core/user-settings.ts');

  assert.match(html, /name="color-scheme" content="only light"/);
  assert.match(html, /name="theme-color" content="#f5f5f5"/);
  assert.match(initializer, /let mode = 'light';/);
  assert.match(initializer, /catch \{\s*mode = 'light';\s*\}/);
  assert.match(initializer, /storedMode === 'system' && storedVersion < 2 \? 'light' : storedMode/);
  assert.match(settings, /const SETTINGS_VERSION = 2;/);
  assert.match(settings, /theme:\s*\{\s*mode: 'light',\s*\}/);
  assert.match(settings, /\? value : 'light';/);
  assert.match(settings, /storedThemeMode === 'system' && storedVersion < SETTINGS_VERSION/);
});

test('explicit system and dark choices remain available without becoming defaults', () => {
  const html = source('index.html');
  const initializer = source('public/theme-init.js');

  assert.match(html, /data-theme-mode-choice="system"/);
  assert.match(html, /data-theme-mode-choice="light"/);
  assert.match(html, /data-theme-mode-choice="dark"/);
  assert.match(initializer, /mode === 'system' && prefersDark/);
});
