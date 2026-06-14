# Task 109: Table > Image Position Rendering Bug Fix

## Goal

Fix two rendering issues in `samples/basic/request.hwp`:
1. **Table placement**: "InFrontOfText" tables should float above body text with vertical position handling
2. **Inline images in cells**: treat_as_char images should be placed sequentially on the same line as text

## Current Status

### Issue 1: Table "InFrontOfText" Placement Not Handled

- `table.attr` bits 21-23 contain text_wrap info (3=InFrontOfText)
- `table.raw_ctrl_data[0..3]` contains v_offset (vertical offset)
- Currently `layout_table()` ignores text_wrap and places all tables in text flow
- "InFrontOfText" tables should be placed at absolute position based on v_offset and should not push body text

### Issue 2: Inline Images in Cells Placed Independently

- Parser removes extended control characters from text → no image placeholder
- `layout_horizontal_cell_text()` places text and controls independently
- Image X position determined by cell alignment basis (Center → cell center), ignoring text flow

## Implementation Plan

### Phase 1: "InFrontOfText" Table Vertical Position Handling

**File**: `src/renderer/layout.rs`

- Extract text_wrap from `table.attr` bits 21-23 in `layout_table()`
- When text_wrap == InFrontOfText:
  - Extract v_offset from `raw_ctrl_data[0..3]`
  - Calculate vertical position based on vert_rel_to (bits 3-4), vert_align (bits 5-7)
  - Determine `table_y` based on v_offset (instead of y_start)
- In call site (`build_render_tree`), prevent advancing y_offset from return value for "InFrontOfText" tables

### Phase 2: Add Inline Offset Parameter to `layout_composed_paragraph()`

**File**: `src/renderer/layout.rs`

- Add `first_line_x_offset: f64` parameter to signature
- When rendering first line (line_idx == start_line):
  - `available_width -= first_line_x_offset` (reduce available width)
  - `x_start += first_line_x_offset` (offset text start position)
- All 10 existing call sites pass `0.0` (no behavior change)

### Phase 3: Sequential Inline Image Placement in Cell Layout

**File**: `src/renderer/layout.rs`

Modify cell layout code at two locations (line ~2166, ~3062):

- Calculate total inline image width before text compose
- Pass inline offset when calling `layout_composed_paragraph`
- Track `inline_x` during control placement, use sequential X positions (reference textbox pattern)
- Non-inline controls maintain existing behavior

### Phase 4: Verification and Regression Testing

- request.hwp SVG export verification:
  - Table correctly positioned above body text
  - Inline images + text on same line in cells
- k-water-rfp.hwp regression test
- Worldcup_FIFA2010_32.hwp regression test
- Confirm all tests pass

## Files to Modify

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Table "InFrontOfText" vertical position + `layout_composed_paragraph()` signature + inline placement at 2 cell layout locations |

## Branch

`local/task109` (branched from devel)
