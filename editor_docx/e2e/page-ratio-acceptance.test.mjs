#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

import { loadBrowserAutomation } from '../../editor_common/browser-acceptance-runtime.mjs';
import { DocxApiSession } from '../scripts/docx-api-utils.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const editorUrl = process.env.DOCX_PAGE_RATIO_ACCEPTANCE_URL
  || 'http://127.0.0.1:11017/docx/';
const chromePath = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const evidenceRoot = path.resolve(
  process.env.DOCX_PAGE_RATIO_ACCEPTANCE_EVIDENCE
    || path.join(repoRoot, '.qa', 'browser-acceptance'),
);
const marker = process.env.DOCX_PAGE_RATIO_ACCEPTANCE_MARKER
  || `[DOCX-PAGE-RATIO-QA-${Date.now()}]`;
const expectedSectionDimensions = [
  [5000, 5000],
  [8000, 5000],
];
const dimensionToleranceTwips = 16;

const editorOrigin = new URL(editorUrl).origin;
const contentsUrl = new URL(
  '/docx/wopi/files/docx-home/contents?access_token=local-docx-token',
  editorOrigin,
);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForEditor(page) {
  await page.waitForSelector('iframe[title="DOCX editor"]', { timeout: 30_000 });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const editorFrame = page.frames().find((frame) =>
      frame !== page.mainFrame()
      && !frame.url().includes('/welcome/welcome.html')
      && frame.url().includes('/browser/'));
    if (editorFrame && await editorFrame.$('button[aria-label="Save"]')) {
      return editorFrame;
    }
    await sleep(100);
  }
  throw new Error('Collabora editor frame did not become editable');
}

async function closeWelcome(page) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    for (const welcomeFrame of page.frames().filter((frame) => frame.url().includes('/welcome/welcome.html')).toReversed()) {
      const close = welcomeFrame.locator('#welcome-close');
      if (await close.count()) {
        await close.dispatchEvent('click');
        return;
      }
    }
    await sleep(100);
  }
}

async function waitForPageRectangles(editorFrame) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const rectangles = await editorFrame.evaluate(() => {
      const raw = globalThis.app?.map?._docLayer?._documentInfo;
      const payload = String(raw || '').replace(/^statusupdate:\s*/, '');
      try {
        const parsed = JSON.parse(payload);
        return Array.isArray(parsed.pagerectangles) ? parsed.pagerectangles : [];
      } catch {
        return [];
      }
    });
    if (rectangles.length === expectedSectionDimensions.length) {
      return rectangles;
    }
    await sleep(100);
  }
  throw new Error('Rendered page rectangles did not become available');
}

function assertPageDimensions(rectangles, label) {
  assert.equal(rectangles.length, expectedSectionDimensions.length, `${label}: page count`);
  rectangles.forEach((rectangle, index) => {
    assert.equal(rectangle.length, 4, `${label}: page ${index + 1} rectangle shape`);
    const [, , renderedWidth, renderedHeight] = rectangle;
    const [expectedWidth, expectedHeight] = expectedSectionDimensions[index];
    assert.ok(
      Math.abs(renderedWidth - expectedWidth) <= dimensionToleranceTwips,
      `${label}: page ${index + 1} width ${renderedWidth} must preserve ${expectedWidth}`,
    );
    assert.ok(
      Math.abs(renderedHeight - expectedHeight) <= dimensionToleranceTwips,
      `${label}: page ${index + 1} height ${renderedHeight} must preserve ${expectedHeight}`,
    );
    assert.ok(
      Math.abs((renderedWidth / renderedHeight) - (expectedWidth / expectedHeight)) <= 0.005,
      `${label}: page ${index + 1} aspect ratio must be preserved`,
    );
  });
}

function assertSectionDimensions(document, label) {
  const rectangles = document.sections.map(({ pageSetup }) => [
    0,
    0,
    pageSetup.width,
    pageSetup.height,
  ]);
  assertPageDimensions(rectangles, label);
}

async function readSavedArtifact() {
  const response = await fetch(contentsUrl);
  assert.equal(response.status, 200, 'WOPI contents read must succeed');
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, document: new DocxApiSession(bytes).readJson() };
}

let browser;

try {
  await mkdir(evidenceRoot, { recursive: true });
  const runRoot = await mkdtemp(path.join(evidenceRoot, 'docx-page-ratio-'));
  const baselineArtifact = await readSavedArtifact();
  assertSectionDimensions(baselineArtifact.document, 'WOPI fixture');

  const { chromium } = await loadBrowserAutomation();
  browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const editorFrame = await waitForEditor(page);
  await closeWelcome(page);
  const initialRectangles = await waitForPageRectangles(editorFrame);
  assertPageDimensions(initialRectangles, 'initial open');

  await page.mouse.click(300, 253);
  await page.keyboard.press('End');
  await page.keyboard.type(` ${marker}`, { delay: 5 });
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
  assertSectionDimensions(savedArtifact.document, 'saved OOXML');

  const reopenedPage = await context.newPage();
  await reopenedPage.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const reopenedFrame = await waitForEditor(reopenedPage);
  await closeWelcome(reopenedPage);
  const reopenedRectangles = await waitForPageRectangles(reopenedFrame);
  assertPageDimensions(reopenedRectangles, 'reopen after save');
  assert.deepEqual(reopenedRectangles, initialRectangles, 'Rendered page geometry must survive save/reopen');

  const screenshotPath = path.join(runRoot, 'custom-page-ratios-reopened.png');
  await reopenedPage.screenshot({ path: screenshotPath });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    editorUrl,
    contentsUrl: contentsUrl.toString(),
    screenshotPath,
    markerRecovered: true,
    initialRectangles,
    reopenedRectangles,
    sectionDimensions: expectedSectionDimensions,
  })}\n`);
} finally {
  await browser?.close();
}
