import { spawnSync } from 'node:child_process';

const configured = String(process.env.EDITOR_UNO_TEST_PYTHON || '').trim();
const candidates = configured
  ? [[configured, []]]
  : process.platform === 'win32'
    ? [['python', []], ['py', ['-3']]]
    : [['/opt/collaboraoffice/program/python', []], ['python3', []], ['python', []]];

let selected = null;
for (const [command, prefixArgs] of candidates) {
  const probe = spawnSync(command, [...prefixArgs, '--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (!probe.error && probe.status === 0) {
    selected = [command, prefixArgs];
    break;
  }
}

if (!selected) {
  console.error('[editor] no Python runtime is available for the UNO renderer tests.');
  process.exit(1);
}

const [command, prefixArgs] = selected;
const result = spawnSync(command, [
  ...prefixArgs,
  '-B',
  '-m',
  'unittest',
  'editor_docx.scripts.test_render_docx_uno',
  '-v',
], {
  cwd: process.cwd(),
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(`[editor] failed to run UNO renderer tests: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
