import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function listModules(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.build') continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listModules(target));
    } else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) {
      files.push(target);
    }
  }
  return files;
}

function moduleSpecifiers(source) {
  return [...source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
}

test('format engines never import the opposite format engine', async () => {
  for (const [root, forbidden] of [
    [path.resolve('editor_docx'), 'editor_hwpx'],
    [path.resolve('editor_hwpx'), 'editor_docx'],
  ]) {
    for (const file of await listModules(root)) {
      const imports = moduleSpecifiers(await readFile(file, 'utf8'));
      assert.equal(
        imports.some((specifier) => specifier.includes(forbidden)),
        false,
        `${path.relative(process.cwd(), file)} must not import ${forbidden}`,
      );
    }
  }
});

test('shared server reaches format engines only through format adapters', async () => {
  const serverRoot = path.resolve('editor_server');
  for (const file of await listModules(serverRoot)) {
    if (file.includes(`${path.sep}format-adapters${path.sep}`)) continue;
    const imports = moduleSpecifiers(await readFile(file, 'utf8'));
    assert.equal(
      imports.some((specifier) => /editor_(?:docx|hwpx)/.test(specifier)),
      false,
      `${path.relative(process.cwd(), file)} must depend on a format adapter`,
    );
  }
});
