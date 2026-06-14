# Task 87 — Implementation Plan

## Table Object Selection + Visual Feedback

### Step Division (4 steps)

---

### Step 1: Table Bounding Box WASM API + Table Delete Rust Model

**Goal**: Add WASM API returning table-wide bounding box, implement table control deletion in Rust model

**Modified files**:
- `src/wasm_api.rs`
  - `getTableBBox(sec, ppi, ci)` WASM binding + native implementation
  - Similar to existing `get_table_cell_bboxes_native` but returns Table node's bbox instead of individual cells
  - Find Table node in render tree and return `{pageIndex, x, y, width, height}` JSON
  - `deleteTableControl(sec, ppi, ci)` WASM binding + native implementation
  - Remove the table control from paragraph's controls array
- `src/model/paragraph.rs`
  - Add `remove_control(index)` method (remove from controls array at given index)
- `rhwp-studio/src/core/wasm-bridge.ts`
  - Add `getTableBBox()` bridge method
  - Add `deleteTableControl()` bridge method

**Verification**: Rust tests + WASM/Vite build

---

### Step 2: CursorState Table Object Selection Mode + InputHandler Esc Key + Auto Transparent Borders

**Goal**: Table object selection state management + Esc key mode transitions + auto ON/OFF transparent borders on cell entry

**Modified files**:
- `rhwp-studio/src/engine/cursor.ts`
  - Add `_tableObjectSelected` state (boolean)
  - Add `selectedTableRef` (`{sec, ppi, ci}` | null)
  - `enterTableObjectSelection()` — object-select the table at current cell position
  - `exitTableObjectSelection()` — release object selection
  - `isInTableObjectSelection()` return
  - `getSelectedTableRef()` return
- `rhwp-studio/src/engine/input-handler.ts`
  - Extended Esc key handling:
    - Cell selection mode → Esc → table object selection mode
    - Cell edit mode → Esc → table object selection mode
    - Table object selection → Esc → move cursor outside table
    - Table object selection → Enter → return to cell edit mode
  - onClick extension: click outside table during table object selection → release
  - Delete/Backspace handling: during table object selection → delete table + document-changed
  - Public accessors: `isInTableObjectSelection()`, `getSelectedTableRef()`
  - **Auto transparent borders**: detect cell entry/exit state change after cursor move
    - Track previous state: `wasInCell: boolean`
    - Outside → cell entry: `wasm.setShowTransparentBorders(true)` + `document-changed`
    - Inside → cell exit: `wasm.setShowTransparentBorders(false)` + `document-changed`
    - Coexist with manual toggle (`view:border-transparent`): `manualTransparentBorders` flag prevents auto OFF when manually ON
- `rhwp-studio/src/command/commands/view.ts`
  - Make `view:border-transparent` command state readable externally via eventBus
  - Emit `transparent-borders-changed` event for manual toggle state propagation

**Verification**: Vite build

---

### Step 3: TableObjectRenderer Visual Feedback

**Goal**: Display outline + 8 resize handles when table object is selected

**Modified files**:
- `rhwp-studio/src/engine/table-object-renderer.ts` (new)
  - Same pattern as CellSelectionRenderer
  - `render(tableBBox, zoom)` — blue border around table + 8 handle rectangles
  - Handle positions: 4 corners (NW, NE, SW, SE) + 4 edge midpoints (N, S, E, W)
  - Handle size: 8x8px (screen-fixed, zoom-independent)
  - `clear()`, `dispose()`
- `rhwp-studio/src/style.css`
  - `.table-object-border` — blue 2px solid border
  - `.table-object-handle` — blue background white border square
- `rhwp-studio/src/engine/input-handler.ts`
  - `setTableObjectRenderer()` injection method
  - Call `tableObjectRenderer.render()` on table object selection
  - Call `tableObjectRenderer.clear()` on release
- `rhwp-studio/src/main.ts`
  - Create TableObjectRenderer instance + inject into InputHandler

**Verification**: Vite build + visual feedback confirmed when selecting table with Esc key in web

---

### Step 4: Build Verification + Web Testing + Resize Cursors

**Goal**: Full build verification + web behavior testing + cursor change on handle hover

**Modified files**:
- `rhwp-studio/src/engine/input-handler.ts`
  - Add `onMouseMove` event: during table object selection, mouse over handle → cursor change (resize cursor)
  - Per-handle cursor: NW/SE=`nwse-resize`, NE/SW=`nesw-resize`, N/S=`ns-resize`, E/W=`ew-resize`
  - Outside handles → restore `default` cursor
- `rhwp-studio/src/engine/table-object-renderer.ts`
  - `getHandleAtPoint(x, y, zoom)` — determine which handle the mouse coordinate is over
- Add "Delete Table" item to context menu

**Verification**:
- All Rust tests pass
- WASM build success
- Vite build success
- Web testing:
  - Esc in table cell → table object selection (blue border + handles)
  - Esc in table object selection → leave table
  - Enter in table object selection → return to cell editing
  - Delete in table object selection → table deleted
  - Mouse over handle → cursor change

---

### Summary

| Step | Content | Key Files |
|------|---------|-----------|
| 1 | WASM API (getTableBBox, deleteTableControl) + Rust model | wasm_api.rs, paragraph.rs, wasm-bridge.ts |
| 2 | CursorState table object selection + Esc key handling | cursor.ts, input-handler.ts |
| 3 | TableObjectRenderer visual feedback | table-object-renderer.ts (new), style.css, main.ts |
| 4 | Build verification + web testing + resize cursors | input-handler.ts, table-object-renderer.ts |

### Note
- Drag resize (resizing table by dragging handles) implements only cursor change in this task; actual drag adjustment is separated to a follow-up task (requires WASM API resizeTable)
