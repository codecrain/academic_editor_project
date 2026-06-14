# Task 80 Final Report: Match Table Cell Height to HWP

## Summary

Fixed an issue where table cell heights were rendered larger than actual HWP. Additionally fixed trailing line_spacing handling during cell rendering for consistency, resolving cell text overflow issues.

## Root Cause

Cell content height calculation was **unnecessarily adding the last line's `line_spacing`**.

HWP LineSeg's `line_spacing` means "spacing to the next line":
- Middle lines: `line_height + line_spacing` (distance to next line start)
- Last line: `line_height` only (no spacing needed since there is no next line)

### Diagnostic Data (table-001.hwp Cell[8] basis)

| Item | Before | After | HWP Declared Value |
|------|--------|-------|--------------------|
| content | 900+540=1440hu | 900hu | ~901hu |
| required | 1440+282=1722hu | 900+282=1182hu | 1183hu |
| Error | +539hu (46%!) | -1hu (0%) | - |

## Changes

### 1. Row Height Calculation (3 locations)

**File**: `src/renderer/layout.rs`

Excluded last line's `line_spacing` from `lines_total` calculation at 3 locations:

```rust
// After fix: exclude line_spacing for last line
let line_count = comp.lines.len();
let lines_total: f64 = comp.lines.iter()
    .enumerate()
    .map(|(i, line)| {
        let h = hwpunit_to_px(line.line_height, self.dpi);
        if i + 1 < line_count {
            h + hwpunit_to_px(line.line_spacing, self.dpi)
        } else {
            h  // Last line: exclude spacing
        }
    }).sum();
```

| Location | Purpose |
|----------|---------|
| Stage 1-b (~line 1254) | Row height determination for row_span=1 cells |
| Stage 2-b (~line 1354) | Merged cell row expansion determination |
| Rendering (~line 1560) | Content height for vertical alignment |

### 2. Cell Rendering Trailing Spacing Removal

Also excluded trailing line_spacing when rendering the last line in cells for consistency with row height calculation:

```rust
// Line spacing application: exclude trailing spacing for last line in cells
// (maintained in body text as inter-paragraph spacing)
if line_idx + 1 < end || cell_ctx.is_none() {
    y += line_height + line_spacing_px;
} else {
    y += line_height;
}
```

Conditionally applied using `cell_ctx` parameter, only inside cells. Inter-paragraph spacing in body text is unaffected.

## Unresolved Issues

Subtle asymmetry exists in cell vertical center alignment. `baseline_distance` is at ~85% of `line_height`, so center alignment based on line box appears slightly offset downward. To be handled in next task.

## Test Results

| Item | Result |
|------|--------|
| `test_task80_cell_height_matches_hwp` | 125 cell heights verified |
| Full tests | All 495 passed |
| WASM build | Succeeded |
| Vite build | Succeeded |

## Modified File List

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Fixed lines_total at 3 locations + conditional trailing spacing exclusion in cell rendering |
| `src/wasm_api.rs` | Added cell height verification test |

## Completion Date

2026-02-15
