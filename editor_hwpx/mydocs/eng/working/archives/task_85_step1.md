# Task 85 — Stage 1 Completion Report

## WASM Bridge + InputHandler Method Addition

### Changes

**`rhwp-studio/src/core/wasm-bridge.ts`**:
- `mergeTableCells(sec, ppi, ci, startRow, startCol, endRow, endCol)` -> `{ok, cellCount}`
- `splitTableCell(sec, ppi, ci, row, col)` -> `{ok, cellCount}`

**`rhwp-studio/src/engine/input-handler.ts`**:
- `getSelectedCellRange()` -> delegated to cursor, returns cell selection range
- `getCellTableContext()` -> delegated to cursor, returns table context
- `exitCellSelectionMode()` -> exits cell selection mode + clears renderer + updates caret

### Verification
- Vite build: Succeeded
