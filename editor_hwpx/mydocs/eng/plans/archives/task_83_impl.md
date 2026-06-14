# Task 83 Implementation Plan: F5 Cell Selection Mode + Cell Range Selection

## Step 1: WASM API — Add getTableCellBboxes

**Files**: `src/wasm_api.rs` (modify), `rhwp-studio/src/core/wasm-bridge.ts` (modify), `rhwp-studio/src/core/types.ts` (modify)

### Implementation

Rust WASM API:
```rust
#[wasm_bindgen(js_name = getTableCellBboxes)]
pub fn get_table_cell_bboxes(
    &self, section_idx: u32, parent_para_idx: u32, control_idx: u32,
) -> Result<String, JsValue>
```
- Collect all cell bboxes for the table from render tree
- Return JSON: `[{cellIdx, row, col, rowSpan, colSpan, pageIndex, x, y, w, h}, ...]`

TypeScript types and bridge:
```typescript
interface CellBbox {
  cellIdx: number; row: number; col: number;
  rowSpan: number; colSpan: number;
  pageIndex: number; x: number; y: number; w: number; h: number;
}
getTableCellBboxes(sec, parentPara, controlIdx): CellBbox[]
```

---

## Step 2: CursorState Cell Selection Mode + InputHandler F5 Key Handling

**Files**: `rhwp-studio/src/engine/cursor.ts` (modify), `rhwp-studio/src/engine/input-handler.ts` (modify)

### CursorState Extension
- `cellSelectionMode: boolean`
- `cellSelectionAnchor: {row: number, col: number} | null`
- `cellSelectionFocus: {row: number, col: number} | null`
- `enterCellSelectionMode()`: set current cell's row/col as anchor/focus
- `exitCellSelectionMode()`: reset all cell selection state
- `expandCellSelection(dr, dc)`: move focus by (dr, dc) (clamp within table bounds)
- `getSelectedCellRange()`: return {startRow, startCol, endRow, endCol}
- `isInCellSelectionMode()`: boolean

### InputHandler Changes
- F5 key: `e.preventDefault()`, inside table cell → `enterCellSelectionMode()`
- Cell selection mode + arrow keys → `expandCellSelection(dr, dc)` + rendering
- Cell selection mode + ESC → `exitCellSelectionMode()`
- Cell selection mode + other keys (Tab, Enter, character input) → exit mode then existing handling

---

## Step 3: CellSelectionRenderer + EditorContext Extension + Integration

**Files**: `rhwp-studio/src/engine/cell-selection-renderer.ts` (new), `rhwp-studio/src/command/types.ts` (modify), `rhwp-studio/src/style.css` (modify)

### CellSelectionRenderer Class
- `render(cellBboxes, selectedRange, zoom)`: create highlight overlay for bboxes of cells within range
- `clear()`: remove all overlays
- Same pattern as SelectionRenderer, separate layer

### EditorContext Extension
- Add `inCellSelectionMode: boolean`
- Pass cell selection mode status to command system in addition to existing `inTable`

### style.css
- `.cell-selection-highlight` style (light blue background)

---

## Completion Criteria

- [ ] Enter cell selection mode with F5 key (browser refresh blocked)
- [ ] Expand cell range with arrow keys
- [ ] Highlight overlay displayed on selected cell range
- [ ] Exit cell selection mode with ESC
- [ ] All existing Rust tests pass
- [ ] WASM build successful
- [ ] Vite build successful
- [ ] Web verification complete
