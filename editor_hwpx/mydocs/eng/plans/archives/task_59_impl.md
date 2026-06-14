# Task 59: Intra-Row Page Splitting for Table Cells - Implementation Plan

## Phase 1: Data Structure Extension + Measurement Logic (~120 lines)

### height_measurer.rs

1. Add `MeasuredCell` struct (row, col, row_span, padding, line_heights, total_content_height, para_line_counts)
2. Add `cells: Vec<MeasuredCell>`, `page_break: TablePageBreak` fields to `MeasuredTable`
3. Collect per-cell line-level data in `measure_table()` when `CellBreak`
4. Helper methods: `remaining_content_for_row()`, `max_padding_for_row()`, `effective_row_height()`

### pagination.rs

5. Add `split_start_content_offset: f64`, `split_end_content_limit: f64` to `PageItem::PartialTable`
6. Add `0.0` default values to 4 existing PartialTable creation sites

## Phase 2: Pagination Intra-Row Splitting Logic (~80 lines)

### pagination.rs (lines 569-686)

1. Add `content_offset: f64` state variable
2. `CellBreak` branch: partial cell content placement when row doesn't fit
3. `r > cursor_row`: full rows + partial row placement
4. `r == cursor_row`: first row doesn't fit -> intra-row split
5. Continuation row effective height calculation
6. Maintain cursor_row after page flush

## Phase 3: Layout Split Row Cell Rendering (~90 lines)

### layout.rs

1. Pass new fields from `PartialTable` dispatch (line 323)
2. Extend `layout_partial_table()` signature
3. Override split row height
4. `compute_cell_line_range()` helper: content_offset/limit -> (start_line, end_line) per paragraph
5. Apply line range in cell rendering loop
6. Force top alignment for split rows

## Phase 4: Build Verification + Testing + Visual Confirmation

1. WASM build successful
2. Existing tests pass
3. 3 unit tests: intra_row_split, cell_break_disabled, multi_page_row
4. k-water-rfp.hwp SVG visual verification
