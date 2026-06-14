# Task 60: Table Cell Height Handling Improvement - Execution Plan

## Goal

Fix the issue where spacing_before/spacing_after and last line line_spacing of paragraphs within cells are missing from height measurement, causing text to overflow outside cell borders.

## Current State Analysis

- **Problem**: Rendered text within cells extends beyond the cell bottom border
- **Evidence**: k-water-rfp_023.svg "Project Overview" cell -- bottom border y=1028.87, last text y=1035.52 (6.65px overflow)
- **Cause**: `layout_composed_paragraph()` advances y including spacing_before/after + last line line_spacing, but cell row height measurement code (height_measurer.rs, layout.rs) does not include these
- **Note**: Standalone paragraph `measure_paragraph()` already correctly includes spacing (line 187)

## Core Design

Fix 7 locations in cell row height calculation with the same pattern:
1. Query spacing_before/spacing_after from `styles.para_styles` for each paragraph
2. Add to content_height
3. Remove last line line_spacing exclusion logic

## Changed Files

| File | Changes |
|------|---------|
| `src/renderer/height_measurer.rs` | Pass styles to measure_table(), add spacing, MeasuredCell spacing fold |
| `src/renderer/layout.rs` | Fix 4 height calculation locations + compute_cell_line_ranges spacing fold |

## Verification

- Native build + WASM build successful
- All existing tests pass
- k-water-rfp.hwp SVG: text within cells contained within borders
- Existing file SVGs: no layout breakage
