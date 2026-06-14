# Task 86 Execution Plan: Row/Column Add and Delete

## Goal

Implement adding rows/columns (above/below, left/right) and deleting them in tables

## Current Status

- **Rust model**: `Table::insert_row()`, `Table::insert_column()` implemented. Delete methods not implemented
- **WASM API**: `insertTableRow`, `insertTableColumn` implemented. Delete APIs not implemented
- **TypeScript bridge**: No row/column related bridge methods
- **Commands**: 6 stubs registered (table.ts)
  - `table:insert-row-above`, `table:insert-row-below`
  - `table:insert-col-left`, `table:insert-col-right`
  - `table:delete-row`, `table:delete-col`
- **Context menu**: Above 6 command items already placed (input-handler.ts)
- **Shortcuts**: `Alt+Insert` (add column), `Alt+Delete` (delete column) defined but not registered in shortcut-map

## Scope

1. **Rust model extension**: Add `Table::delete_row()`, `Table::delete_column()` methods
2. **WASM API addition**: Add `deleteTableRow`, `deleteTableColumn` bindings
3. **WASM bridge addition**: 4 methods (`insertTableRow`, `insertTableColumn`, `deleteTableRow`, `deleteTableColumn`)
4. **Command implementation**: 6 stubs → actual execute implementation
5. **Shortcut registration**: Register `Alt+Insert`, `Alt+Delete` in shortcut-map

## Impact

- Medium (table structure change → re-render)
- Rust model change → WASM rebuild required
- No changes to existing behavior (new features only)

## Dependencies

- Task 82 (context menu) — complete
- Task 85 (cell merge/split) — complete (merged area handling reference)

## Verification

1. Rust tests pass (existing tests + new delete-related tests)
2. WASM build success
3. Vite build success
4. Web verification: row/column add/delete from context menu works
5. Web verification: Alt+Insert / Alt+Delete shortcuts work

## Notes

- Row/column deletion with merged cells: rowSpan/colSpan spanning cells need span reduction
- Cannot delete last row/column (ensure minimum 1x1)
- After WASM rebuild, `node_modules/.vite` cache must be cleared
