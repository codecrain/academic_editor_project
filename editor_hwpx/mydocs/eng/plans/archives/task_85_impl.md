# Task 85 Implementation Plan: Cell Merge/Split

## Implementation Steps (3 steps)

### Step 1: WASM Bridge + InputHandler Methods

**Modified files**: `rhwp-studio/src/core/wasm-bridge.ts`, `rhwp-studio/src/engine/input-handler.ts`

1. Add 2 methods to `wasm-bridge.ts`:
   - `mergeTableCells(sec, ppi, ci, startRow, startCol, endRow, endCol)` → `{ok, cellCount}`
   - `splitTableCell(sec, ppi, ci, row, col)` → `{ok, cellCount}`

2. Add 3 public methods to `input-handler.ts`:
   - `getSelectedCellRange()` → cell selection range (delegate to cursor)
   - `getCellTableContext()` → table context (delegate to cursor)
   - `exitCellSelectionMode()` → exit cell selection mode + clear renderer + update caret

**Completion criteria**: Vite build success

---

### Step 2: Command execute + Shortcut Implementation

**Modified files**: `rhwp-studio/src/command/commands/table.ts`, `rhwp-studio/src/engine/input-handler.ts`

1. `table:cell-merge` stub → actual implementation:
   - `canExecute`: `ctx.inCellSelectionMode`
   - `execute`: query cell range → `wasm.mergeTableCells()` call → exit cell selection mode → `document-changed`

2. `table:cell-split` stub → actual implementation:
   - `canExecute`: `inTable`
   - `execute`: `wasm.getCellInfo()` → verify rowSpan/colSpan > 1 → `wasm.splitTableCell()` call → `document-changed`

3. Add to cell selection mode key handling block in `input-handler.ts`:
   - `M` key: dispatch `table:cell-merge`
   - `S` key: dispatch `table:cell-split`

**Completion criteria**: Vite build success

---

### Step 3: Build Verification + Web Testing

1. WASM build confirmation (no Rust code changes so rebuild not needed, only clear Vite cache)
2. Final Vite build confirmation
3. Web verification:
   - F5 → select cell range → M (merge) works
   - F5 on merged cell → S (split) works
   - Context menu merge/split works

**Completion criteria**: Full build success, merge/split behavior confirmed
