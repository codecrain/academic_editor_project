import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

test('본문의 일반 p 입력은 비활성 개체 속성 단축키에 가로막히지 않는다', () => {
  const keyboard = readFileSync(join(rootDir, 'src/engine/input-handler-keyboard.ts'), 'utf8');
  const start = keyboard.lastIndexOf("default: {");
  const end = keyboard.indexOf('\nexport function handleCtrlKey', start);
  const defaultCase = keyboard.slice(start, end);

  assert.match(defaultCase, /cmdId && this\.dispatcher\.isEnabled\?\.\(cmdId\)/);
  assert.doesNotMatch(defaultCase, /if \(cmdId\) \{\s*e\.preventDefault\(\)/);
});
