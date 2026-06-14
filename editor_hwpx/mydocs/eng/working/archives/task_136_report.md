# Task 136 Final Report — Table Resize Feature Implementation

## 1. Goal

1. **Rust `resizeTableCells` batch WASM API**: Apply width/height deltas for multiple cells at once, performing recompose+paginate only once
2. **Per-row column position layout**: Reflect HWP's per-cell independent width with `build_row_col_x` for per-row column coordinate calculation
3. **Cell selection mode (F5) keyboard resize**: Ctrl+arrow keys to resize selected cells horizontally/vertically + neighbor cell compensation
4. **Mouse drag resize**: Drag border lines to change column/row sizes + in cell selection mode, change only selected cells
5. **Text reflow**: `reflow_cell_paragraph` for line-break recalculation when cell width changes
6. **Cell selection block update**: Visual synchronization of selection area after size change

## 2. Implementation Details

### Step 1: Rust — `resizeTableCells` Batch WASM API
- Added `resize_table_cells_native()` to `wasm_api.rs`
- JSON input: `[{cellIdx, widthDelta, heightDelta}]`
- Applies delta to each cell (minimum 200 HWPUNIT guaranteed)
- `update_ctrl_dimensions()` → `recompose` → `paginate` performed once
- Text reflow: Calls `reflow_cell_paragraph` for all paragraphs in width-changed cells

### Step 2: Per-row Column Position Layout
- Added `build_row_col_x()` free function to `layout.rs`
- Calculates per-row cumulative column coordinates reflecting per-cell independent widths
- Modified 3 functions: `layout_table`, `layout_partial_table`, `layout_embedded_table`
- Cell position: `col_x[c]` → `row_col_x[r][c]`
- Table width: Uses maximum width across all rows

### Step 3: Border Rendering Per-row Support
- Changed `render_edge_borders`, `render_transparent_borders` function signatures
  - `col_x: &[f64]` → `row_col_x: &[Vec<f64>]`
- Vertical borders: Segment splitting when x coordinate changes between rows
- Horizontal borders: References x coordinates from the row below the boundary

### Step 4: Cell Selection Mode Keyboard Resize
- Added Ctrl+arrow key handler in F5 cell selection mode in `input-handler.ts`
- `resizeCellByKeyboard()` method: Left/Right (width), Up/Down (height)
- 300 HWPUNIT (~1mm) increment/decrement per action
- Neighbor compensation: Applies opposite delta to right neighbor (width) / bottom neighbor (height) in same row/column → maintains row total width

### Step 5: Mouse Drag Resize
- Utilized existing Task 135 border markers + hitTest infrastructure
- 3-phase: `startResizeDrag()` / `updateResizeDrag()` / `finishResizeDrag()`
- Normal mode: Changes all cells left/above the border (entire column/row)
- Cell selection mode: Changes only selected cells + neighbor compensation
- `showDragMarker()`: Real-time marker position tracking during drag

### Step 6: Cell Selection Block Update
- Calls `this.updateCellSelection()` after keyboard/mouse resize
- Visually synchronizes selection block to changed cell coordinates

## 3. Key Technical Decisions

### Per-row Layout + Neighbor Compensation Combination
- **Problem**: HWP allows independent width per cell, but existing layout used max column width (`col_widths[c] = max(all cells in col c)`), so individual cell size changes were not visually reflected
- **Solution**: Per-row cumulative column coordinates → each row has independent column boundaries
- **Need for neighbor compensation**: In per-row cumulative layout, widening one cell shifts all right-side cells in that row. Applying opposite delta to right neighbor maintains row total width

### Text Reflow
- `compose_paragraph` uses pre-stored `line_segs` for line-breaking. When cell width changes, `reflow_cell_paragraph` is required to recalculate based on new width

## 4. Changed Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/renderer/layout.rs` | `build_row_col_x()` + 3 layout functions per-row conversion + 2 border functions per-row support | +148 lines |
| `src/wasm_api.rs` | `resizeTableCells` batch API + text reflow logic | +23 lines |
| `rhwp-studio/src/engine/input-handler.ts` | Keyboard resize + mouse drag neighbor compensation + cell selection update | +178 lines -63 lines |

Total 4 files, ~350 lines changed.

## 5. Verification Results

| Item | Result |
|------|--------|
| Existing 582 test regression | Passed |
| WASM build | Success |
| TypeScript compilation | Success |
| Cell selection mode Ctrl+arrow resize | Success — only selected cells resized |
| Mouse border drag resize | Success — marker tracking + applied on release |
| Neighbor compensation | Success — row total width maintained |
| Cell selection block update | Success — synchronized after size change |
| Text reflow | Success — line-break recalculated on cell width change |
| saved/111.hwp (per-cell independent sizes) | Normal rendering confirmed |
