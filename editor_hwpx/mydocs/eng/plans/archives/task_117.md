# Task 117 Execution Plan

## Subject
Line Spacing Calculation Improvement: Match HWP Program Behavior

## Background

Our renderer's line spacing calculation is inconsistent with HWP program's actual behavior. Per-line micro-errors accumulate across the page, causing page flow to deviate (related to B-003).

**HWP Program Behavior:**
- HWP manual: "Line spacing is from the top of the current line to the top of the next line"
- Uses current line's font size and line spacing setting to determine **next line's starting position**
- LineSeg's `vertical_pos` field stores each line's actual Y coordinate (ground truth)

**Our Renderer's Current Behavior:**
- `layout.rs:1863`: `y += line_height + line_spacing_px` (current line height + line spacing)
- `height_measurer.rs:186`: per-line height = `line_height + line_spacing`
- pagination.rs comments (lines 304-305) already acknowledge: "measured height is measured larger than rendering, causing page count to increase"

**Core Issue:**
LineSeg.line_spacing field per HWP spec means "line spacing" i.e., **distance from current line top to next line top**.
Our code **additionally adds** this to `line_height`, so Y advance may be larger than actual.

## Test Target

- `samples/hancom-webgian.hwp` — test file for line spacing verification

## Implementation Plan (3 Phases)

### Phase 1: Empirical Investigation — LineSeg Field Meaning Verification

Analyze LineSeg data from `samples/hancom-webgian.hwp` to verify field relationships.

**Work:**
1. Write diagnostic test function: load hancom-webgian.hwp → output each paragraph's LineSeg values
2. Core verification: check if `vertical_pos[n+1] - vertical_pos[n]` matches:
   - (A) `line_spacing[n]` → line_spacing is top-to-top distance
   - (B) `line_height[n] + line_spacing[n]` → line_spacing is additional spacing

**Branching based on results:**
- If (A): modify Y advance to `y += line_spacing_px`
- If (B): Y advance formula is correct but value calculation logic has issues → trace root cause

### Phase 2: Y Advance and Height Measurement Fix

Fix calculation formula based on Phase 1 results.

**Files to modify:**

| File | Current Code | Fix Direction |
|------|-------------|--------------|
| `src/renderer/layout.rs:1862-1866` | `y += line_height + line_spacing_px` | Fix based on verification results |
| `src/renderer/height_measurer.rs:182-195` | `line_height + line_spacing` per line | Fix with same formula |
| `src/renderer/pagination.rs:310` | `vpos_end = vertical_pos + line_height + line_spacing` | Ensure consistency |
| `src/renderer/composer.rs:1202-1207` | `font_size_to_line_height = font_size * 1.6` | Fix if needed |

### Phase 3: Full Tests + Visual Verification + Report

1. Docker native build + full test execution (569 tests)
2. WASM build
3. Visual verification of `hancom-webgian.hwp` in web viewer
4. Final report + daily task status update

## Key Reference Files

| File | Reference Reason |
|------|-----------------|
| `src/renderer/layout.rs:1858-1866` | Y advance calculation (core fix point) |
| `src/renderer/height_measurer.rs:180-203` | Per-line height measurement (for pagination) |
| `src/renderer/pagination.rs:300-325` | vpos-based zone height calculation |
| `src/renderer/composer.rs:1202-1207` | `font_size_to_line_height()` |
| `src/renderer/style_resolver.rs:505-508` | ParaShape → ResolvedParaStyle line spacing resolution |
| `src/model/paragraph.rs:110-131` | LineSeg struct definition |
| `mydocs/manual/hwp/Help/extracted/format/paragraph/paragraph(line_spacing).htm` | HWP line spacing definition |

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| LineSeg.line_spacing meaning may differ from expected | Determine fix direction after Phase 1 empirical verification |
| Y advance change affects table cell internal layout | Maintain special handling logic for last line in table cells |
| Recomposed LineSeg inaccurate during editing | Fix composer.rs regeneration logic as well |
| Existing test expected values may need updating | Update expected values since they now match HWP more closely |
