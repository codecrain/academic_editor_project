# Task 16 Implementation Plan: Shape Rendering Implementation

## Step 1: Individual Shape Visual Element Rendering

**Changed files:**
- `src/renderer/layout.rs`

**Tasks:**
1. Add `drawing_to_shape_style()` helper function: Convert `DrawingObjAttr`'s `fill`/`border_line` → `ShapeStyle`
2. Add `drawing_to_line_style()` helper function: Convert `ShapeBorderLine` → `LineStyle`
3. Modify `layout_shape()`: Create visual nodes for shapes without TextBox too
   - Rectangle → `RenderNodeType::Rectangle(RectangleNode)` + child TextBox
   - Line → `RenderNodeType::Line(LineNode)`
   - Ellipse → `RenderNodeType::Ellipse(EllipseNode)` + child TextBox
   - Arc/Polygon/Curve → `RenderNodeType::Path(PathNode)` + child TextBox
4. Move existing TextBox-only logic to become a child of shape nodes

**Completion criteria:** Existing tests pass, rectangles/lines without TextBox are rendered in SVG

---

## Step 2: Group Object Rendering

**Changed files:**
- `src/renderer/layout.rs`

**Tasks:**
1. Extract `layout_shape_object()` function: Convert individual ShapeObject to render node (with base coordinate parameter)
2. Handle Group in `layout_shape()`: Use Group's common position as reference point, recursively process children
   - Calculate absolute coordinates of Group (common.horizontal_offset, vertical_offset)
   - Apply each child's ShapeComponentAttr.offset_x/y relative to Group reference point
3. Add Group handling in `calculate_shape_reserved_height()` as well

**Completion criteria:** Existing tests pass, Group shapes are rendered in SVG

---

## Step 3: Testing and Verification

**Tasks:**
1. Add shape-related unit tests
   - `drawing_to_shape_style` conversion tests (Solid fill, None fill, border)
   - Rectangle/Line/Ellipse layout tests
2. Confirm SVG export of pages 19~20 of `samples/hwp-3.0-HWPML.hwp`
3. Confirm existing TextBox document rendering is normal
4. Confirm WASM build

**Completion criteria:** All tests pass, WASM build succeeds, sample diagram rendering is normal
