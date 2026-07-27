#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { loadBrowserAutomation } from '../../../editor_common/browser-acceptance-runtime.mjs';
import { extractRhwpText } from '../../scripts/hwpx-api-utils.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const inputPath = path.resolve(
  process.env.HWPX_ACCEPTANCE_INPUT
    || path.join(repoRoot, '.qa', 'task8-pdf-smoke', 'input.hwpx'),
);
const evidenceRoot = path.resolve(
  process.env.HWPX_ACCEPTANCE_EVIDENCE
    || path.join(repoRoot, '.qa', 'browser-acceptance'),
);
const chromePath = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const studioUrl = process.env.VITE_URL || 'http://academic-editor.test:11006/hwpx/';
const marker = process.env.HWPX_ACCEPTANCE_MARKER
  || '공공기관 HWPX 실제 브라우저 저장 검수 2026-07-27';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const consoleErrors = [];
let browser;

try {
  await mkdir(evidenceRoot, { recursive: true });
  const runRoot = await mkdtemp(path.join(evidenceRoot, 'run-'));
  const { chromium } = await loadBrowserAutomation();
  browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--host-resolver-rules=MAP academic-editor.test 127.0.0.1',
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(studioUrl, { waitUntil: 'networkidle0', timeout: 30_000 });
  const input = page.locator('#file-input');
  assert.equal(await input.count(), 1, 'Studio must expose one file input');
  await input.setInputFiles(inputPath);
  await page.waitForSelector('#scroll-container canvas', { timeout: 30_000 });

  const firstCanvas = page.locator('#scroll-container canvas').first();
  const canvasBox = await firstCanvas.boundingBox();
  assert.ok(canvasBox && canvasBox.width > 0 && canvasBox.height > 0, 'Studio canvas must be non-empty');
  await page.mouse.click(canvasBox.x + 120, canvasBox.y + 120);
  await page.keyboard.type(marker);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const browserResult = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('#scroll-container canvas')];
    return {
      canvasCount: canvases.length,
      canvasSizes: canvases.map((canvas) => ({ width: canvas.width, height: canvas.height })),
      secureContext: window.isSecureContext,
      savePickerAvailable: typeof window.showSaveFilePicker === 'function',
    };
  });
  assert.equal(browserResult.secureContext, false);
  assert.equal(browserResult.savePickerAvailable, false);
  assert.ok(browserResult.canvasCount >= 1);
  assert.ok(browserResult.canvasSizes.every(({ width, height }) => width > 0 && height > 0));

  const client = await context.newCDPSession(page);
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: runRoot });
  await page.keyboard.down('Control');
  await page.keyboard.press('s');
  await page.keyboard.up('Control');

  let downloadedPath = '';
  const downloadDeadline = Date.now() + 30_000;
  while (Date.now() < downloadDeadline) {
    const names = await readdir(runRoot);
    const complete = names.find((name) => name.toLowerCase().endsWith('.hwpx'));
    if (complete && !names.some((name) => name.endsWith('.crdownload'))) {
      downloadedPath = path.join(runRoot, complete);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(downloadedPath, 'Studio save must produce one completed HWPX download');

  const outputBytes = await readFile(downloadedPath);
  assert.deepEqual([...outputBytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const extracted = await extractRhwpText(outputBytes);
  assert.match(extracted.text, new RegExp(marker));

  await input.setInputFiles(downloadedPath);
  await page.waitForSelector('#scroll-container canvas', { timeout: 30_000 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const reopened = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('#scroll-container canvas')];
    return {
      canvasCount: canvases.length,
      canvasSizes: canvases.map((canvas) => ({ width: canvas.width, height: canvas.height })),
      status: document.querySelector('#status-bar')?.textContent || '',
    };
  });
  assert.ok(reopened.canvasCount >= 1);
  assert.ok(reopened.canvasSizes.every(({ width, height }) => width > 0 && height > 0));
  assert.match(reopened.status, /HWPX/);
  assert.deepEqual(consoleErrors, []);

  const screenshotPath = path.join(runRoot, 'browser-edited-reopened.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    studioUrl,
    inputPath,
    outputPath: downloadedPath,
    screenshotPath,
    sha256: sha256(outputBytes),
    byteLength: outputBytes.length,
    canvasCount: reopened.canvasCount,
    extractedParagraphCount: extracted.paragraphCount,
    markerRecovered: true,
    browserReopened: true,
    consoleErrors,
  })}\n`);
} finally {
  await browser?.close();
}
