import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve('editor_hwpx/scripts/hancom/Invoke-HwpxAcceptance.ps1');
const fixturePath = path.resolve('evaluation/hwpx-agent-final-20-v1/attachments/source/blank-generation-template.hwpx');

async function hwpPids() {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-Command',
    "(Get-Process -Name Hwp -ErrorAction SilentlyContinue | Sort-Object Id | ForEach-Object Id) -join ','",
  ], { windowsHide: true });
  return stdout.trim();
}

test('Hancom harness dry-run records evidence without starting or stopping Hwp processes', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'hancom-hwpx-acceptance-'));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const evidencePath = path.join(tempRoot, 'evidence.json');
  const before = await hwpPids();

  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-InputPath', fixturePath,
    '-ResavedPath', path.join(tempRoot, 'resaved.hwpx'),
    '-PdfPath', path.join(tempRoot, 'rendered.pdf'),
    '-EvidencePath', evidencePath,
    '-SkipPdf',
    '-DryRun',
  ], { windowsHide: true });

  const result = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.equal(result.status, 'dry-run');
  assert.equal(result.mode, 'open-resave');
  assert.equal(result.opened, false);
  assert.equal(result.resaved, false);
  assert.equal(result.pdfExported, false);
  assert.equal(result.paginationStable, false);
  assert.deepEqual(result.pageImages, []);
  assert.deepEqual(result.ownedPids, []);
  assert.equal(await hwpPids(), before);
});

test('Hancom harness source never uses a broad all-Hwp process stop', async () => {
  const source = await readFile(path.resolve('editor_hwpx/scripts/hancom/HwpxAcceptance.psm1'), 'utf8');
  assert.match(source, /ownedPids|OwnedHwp/);
  assert.doesNotMatch(source, /Get-Process\s+-Name\s+['"]?Hwp['"]?[\s\S]{0,200}Stop-Process/iu);
});
