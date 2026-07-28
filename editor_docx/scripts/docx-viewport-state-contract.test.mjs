import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const wopiSource = await readFile(
  new URL('../browser/src/map/handler/Map.WOPI.js', import.meta.url),
  'utf8',
);

test('DOCX postMessage contract exposes bounded viewport capture and restore', () => {
  assert.match(wopiSource, /MessageId === 'Get_Document_UI_State'/);
  assert.match(wopiSource, /MessageId === 'Restore_Document_UI_State'/);
  assert.match(wopiSource, /Viewport: viewedRectangle \? \{/);
  assert.match(wopiSource, /Unit: 'twip'/);
  assert.match(wopiSource, /nextLayout\.scrollTo\(scrollX, scrollY\)/);
  assert.match(wopiSource, /msgId: 'Restore_Document_UI_State_Resp'/);
});

test('viewport restore validates requested coordinates and waits for layout settling', () => {
  assert.match(wopiSource, /Number\.isFinite\(viewportX\)/);
  assert.match(wopiSource, /Number\.isFinite\(viewportY\)/);
  assert.match(wopiSource, /requestedPage <= pageRectangles\.length/);
  assert.match(
    wopiSource,
    /window\.requestAnimationFrame\(function\(\) \{\s*window\.requestAnimationFrame\(finish\);/,
  );
});
