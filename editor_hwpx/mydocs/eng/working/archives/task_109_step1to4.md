# Task 109: Table > Image Position Rendering Bug Fix - Step-by-Step Report

## Step 1: "In Front of Text" Table Vertical Position Handling

### Work Done

- Extracted `table_text_wrap` from `table.attr` bits 21-23 in `layout_table()`
- For `text_wrap == 2(behind text) / 3(in front of text)` tables:
  - Extracted `v_offset` from `raw_ctrl_data[0..3]`
  - Calculated vertical position based on `vert_rel_to` (bits 3-4), `vert_align` (bits 5-7)
  - Determined `table_y` as absolute position based on v_offset
- Return value: Behind/InFrontOfText tables return `y_start` (don't push body text)
- Excluded `InFrontOfText` shapes from `calculate_shape_reserved_height()` (prevent body push-down)

## Step 2: `layout_composed_paragraph()` Parameter Addition

### Work Done

- Added `first_line_x_offset: f64` parameter to signature
- During first line rendering:
  - `available_width -= inline_offset` (reduced available width)
  - `x_start += inline_offset` (offset text start position)
- All existing 11 call sites pass `0.0` (no behavior change)

## Step 3: Inline Image Sequential Placement

### Findings

Investigation revealed that inline images (hancom logo) in request.hwp are not inside **table cells** but inside **text boxes (shapes)**. No Picture in cell's `para.controls`; images are inline controls within text boxes of shapes processed as PageItem::Shape.

### Work Done (3 Locations Modified)

**A. Text Box Layout (`layout_textbox_content`)**
- Calculated total inline control width (`tb_inline_width`) before `layout_composed_paragraph` call
- Passed as first line offset so text is placed after images
- Calculated `inline_x` based on total line width (`total_line_width`) for alignment

**B. Cell Layout 1 (horizontal cells within `layout_table`)**
- Pre-calculated inline control total width, passed offset to `layout_composed_paragraph`
- Tracked `inline_x` sequentially during inline control placement, calculated alignment-based start X

**C. Cell Layout 2 (split row cells within `layout_partial_table`)**
- Applied same inline width calculation and offset passing
- Applied `inline_x` sequential placement pattern

## Step 4: Verification and Feedback Incorporation

### Feedback Applied

- **Issue**: `calculate_shape_reserved_height()` treated `InFrontOfText` shapes same as `TopAndBottom`, pushing body down by 77.88px
- **Fix**: Removed `InFrontOfText` condition, only `TopAndBottom` pushes body

### Verification Results

| Item | Result |
|------|--------|
| All tests | 565 passed |
| WASM build | Success |
| request.hwp | Image (x=75.89) + text (x=195.05) on same line, body y=200.76 normal |
| k-water-rfp.hwp | 29 pages SVG normal export, no regression |
| Worldcup_FIFA2010_32.hwp | Page 1 SVG normal export, no regression |

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Table "InFrontOfText" vertical position + `layout_composed_paragraph()` signature + textbox/cell layout inline placement + `calculate_shape_reserved_height` InFrontOfText exclusion |
