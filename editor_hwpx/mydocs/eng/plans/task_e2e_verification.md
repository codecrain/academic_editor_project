# Inline Table Layout Automated Verification System Design

## Goal

Implement a complete cycle that programmatically creates documents from scratch and **automatically verifies** that rendering results match expected values.

## Full Cycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. Scenario │────▶│  2. Expected │────▶│  3. Execute  │────▶│  4. Compare  │
│  Definition  │     │  Values      │     │  + Measure   │     │  + Verdict   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Step 1: Scenario Definition

Declaratively describe document structure, reflecting the exact input sequence from Hancom.

```javascript
const scenario = {
  name: 'TC #20: Basic Inline TAC Table',
  steps: [
    { type: 'text', value: 'TC #20' },
    { type: 'enter' },
    { type: 'text', value: 'tacglkj table 3 placement start   ' },
    { type: 'inlineTable', rows: 2, cols: 2, colWidths: [6777, 6777],
      cells: ['1', '2', '3 tacglkj', '4 tacglkj'] },
    { type: 'text', value: '   4 tacglkj after table' },
    { type: 'enter' },
    { type: 'text', value: 'tacglkj text content' },
  ],
};
```

### Step 2: Expected Value Generation

Two methods to establish expected values:

**Method A: Hancom Original Reference** (Golden Test)
- Create HWP file with identical content in Hancom
- Load that file and extract render tree coordinates → save as expected values
- Hancom's typesetting result is the ground truth

**Method B: Rule-Based Calculation**
- Specify expected layout rules from the scenario
- Verify rule satisfaction from the render tree

```javascript
const expectations = {
  // Structure verification
  pageCount: 1,
  paragraphs: [
    { index: 0, text: 'TC #20' },
    { index: 1, textContains: ['placement start', 'after table'],
      controls: [{ type: 'Table', rows: 2, cols: 2, treatAsChar: true }] },
    { index: 2, text: 'tacglkj text content' },
  ],
  // Layout rule verification
  layout: [
    // Rule 1: Table placed inline between text (x-coordinate order)
    { rule: 'inline-order', paraIndex: 1,
      order: ['text:placement start', 'table:0', 'text:after table'] },
    // Rule 2: Table bottom ≈ host text baseline + outer_margin_bottom
    { rule: 'table-baseline-align', paraIndex: 1, controlIndex: 0,
      tolerance: 2.0 }, // px
    // Rule 3: Spaces before/after table are rendered
    { rule: 'space-before-table', paraIndex: 1, controlIndex: 0,
      minGap: 5.0 }, // px (3 spaces ≈ 10px)
    { rule: 'space-after-table', paraIndex: 1, controlIndex: 0,
      minGap: 5.0 },
    // Rule 4: Table position unchanged after Enter
    { rule: 'stable-after-enter', paraIndex: 1,
      compareSteps: ['after-table', 'after-enter'] },
  ],
};
```

### Step 3: Execution + Measurement

Execute the scenario via E2E and collect render tree coordinates at each step.

```javascript
// Scenario executor
async function executeScenario(page, scenario) {
  const snapshots = {}; // Per-step render tree snapshots

  for (const step of scenario.steps) {
    switch (step.type) {
      case 'text':
        // Keyboard input
        break;
      case 'enter':
        // Enter key
        break;
      case 'inlineTable':
        // createTableEx API + cell input + cursor movement
        break;
    }
    // Save render tree snapshot after each step
    snapshots[step.label] = await captureRenderTree(page);
  }
  return snapshots;
}

// Extract verification-needed coordinates from render tree
async function captureRenderTree(page) {
  return page.evaluate(() => {
    const tree = JSON.parse(window.__wasm.doc.getPageRenderTree(0));
    // Recursively collect Table, TextRun node bboxes
    return extractLayoutInfo(tree);
  });
}
```

### Step 4: Compare + Verdict

Compare expected values with actual measurements to determine pass/fail.

```javascript
function verifyLayout(snapshots, expectations) {
  const results = [];

  for (const rule of expectations.layout) {
    switch (rule.rule) {
      case 'inline-order':
        // text before maxX < table minX < table maxX < text after minX
        results.push(verifyInlineOrder(snapshots, rule));
        break;
      case 'table-baseline-align':
        // |table bottom - (text baseline + om_bottom)| < tolerance
        results.push(verifyBaselineAlign(snapshots, rule));
        break;
      case 'space-before-table':
        // table start x - preceding text end x > minGap
        results.push(verifySpaceGap(snapshots, rule, 'before'));
        break;
      case 'stable-after-enter':
        // Table bbox coordinate difference between two snapshots < 1px
        results.push(verifyStability(snapshots, rule));
        break;
    }
  }

  return results;
}
```

## Extended Scenarios

Once this system is built, the following scenarios can be automatically verified:

| Scenario | Verification Items |
|---------|----------|
| Single inline table (basic) | x-order, vertical alignment, spacing |
| Two consecutive inline tables | Gap between tables, x-order |
| Inline table + line wrap | Table wrapping to next line placement |
| Inline tables of various sizes | Vertical alignment of large/small tables |
| Inline table + Enter split | Layout after splitting paragraph containing table |
| Inline table + text deletion | Relayout after deleting text before/after table |
| Hancom original comparison (golden) | Coordinate difference < tolerance |

## Implementation Priority

1. **Scenario executor** — Declarative scenario → E2E execution
2. **Render tree measurer** — getPageRenderTree → extract verification coordinates
3. **Rule verifier** — Per-rule comparison logic for expected values
4. **Golden tests** — Load Hancom original → save coordinates → compare
5. **Reporter** — Pass/fail + coordinate difference visualization
