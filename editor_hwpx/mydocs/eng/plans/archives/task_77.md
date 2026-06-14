# Task 77 Execution Plan: Image Handling in Table Cells at Page Bottom

## Background

In `samples/20250130-hongbo.hwp`, table 6 (paragraph 30, 4 rows x 1 col) does not correctly render images in cells when the table spans pages.

### Document Structure

```
Table 6 [Section 0:Paragraph 30]: 4 rows x 1 col, 4 cells, cell_spacing=0
  Cell[0]: row=0, cell.height=22839(304.5px) → Image 3 (bin_data_id=6)
  Cell[1]: row=1, cell.height=3860(51.5px) → text only
  Cell[2]: row=2, cell.height=22839(304.5px) → Image 4 (bin_data_id=1)
  Cell[3]: row=3, cell.height=3860(51.5px) → text only
```

### Measurement Data (MeasuredTable)

```
row_heights: [379.4, 149.4, 377.5, 52.3]
MeasuredCell:
  row=0: total_content_h=375.7, line_heights=[375.7]  <- image measured as single "line"
  row=1: total_content_h=145.6, line_heights=[24.3, 24.3, 24.3, 24.3, 24.3, 24.3]
  row=2: total_content_h=373.7, line_heights=[373.7]  <- image measured as single "line"
  row=3: total_content_h=48.5, line_heights=[24.3, 24.3]
```

### Current Pagination Result

```
PAGE 2: Table(27) + Para(28) + Para(29) + PartialTable(30, rows=0..3, split_end=338.8)
  body_area: y=94.5, height=933.6 (y_max=1028.1)
PAGE 3: PartialTable(30, rows=2..4, split_start=338.8) + Para(31)
```

### Current Rendering

| Page | Expected | Actual |
|------|----------|--------|
| PAGE 2 | Cell 0 (Image 3) + Cell 1 (text) | Only Cell 0 (Image 3) rendered, Cell 2 empty space |
| PAGE 3 | Cell 2 (Image 4, full) + Cell 3 (text) | Cell 2 (Image 4) rendered |

### Root Cause

1. Image-only cell paragraphs are composed as a single "line" (373.7px) by `compose_paragraph()`
2. During intra-row splitting, `split_end_content_limit=338.8` is applied
3. `compute_cell_line_ranges()` returns line range `(0, 0)` since 373.7 > 338.8
4. `layout_partial_table()` has `start_line >= end_line` → `continue` → **paragraph's image controls are also skipped**
5. Text cells can be split by line, but image cells are unsplittable as a single line → image completely missing

### HWP Behavior Principle

- When cell text exceeds page boundary → render cell independently on next page (intra-row split)
- When cell contains only images → images cannot be cropped, so **move entire row to next page**

## Goal

For tables spanning pages (PartialTable), when a row contains only image cells, prevent intra-row splitting and move the entire row to the next page so images render completely without cropping.

## Scope

1. **Pagination**: When all cells in a row are single-line (image), prohibit intra-row split → move entire row to next page
2. Expected result: PAGE 2 = rows 0..2 (Cell 0 image + Cell 1 text), PAGE 3 = rows 2..4 (Cell 2 full image + Cell 3 text)
3. Add regression tests and verify
