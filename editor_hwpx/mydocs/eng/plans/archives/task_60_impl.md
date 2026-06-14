# Task 60: Table Cell Height Handling Improvement - Implementation Plan

## Phase 1: height_measurer.rs Modifications (~30 lines)

1. Add `styles: &ResolvedStyleSet` parameter to `measure_table()` signature
2. Pass `styles` argument at `measure_section()` call site
3. Phase 2 (line 253-276): Query spacing_before/after for each paragraph -> add to content_height, remove last_line_spacing subtraction
4. MeasuredCell (line 328-346): Fold spacing into line_heights (spacing_before on first line, spacing_after on last line), maintain last line line_spacing

## Phase 2: layout.rs Modifications (~50 lines)

1. `layout_table()` Phase 1-b: Add per-paragraph spacing_before/after, remove last_line_spacing subtraction
2. `layout_table()` vertical alignment height: Access para_shape_id via .zip(cell.paragraphs), add spacing
3. `layout_partial_table()` non-split cell height: Same fix
4. `layout_partial_table()` split cell height: Conditional spacing_before (start==0), spacing_after (end==total)
5. `compute_cell_line_ranges()`: Add styles parameter, fold spacing_before on first line, spacing_after on last line

## Phase 3: Build Verification + Testing + Visual Confirmation

1. Native build
2. Full test suite (existing 480 pass)
3. WASM build
4. k-water-rfp.hwp SVG visual verification: cell text overflow resolved
