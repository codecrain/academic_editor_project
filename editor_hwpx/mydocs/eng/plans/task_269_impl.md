# Task 269 Implementation Plan: Table Cell Selection Behavior

## Step 1: Cell Selection Phase Management (cursor.ts)

### Changed Files
- `rhwp-studio/src/engine/cursor.ts`

### Details
- Add `_cellSelectionPhase: number` field (1=single cell, 2=range, 3=all)
- `enterCellSelectionMode()`: Start at phase=1 (preserve existing behavior)
- `advanceCellSelectionPhase()`: New method
  - phase 1→2: Fix anchor, switch to range selection mode
  - phase 2→3: anchor=(0,0), focus=(maxRow-1, maxCol-1) select all
- `exitCellSelectionMode()`: Reset phase
- `getCellSelectionPhase(): number` getter

## Step 2: F5 + Arrow Key Keyboard Handling (input-handler-keyboard.ts)

### Changed Files
- `rhwp-studio/src/engine/input-handler-keyboard.ts`

### Details
- Modified F5 handling:
  ```
  if (already in cell selection mode) {
    cursor.advanceCellSelectionPhase();
    updateCellSelection();
  } else {
    cursor.enterCellSelectionMode();
  }
  ```
- Arrow key branching in cell selection mode:
  - phase 1: `moveCellSelection(dr, dc)` (existing: single cell move)
  - phase 2: `expandCellSelection(dr, dc)` (anchor fixed, focus expands)
  - phase 3 + Ctrl: `resizeTable(axis, delta)` call

## Step 3: Range Expansion + Select All (cursor.ts)

### Changed Files
- `rhwp-studio/src/engine/cursor.ts`

### Details
- `expandCellSelection(deltaRow, deltaCol)`: Keep anchor, move focus only
  - `cellFocus.row += deltaRow`, `cellFocus.col += deltaCol` (clamped)
- `selectAllCells()`: anchor=(0,0), focus=(rowCount-1, colCount-1)

## Step 4: Table Proportional Resize

### Changed Files
- `src/document_core/commands/table_ops.rs` (Rust)
- `src/wasm_api.rs` (WASM binding)
- `rhwp-studio/src/core/wasm-bridge.ts` (TS bridge)
- `rhwp-studio/src/engine/input-handler-keyboard.ts` (key handling)

### Details
- Rust API: `resize_table_proportional_native(sec, para, ci, axis, delta_hu)`
  - axis=0: proportional column width adjustment, axis=1: proportional row height adjustment
  - delta_hu: adjustment value in HWPUNIT
  - Adjusts all columns/rows by the same ratio
- Ctrl+Left/Right: Proportional column width adjustment (delta = +/-200 HU)
- Ctrl+Up/Down: Proportional row height adjustment (delta = +/-200 HU)

## Step 5: Cell Selection Rendering Update

### Changed Files
- `rhwp-studio/src/engine/cell-selection-renderer.ts`

### Details
- Highlight entire table area when in phase 3 (select all)
- Existing range selection highlight logic used identically for phases 1 and 2

## Test Scenarios

1. F5 in a table cell → Select current cell (phase 1)
2. F5 again → Range selection mode (phase 2), expand range with arrow keys
3. F5 again → Select all (phase 3), all cells highlighted
4. Ctrl+Right → Increase all column widths
5. Ctrl+Down → Increase all row heights
6. Escape → Exit cell selection mode
