# Task 65 Final Report: GSO TextBox Cursor Support

## Overview

Implemented cursor entry/movement/caret calculation for text inside GSO TextBox.
Reused the existing table cell `CellContext` infrastructure with `cell_index=0`, completing the feature without additional infrastructure.
Also fixed TextBox border and fill (gradient) rendering.

## Modified Files (13)

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Propagated CellContext in `layout_textbox_content()`, line_type=0 is solid line (HWP spec Table 27), corrected border width unit to HWPUNIT |
| `src/wasm_api.rs` | Added Shape match arm to `get_cell_paragraph_ref`, added `getTextBoxControlIndex`, fixed hitTest priority (cell/textbox > body), added Shape escape handling in `handle_cell_boundary` |
| `src/parser/control.rs` | Auto-correction for 2-byte offset in SHAPE_COMPONENT fill, reused `parse_fill()` |
| `src/parser/doc_info.rs` | Made `parse_fill()` `pub(crate)` |
| `src/parser/byte_reader.rs` | Added `set_position()` method |
| `src/renderer/web_canvas.rs` | Corrected sin/cos in `angle_to_canvas_coords` (same coordinate system as SVG) |
| `rhwp-studio/src/core/types.ts` | Added `isTextBox` field to `DocumentPosition`, `HitTestResult`, `MoveVerticalResult` |
| `rhwp-studio/src/engine/cursor.ts` | Added TextBox entry logic to `moveHorizontalInBody`, `enterTextBox()`, `exitTextBox()`, `isInTextBox()` methods |
| `rhwp-studio/src/engine/input-handler.ts` | Propagated hitTest result `isTextBox`, prevented Tab key cell movement inside TextBox |
| `rhwp-studio/src/core/wasm-bridge.ts` | Added `getTextBoxControlIndex` bridge function |
| `mydocs/orders/20260214.md` | Updated Task 65 status to complete, registered backlog B1 |
| `mydocs/plans/task_65.md` | Execution plan |
| `mydocs/plans/task_65_impl.md` | Implementation plan |

## Implementation Details

### Stage 1: Rust CellContext Propagation

- Passed `Some(CellContext { cell_index: 0 })` from `layout_textbox_content()` to `layout_composed_paragraph()`
- TextRun in render tree includes `parent_para_index`, `control_index`, `cell_index`, `cell_para_index`

### Stage 2: WASM API Extension

- `get_cell_paragraph_ref()`: `Control::Shape` -> `get_textbox_from_shape()` -> TextBox paragraph reference
- `get_cell_paragraph_count_native()`: Returns Shape TextBox paragraph count
- `hit_test_native()`: Cell/TextBox TextRun priority matching, `isTextBox: true` for Shape
- `handle_cell_boundary()`: Shape controls escape to body without cell movement
- `getTextBoxControlIndex(sec, para)`: Returns first TextBox Shape control index of a paragraph (-1: none)

### Stage 3: TypeScript Cursor Support

- `moveHorizontalInBody()`: Calls `enterTextBox()` if current/adjacent paragraph is a TextBox
- `enterTextBox(sec, para, ctrlIdx, delta)`: Enter TextBox (delta>0: start, delta<0: end)
- `moveHorizontalInTextBox(delta)`: Cursor movement inside TextBox, escapes to body at boundary
- `exitTextBox(delta)`: Releases cell context + returns to body paragraph
- Tab key: No cell movement inside TextBox

### Stage 4: Border/Fill Rendering

- **Border**: `line_type=0` is Solid per HWP spec (Table 27). Rendering determined by `border.width > 0`. Fixed `shape_border_width_to_px()` unit from 0.01mm to HWPUNIT
- **Fill**: Auto-correction when 2 extra bytes exist in SHAPE_COMPONENT fill data. Reused `doc_info::parse_fill()`
- **Canvas gradient**: Fixed swapped sin/cos in `angle_to_canvas_coords()` (same coordinate system as SVG)

## Test Results

- Rust: 486 tests passed
- TypeScript: `tsc --noEmit` succeeded
- Vite build: succeeded
- WASM build: succeeded
- SVG export: img-start-001.hwp 3 pages output correctly

## Backlog

| No | Description | Notes |
|----|-------------|-------|
| B1 | Missing text rendering for paragraphs containing both text and Table controls | layout.rs skips paragraph text when has_table=true. To be resolved in next task |
