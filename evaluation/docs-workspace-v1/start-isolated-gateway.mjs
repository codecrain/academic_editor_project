import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const runtimeRoot = path.resolve(process.env.DOCS_QA_RUNTIME_ROOT || path.join(repoRoot, '.build', 'docsqa-runtime'));
const gatewayScript = path.join(repoRoot, 'editor_server', 'editor-gateway.mjs');
const stdout = openSync(path.join(runtimeRoot, 'gateway.stdout.log'), 'a');
const stderr = openSync(path.join(runtimeRoot, 'gateway.stderr.log'), 'a');

const child = spawn(process.execPath, [gatewayScript], {
  cwd: repoRoot,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', stdout, stderr],
  env: process.env,
});
child.unref();
process.stdout.write(`${child.pid}\n`);
