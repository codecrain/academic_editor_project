import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { DOCX_COMMAND_OPS } from '../editor_docx/scripts/docx-command-catalog.mjs';
import { HWPX_COMMAND_OPS } from '../editor_hwpx/scripts/hwpx-command-catalog.mjs';
import { PDF_COMMAND_OPS } from '../editor_pdf/scripts/pdf-command-catalog.mjs';
import { DOCX_MCP_TOOLS, HWPX_MCP_TOOLS, PDF_MCP_TOOLS } from './editor-mcp.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const canonicalPaths = [
  'README.md',
  'API.md',
  'docs/DOCUMENTATION_INDEX.md',
  'docs/HWPX_EDITOR.md',
  'docs/HWPX_MCP_API.md',
  'docs/PDF_EDITOR.md',
  'docs/PDF_MCP_API.md',
  'evaluation/hwpx-agent-final-20-v1/README.md',
  'evaluation/hwpx-agent-final-20-v1/METHODOLOGY.md',
];
const canonical = new Map(canonicalPaths.map((relativePath) => [
  relativePath,
  readFileSync(path.join(repoRoot, relativePath), 'utf8'),
]));

function textBlockAfter(source, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\n\\s*\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``));
  assert.ok(match, `missing text block after: ${heading}`);
  return match[1].trim().split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function markdownToolListAfter(source, heading) {
  const start = source.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const following = source.slice(start + heading.length);
  const boundary = following.search(/\n(?:HWPX MCP tools:|## )/);
  const section = boundary < 0 ? following : following.slice(0, boundary);
  return [...section.matchAll(/^\s*-\s+`([^`]+)`/gm)].map((match) => match[1]);
}

test('canonical documentation has no superseded editor claims', () => {
  const combined = [...canonical.entries()]
    .map(([relativePath, source]) => `\n# ${relativePath}\n${source}`)
    .join('\n');
  for (const stale of [
    /gpt-5\.4-nano/i,
    /OpenAI Responses API/i,
    /editor-public-sector-v2/i,
    /\b27 (?:available|HWPX)/i,
    /five unavailable/i,
    /readiness=unavailable/i,
    /121 tests/i,
  ]) {
    assert.doesNotMatch(combined, stale);
  }
  assert.match(canonical.get('README.md'), /DOCX, HWPX, and PDF are separate editor engines/);
  for (const enginePath of ['editor_docx/', 'editor_hwpx/', 'editor_pdf/']) {
    assert.ok(canonical.get('README.md').includes('`' + enginePath + '`'));
  }
  assert.match(
    canonical.get('docs/HWPX_EDITOR.md'),
    new RegExp(`${HWPX_COMMAND_OPS.length} canonical commands.*readiness=available`, 's'),
  );
});

test('documented command lists match executable catalogs exactly', () => {
  const documentedDocx = textBlockAfter(
    canonical.get('API.md'),
    'DOCX supported shared and package commands:',
  );
  assert.deepEqual(documentedDocx, DOCX_COMMAND_OPS);

  const hwpxEditor = canonical.get('docs/HWPX_EDITOR.md');
  for (const operation of HWPX_COMMAND_OPS) {
    assert.match(hwpxEditor, new RegExp(`^${operation.replaceAll('.', '\\.')}\\r?$`, 'm'));
  }
  assert.deepEqual(textBlockAfter(hwpxEditor, 'exception.'), HWPX_COMMAND_OPS);
  assert.equal(DOCX_COMMAND_OPS.length, 31);
  assert.deepEqual(
    textBlockAfter(canonical.get('docs/PDF_EDITOR.md'), '## Supported commands'),
    PDF_COMMAND_OPS,
  );
  assert.equal(PDF_COMMAND_OPS.length, 46);
  assert.match(canonical.get('API.md'), /31 DOCX commands, 42 HWPX commands, and 46 PDF commands/);
  assert.match(canonical.get('docs/DOCUMENTATION_INDEX.md'), /17 DOCX, 9 HWPX, 16 PDF, and 7 Image Studio/);
});

test('documented MCP tool lists match executable HWPX and PDF tools', () => {
  assert.deepEqual(
    markdownToolListAfter(canonical.get('API.md'), 'DOCX MCP tools:'),
    DOCX_MCP_TOOLS.map((tool) => tool.name),
  );
  assert.match(canonical.get('API.md'), /DOCX additionally supports\s+`references`/);
  assert.match(canonical.get('API.md'), /Only `editor_docx_render_pages` and `editor_docx_export_pdf` return an\s+authoritative renderer page count/);
  const documented = textBlockAfter(canonical.get('docs/HWPX_MCP_API.md'), '## Tools');
  assert.deepEqual(documented, HWPX_MCP_TOOLS.map((tool) => tool.name));
  assert.equal(HWPX_MCP_TOOLS.length, 9);
  assert.equal(DOCX_MCP_TOOLS.length, 17);
  assert.deepEqual(
    textBlockAfter(canonical.get('docs/PDF_MCP_API.md'), '## Tools'),
    PDF_MCP_TOOLS.map((tool) => tool.name),
  );
  assert.equal(PDF_MCP_TOOLS.length, 16);
  assert.match(canonical.get('docs/HWPX_MCP_API.md'), /"baseRevision": 1/);
});

test('canonical local Markdown links resolve', () => {
  for (const [relativePath, source] of canonical.entries()) {
    const sourceDirectory = path.dirname(path.join(repoRoot, relativePath));
    for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].trim();
      if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue;
      const withoutFragment = decodeURIComponent(target.split('#')[0]);
      assert.equal(
        existsSync(path.resolve(sourceDirectory, withoutFragment)),
        true,
        `${relativePath} has a missing local link: ${target}`,
      );
    }
  }
});
