# Task 185 - Step 2 Completion Report: HeightMeasurer Height Calculation Fix

## Changes

### Modified File
- `src/renderer/height_measurer.rs` — `measure_paragraph()` method

### Fix
Added line_height correction logic identical to layout's `layout_paragraph()` when using composed line data in HeightMeasurer's `measure_paragraph()`.

**Correction condition**: `raw_line_height < max_font_size` (maximum font size of that line)

**Correction formula** (by ParaShape's line_spacing_type):
- Percent: `max_fs * line_spacing / 100.0`
- Fixed: `line_spacing.max(max_fs)`
- SpaceOnly: `max_fs + line_spacing`
- Minimum: `line_spacing.max(max_fs)`

Final value: `computed.max(max_fs)` (never falls below font size)

## Verification Results

| Item | Before | After |
|------|--------|-------|
| Overflow count | 31 | 1 |
| Total pages | 66 | 67 |
| Tests passed | 657/657 | 657/657 |

- Page count increase (66→67) is correct: paragraphs properly move to next page
- Remaining 1 case is page 23 Table (para 199) — existing table split bug, outside this task scope
