# Task 86 — Stage 2 Completion Report

## WASM API + Bridge + Shortcut Registration

### Changes

**`src/wasm_api.rs`**:
- Added `deleteTableRow(sec, ppi, ci, rowIdx)` WASM binding + native implementation
- Added `deleteTableColumn(sec, ppi, ci, colIdx)` WASM binding + native implementation

**`rhwp-studio/src/core/wasm-bridge.ts`**:
- Added `insertTableRow()` bridge method
- Added `insertTableColumn()` bridge method
- Added `deleteTableRow()` bridge method
- Added `deleteTableColumn()` bridge method

**`rhwp-studio/src/command/shortcut-map.ts`**:
- Registered `Alt+Insert` -> `table:insert-col-left`
- Registered `Alt+Delete` -> `table:delete-col`

### Verification
- WASM build: Succeeded
- Vite build: Succeeded
