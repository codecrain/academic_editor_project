# Task 283 Plan: Nested Structure hitTest/Cursor Navigation Refinement

## Goal

In complex nested HWP documents (table>table, table>table>table, table>cell>text box):
1. hitTest accurately traces paths to the deepest (innermost) child element
2. Left→right cursor movement wraps from end of line to start of next line
3. F5 cell selection mode treats merged cells as single cells for arrow key navigation

## Test Files

- `samples/table-path-bug.hwp`: Table(5x3) > Cell > Inner table(3x3) + Inner table(5x5) + Inline Shape
- `samples/group-box.hwp`: Grouped objects (14 text boxes)

## Implementation Steps

### Step 1: hitTest Deepest Path Tracing (WASM + Rust)

**Symptom**: Clicking table>cell>inner table>cell places cursor in outer table cell, or causes error
**Cause**: hitTest does not recursively traverse into nested tables/text boxes

Modified files:
- `src/document_core/queries/cursor_rect.rs`: Recursive hitTest traversal
- `src/document_core/queries/rendering.rs`: Return nested control paths within cells

### Step 2: Cursor Left→Right Navigation (Line End → Next Line Start)

**Symptom**: Pressing right arrow key at line end within a cell stops the cursor
**Expected**: Cursor moves to the leftmost position of the next line at line boundary

Modified files:
- `rhwp-studio/src/engine/cursor.ts`: `moveHorizontal` line boundary handling
- `rhwp-studio/src/engine/input-handler-keyboard.ts`: Arrow key handler

### Step 3: F5 Cell Selection Mode Merged Cell Navigation

**Symptom**: Arrow key movement in F5 mode recognizes each row/column of merged cells as individual cells
**Expected**: Merged cells are treated as a single cell and skipped

Modified files:
- `rhwp-studio/src/engine/cursor.ts`: `moveCellSelection` merged cell skipping
- `src/wasm_api.rs`: Cell merge info query API (if needed)

## Verification Method

- Load `samples/table-path-bug.hwp`:
  - Click inner table cell → caret in correct cell
  - Left/right arrow keys in cell text → cross line boundaries
  - F5 → arrow keys → move in merged cell units
- Load `samples/group-box.hwp`:
  - Click text box → caret inside text box
- Existing E2E tests passing
