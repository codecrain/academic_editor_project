# Task 85 Execution Plan: Cell Merge/Split

## Goal

Implement cell range merge in F5 cell selection mode and single cell split functionality

## Current Status

- **WASM API**: `mergeTableCells`, `splitTableCell`, `getCellInfo` exist (wasm_api.rs)
- **TypeScript bridge**: Not connected
- **Commands**: `table:cell-merge`, `table:cell-split` stubs registered (table.ts)
- **F5 cell selection**: Working normally (Task 83 complete)
- **Context menu**: Working normally (Task 82 complete)

## Scope

1. **WASM bridge method additions**: `mergeTableCells()`, `splitTableCell()` TypeScript bridge
2. **InputHandler public method additions**: Cell selection range/context query, cell selection mode exit
3. **Command execute implementation**:
   - `table:cell-merge`: Merge cell selection range → document changed event
   - `table:cell-split`: Split merged cell → document changed event
4. **Shortcut binding**: M (merge), S (split) keys in cell selection mode

## Impact

- Medium (table structure change → re-render)
- No changes to existing behavior (new features only)

## Dependencies

- Task 83 (F5 cell selection mode) — complete
- Task 82 (context menu) — complete

## Verification

1. Vite build success
2. Web verification: F5 → select cell range → M (merge) works
3. Web verification: F5 on merged cell → S (split) works
4. Context menu merge/split works

## Notes

- After WASM rebuild, `node_modules/.vite` cache must be cleared
