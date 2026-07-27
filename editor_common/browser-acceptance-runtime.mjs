import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function playwrightCandidates() {
  const explicitRoot = String(process.env.EDITOR_BROWSER_NODE_MODULES || '').trim();
  const candidates = ['playwright'];
  if (explicitRoot) {
    candidates.push(pathToFileURL(path.join(explicitRoot, 'playwright', 'index.mjs')).href);
  }
  candidates.push(pathToFileURL(path.join(
    os.homedir(),
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'node',
    'node_modules',
    'playwright',
    'index.mjs',
  )).href);
  return candidates;
}

export async function loadBrowserAutomation() {
  const failures = [];
  for (const candidate of playwrightCandidates()) {
    if (candidate.startsWith('file:') && !existsSync(new URL(candidate))) continue;
    try {
      return await import(candidate);
    } catch (error) {
      failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    'Playwright is required for browser acceptance. Install it locally or set '
      + `EDITOR_BROWSER_NODE_MODULES. Attempts: ${failures.join(' | ')}`,
  );
}
