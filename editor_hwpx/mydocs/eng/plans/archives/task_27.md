# Task 27: Table Page Breaking - Execution Plan

## 1. Overview

Implement rendering of large tables that exceed the page body area height by **splitting at row boundaries** across multiple pages.

### Current Problem

- Currently tables are placed as a single `PageItem::Table` on one page
- If a table is larger than the page, it moves to the next page, but if the table itself is larger than the page, it **overflows beyond the page**
- Sample file `k-water-rfp.hwp` contains many large tables such as 21 rows x 7 cols (Table 6), 32 rows x 4 cols (Table 7), 28 rows x 13 cols (Table 15)
- Hancom Office automatically splits such tables at row boundaries

### Existing Infrastructure

| Item | Status | Description |
|------|--------|-------------|
| `TablePageBreak` enum | Parsed, unused | `None`, `CellBreak` values exist |
| `Table.repeat_header` | Parsed, unused | Whether to repeat header row |
| `MeasuredTable.row_heights` | Measured | Per-row heights (px) pre-calculated |
| `PageItem::Table` | Full table only | No partial table support |
| `layout_table()` | Full rendering | Cannot specify row range |

## 2. Goal

- Split tables exceeding page height at row boundaries and render across multiple pages
- When `repeat_header` is true, repeat the first row (header row) on continuation pages
- Maintain all existing 381 tests passing
- Large tables in `k-water-rfp.hwp` sample correctly split and rendered across multiple pages

## 3. Sample Analysis

`samples/k-water-rfp.hwp` (30 pages, 2 sections):
- All tables set to `page_break=None` (TablePageBreak::None)
- However, Hancom Office splits tables that exceed the page
- Meaning, even with `None`, forced splitting is needed when the table is larger than the page

## 4. Change Scope

| File | Changes |
|------|---------|
| `src/renderer/pagination.rs` | Add `PageItem::PartialTable`, row-level splitting logic |
| `src/renderer/layout.rs` | Add row range support to `layout_table()`, add `layout_partial_table()` |
| `src/renderer/height_measurer.rs` | Add cell_spacing info to `MeasuredTable` (if needed) |

## 5. Implementation Phases (3 Phases)

### Phase 1: PageItem::PartialTable and Pagination Splitting Logic
- Add `PageItem::PartialTable { para_index, control_index, start_row, end_row, is_continuation }`
- When table height exceeds remaining area in paginator, accumulate row heights to determine split point
- `repeat_header` support: consider header row height on continuation pages

### Phase 2: layout_table Row Range Rendering
- Add `start_row`, `end_row` parameters to `layout_table()` (or separate `layout_partial_table` function)
- Render only cells in the specified row range
- If `is_continuation`, render header row (row 0) first, then start_row~end_row below
- Handle merged cells (row_span) crossing range boundaries

### Phase 3: Testing and Verification
- Unit tests (pagination splitting, partial rendering)
- `k-water-rfp.hwp` SVG output verification
- WASM build confirmation
- Existing 381 tests pass

## 6. Risk Factors

- Complexity when merged cells (row_span > 1) cross split boundaries
- Determining conditions for forced splitting when table has `page_break=None`
- Header row with merged cells during `repeat_header`
