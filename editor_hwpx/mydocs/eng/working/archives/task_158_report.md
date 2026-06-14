# Task 158 Completion Report: Text Box Vertical Writing (Step 1)

## Work Summary

Implemented text box vertical writing rendering. Adapted from table cell vertical writing logic for text boxes, and improved table cell vertical writing to line_seg-based column layout.

## Key Implementation

### 1. Text Box Vertical Writing Detection (`shape_layout.rs`)
- Extracted text_direction from `text_box.list_attr & 0x07` (bits 0-2)
- Table cells use bits 16-18, but text box LIST_HEADER uses bits 0-2
- text_direction: 0=horizontal, 1=Latin rotated, 2=Latin upright

### 2. `layout_vertical_textbox_text()` Function (shape_layout.rs, ~247 lines)
- Adapted from table cell's `layout_vertical_cell_text()` for text boxes
- Per-column character placement: text top→bottom, columns right→left
- CJK/Latin character rotation handling
- Column overflow moves to next column
- Vertical alignment support (Top→right, Center→center, Bottom→left)

### 3. Table Cell Vertical Writing Improvement (`table_cell_content.rs`)
- Before: Column width based on font size
- After: line_seg structure-based column mapping
  - `line_seg.line_height` → col_width
  - `line_seg.line_spacing` → col_spacing
- Introduced `ColumnInfo` struct: col_width, col_spacing, total_height, alignment
- Per-paragraph alignment reflected

## Test Results
- 608 tests all passed
- No regression
