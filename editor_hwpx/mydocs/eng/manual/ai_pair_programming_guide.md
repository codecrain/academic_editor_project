# AI Pair Programming Guide

## Overview

This document summarizes the pair programming patterns and principles accumulated while building the rhwp project — a collaboration between AI (Claude) and a human (the task director).

In a highly complex project involving Rust + WASM + Canvas + E2E + reverse engineering, the task director's domain knowledge combined with AI's implementation capability produced 167 files and 6,500 lines of code in 3 days, resolving 5 issues in a single day.

## Role Division

### Task Director (Human)

- **Setting direction**: Decides what needs to be done and why
- **Domain knowledge**: Hancom HWP typesetting rules, grid comparison, visual quality judgment
- **Quality standards**: "No workarounds allowed", "It must match Hancom exactly"
- **Immediate feedback**: Screenshots, grid captures, visual corrections like "The table is above the baseline"
- **Work schedule management**: Decides when work starts and stops

### AI (Claude)

- **Implementation**: Writing code, building, running tests
- **Analysis**: Code exploration, root cause tracing, numerical calculation
- **Design**: API design, data structure design, test framework construction
- **Documentation**: Manuals, commit messages, reports
- **Verification**: Native tests, E2E tests, regression checks

## Core Principles

### 1. Correct immediately using visual feedback

```
Task director: [screenshot attached] "The table is above the baseline"
   → AI: Numerical analysis → Root cause identified → Code fix → SVG regenerated
Task director: [screenshot reviewed] "It's correct now" or "Still 2px too high"
   → AI: Further adjustment → Re-verify
```

Precise comparison using Hancom's grid view (1mm intervals) is a prime example. When the task director provides a grid capture, the AI analyzes it at the pixel level to derive exact typesetting rules.

**Real example**: Vertical alignment of inline TAC tables
- 1st attempt: `table_y = baseline - table_h` → "The table is slightly too high"
- 2nd attempt: `table_y = y` (line start) → "It went even higher"
- 3rd attempt: `table_y = baseline + om_bottom - table_h` → "Matches Hancom exactly"

### 2. Solve head-on — no workarounds

When the task director rejects a workaround, a fundamental solution must be found.

**Real example**: Typing text after an inline table
- Workaround: Enter all text first, then insert the table → **Rejected**
- Head-on: Design a logical offset system → Modify `insert_text_at` → Leverage `navigateNextEditable` → Implement Hancom-style input flow

### 3. Build verifiable structures

Relying on manual inspection cannot catch regressions.

```
Manual verification → "The screenshot looks right"
   ↓ Evolution
Automated verification → Declarative scenarios → Render tree coordinate measurement → Rule-based validation
```

**Progression**:
1. Visual inspection via SVG export
2. E2E screenshot capture (for records)
3. Render tree coordinate extraction (`getPageRenderTree`)
4. Rule validators (`inline-order`, `table-baseline-align`, `stable-after-enter`)
5. Declarative scenario runner (define scenarios in JSON → auto-execute + validate)

### 4. The task director sets direction; AI executes

AI does not define its own work scope or suggest ending the session.

```
Task director: "Include this in the current task"      → AI: Expand scope
Task director: "Register that as a separate issue"     → AI: Separate it
Task director: "No workarounds allowed"                → AI: Find the root fix
Task director: "It must match Hancom"                  → AI: Raise the bar
```

### 5. When something overlooked is discovered, address it immediately

**Real example**: Pagination propagation range

```
Task director: "Once we reach page 14, later pages should not change"
   → AI: Analysis → Found 188.9px of remaining space on page 14
   → Designed convergence detection framework → Incremental measurement cache optimization
```

A single remark from the task director can fundamentally change the design direction.

## Effective Communication Patterns

### Evidence-based visual dialogue

| Ineffective | Effective |
|-------------|-----------|
| "The table position is wrong" | [grid capture] "The table bottom is 1mm above the baseline" |
| "The rendering is incorrect" | [Hancom screenshot + our screenshot] "The cell text and host text baselines differ" |
| "Pagination isn't working" | "Pressing Enter on page 13 pushes the table on page 14 to page 15" |

### Progressive refinement

```
1st: "The inline table should fit between text"          ← Direction
2nd: [grid capture] "Align table bottom with text baseline" ← Rule
3rd: "Re-verify with text that has ascenders/descenders"  ← Edge case
4th: "It needs to go down by outer_margin_bottom"         ← Fine-tuning
```

### Learning through failure

```
AI: Applied baseline - table_h approach → SVG output
Task director: "Visually no change. It needs to go down about 4px"
AI: line_height approach → 6.3px shift → "That went too far"
AI: baseline + outer_margin_bottom → 3.77px → Matches Hancom
```

The rapid failure→feedback→fix cycle converges on the correct rule.

## Debugging Workflow

### Layout bugs

```bash
# 1. Visual identification
rhwp export-svg sample.hwp --debug-overlay -o output/

# 2. Page layout inspection
rhwp dump-pages sample.hwp -p 23

# 3. Paragraph property investigation
rhwp dump sample.hwp -s 0 -p 239

# 4. HWPX↔HWP comparison (parsing differences)
rhwp ir-diff sample.hwpx sample.hwp
```

### Pagination bugs

```rust
// Reproduce with a native test
let mut doc = HwpDocument::from_bytes(&bytes).unwrap();
doc.convert_to_editable_native().unwrap();
doc.paginate();

let pages_before = doc.pagination[0].pages.len();
doc.split_paragraph_native(0, 199, 0).unwrap();
let pages_after = doc.pagination[0].pages.len();

// Compare with save-and-reload
let exported = doc.export_hwp_native().unwrap();
let mut doc2 = HwpDocument::from_bytes(&exported).unwrap();
// → Edit result and reload result must match
```

### E2E typesetting bugs

```javascript
// Reproduce with a declarative scenario
const scenario = {
  name: 'Bug reproduction',
  steps: [
    { type: 'text', value: 'text' },
    { type: 'inlineTable', rows: 2, cols: 2, ... },
    { type: 'enter' },  // ← Bug occurs here
  ],
};
// → Screenshot + render tree snapshot collected automatically at each step
```

## How Project Structure Affects AI Pair Programming

### Structures that work well

- **CLI tool chain**: `export-svg`, `dump-pages`, `dump`, `ir-diff` — AI can run and inspect results instantly
- **Native tests**: Rust `#[test]` — Fast feedback (783 tests in 7 seconds)
- **E2E framework**: CDP-based — Verify visual results programmatically
- **Declarative scenarios**: Define scenarios in JSON → Reproducible
- **Clear branching strategy**: `local/task{N}` → `local/devel` → `devel` → `main`

### What AI struggles with

- **Visual judgment**: "Does it look similar to Hancom?" — The task director's eyes are essential
- **Domain rule inference**: "table bottom = baseline + outer_margin_bottom" — Requires Hancom reverse engineering data
- **Priority decisions**: "Should this be included in the current task?" — Task director decides
- **When to stop**: Only the task director decides

## Checklist: Working Effectively with AI

### Before starting

- [ ] Register a GitHub Issue (task number = Issue number)
- [ ] Create a branch (`local/task{N}`)
- [ ] Prepare a reproducible sample (HWP file or scenario JSON)

### During work

- [ ] Provide visual feedback via screenshots/grid captures
- [ ] Clearly state "This is correct" / "This is wrong"
- [ ] Demand root-cause fixes, not workarounds
- [ ] Check intermediate results frequently (SVG, E2E, tests)

### After completion

- [ ] Confirm all tests pass (`cargo test`)
- [ ] Add E2E verification scenarios
- [ ] Commit + close Issue
- [ ] Push `devel` → `origin/devel`
- [ ] Update the daily task document

## Conclusion

The key to AI pair programming is **clear role division**. The human handles direction, judgment, and feedback; the AI handles implementation, analysis, and verification. The clearer this division, the higher both velocity and quality become.

This project is not just an HWP viewer — the process of building complex software together with AI is itself a reference implementation.
