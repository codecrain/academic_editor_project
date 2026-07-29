import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('/pdf UI boots the pinned PDFium editor with advanced editing categories', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  ]);
  for (const expected of [
    'id="pdfViewer"', 'Academic PDF', 'PDFium', 'id="runtimeStatus"', 'id="objectEditorButton"',
    '모든 도구', '품질·접근성 검사', '원본과 비교', '페이지 위 편집 도구', '텍스트를 한 번 클릭',
    'assets/tabler/tabler-icons.min.css', 'id="canvasOverlay"', 'id="selectionToolbar"',
    'id="fontFamily"', 'id="advancedTool"', 'id="savePdfButton"',
  ]) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(source, /import EmbedPDF from '\.\/vendor\/embedpdf\/embedpdf\.js'/);
  assert.match(source, /worker: true/);
  assert.match(source, /annotations:/);
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
  assert.doesNotMatch(source, /editor\.select\(\)/);
  assert.match(source, /activateEditMode\('text'\)/);
  assert.match(source, /queueMicrotask/);
  assert.match(source, /objectScreenRect/);
  assert.match(source, /beginImageDrag/);
  assert.match(source, /image\.replaceObject/);
  assert.match(source, /redaction\.apply/);
  assert.match(source, /ocr\.recognize/);
  assert.match(source, /watermark\.add/);
  assert.match(source, /bates\.add/);
  assert.match(source, /form\.addTextField/);
  assert.match(source, /document\.sanitize/);
  assert.match(source, /documents\/save-buffer/);
  assert.match(source, /quality\/render-compare/);
  assert.match(source, /quality\/check/);
  assert.doesNotMatch(source, /https?:\/\//);
});
