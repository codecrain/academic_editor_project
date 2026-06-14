# Task 102 — Step 1 Completion Report

## Step Name
Dense Grid Index + MeasuredTable Passing

## Work Period
2026-02-17

## Change Details

### 1. Added cell_grid 2D Index to Table
- `src/model/table.rs`: Added `cell_grid: Vec<Option<usize>>` field
- Auto-initialized as empty Vec with `#[derive(Default)]`
- No impact on HWP serialization (parsing/saving) — runtime-only index

### 2. Grid API Implementation
- `rebuild_grid()`: Rebuilds 2D grid index from cell list. Entire span area of merged cells points to anchor cell index
- `cell_index_at(row, col) -> Option<usize>`: O(1) cell index lookup
- `cell_at(row, col) -> Option<&Cell>`: O(1) immutable cell access
- `cell_at_mut(row, col) -> Option<&mut Cell>`: O(1) mutable cell access

### 3. Added rebuild_grid() Calls to Edit APIs
- `insert_row()`, `insert_column()`, `delete_row()`, `delete_column()`, `merge_cells()`, `split_cell()` — added `self.rebuild_grid()` call at end of all 6 methods

### 4. Called rebuild_grid() from Parsers
- `src/parser/control.rs`: HWP binary parser — called just before table parsing completion
- `src/parser/hwpx/section.rs`: HWPX XML parser — called just before table parsing completion
- `src/wasm_api.rs`: Table creation API (`insert_table`) — called after table construction

### 5. Switched find_cell_at_row_col → cell_index_at
- `src/wasm_api.rs:3293`: O(n) linear search `find_cell_at_row_col()` → O(1) `table.cell_index_at()` switch
- Deleted `find_cell_at_row_col()` function

### 6. Built MeasuredTable Passing Pipeline
- `src/renderer/pagination.rs`: Extended `paginate()` return type from `PaginationResult` → `(PaginationResult, MeasuredSection)` tuple
- `src/wasm_api.rs`: Added `measured_tables: Vec<Vec<MeasuredTable>>` field to HwpDocument. Preserves per-section table measurement data after paginate()
- `src/renderer/layout.rs`: Added `measured_table: Option<&MeasuredTable>` to `layout_table()` signature. Uses MeasuredTable.row_heights directly for body table rendering; master page/header/footer use None (existing calculation fallback)
- Added `measured_tables: &[MeasuredTable]` to `build_render_tree()` signature

### 7. Tests
- 7 new tests added:
  - `test_rebuild_grid_basic`, `test_rebuild_grid_merged`
  - `test_cell_at_basic`, `test_cell_at_out_of_bounds`, `test_cell_at_merged_span`
  - `test_cell_index_at_basic`, `test_edit_ops_rebuild_grid`

## Test Results
- 554 tests passed (existing 547 + new 7)
- WASM build success
- Vite build success

## Modified Files
| File | Changes |
|------|---------|
| `src/model/table.rs` | +165 lines (cell_grid, API, tests) |
| `src/parser/control.rs` | +1 line |
| `src/parser/hwpx/section.rs` | +1 line |
| `src/renderer/layout.rs` | +29 lines, -2 lines |
| `src/renderer/pagination.rs` | +13 lines, -18 lines |
| `src/wasm_api.rs` | +18 lines, -13 lines |
