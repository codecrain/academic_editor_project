import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('/pdf UI boots tlooto PDF with advanced editing categories', async () => {
  const [html, source, css] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
  ]);
  for (const expected of [
    'id="pdfViewer"', 'tlooto PDF', 'id="runtimeStatus"', 'id="objectEditorButton"', 'id="settingsButton"', 'id="settingsMenu"',
    '모든 도구', '품질·접근성 검사', '원본과 비교', '페이지 위 편집 도구', '텍스트를 한 번 클릭',
    'assets/tabler/tabler-icons.min.css', 'id="canvasOverlay"', 'id="selectionToolbar"', 'id="commentComposer"', 'id="advancedConfirm"',
    'id="imageChooseButton"',
    'data-edit-mode="comment"', 'data-edit-mode="redaction"',
    'id="fontFamily"', 'id="advancedTool"', 'id="savePdfButton"',
  ]) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(source, /import EmbedPDF from '\.\/vendor\/embedpdf\/embedpdf\.js'/);
  assert.match(source, /worker: true/);
  assert.match(source, /new URL\('\.\/vendor\/embedpdf\/pdfium\.wasm', import\.meta\.url\)\.href/);
  assert.match(source, /wasmUrl: pdfiumWasmUrl/);
  assert.match(source, /fonts: \{ ui: null, signature: null \}/);
  assert.match(source, /fontFallback: null/);
  assert.match(source, /stamp: \{ manifests: \[\] \}/);
  assert.match(source, /annotations:/);
  assert.match(source, /id: 'tlooto-pdf-host-ui'/);
  assert.match(source, /toolbars: \{\}/);
  assert.match(source, /pan: \{ defaultMode: 'never' \}/);
  assert.match(css, /data-mode="comment"\] \.object-hitbox/);
  assert.match(source, /className = 'comment-marker'/);
  assert.match(css, /\.comment-marker/);
  assert.match(source, /enforceDocumentPermissions: true/);
  assert.match(source, /window\.academicPdfEditor/);
  assert.match(source, /text\.replaceObject/);
  assert.match(source, /beginInlineTextEdit/);
  assert.match(source, /sampleObjectBackground/);
  assert.match(source, /inline-edit-shell/);
  assert.match(source, /inline-edit-actions/);
  assert.match(source, /setSelectionRange/);
  assert.match(source, /wrapTextForWidth/);
  assert.match(source, /stageTextPreview/);
  assert.match(source, /syncViewer: false/);
  assert.match(source, /saveEditedPdf/);
  assert.match(source, /flushInlineTextEdit/);
  assert.match(source, /enqueueDocumentOperation/);
  assert.match(source, /state\.inlineFinalize/);
  assert.doesNotMatch(source, /editor\.select\(\)/);
  assert.match(source, /activateEditMode\('text'\)/);
  assert.match(source, /queueMicrotask/);
  assert.match(source, /objectScreenRect/);
  assert.match(source, /pagePointAtClient/);
  assert.match(source, /saveDirectComment/);
  assert.match(source, /handleRedactionPointerDown/);
  assert.match(source, /clearSelection/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /beginImageDrag/);
  assert.match(source, /autoScrollDuringDrag/);
  assert.match(source, /viewerScroller/);
  assert.match(source, /modeActivation/);
  assert.match(source, /cancelDirectInteraction/);
  assert.match(source, /copySelectedObject/);
  assert.match(source, /pasteCopiedObject/);
  assert.match(source, /nudgeSelectedImage/);
  assert.match(source, /event\.key === 'Delete' \|\| event\.key === 'Backspace'/);
  assert.match(source, /event\.key\.toLowerCase\(\) === 's'/);
  assert.match(source, /image\.replaceObject/);
  assert.match(source, /image\.add/);
  assert.match(source, /placePendingImage/);
  assert.match(source, /#document-content img, #document-content canvas/);
  assert.match(source, /redaction\.apply/);
  assert.match(source, /showAdvancedConfirmation/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /ocr\.recognize/);
  assert.match(source, /watermark\.add/);
  assert.match(source, /bates\.add/);
  assert.match(source, /form\.addTextField/);
  assert.match(source, /document\.sanitize/);
  assert.match(source, /documents\/save-buffer/);
  assert.match(source, /baselineData/);
  assert.match(source, /baselineSource/);
  assert.match(source, /quality\/render-compare/);
  assert.match(source, /report\.pageSelect/);
  assert.match(source, /pages: \[page\]/);
  assert.doesNotMatch(source, /pages: \[1\]/);
  assert.match(source, /quality\/check/);
  assert.doesNotMatch(source, /https?:\/\//);
});
