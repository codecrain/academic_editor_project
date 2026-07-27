#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

import { loadBrowserAutomation } from '../../editor_common/browser-acceptance-runtime.mjs';
import { DocxApiSession } from '../scripts/docx-api-utils.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const editorUrl = process.env.DOCX_ACCEPTANCE_URL || 'http://127.0.0.1:11007/docx/';
const chromePath = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const evidenceRoot = path.resolve(
  process.env.DOCX_ACCEPTANCE_EVIDENCE
    || path.join(repoRoot, '.qa', 'browser-acceptance'),
);
const marker = process.env.DOCX_ACCEPTANCE_MARKER
  || `[DOCX-BROWSER-QA-${Date.now()}]`;

const editorOrigin = new URL(editorUrl).origin;
const contentsUrl = new URL(
  '/docx/wopi/files/docx-home/contents?access_token=local-docx-token',
  editorOrigin,
);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForEditor(page) {
  await page.waitForSelector('iframe[title="DOCX editor"]', { timeout: 30_000 });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const editorFrame = page.frames().find((frame) =>
      frame !== page.mainFrame()
      && !frame.url().includes('/welcome/welcome.html')
      && frame.url().includes('/browser/'));
    if (editorFrame) {
      const save = await editorFrame.$('button[aria-label="Save"]');
      if (save) return editorFrame;
    }
    await sleep(100);
  }
  throw new Error('Collabora editor frame did not become editable');
}

async function closeWelcome(page) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const welcomeFrames = page.frames().filter((frame) => frame.url().includes('/welcome/welcome.html'));
    for (const welcomeFrame of welcomeFrames.toReversed()) {
      const close = welcomeFrame.locator('#welcome-close');
      if (await close.count()) {
        await close.dispatchEvent('click');
        return true;
      }
    }
    await sleep(100);
  }
  return false;
}

async function readSavedArtifact() {
  const response = await fetch(contentsUrl);
  assert.equal(response.status, 200, 'WOPI contents read must succeed');
  const bytes = Buffer.from(await response.arrayBuffer());
  const document = new DocxApiSession(bytes).readJson();
  return { bytes, document };
}

const consoleErrors = [];
const pageErrors = [];
const failedResponses = [];
let browser;

try {
  await mkdir(evidenceRoot, { recursive: true });
  const runRoot = await mkdtemp(path.join(evidenceRoot, 'docx-run-'));
  const { chromium } = await loadBrowserAutomation();
  browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ text: message.text(), location: message.location() });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const editorFrame = await waitForEditor(page);
  await closeWelcome(page);

  await page.mouse.click(300, 253);
  await page.keyboard.press('End');
  await page.keyboard.type(` ${marker}`, { delay: 10 });
  await sleep(500);
  await editorFrame.click('button[aria-label="Save"]');

  let savedArtifact;
  const saveDeadline = Date.now() + 30_000;
  while (Date.now() < saveDeadline) {
    savedArtifact = await readSavedArtifact();
    if (savedArtifact.document.blocks.some((block) => block.text.includes(marker))) break;
    await sleep(200);
  }
  assert.ok(
    savedArtifact?.document.blocks.some((block) => block.text.includes(marker)),
    'Saved DOCX must contain the browser edit marker',
  );

  const reopenedPage = await context.newPage();
  reopenedPage.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ text: message.text(), location: message.location() });
    }
  });
  reopenedPage.on('pageerror', (error) => pageErrors.push(error.message));
  reopenedPage.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });
  await reopenedPage.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForEditor(reopenedPage);
  await closeWelcome(reopenedPage);
  const screenshotPath = path.join(runRoot, 'docx-edited-reopened.png');
  await reopenedPage.screenshot({ path: screenshotPath });

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedResponses, []);
  assert.deepEqual(consoleErrors, []);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    editorUrl,
    contentsUrl: contentsUrl.toString(),
    screenshotPath,
    sha256: sha256(savedArtifact.bytes),
    byteLength: savedArtifact.bytes.length,
    paragraphCount: savedArtifact.document.blocks.length,
    markerRecovered: true,
    browserReopened: true,
    consoleErrors,
    pageErrors,
    failedResponses,
  })}\n`);
} finally {
  await browser?.close();
}
