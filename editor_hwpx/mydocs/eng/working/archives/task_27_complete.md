# Task 27: Table Page Break — Completion Report

## Summary

Implemented row-level splitting of tables exceeding the page body area, rendering them across multiple pages.

### Implementation Results

| Item | Result |
|------|--------|
| Tests | 384 passed (381 existing + 3 new) |
| WASM build | Successful |
| SVG output | k-water-rfp.hwp pages 5-6 table split confirmed |

### Changed Files

| File | Changes |
|------|---------|
| `src/renderer/pagination.rs` | Added `PageItem::PartialTable`, row-level split logic, 3 tests |
| `src/renderer/layout.rs` | Added `layout_partial_table()` function, PartialTable rendering branch |
| `src/renderer/height_measurer.rs` | Added `cell_spacing`, `repeat_header` fields to `MeasuredTable`, added `get_measured_table()` method |

### Core Algorithm

1. **Pagination Split** (`pagination.rs`):
   - When table height exceeds remaining page area, uses `MeasuredTable.row_heights` cumulative heights to determine split point
   - Places `PageItem::PartialTable { start_row, end_row, is_continuation }` on each page
   - For tables with `repeat_header=true`, deducts header row (row 0) height from available area on continuation pages

2. **Partial Table Rendering** (`layout.rs`):
   - `layout_partial_table()`: Calculates full column widths/row heights then renders only specified row range
   - `is_continuation && repeat_header` → renders header row first then body rows
   - Merged cells (row_span): Sums heights only for rows within render range
   - row_span cells crossing page boundary: Renders at first render_row within span range even when start row is not in render_rows

### Verification Results (k-water-rfp.hwp)

**Before change:**
- Page 5: Text only (table pushed to page 6)
- Page 6: Entire table (y=113→1166, exceeds page height 1122 overflow)

**After change:**
- Page 5: Text + table start (header+row1+row2, y=309→633 within page)
- Page 6: Header repeat + row3 (y=113→883 within page) + following text

### Bug Fix

- **row_span cell border missing**: In continuation pages, "Proposal" cell (row=2, col=0, row_span=2) left border was not rendered
  - Cause: In `render_rows = [0, 3]`, exact match for `cell_row=2` returned None → continue
  - Fix: Added `or_else()` fallback to search for first render_row within cell span range

### New Tests

- `test_table_page_split`: Verifies large table is split into PartialTable
- `test_table_fits_single_page`: Verifies small table is placed as Table
- `test_table_split_with_repeat_header`: Verifies is_continuation for repeat_header table
