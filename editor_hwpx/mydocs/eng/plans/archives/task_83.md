# Task 83 Execution Plan: F5 Cell Selection Mode + Cell Range Selection

## 1. Goal

Implement HWP's F5 cell block selection mode. When F5 is pressed inside a table cell, enter cell selection mode, extend cell range with arrow keys, and display the selected cell area with a highlight overlay.

## 2. Current Status Analysis

### Existing Infrastructure
- **CursorState**: Cell internal position management (`parentParaIndex`, `controlIndex`, `cellIndex`)
- **getCellInfo WASM API**: Can query cell's row/col/rowSpan/colSpan
- **getTableDimensions WASM API**: Can query table's rowCount/colCount/cellCount
- **SelectionRenderer**: Text selection highlight (blue overlay) fully implemented
- **InputHandler**: No F5 key handling (currently falls through to default branch)
- **get_page_control_layout_native**: API that already exports cell bbox as JSON from render tree (not connected to frontend)

### Missing Parts
- No cell selection mode state management
- No F5 key handler
- No cell range visualization (no individual cell bbox query API)
- No arrow key → cell range expansion logic in cell selection mode

## 3. Implementation Scope

### 3-1. WASM API Addition: getCellBboxInTable
- API to return all cell bboxes for a table at once
- Collect TableCell node bboxes from render tree
- Return: `[{cellIdx, row, col, rowSpan, colSpan, pageIndex, x, y, w, h}, ...]`

### 3-2. CursorState Extension
- `cellSelectionMode: boolean` — cell selection mode active
- `cellSelectionAnchor: {row, col}` — selection start cell
- `cellSelectionFocus: {row, col}` — selection end cell
- `enterCellSelectionMode()` / `exitCellSelectionMode()`
- `expandCellSelection(deltaRow, deltaCol)` — expand range with arrows

### 3-3. InputHandler F5 Key Handling
- Intercept F5 key (`e.preventDefault()` — block browser refresh)
- F5 inside table cell → enter cell selection mode
- Arrow keys in cell selection mode → expand cell range
- ESC → exit cell selection mode
- Tab/Enter etc. → exit cell selection mode

### 3-4. CellSelectionRenderer
- Display highlight overlay on selected cell range
- Query cell bboxes via WASM API → highlight only cells within range

### 3-5. EditorContext Extension
- Add `inCellSelectionMode: boolean`
- Allow cell selection state to be used in context menus

## 4. Impact

- **Medium**: F5 key interception (blocks browser default behavior), arrow key behavior branching added
- No impact on existing text selection/caret movement (cell selection mode is separate state)

## 5. Branch

- `local/table-edit` → `local/task83`
- Merge to `local/table-edit` after completion
