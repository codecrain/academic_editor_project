# Task 86 Implementation Plan: Row/Column Add and Delete

## Implementation Steps (4 steps)

### Step 1: Rust Model — Implement delete_row / delete_column + Tests

**Modified file**: `src/model/table.rs`

1. Add `Table::delete_row(row_idx: u16)` method:
   - Validate `row_idx` range, ensure minimum 1 row (error if row_count == 1)
   - Remove cells in target row (`cell.row == row_idx && cell.row_span == 1`)
   - Merged cells spanning deleted row: `row_span -= 1`
   - Cells below deleted row: `cell.row -= 1`
   - `row_count -= 1`, `rebuild_row_sizes()`, sort, `update_ctrl_dimensions()`

2. Add `Table::delete_column(col_idx: u16)` method:
   - Validate `col_idx` range, ensure minimum 1 column (error if col_count == 1)
   - Remove cells in target column (`cell.col == col_idx && cell.col_span == 1`)
   - Merged cells spanning deleted column: `col_span -= 1`, reduce `width`
   - Cells right of deleted column: `cell.col -= 1`
   - `col_count -= 1`, `rebuild_row_sizes()`, sort, `update_ctrl_dimensions()`

3. Add unit tests (reference existing insert_row/insert_column test patterns)

**Completion criteria**: `docker compose run --rm test` all pass

---

### Step 2: WASM API + Bridge + Shortcut Registration

**Modified files**: `src/wasm_api.rs`, `rhwp-studio/src/core/wasm-bridge.ts`, `rhwp-studio/src/command/shortcut-map.ts`

1. Add 2 methods to `wasm_api.rs`:
   - `deleteTableRow(sec, ppi, ci, rowIdx)` → `delete_table_row_native()` call
   - `deleteTableColumn(sec, ppi, ci, colIdx)` → `delete_table_column_native()` call
   - Return: `{"ok":true,"rowCount":<N>,"colCount":<M>}`

2. Add 4 methods to `wasm-bridge.ts`:
   - `insertTableRow(sec, ppi, ci, rowIdx, below)` → `{ok, rowCount, colCount}`
   - `insertTableColumn(sec, ppi, ci, colIdx, right)` → `{ok, rowCount, colCount}`
   - `deleteTableRow(sec, ppi, ci, rowIdx)` → `{ok, rowCount, colCount}`
   - `deleteTableColumn(sec, ppi, ci, colIdx)` → `{ok, rowCount, colCount}`

3. Register 2 shortcuts in `shortcut-map.ts`:
   - `Alt+Insert` → `table:insert-col-left`
   - `Alt+Delete` → `table:delete-col`

**Completion criteria**: WASM build success, Vite build success

---

### Step 3: Command execute Implementation

**Modified file**: `rhwp-studio/src/command/commands/table.ts`

Replace 6 stubs with actual implementations:

1. `table:insert-row-above`:
   - `getCellInfo()` → `insertTableRow(sec, ppi, ci, row, false)` → `document-changed`

2. `table:insert-row-below`:
   - `getCellInfo()` → `insertTableRow(sec, ppi, ci, row, true)` → `document-changed`

3. `table:insert-col-left`:
   - `getCellInfo()` → `insertTableColumn(sec, ppi, ci, col, false)` → `document-changed`

4. `table:insert-col-right`:
   - `getCellInfo()` → `insertTableColumn(sec, ppi, ci, col, true)` → `document-changed`

5. `table:delete-row`:
   - `getCellInfo()` → `deleteTableRow(sec, ppi, ci, row)` → `document-changed`

6. `table:delete-col`:
   - `getCellInfo()` → `deleteTableColumn(sec, ppi, ci, col)` → `document-changed`

Common pattern: cursor position → query cellInfo → WASM call → document-changed event

**Completion criteria**: Vite build success

---

### Step 4: Build Verification + Web Testing

1. WASM build + Vite cache clear + final Vite build confirmation
2. Web verification:
   - Add rows above/below from context menu
   - Add columns left/right from context menu
   - Delete rows/columns from context menu
   - Alt+Insert / Alt+Delete shortcut works
   - Merged cell row/column deletion handled correctly

**Completion criteria**: Full build success, row/column add/delete behavior confirmed
