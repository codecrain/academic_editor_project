# Task 80 Execution Plan: Match Table Cell Height to HWP

## Background

Currently our table cell heights are rendered larger than the actual HWP program.

### Root Cause

When calculating cell content height, **the last line's `line_spacing` is unnecessarily added.**

HWP LineSeg's `line_spacing` field means "spacing to the next line." Therefore:
- Middle lines: `line_height + line_spacing` (distance to next line)
- **Last line**: `line_height` only (no next line, so spacing is unnecessary)

### Diagnostic Data (table-001.hwp)

```
Cell[8] row=1 col=1: declared_height=1183hu padding=141+141=282
  Line[0] line_height=900 line_spacing=540

HWP expected: 141 + 900 + 141 = 1182hu ~ 1183hu  <- exact
Our value:    141 + (900+540) + 141 = 1722hu      <- 539hu excess!
```

2-line cell `vertical_pos` verification:
```
Line[0] vpos=0    line_height=1200 line_spacing=360
Line[1] vpos=1560 line_height=1200 line_spacing=360
gap = 1560 = 1200 + 360  (line_height + line_spacing = next line start)
```

### Problem Code Location (layout.rs)

All **3 locations** calculating cell content height have the same error:

1. **Phase 1-b** (lines 1254-1258): row_span=1 cell content height
2. **Phase 2-b** (lines 1348-1352): merged cell content height
3. **Rendering height** (lines 1547-1553): vertical alignment content height

Current code:
```rust
let lines_total: f64 = comp.lines.iter()
    .map(|line| {
        let h = hwpunit_to_px(line.line_height, self.dpi);
        let spacing = hwpunit_to_px(line.line_spacing, self.dpi);
        h + spacing  // <- spacing added to all lines (including last!)
    })
    .sum();
```

## Goal

1. Exclude last line's `line_spacing` from cell content height calculation to achieve identical cell height as HWP
2. Confirm no regression in existing table rendering

## Scope

### Modifications

**File**: `src/renderer/layout.rs`

Fix `lines_total` calculation at 3 locations:

```rust
// After fix: exclude line_spacing for last line
let lines_total: f64 = comp.lines.iter()
    .enumerate()
    .map(|(i, line)| {
        let h = hwpunit_to_px(line.line_height, self.dpi);
        if i + 1 < comp.lines.len() {
            h + hwpunit_to_px(line.line_spacing, self.dpi)
        } else {
            h  // last line: exclude spacing
        }
    })
    .sum();
```

### Modification Locations

| Location | Purpose | Lines |
|----------|---------|-------|
| Phase 1-b | row_span=1 cell row height determination | ~1254-1258 |
| Phase 2-b | Merged cell row expansion determination | ~1348-1352 |
| Rendering | Vertical alignment content height | ~1547-1553 |

### Test Verification

- All 494 existing tests pass
- Add cell height verification test (our calculation ~ HWP declared value)
- SVG export comparison
- WASM + Vite build verification

## Expected Effect

| Cell type | Before fix | After fix |
|-----------|-----------|-----------|
| 1-line 1-paragraph cell | height + line_spacing | height (exact) |
| N-line 1-paragraph cell | N*(h+s) | (N-1)*(h+s) + h |
| Composite cell | Last line spacing excess per paragraph | Exact |
