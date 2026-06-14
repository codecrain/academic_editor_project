# Task 269 Plan: Table Cell Selection Behavior

## Hancom Behavior

| F5 Count | Behavior | Arrow Keys |
|---------|------|--------|
| 1x | Select current cell | Arrow keys move cell (single cell) |
| 2x | Cell range selection mode | Arrow keys expand range (anchor fixed) |
| 3x | Select all cells | Ctrl+Arrow for proportional table resize |

## Current State

- F5 1x: Done (enterCellSelectionMode)
- F5 2x+: Not implemented (ignored when already in cell selection mode)

## Implementation Plan

### Step 1: Cell Selection Phase Management
- Add `cellSelectionPhase: 1 | 2 | 3` field (cursor.ts)
- Phase increments on repeated F5: 1→2→3
- phase 1: Single cell (current behavior)
- phase 2: Range selection (anchor fixed, arrow keys expand focus)
- phase 3: Select all cells

### Step 2: Keyboard Handler Modification
- phase 2 arrow keys: `expandCellSelection` (anchor fixed)
- phase 3 Ctrl+arrow keys: `resizeTable` API call
- Escape: Exit cell selection mode

### Step 3: Select All Cells UI
- On phase 3 entry: anchor=(0,0), focus=(maxRow, maxCol)
- Highlight rendering for all cells

### Step 4: Table Proportional Resize
- Ctrl+Up/Down: Proportional row height adjustment
- Ctrl+Left/Right: Proportional column width adjustment
- WASM API: resizeTableProportional(sec, para, ci, axis, delta)

## Reference Files

| File | Role |
|------|------|
| rhwp-studio/src/engine/cursor.ts | cellSelectionPhase state |
| rhwp-studio/src/engine/input-handler-keyboard.ts | F5 + arrow key handling |
| rhwp-studio/src/engine/cell-selection-renderer.ts | Selection highlighting |
