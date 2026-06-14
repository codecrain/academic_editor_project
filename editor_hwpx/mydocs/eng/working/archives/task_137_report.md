# Task 137 Final Report — Table Keyboard/Mouse Movement + Grid Settings + Undo

## 1. Goal

1. **Move table with arrow keys in table object selection mode** (grid size units)
2. **Move table with mouse drag** (real-time tracking)
3. **Select table by clicking outside cells** (selectable from outside cell area)
4. **Grid settings dialog** (View menu → movement interval mm setting)
5. **treat_as_char (inline) table offset application** (h/v offset applied from inline position)
6. **Paragraph boundary movement** (table moves to adjacent paragraph when v_offset exceeds line height)
7. **Undo/Redo support** (keyboard movement merge + mouse drag batch recording)

## 2. Implementation Details

### Step 1: Rust — `moveTableOffset` WASM API
- Added `move_table_offset` public WASM method + `move_table_offset_native` native implementation to `wasm_api.rs`
- Applies delta to `raw_ctrl_data[0..4]` (v_offset), `[4..8]` (h_offset)
- treat_as_char tables: `while` loop for multi-paragraph boundary exchange (down: v_offset >= line_height, up: v_offset < 0)
- Return JSON includes `ppi`, `ci`: passes new position after paragraph exchange

### Step 2: Layout Engine — treat_as_char Offset Application
- `layout.rs` `layout_table()`: Applied h_offset/v_offset to treat_as_char tables
- Horizontal: inline x + h_offset, alignment-based x + h_offset
- Vertical: y_start + v_offset (including caption)

### Step 3: TypeScript — Keyboard/Mouse Movement
- `wasm-bridge.ts`: `moveTableOffset()` bridge method
- `cursor.ts`: `updateSelectedTableRef()` method added
- `input-handler.ts`:
  - Arrow key handler: `moveSelectedTable()` — grid size (mm→HWPUNIT) unit movement
  - Mouse drag: `updateMoveDrag()` / `finishMoveDrag()` — real-time movement
  - `gridStepMm` field + `setGridStep()` / `getGridStepMm()`

### Step 4: Table Outer Click Selection
- `findTableByOuterClick()`: When hitTest doesn't return a cell, checks adjacent paragraphs (+-2) for table outer proximity
- Added outer click branch to `onClick`: calls `enterTableObjectSelectionDirect()` when table found
- Shows move cursor during table object selection

### Step 5: Grid Settings Dialog
- `grid-settings-dialog.ts`: Inherits `ModalDialog`, number input (0.5~50mm, step 0.5)
- `view.ts`: Replaced existing disabled `view:grid` → active `view:grid-settings` command
- `index.html`: Menu item updated

### Step 6: Undo/Redo Support
- `command.ts`: Added `MoveTableCommand` class
  - `execute()`: Calls `moveTableOffset(delta)` (for redo)
  - `undo()`: Applies `moveTableOffset(-delta)` reverse direction (supports multi-paragraph boundary loop)
  - `mergeWith()`: Merges consecutive movements within 500ms
- Keyboard movement: Records `recordWithoutExecute()` per movement
- Mouse drag: Records one command with accumulated delta at `finishMoveDrag()`

## 3. Key Technical Decisions

### Paragraph Boundary Exchange Method
- **Problem**: When treat_as_char table reaches next line position via v_offset, document structure change needed
- **Solution**: `paragraphs.swap(ppi, ppi+-1)` — swaps positions of table paragraph and adjacent paragraph
- **Advantage**: Simpler and safer than control move (delete+insert)

### Multi-Boundary Loop for Undo
- **Problem**: Large reverse delta during mouse drag Undo must cross multiple paragraphs at once
- **Solution**: Changed `if` → `while` loop so single call can cross N paragraph boundaries
- **Verification**: Reverse order of forward swap sequence is naturally reproduced

### Keyboard Movement Merge (mergeWith)
- Consecutive arrow key inputs within 500ms merged into single MoveTableCommand
- Ctrl+Z restores entire consecutive movement at once

## 4. Changed Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/wasm_api.rs` | `moveTableOffset` API + treat_as_char paragraph boundary loop | +106 lines |
| `src/renderer/layout.rs` | treat_as_char table h/v offset application | +34 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | `moveTableOffset()` bridge | +5 lines |
| `rhwp-studio/src/engine/command.ts` | `MoveTableCommand` class | +53 lines |
| `rhwp-studio/src/engine/cursor.ts` | `updateSelectedTableRef()` | +6 lines |
| `rhwp-studio/src/engine/input-handler.ts` | Keyboard/mouse movement + outer click + Undo integration | +253 lines |
| `rhwp-studio/src/ui/grid-settings-dialog.ts` | New file — grid settings dialog | +49 lines |
| `rhwp-studio/src/command/commands/view.ts` | `view:grid-settings` command | +13 lines -13 lines |
| `rhwp-studio/index.html` | Menu item updated | 1 line |

Total 9 files, ~505 lines changed.

## 5. Verification Results

| Item | Result |
|------|--------|
| Existing 582 test regression | Passed |
| WASM build | Success |
| TypeScript compilation | Success |
| Arrow key table movement | Success — grid size units |
| Mouse drag table movement | Success — real-time tracking |
| Table outer click selection | Success — clicks outside cells also select |
| Grid settings dialog | Success — interval change applied |
| treat_as_char offset | Success — movement from inline position |
| Paragraph boundary movement | Success — paragraph exchange when line height exceeded |
| Undo/Redo (keyboard) | Success — consecutive movement merge + Ctrl+Z restore |
| Undo/Redo (mouse drag) | Success — drag batch Ctrl+Z restore |

## 6. Unresolved/Future Improvements

- **Proportional table resize**: Handle drag for overall table size change (currently only handle cursor shown, resize not implemented)
- **Non-treat_as_char table movement**: Detailed movement logic per absolute positioning table reference coordinates (page/paper/column)
- **Auto-restore table object selection after Undo**: Currently cursor moves to paragraph after Undo; table reselection is manual
