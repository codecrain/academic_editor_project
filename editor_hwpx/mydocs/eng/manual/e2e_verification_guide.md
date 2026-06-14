# E2E Typesetting Automated Verification Guide

## Overview

A system that programmatically creates documents from a blank document and **automatically verifies** that the rendering results match expected values.

```
Scenario definition → Auto-execution → Render tree measurement → Rule-based validation → Result report
```

## Prerequisites

1. WASM build completed (`docker compose --env-file .env.docker run --rm wasm`)
2. Vite dev server running (`cd rhwp-studio && npx vite --host 0.0.0.0 --port 7700`)
3. Chrome CDP connection available (host or headless)

## Running Tests

```bash
cd rhwp-studio

# Host Chrome CDP
CHROME_CDP=http://localhost:19222 node e2e/tac-verify.test.mjs --mode=host

# Headless Chrome
node e2e/tac-verify.test.mjs --mode=headless
```

## File Structure

```
rhwp-studio/e2e/
├── scenario-runner.mjs      # Scenario runner + measurer + validator
├── tac-verify.test.mjs       # Inline TAC table verification scenarios
├── tac-inline-create.test.mjs # Hancom-style input E2E (step-by-step screenshots)
├── helpers.mjs               # Common helpers (moveCursorTo, etc.)
└── screenshots/              # Auto-generated screenshots
```

## Writing Scenarios

### Scenario Definition

Declare the document creation sequence as a JSON object. It mirrors the exact input order used in Hancom.

```javascript
const scenario = {
  name: 'TC-V01: Basic inline TAC table',
  steps: [
    { type: 'text',  value: 'TC #20',           label: 'title' },
    { type: 'enter',                             label: 'enter1' },
    { type: 'text',  value: 'Before table   ',   label: 'before-text' },
    { type: 'inlineTable',
      rows: 2, cols: 2,
      colWidths: [6777, 6777],                   // Column widths in HWPUNIT
      cells: ['1', '2', '3', '4'],               // Cell text (left→right, top→bottom)
      label: 'table' },
    { type: 'text',  value: '   After table',    label: 'after-text' },
    { type: 'enter',                             label: 'enter2' },
    { type: 'text',  value: 'Next line',          label: 'last-line' },
  ],
};
```

### Step Types

| type | Description | Required properties | Optional properties |
|------|-------------|-------------------|-------------------|
| `text` | Type text via keyboard | `value` | `label` |
| `enter` | Enter key (paragraph split) | — | `label` |
| `inlineTable` | Insert an inline TAC table | `rows`, `cols`, `colWidths` | `cells`, `label`, `sec`, `para` |

### label

Assigning a `label` to each step:
- Includes it in the screenshot filename (`v01-03-table.png`)
- Uses it as a snapshot key (referenced in rule validation)
- Auto-generated as `step-0`, `step-1`, ... if omitted

### Defining Expectations

Expectations consist of structural validation and layout rule validation.

```javascript
const expectations = {
  // ── Structural validation ──
  pageCount: 1,
  paragraphs: [
    { index: 0, text: 'TC #20' },                      // Exact text match
    { index: 1, textContains: ['Before table', 'After table'] }, // Substring match
    { index: 2, textContains: ['Next line'] },
  ],

  // ── Layout rule validation ──
  layout: [
    { rule: 'inline-order', paraIndex: 1 },
    { rule: 'table-baseline-align', paraIndex: 1, controlIndex: 0, tolerance: 10.0 },
    { rule: 'space-before-table', paraIndex: 1, controlIndex: 0, minGap: 5.0 },
    { rule: 'space-after-table', paraIndex: 1, controlIndex: 0, minGap: 5.0 },
    { rule: 'stable-after-enter', paraIndex: 1,
      compareSteps: ['table', 'enter2'], tolerance: 3.0 },
  ],
};
```

## Validation Rules in Detail

### inline-order

Verifies that the table is placed inline between text by checking x-coordinate order.

```javascript
{ rule: 'inline-order', paraIndex: 1 }
```

- Collects TextRuns within the same y-range (±10px) as the table
- Checks that text before the table (x+w ≤ table x) and text after (x ≥ table x+w) exist
- Also passes if TextRuns are not split (a single text run before the table)

### table-baseline-align

Verifies that the table bottom is aligned near the text baseline.

```javascript
{ rule: 'table-baseline-align', paraIndex: 1, tolerance: 10.0 }
```

- `tolerance`: Allowed px difference (default 5.0)
- Compares the difference between the text y-coordinate before the table and the table bottom (y+h)

### space-before-table / space-after-table

Verifies that whitespace is rendered before/after the table.

```javascript
{ rule: 'space-before-table', paraIndex: 1, minGap: 5.0 }
```

- `minGap`: Minimum gap in px (default 3.0)
- Measures the gap between the table x and the end x of the preceding text

### stable-after-enter

Compares snapshots from two points in time to verify the table position has not shifted.

```javascript
{ rule: 'stable-after-enter', paraIndex: 1,
  compareSteps: ['table', 'enter2'], tolerance: 3.0 }
```

- `compareSteps`: Labels of the two steps to compare
- Compares the table bbox at the same paraIndex across both snapshots
- `tolerance`: Allowed dx/dy in px (default 2.0)

## Test Execution Code

```javascript
import { runTest, createNewDocument, clickEditArea } from './helpers.mjs';
import { runScenario } from './scenario-runner.mjs';

runTest('Test name', async ({ page }) => {
  await createNewDocument(page);
  await clickEditArea(page);
  await runScenario(page, scenario, expectations, 'screenshot-prefix');
});
```

### runScenario Return Value

```javascript
const { results, snapshots, finalState } = await runScenario(page, scenario, expectations);

// results: Array of validation results
// [{ rule: 'pageCount', pass: true, message: '...' }, ...]

// snapshots: Render tree at each step
// { 'title': { tables: [...], textRuns: [...] }, 'table': {...}, 'final': {...} }

// finalState: Final document state
// { pageCount: 1, paraCount: 3, paragraphs: [{ index: 0, text: '...' }, ...] }
```

## Scenario Examples

### Two Consecutive Inline Tables

```javascript
const scenario = {
  name: 'TC-V04: Two inline tables',
  steps: [
    { type: 'text', value: 'Before ' },
    { type: 'inlineTable', rows: 1, cols: 2, colWidths: [4000, 4000],
      cells: ['A', 'B'], label: 'table1' },
    { type: 'text', value: ' Middle ' },
    { type: 'inlineTable', rows: 1, cols: 2, colWidths: [4000, 4000],
      cells: ['C', 'D'], label: 'table2' },
    { type: 'text', value: ' After' },
  ],
};

const expectations = {
  pageCount: 1,
  paragraphs: [
    { index: 0, textContains: ['Before', 'Middle', 'After'] },
  ],
  layout: [
    { rule: 'inline-order', paraIndex: 0 },
  ],
};
```

### Large and Small Tables

```javascript
const scenario = {
  name: 'TC-V05: Tables of varying sizes',
  steps: [
    { type: 'text', value: 'Small table: ' },
    { type: 'inlineTable', rows: 1, cols: 1, colWidths: [3000],
      cells: ['S'], label: 'small' },
    { type: 'text', value: ' Large table: ' },
    { type: 'inlineTable', rows: 3, cols: 3, colWidths: [5000, 5000, 5000],
      cells: ['1','2','3','4','5','6','7','8','9'], label: 'large' },
    { type: 'text', value: ' End' },
  ],
};
```

### Comparing Against a Hancom Original File (Golden Test)

```javascript
import { loadHwpFile } from './helpers.mjs';
import { captureLayout } from './scenario-runner.mjs';

// Load the Hancom original → Extract render tree → Use as expected values
const { pageCount } = await loadHwpFile(page, 'tac-case-001.hwp');
const goldenLayout = await captureLayout(page, 0);

// Create the same structure from a blank document → Compare render trees
await createNewDocument(page);
await runScenario(page, scenario, expectations);
const generatedLayout = await captureLayout(page, 0);

// Coordinate comparison
const goldenTable = goldenLayout.tables[0];
const genTable = generatedLayout.tables[0];
const dx = Math.abs(goldenTable.x - genTable.x);
const dy = Math.abs(goldenTable.y - genTable.y);
assert(dx < 5 && dy < 5, `Difference from Hancom: dx=${dx} dy=${dy}`);
```

## WASM API Reference

APIs used internally by the scenario runner:

| API | Purpose |
|-----|---------|
| `createTableEx(json)` | Create an inline TAC table (`treatAsChar: true`) |
| `insertTextLogical(sec, para, logicalOffset, text)` | Insert text at a logical offset |
| `getLogicalLength(sec, para)` | Logical paragraph length (text + controls) |
| `logicalToTextOffset(sec, para, logicalOffset)` | Logical → text offset conversion |
| `navigateNextEditable(sec, para, charOffset, delta, contextJson)` | Cursor navigation (skipping controls) |
| `getPageRenderTree(pageNum)` | Render tree JSON (for coordinate verification) |
| `insertTextInCell(sec, para, ctrl, cell, cellPara, offset, text)` | Insert text inside a cell |

## Output

### Console Output

```
  === Scenario: TC-V01: Basic inline TAC table ===
  Execution complete: 1 page, 3 paragraphs
  ✓ [pageCount] Page count: expected=1 actual=1
  ✓ [paragraph-contains] pi=1 contains 'Before table': true
  ✓ [inline-order] Inline order: before=3 after=11 same-line=18
  ✓ [table-baseline-align] Vertical align: table-bottom=187.8 textY=195.8 diff=8.0px (tolerance=10)
  Result: 7 passed, 0 failed
```

### Screenshots

Saved at `e2e/screenshots/{prefix}-{number}-{label}.png` for each step.

### HTML Report

An HTML report with inline screenshots is generated at `output/e2e/{test-name}-report.html`.
