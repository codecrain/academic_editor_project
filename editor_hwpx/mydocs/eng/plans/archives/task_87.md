# Task 87 — Execution Plan

## Table Object Selection + Visual Feedback

### Goal
Select a table as a single object, display outline + resize handles on selection, resize by dragging handles, and delete table with Delete key

### Current Status
- Click inside cell → cell edit mode (caret entry) done
- F5 cell block selection mode done
- hitTest detects table cell context (parentParaIndex, controlIndex, cellIndex) done
- getTableCellBboxes API can query per-cell bounding box done
- SelectionRenderer, CellSelectionRenderer overlay patterns established done
- Table object selection mode: not implemented

### Implementation Scope

1. **Table bounding box WASM API**
   - `getTableBBox(sec, ppi, ci)` → `{pageIndex, x, y, width, height}`
   - Calculate from existing getTableCellBboxes by summing cell bboxes

2. **Table object selection mode**
   - Add table object selection state to CursorState
   - Entry condition: Esc key inside table cell → table object selection → another Esc → leave table
   - Exit condition: click outside table, click elsewhere, Enter (return to cell editing)

3. **Visual feedback (TableObjectRenderer)**
   - Blue border around selected table
   - 8 resize handles (4 corners + 4 edge midpoints) displayed
   - Leverage existing CellSelectionRenderer pattern

4. **Resize drag**
   - Mouse cursor change on handle hover (resize cursor)
   - Resize table width/height by dragging handles
   - WASM API: `resizeTable(sec, ppi, ci, newWidth, newHeight)`

5. **Delete table with Delete key**
   - Delete/Backspace in table object selection state → remove table control
   - WASM API: `deleteTableControl(sec, ppi, ci)`

### Out of Scope
- Table drag movement: HWP tables are inline objects within paragraphs, so free movement is not possible. Future separate review
- Table border (cell spacing area) click for object selection: hitTest operates at cell level, making precise detection difficult. Replaced with Esc-based entry

### Impact
- Medium: state transition logic addition between existing cell editing/cell selection modes
- CursorState, InputHandler extension

### Dependencies
- All existing infrastructure complete (hitTest, cellBboxes, overlay patterns)
