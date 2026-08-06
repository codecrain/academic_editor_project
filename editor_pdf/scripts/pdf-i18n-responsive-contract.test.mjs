import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, app, css, i18n] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/i18n.js', import.meta.url), 'utf8'),
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

test('PDF editor has a complete Korean/English UI and 600px responsive contract', () => {
  assert.match(html, /id="languageSelect"/);
  assert.match(html, /data-i18n="language\.ko"/);
  assert.match(html, /data-i18n="language\.en"/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.object-editor\s*\{[^}]*max-width: calc\(100vw - 52px\)/su);
  assert.match(css, /\.selection-toolbar\s*\{[^}]*max-width: calc\(100% - 16px\)/su);

  const htmlKeys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/gu)].map((match) => match[1]);
  for (const key of new Set(htmlKeys)) {
    assert.match(i18n, new RegExp(`'${escapeRegExp(key)}':`, 'u'), `missing UI translation key: ${key}`);
  }

  const toolOps = [...app.matchAll(/\{ op: '([^']+)', label:/gu)].map((match) => match[1]);
  for (const op of toolOps) {
    assert.match(i18n, new RegExp(`'tool\\.${escapeRegExp(op)}\\.label':`, 'u'), `missing tool label translation: ${op}`);
    assert.match(i18n, new RegExp(`'tool\\.${escapeRegExp(op)}\\.help':`, 'u'), `missing tool help translation: ${op}`);
  }
  assert.match(app, /localizeTool\(tool\)/u);
  assert.match(app, /setLocale\(elements\.languageSelect\.value\)/u);
});
