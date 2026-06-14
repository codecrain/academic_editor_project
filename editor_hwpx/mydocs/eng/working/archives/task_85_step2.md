# Task 85 — Stage 2 Completion Report

## Command execute + Shortcut Implementation

### Changes

**`rhwp-studio/src/command/commands/table.ts`**:
- `table:cell-merge` stub -> actual implementation
  - `canExecute`: `ctx.inCellSelectionMode`
  - `execute`: Query cell range -> `mergeTableCells()` -> exit cell selection mode -> `document-changed`
- `table:cell-split` stub -> actual implementation
  - `canExecute`: `inTable`
  - `execute`: `getCellInfo()` -> verify rowSpan/colSpan > 1 -> `splitTableCell()` -> `document-changed`

**`rhwp-studio/src/engine/input-handler.ts`**:
- Added M/S keys to cell selection mode key handling block
  - `M` key: Dispatches `table:cell-merge`
  - `S` key: Dispatches `table:cell-split`

### Verification
- Vite build: Succeeded
