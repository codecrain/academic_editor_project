# Task 65: GSO TextBox Cursor Support — Execution Plan

## Background

Currently in rhwp-studio, text inside GSO TextBox objects is only rendered; cursor entry/movement/caret calculation is not implemented. In documents containing text boxes like `samples/img-start-001.hwp`, clicking on a text box area incorrectly maps to a body paragraph, showing an abnormal caret, and arrow key movement is not possible.

Table cells have full cursor support through `CellContext`, but text boxes call `layout_textbox_content()` with `cell_ctx=None`, leaving TextRuns without context.

## Current Status

| Item | Status |
|------|--------|
| TextBox rendering | Working normally (layout_textbox_content → layout_composed_paragraph) |
| TextBox hitTest | CellContext not propagated to TextRun → returns as body paragraph |
| TextBox cursor entry | Not implemented — placed as body cursor |
| TextBox internal movement | Not implemented — arrow key movement not possible |
| TextBox boundary escape | Not implemented |
| Existing table cell cursor | Fully implemented based on CellContext |

## Key Design Decision

**Reuse existing `CellContext` with `cell_index=0` instead of creating new infrastructure.**

- Unlike tables, text boxes have only 1 cell, so `cell_index=0` is fixed
- Reuse existing WASM APIs (`getCursorRectInCell`, `getCellParagraphLength`, `getCellParagraphCount`, etc.) as-is
- Add `Control::Shape` match arm so existing cell APIs handle text boxes too
- Distinguish table/text box with `isTextBox` flag

## Modification Scope

### Rust (Render Tree + WASM API)
| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Propagate CellContext in `layout_textbox_content()` — add section_index, para_index, control_index parameters |
| `src/wasm_api.rs` | Shape support in `get_cell_paragraph_ref()`, isTextBox flag in hitTest, text box escape in handle_cell_boundary |

### TypeScript (rhwp-studio)
| File | Changes |
|------|---------|
| `src/core/types.ts` | Add `isTextBox` field to `DocumentPosition`, `MoveVerticalResult`, `HitTestResult` |
| `src/engine/cursor.ts` | Add `isInTextBox()`, `moveHorizontalInTextBox()`, `exitTextBox()` methods |
| `src/engine/input-handler.ts` | Prevent Tab key cell navigation inside text box |

## Key Technical Details

### CellContext Reuse Structure

```
Table cell: CellContext { parent_para_index, control_index, cell_index: 0..N, cell_para_index }
TextBox:    CellContext { parent_para_index, control_index, cell_index: 0,    cell_para_index }
```

### TextBox Support by ShapeObject Variant

| Variant | TextBox possible | Notes |
|---------|-----------------|-------|
| Rectangle | Yes | drawing.text_box |
| Ellipse | Yes | drawing.text_box |
| Polygon | Yes | drawing.text_box |
| Curve | Yes | drawing.text_box |
| Line | No | No DrawingObjAttr |
| Arc | No | No DrawingObjAttr |
| Group | No | Individual sub-shapes handled separately |

### TextBox vs Table Boundary Behavior Differences

| Action | Table | TextBox |
|--------|-------|---------|
| ArrowLeft/Right boundary | Move to previous/next cell | Escape to body |
| ArrowUp/Down boundary | WASM handle_cell_boundary (adjacent cell) | Escape directly to body |
| Tab/Shift+Tab | Move to next/previous cell | Ignored (no action) |
| Enter | Not implemented (ignored) | Not implemented (ignored) |
