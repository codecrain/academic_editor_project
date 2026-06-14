# Task 102 — Step 4 Completion Report

## Step Name
Page Split Optimization + Section-Level Dirty Caching

## Work Period
2026-02-17

## Change Details

### Sub-step 4-1: Section-Level Dirty Caching (`src/wasm_api.rs`)
- Added `dirty_sections: Vec<bool>` field (whether re-pagination is needed per section)
- `recompose_section(section_idx)` helper method: Combines section recomposition + dirty marking into a single call
- Mechanically replaced direct `compose_section()` calls in 27 editing functions with `recompose_section()` delegation
- Added `mark_all_sections_dirty()` at 3 full recomposition points
- `paginate()` refactoring: Skips sections where `dirty_sections[idx] == false` to prevent reprocessing unedited sections

### Sub-step 4-2: Prefix Sum + Binary Search (`src/renderer/height_measurer.rs`, `src/renderer/pagination.rs`)
- Added `cumulative_heights: Vec<f64>` field to `MeasuredTable`
  - `cumulative_heights[0] = 0`, `cumulative_heights[i+1] = cumulative_heights[i] + row_heights[i] + cs`
- `find_break_row(avail, cursor_row, effective_first_row_h)`: O(log R) binary search to determine row split point
  - Uses `partition_point()` to find maximum row index fitting available height in cumulative array
- `range_height(start_row, end_row)`: O(1) row range height lookup
  - `cumulative_heights[end] - cumulative_heights[start]` + cell_spacing adjustment
- Row split loop in `pagination.rs`: Replaced existing O(R) linear scan → `find_break_row()` O(log R) binary search
- `partial_height` calculation: Replaced existing O(R) `sum()` → `range_height()` O(1)
- Made `paginate_with_measured()` public (called directly from incremental measurement pipeline)
- Added 8 unit tests: cumulative_heights consistency, find_break_row (5 scenarios), range_height

### Sub-step 4-3: Table Dirty Flag + Measurement Cache (`src/model/table.rs`, `src/renderer/height_measurer.rs`, `src/wasm_api.rs`)
- Added `dirty: bool` field to `Table` (Default: false)
- Marked `table.dirty = true` in 8 table editing functions:
  - Structure changes: `insert_table_row`, `insert_table_column`, `delete_table_row`, `delete_table_column`, `merge_table_cells`, `split_table_cell`
  - Cell content changes: `insert_text_in_cell`, `delete_text_in_cell` (marks parent table dirty)
- `measure_section_incremental()`: References previous MeasuredSection, re-measures only dirty tables, reuses non-dirty tables via clone
- Added `measured_sections: Vec<MeasuredSection>` cache field to `HwpDocument`
- `paginate()` incremental measurement pipeline:
  - dirty section + existing measurement → uses `measure_section_incremental()`
  - dirty section + first measurement → uses `measure_section()`
  - clean section → skipped
  - Resets all table dirty flags after measurement completes

## Test Results
- 564 tests passed (existing 556 + height_measurer unit tests 8)
- WASM build success
- Vite build success

## Modified Files
| File | Changes |
|------|---------|
| `src/model/table.rs` | Added `dirty: bool` field |
| `src/renderer/height_measurer.rs` | `cumulative_heights` field, `find_break_row()`, `range_height()`, `measure_section_incremental()`, 8 unit tests |
| `src/renderer/pagination.rs` | Row split binary search O(log R), partial_height O(1), made `paginate_with_measured()` public |
| `src/wasm_api.rs` | `dirty_sections`/`measured_sections` fields, `recompose_section()` helper, `paginate()` incremental measurement pipeline, dirty marking at 27+8 editing function locations |

## Performance Improvement Effects

| Operation | Before | After |
|-----------|--------|-------|
| Post-edit pagination | O(S x P x T) all sections reprocessed | O(P x T) edited section only |
| Row split point determination | O(R) linear scan | O(log R) binary search |
| Row range height lookup | O(R) summation | O(1) cumulative array difference |
| Table measurement | Always full re-measurement | Only dirty tables re-measured |

## Next Step
Step 5: Incremental reflow (comemo memoization, edit-range-limited recomposition)
