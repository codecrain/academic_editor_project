# Task 157 — Step 1 Completion Report

## Step Goal

Shape (text box) creation/deletion/property query-change WASM API and Rust backend implementation

## Changed Files

| File | Changes |
|------|---------|
| `src/model/shape.rs` | Added `common_mut()`, `drawing()`, `drawing_mut()` methods to `ShapeObject` |
| `src/renderer/render_tree.rs` | Added `section_index`, `para_index`, `control_index` fields to `RectangleNode` |
| `src/renderer/layout/shape_layout.rs` | Set actual document coordinates on Shape RectangleNode creation |
| `src/renderer/layout/table_layout.rs` | Set None coordinates on background RectangleNode |
| `src/renderer/layout/paragraph_layout.rs` | Set None coordinates on char/paragraph background RectangleNode (2 places) |
| `src/renderer/layout/table_cell_content.rs` | Set None coordinates on cell background RectangleNode |
| `src/wasm_api/queries/rendering.rs` | Added shape type collection to `getPageControlLayout()` |
| `src/wasm_api/commands/object_ops.rs` | Added 6 native functions |
| `src/wasm_api.rs` | Added 4 WASM binding functions |

## Added APIs

### WASM Bindings (callable from JavaScript)

| API | JS Name | Description |
|-----|---------|-------------|
| `create_shape_control(json)` | `createShapeControl` | Insert text box at cursor position |
| `get_shape_properties(sec, para, ctrl)` | `getShapeProperties` | Query text box properties |
| `set_shape_properties(sec, para, ctrl, json)` | `setShapeProperties` | Change text box properties |
| `delete_shape_control(sec, para, ctrl)` | `deleteShapeControl` | Delete text box |

## Text Box Default Properties (Hancom Default Reference)

| Property | Default |
|----------|---------|
| Border | Black (0x000000), 0.4mm (283 HWPUNIT) |
| TextBox margins | Left/Right 510, Top/Bottom 141 HWPUNIT |
| Vertical alignment | Top |
| Outer margin | All sides 283 HWPUNIT (~1mm) |
| Position reference | Vertical=paragraph, Horizontal=column |

## Verification Results

| Item | Result |
|------|--------|
| Tests | **608 passed, 0 failed** |
| WASM build | **Success** (pkg/ generated) |
| Existing feature regression | None (all existing tests passed) |
