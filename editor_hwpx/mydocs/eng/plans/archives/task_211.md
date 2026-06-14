# Task 211 Execution Plan

## Title
kps-ai.hwp p61 Non-Inline Image Rendering Outside Cell (B-012)

## Symptom
- **File**: kps-ai.hwp, page 61 ("Personal Information Collection/Use/Provision Consent Form")
- **Structure**: Table > Cell (vertical center alignment) > Multiple nested tables + non-inline image
- **Problem**: Non-inline image (text_wrap=1, vert_rel=Para) y-coordinate (para_y=1114.94) exceeds cell clip area (y=724~905), causing image to not display on screen
- **Hancom behavior**: Image displays correctly within the cell

## Root Cause Analysis

### Core Problem
The outer cell's content height calculation and vertical center alignment logic do not correctly handle non-inline image height.

### Structure Description
```
Outer Table > Cell (vertical_align=Center)
  ├─ Nested Table A
  ├─ Nested Table B
  ├─ Non-inline Image (text_wrap=1, vert_rel=Para)
  └─ Nested Table C
```

### Problem Flow
1. `total_content_height` calculation (table_layout.rs ~L987-1036):
   - Sums `calc_composed_paras_content_height()` + nested table height + non-inline image height
   - But `calc_composed_paras_content_height()` is LINE_SEG-based, and LINE_SEG may already include nested table heights → possible double counting

2. height_measurer.rs cell height measurement (L443):
   - `content_height = text_height` — comment "nested table height already reflected in LINE_SEG"
   - Non-inline image height may not be reflected here

3. Non-inline image placement (table_layout.rs ~L1212-1222):
   - Sets y-coordinate based on `para_y`
   - Updates next content position with `para_y += pic_h`
   - Starts from `text_y_start` with vertical center alignment's mechanical_offset applied, but para_y exceeds cell boundary when there is significant prior content (tables etc.)

4. Cell's actual height (cell_h) is either a fixed value recorded in the HWP file or computed by height_measurer → if non-inline image height is not reflected, cell is sized too small

### Key Investigation Points
- Whether height_measurer reflects non-inline image height in cell height
- Mismatch between `total_content_height` and actual cell height (cell_h)
- Whether LINE_SEG includes non-inline image height

## Proposed Fix (Expected)
1. Include non-inline image height in cell content_height in height_measurer
2. Align total_content_height calculation in table_layout with height_measurer logic
3. Ensure cell clip area encompasses all actual content

## Impact Scope
- All cases where non-inline images exist within cells with vertical center/bottom alignment
- Existing Top-aligned cells have minimal impact (mechanical_offset=0)

## Verification Method
1. `cargo test` — confirm existing tests PASS
2. SVG export for kps-ai.hwp p61 visual confirmation (image visibility)
3. E2E test for web rendering confirmation
