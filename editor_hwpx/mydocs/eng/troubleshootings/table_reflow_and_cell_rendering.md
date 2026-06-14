# Table Page Split Rendering and In-Cell Rendering Fixes

## Date
2026-02-17

## Symptoms

### 1. Empty Cells / Duplicate Text During Intra-Row Table Splitting
- In `samples/k-water-rfp.hwp` pages 015-016, when a table row is split across two pages:
  - Page 015: Last row appears as an empty cell (border only, no text)
  - Page 016: Content already rendered on the previous page is duplicated

### 2. Line Spacing Not Applied Inside Cells
- In cells with font size 11pt and 150% line spacing, line spacing was not applied
- Some tables were unaffected (the problem only occurred in multi-paragraph cells)

### 3. Inline Image Position Error Inside Cells
- `samples/table-miss.hwp`: In a cell with [text][enter][image] structure, the image appeared at the bottom of the cell instead of directly below the text
- Approximately 166px gap between text (y=148.8) and image (y=314.6)

### 4. Excessive Height in 1x1 Wrapper Tables
- `samples/k-water-rfp.hwp` page 020: Structure of 1x1 outer table > 3x2 inner table
- In the HWP program, only one 3x2 table is shown, but the outer table's stored cell.height (844.7px) is much larger than the inner table's actual height (410.6px), consuming unnecessary space

## Root Cause Analysis

### 1. Intra-Row Splitting

Missing `min_first_line_height_for_row()` check caused row splitting attempts when not even a single line would fit.

- Page 015: split_end_content_limit=15.7px < minimum line height (~20px) -> 0 lines included -> empty cell
- Page 016: `line_ranges = None` renders all lines -> content from previous page duplicated

### 2. Line Spacing

Line spacing exclusion condition in `layout_composed_paragraph`:
```rust
// Before (incorrect): Exclude line spacing for the last line of every paragraph
if line_idx + 1 < end || cell_ctx.is_none() {
    y += line_height + line_spacing;
} else {
    y += line_height;  // Line spacing excluded
}
```
- When a cell has multiple paragraphs, line spacing was excluded for the last line of each paragraph
- In reality, it should only be excluded for the last line of the last paragraph in the cell

### 3. Inline Image

Inline image (treat_as_char) paragraph structure inside a cell:
- The paragraph's LineSeg.line_height already includes the image height
- When `layout_composed_paragraph` is called, para_y advances by the image height
- Then the control loop places the image at the advanced para_y -> image height double-counted

```
para_y = 148.8 (before compose)
| layout_composed_paragraph -> para_y = 314.6 (includes 166px image height)
| Control loop places image -> y = 314.6 (wrong, should be 148.8)
```

### 4. 1x1 Wrapper Table

HWP files sometimes use a 1x1 wrapper table containing another table.
The HWP spec's table attributes (attr) have no wrapper identification flag (only bits 0-1: page break, bit 2: header row repeat are defined).
The outer cell's height is stored at the original table height, causing excessive space.

## Fixes

### 1. Intra-Row Splitting (commit eae33ad)

- `height_measurer.rs`: Added `min_first_line_height_for_row()` method -- calculates minimum first line height for a row
- `pagination.rs`: Added `avail_content >= min_first_line` check before splitting
- `layout.rs`: Re-enabled `compute_cell_line_ranges()` for accurate line range calculation in split rows
- `render_tree.rs`: Added `TableCellNode.clip: bool` field
- `svg.rs`, `web_canvas.rs`: Applied clipping for split row cells

### 2. Line Spacing (commit 477b882)

- Added `is_last_cell_para: bool` parameter to `layout_composed_paragraph` (11 call sites updated)
- Changed line spacing exclusion condition:
```rust
let is_cell_last_line = is_last_cell_para && line_idx + 1 >= end;
if !is_cell_last_line || cell_ctx.is_none() {
    y += line_height + line_spacing;
}
```
- Same logic applied to 3 cell height calculation locations

### 3. Inline Image (commit 477b882)

- Preserved para_y before compose in the cell loop of `layout_table`, `layout_partial_table`:
```rust
let para_y_before_compose = para_y;
// ... layout_composed_paragraph(para_y) -> para_y advances ...
// Control loop:
let pic_y = if pic.common.treat_as_char {
    para_y_before_compose  // Use pre-compose position
} else {
    para_y
};
```
- Inline images don't need additional para_y advancement since LineSeg already includes the height

### 4. 1x1 Wrapper Table (current work)

- Added wrapper detection logic at the start of `layout_table()`:
```rust
if table.row_count == 1 && table.col_count == 1 && table.cells.len() == 1 {
    // If cell has no visible text and only a Control::Table, delegate to inner table
    return self.layout_table(tree, col_node, nested, ...);
}
```
- Same detection logic applied to `measure_table_impl()` (pagination height accuracy)
- Outer table's TableNode, cell background, and borders are all skipped

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Line spacing, inline image, 1x1 wrapper detection |
| `src/renderer/height_measurer.rs` | min_first_line, 1x1 wrapper detection |
| `src/renderer/pagination.rs` | Split row minimum height check |
| `src/renderer/render_tree.rs` | TableCellNode.clip field |
| `src/renderer/svg.rs` | Cell clipping SVG |
| `src/renderer/web_canvas.rs` | Cell clipping Canvas |

## Verification

- 565 tests passing
- k-water-rfp.hwp: 30 -> 29 pages (outer table excessive height resolved)
- Pages 015-017: Split table empty cells and duplicate text resolved
- Page 020: 1x1 wrapper removed, only 3x2 inner table rendered
- table-miss.hwp: Image placed directly below text
