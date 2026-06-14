# E2E Testing Guide with CDP

> Run E2E tests for the rhwp-studio editor automatically via Chrome DevTools Protocol (CDP),
> and visually observe the test process in real-time through the Chrome browser.

---

## 1. Prerequisites

### 1.1 WASM Build

```bash
# WASM build using Docker
docker compose --env-file .env.docker run --rm wasm
```

Build output is generated in the `pkg/` folder.

### 1.2 WSL2 Network Configuration (mirrored mode)

To connect to Chrome CDP on the Windows host from WSL2, use mirrored network mode.
In mirrored mode, Windows and WSL2 share the same network stack, enabling direct communication via `localhost`.

**Windows-side configuration** -- Create or edit `C:\Users\<username>\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
memory=20GB
processors=8
swap=4GB
dnsTunneling=true
```

> `networkingMode=mirrored` requires WSL 2.0.0+ and Windows 11 22H2 or later.
> Check your WSL version with `wsl --version`.

After configuration, restart WSL from PowerShell:

```powershell
wsl --shutdown
```

### 1.4 Start Chrome in Debugging Mode (Windows Host)

Run from Windows CMD:

```cmd
start chrome --remote-debugging-port=19222 --remote-debugging-address=0.0.0.0 --user-data-dir="C:\temp\chrome-debug1"
```

| Option | Description |
|--------|-------------|
| `--remote-debugging-port=19222` | CDP port (Puppeteer connects here) |
| `--remote-debugging-address=0.0.0.0` | Bind to all interfaces for WSL2 access |
| `--user-data-dir` | Separate profile (prevents conflicts with existing Chrome) |

When Chrome starts, an empty tab opens. During test execution, new tabs open automatically and close after the test completes.

#### Verify CDP Connection (from WSL2)

```bash
curl -s http://localhost:19222/json/version
```

If successful, Chrome version info is returned as JSON.

### 1.5 Start Vite Dev Server (WSL2)

```bash
cd rhwp-studio
npx vite --host 0.0.0.0 --port 7700 &
```

Verify that `http://localhost:7700` is accessible in the browser.

---

## 2. Running Tests

### 2.1 Basic Execution

```bash
cd rhwp-studio
CHROME_CDP=http://localhost:19222 node e2e/edit-pipeline.test.mjs --mode=host
```

| Env Variable/Option | Description |
|---------------------|-------------|
| `CHROME_CDP` | Chrome CDP address (use `http://localhost:19222` in mirrored mode) |
| `--mode=host` | Connect to host Chrome via CDP (default) |
| `--mode=headless` | Use headless Chrome inside WSL2 (no visual verification) |

### 2.2 Full Test List

#### Core Tests

| Test File | Description | Test Count |
|-----------|-------------|------------|
| `e2e/edit-pipeline.test.mjs` | Edit pipeline integration (paragraph add/delete, table insert, image, textbox, bulk editing) | 52 |
| `e2e/text-flow.test.mjs` | Text flow (input, line wrap, Enter, page overflow, Backspace) | 6 |

#### Feature Tests

| Test File | Description | Sample File |
|-----------|-------------|-------------|
| `e2e/blogform.test.mjs` | BlogForm_BookReview.hwp ClickHere field guide text handling | BlogForm_BookReview.hwp |
| `e2e/copy-paste.test.mjs` | Text block copy/paste | -- |
| `e2e/footnote-insert.test.mjs` | Footnote insertion paragraph position verification | footnote-01.hwp |
| `e2e/footnote-vpos.test.mjs` | Footnote editing vpos anomaly verification | footnote-01.hwp |
| `e2e/line-spacing.test.mjs` | Page overflow on line spacing change | -- |
| `e2e/page-break.test.mjs` | Forced page break | biz_plan.hwp |
| `e2e/shape-inline.test.mjs` | Inline shape control -- cursor movement and text insertion | -- |
| `e2e/shift-end.test.mjs` | Shift+End selection range verification | shift-return.hwp |
| `e2e/typesetting.test.mjs` | Typesetting quality verification (paragraph marks display) | -- |
| `e2e/responsive.test.mjs` | Responsive layout (by viewport size) | -- |
| `e2e/hwpctl-basic.test.mjs` | hwpctl API basic operations | -- |

#### Debug (Manual Verification)

| Test File | Description |
|-----------|-------------|
| `e2e/debug-pagination.test.mjs` | Pagination debug |
| `e2e/debug-table-pos.test.mjs` | Table position debug |
| `e2e/debug-textbox.test.mjs` | Textbox debug |

#### Utilities

| File | Description |
|------|-------------|
| `e2e/helpers.mjs` | Common helpers (test runner, browser connection, document loading, assertions, screenshots, report generation) |
| `e2e/report-generator.mjs` | HTML report generator (`TestReporter` class) |

### 2.3 Headless Mode (for CI)

Automated execution without visual verification:

```bash
cd rhwp-studio
node e2e/edit-pipeline.test.mjs --mode=headless
```

In headless mode, Chromium inside WSL2 is used, so Windows Chrome is not required.

---

## 3. Test Structure

### 3.1 Common Pattern (`runTest`)

All tests follow a consistent structure using the `runTest()` wrapper from `helpers.mjs`:

```javascript
import { runTest, createNewDocument, clickEditArea, assert, screenshot } from './helpers.mjs';

runTest('Test Title', async ({ page, browser }) => {
  // Create new blank document
  await createNewDocument(page);
  await clickEditArea(page);

  // Test logic...
  assert(condition, 'Assertion message');
  await screenshot(page, 'step-name');
});
```

Items automatically handled by `runTest()`:

| Item | Description |
|------|-------------|
| Browser connection | `launchBrowser()` -- CDP or headless |
| Page creation | `createPage()` -- window size (host: 1280x750, headless: 1280x900) |
| App loading | `loadApp()` -- Vite server + WASM initialization wait |
| Error handling | try/catch -- error screenshot + `process.exitCode = 1` |
| Tab cleanup | Only closes tabs opened by the test (preserves existing host Chrome tabs) |
| HTML report | Auto-generated at `output/e2e/{test-name}-report.html` |

Options:
- `{ skipLoadApp: true }` -- Skip app loading (for tests using a separate HTML page like hwpctl-basic)

### 3.2 Document Loading Patterns

**Create a new blank document:**

```javascript
await createNewDocument(page);  // eventBus emit + canvas wait
```

**Load an HWP file:**

```javascript
const { pageCount } = await loadHwpFile(page, 'biz_plan.hwp');
// fetch from samples/ -> WASM loadDocument -> canvas wait
```

### 3.3 Helper Functions (helpers.mjs)

#### Browser/Page Lifecycle

| Function | Description |
|----------|-------------|
| `launchBrowser()` | Connect to Chrome CDP or start headless |
| `createPage(browser, width?, height?)` | Create test tab + set size |
| `closePage(page)` | Close tab |
| `closeBrowser(browser)` | Close test tabs + CDP disconnect or headless close |

#### App/Document Loading

| Function | Description |
|----------|-------------|
| `loadApp(page)` | Load app from Vite server + wait for WASM initialization |
| `createNewDocument(page)` | Create new blank document + wait for canvas |
| `loadHwpFile(page, filename)` | Fetch HWP file + loadDocument + wait for canvas |
| `waitForCanvas(page, timeout?)` | Wait for edit area canvas |

#### Editing/Input

| Function | Description |
|----------|-------------|
| `clickEditArea(page)` | Click edit area canvas to focus |
| `typeText(page, text)` | Type text via keyboard (30ms delay per character) |

#### Query/Assertion

| Function | Description |
|----------|-------------|
| `getPageCount(page)` | Query page count via WASM API |
| `getParagraphCount(page, secIdx?)` | Query paragraph count via WASM API |
| `getParaText(page, secIdx, paraIdx, maxLen?)` | Query paragraph text via WASM API |
| `assert(condition, message)` | PASS/FAIL output + auto-record to reporter |
| `screenshot(page, name)` | Save screenshot + auto-link to reporter |

#### Test Runner

| Function | Description |
|----------|-------------|
| `runTest(title, testFn, options?)` | Test execution wrapper (lifecycle + error handling + report) |
| `setTestCase(name)` | Set test case group name in report |

### 3.4 Direct WASM API Calls

Beyond keyboard input, you can call the WASM API directly for precise editing tests:

```javascript
const result = await page.evaluate(() => {
  const w = window.__wasm;

  // Insert text
  w.doc.insertText(0, 0, 0, 'Hello');

  // Split paragraph
  w.doc.splitParagraph(0, 0, 5);

  // Insert table
  const tr = JSON.parse(w.doc.createTable(0, 1, 0, 2, 2));

  // Insert cell text
  w.doc.insertTextInCell(0, tr.paraIdx, tr.controlIdx, 0, 0, 0, 'Cell');

  // Page break
  w.doc.insertPageBreak(0, 0, 5);

  // Merge paragraphs
  w.doc.mergeParagraph(0, 1);

  // Trigger canvas re-render (required after direct WASM API calls)
  window.__eventBus?.emit('document-changed');

  return { pageCount: w.doc.pageCount() };
});
```

> **Important**: After calling the WASM API directly, you must call
> `window.__eventBus?.emit('document-changed')` to refresh the canvas
> for changes to appear on screen. Keyboard input (`typeText`) handles this automatically.

---

## 4. HTML Test Reports

HTML reports are automatically generated in the `output/e2e/` folder for all test runs.

### 4.1 Report Files

Tests using `runTest()` automatically generate reports:

```
output/e2e/
  blogform-report.html
  copy-paste-report.html
  debug-pagination-report.html
  debug-table-pos-report.html
  debug-textbox-report.html
  edit-pipeline-report.html
  footnote-insert-report.html
  footnote-vpos-report.html
  hwpctl-basic-report.html
  line-spacing-report.html
  page-break-report.html
  responsive-report.html
  shape-inline-report.html
  shift-end-report.html
  text-flow-report.html
  typesetting-report.html
```

### 4.2 Report Contents

- **Summary dashboard**: Total / Passed / Failed / Skipped counts
- **Per-TC cards**: Assertion results + screenshots for each test case
- **Inline screenshots**: Base64-encoded, viewable in a single HTML file without separate image files

### 4.3 Viewing Reports

```bash
# Run test (report auto-generated)
cd rhwp-studio
CHROME_CDP=http://localhost:19222 node e2e/copy-paste.test.mjs --mode=host

# Open report (Windows -- run from WSL2)
explorer.exe "$(wslpath -w ../output/e2e/copy-paste-report.html)"
```

### 4.4 Reporter Integration with assert and screenshot

`assert()` outputs PASS/FAIL to the console and simultaneously records it in the built-in reporter.
`screenshot()` saves a screenshot to file and auto-links it to the reporter's last assertion.

```javascript
await screenshot(page, 'step-01');      // Save screenshot
assert(count === 1, 'Page count = 1');  // PASS/FAIL + reporter record + screenshot link
```

### 4.5 Custom Reporter Usage (edit-pipeline, responsive)

Using the `TestReporter` class directly allows fine-grained control such as test case grouping:

```javascript
import { TestReporter } from './report-generator.mjs';

const reporter = new TestReporter('My Test');
reporter.pass('TC #1', 'Text insertion successful');
reporter.fail('TC #2', 'Page count mismatch');
reporter.skip('TC #3', 'API not supported');
reporter.generate('../output/e2e/my-report.html');
```

---

## 5. Screenshots

Screenshots for each step are saved to `rhwp-studio/e2e/screenshots/` during test execution.
Screenshots are included inline in HTML reports as base64.

```
rhwp-studio/e2e/screenshots/
  cp-01-typed.png
  cp-02-pasted.png
  cp-03-final.png
  edit-01-split.png
  edit-06-table-insert.png
  ...
  error.png              <- Auto-captured on error
```

---

## 6. Adding New Tests

### 6.1 New Blank Document Test

```javascript
import {
  runTest, createNewDocument, clickEditArea, typeText,
  screenshot, assert, getPageCount,
} from './helpers.mjs';

runTest('My New Test', async ({ page }) => {
  await createNewDocument(page);
  await clickEditArea(page);

  await typeText(page, 'Hello World');
  await screenshot(page, 'my-01-input');

  const pages = await getPageCount(page);
  assert(pages === 1, `Page count check: ${pages}`);
});
```

### 6.2 HWP File Load Test

```javascript
import { runTest, loadHwpFile, screenshot, assert } from './helpers.mjs';

runTest('My File Test', async ({ page }) => {
  const { pageCount } = await loadHwpFile(page, 'my-sample.hwp');
  assert(pageCount >= 1, `Document loaded (${pageCount} pages)`);
  await screenshot(page, 'my-01-loaded');

  // Direct WASM API call
  const text = await page.evaluate(() =>
    window.__wasm?.getTextRange(0, 0, 0, 50) ?? ''
  );
  assert(text.includes('expected text'), `First paragraph text check`);
});
```

### 6.3 Assertion Patterns

| Pattern | Function |
|---------|----------|
| Check paragraph text | `getParaText(page, sec, para)` or `w.doc.getTextRange(sec, para, offset, count)` |
| Check cell text | `w.doc.getTextInCell(sec, para, ctrl, cell, cellPara, offset, count)` |
| Check paragraph count | `getParagraphCount(page, sec)` or `w.doc.getParagraphCount(sec)` |
| Check page count | `getPageCount(page)` or `w.doc.pageCount()` |
| Check line info | `JSON.parse(w.doc.getLineInfo(sec, para, offset))` |
| Check SVG rendering | `w.doc.renderPageSvg(pageNum)` |

---

## 7. Troubleshooting

### CDP Connection Failure

```
TypeError: Failed to fetch browser webSocket URL
```

- Verify Chrome is running in debugging mode (`start chrome --remote-debugging-port=19222 ...`)
- Verify `CHROME_CDP=http://localhost:19222` is set
- Check port proxy settings: `netsh interface portproxy show v4tov4`
- Test connection from WSL2: `curl -s http://localhost:19222/json/version`

### Canvas Not Found

```
Error: Edit area canvas not found
```

- Verify Vite dev server is running on `0.0.0.0:7700`
- Verify WASM build (`pkg/`) is up to date
- Verify canvas was created after new document creation or file load

### Screen Not Updating After WASM API Call

- Verify `window.__eventBus?.emit('document-changed')` is called
- Add stabilization wait: `await page.evaluate(() => new Promise(r => setTimeout(r, 300)))`

### Test Failing Due to Timing Issues

- Use `page.keyboard.type(text, { delay: 5 })` instead of `typeText` for faster input
- Switch to direct WASM API calls (more stable than keyboard input)
- Increase stabilization wait time (adjust `setTimeout` values)

### Missing Sample Files

```
Error: File load failed (biz_plan.hwp): HTTP 404
```

- Verify the HWP file exists in `rhwp-studio/public/samples/`
- Copy from `samples/` folder: `cp samples/biz_plan.hwp rhwp-studio/public/samples/`
