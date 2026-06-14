# Task 77 Final Report: Image Handling in Table Cells at Page Bottom

## Summary

Resolved an issue in `samples/20250130-hongbo.hwp` where table 6 (paragraph 30, 4 rows x 1 column) spans a page break, and an image-only cell (row 2) was intra-row split, causing the image to be completely missing. Prohibited intra-row splitting of image cell rows, moving the entire row to the next page.

## Root Cause

1. An image-only cell's paragraph is composed as a single "line" (373.7px) of image size in `compose_paragraph()`
2. During pagination, intra-row split applies `split_end_content_limit=338.8`
3. `compute_cell_line_ranges()` returns line range `(0, 0)` since 373.7 > 338.8
4. `layout_partial_table()` skips when `start_line >= end_line` -> `continue` -> image control also skipped

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/height_measurer.rs` | Added `MeasuredTable::is_row_splittable()` method. Determines row as non-splittable if all cells have a single line (<=1) |
| `src/renderer/pagination.rs` | Added `mt.is_row_splittable(r)` check to intra-row split conditions (2 locations) |
| `src/wasm_api.rs` | Added 1 regression test (`test_task77_image_cell_no_intra_row_split`) |

## Key Fixes

| Item | Before | After |
|------|--------|-------|
| First row overflow split condition (line 740) | `if can_intra_split` | `if can_intra_split && mt.is_row_splittable(r)` |
| Middle row partial placement condition (line 758) | `if can_intra_split` | `if can_intra_split && mt.is_row_splittable(r)` |
| Pagination result | rows=0..3 (split_end=338.8) | rows=0..2 (no split) |

## Verification Results

- 492 Rust tests passed (existing 491 + 1 new)
- SVG export: 20250130-hongbo.hwp normal
- WASM build succeeded
- Vite build succeeded
- Web browser rendering confirmed normal
