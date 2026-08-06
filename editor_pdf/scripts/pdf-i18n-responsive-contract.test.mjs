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
  assert.match(html, /id="settingsButton"/);
  assert.match(html, /id="settingsMenu"/);
  assert.match(html, /tlooto-pdf-mark\.svg/u);
  assert.doesNotMatch(html, /Academic PDF|PDFium/u);
  assert.match(html, /data-i18n="language\.ko"/);
  assert.match(html, /data-i18n="language\.en"/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.settings-menu\s*\{/u);
  assert.match(css, /\.object-editor\s*\{[^}]*max-width: calc\(100vw - 52px\)/su);
  assert.match(css, /\.selection-toolbar\s*\{[^}]*max-width: calc\(100% - 16px\)/su);
  assert.match(css, /data-mode="image"\]\[data-image-placement="true"\]/u);
  assert.match(css, /\.hint-action\s*\{/u);
  assert.match(css, /\.edit-hint\s*\{[^}]*bottom: 18px/su);
  assert.match(css, /#editHintText\s*\{[^}]*text-overflow: ellipsis/su);

  const htmlKeys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/gu)].map((match) => match[1]);
  for (const key of new Set(htmlKeys)) {
    assert.match(i18n, new RegExp(`'${escapeRegExp(key)}':`, 'u'), `missing UI translation key: ${key}`);
  }

  const toolOps = [...app.matchAll(/\{ op: '([^']+)', label:/gu)].map((match) => match[1]);
  for (const op of toolOps) {
    assert.match(i18n, new RegExp(`'tool\\.${escapeRegExp(op)}\\.label':`, 'u'), `missing tool label translation: ${op}`);
    assert.match(i18n, new RegExp(`'tool\\.${escapeRegExp(op)}\\.help':`, 'u'), `missing tool help translation: ${op}`);
  }

  for (const category of ['text', 'ocr', 'annotation', 'image', 'object', 'signature', 'page', 'document', 'redaction', 'interactive', 'form', 'security', 'attachment']) {
    assert.match(i18n, new RegExp(`'category\\.${category}':`, 'u'), `missing category translation: ${category}`);
  }

  for (const issueCode of ['page_count_changed', 'independent_reopen_failed', 'save_reopen_failed', 'existing_signature_may_be_invalidated', 'accessibility_missing_title', 'accessibility_missing_language', 'accessibility_untagged', 'accessibility_image_only_pages', 'preflight_unembedded_fonts', 'preflight_active_content']) {
    assert.match(i18n, new RegExp(`'issue\\.${issueCode}':`, 'u'), `missing quality issue translation: ${issueCode}`);
  }

  assert.match(app, /localizedIssueMessage\(issue\)/u);
  assert.match(app, /t\(`category\.\$\{category\}`\)/u);
  assert.match(app, /localizeTool\(tool\)/u);
  assert.match(app, /setLocale\(elements\.languageSelect\.value\)/u);
  for (const key of ['status.objectCopied', 'status.objectPasted', 'error.copyImageUnavailable', 'error.copyObjectUnavailable']) {
    assert.match(i18n, new RegExp(`'${escapeRegExp(key)}':`, 'u'), `missing keyboard interaction translation: ${key}`);
  }
});
