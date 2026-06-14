# Task 16: Shape Rendering Implementation

## Goal

Render shape objects (rectangles, lines, ellipses, polygons, curves, group objects) in HWP documents.
Currently, only the text portion of shapes with TextBox is rendered, and visual elements (fill/border) and Group objects are unimplemented.

## Current Status

| Item | Status | Notes |
|------|--------|-------|
| Parsing | Complete | 7 ShapeObject types parsed (Line, Rectangle, Ellipse, Arc, Polygon, Curve, Group) |
| Render tree nodes | Complete | Line, Rectangle, Ellipse, Path, Group, TextBox node types exist |
| SVG/Canvas renderer | Complete | Render tree node handling implemented (used for table cell borders, etc.) |
| layout_shape | Partial | Only text layout for shapes with TextBox, no visual element rendering |
| Group shapes | Not implemented | `ShapeObject::Group(_) => return` |
| Visual elements | Not implemented | Fill, ShapeBorderLine not applied |

## Affected Files

| File | Change Description |
|------|-------------------|
| `src/renderer/layout.rs` | Refactor `layout_shape()`: create shape visual nodes, recursive Group processing |

## Implementation Method

### Individual Shape Rendering

Currently `layout_shape()` skips shapes without TextBox, but after modification:

1. **Extract fill/border from DrawingObjAttr** → Create ShapeStyle
2. **Create render node by shape type**:
   - `ShapeObject::Rectangle` → `RenderNodeType::Rectangle(RectangleNode)`
   - `ShapeObject::Line` → `RenderNodeType::Line(LineNode)`
   - `ShapeObject::Ellipse` → `RenderNodeType::Ellipse(EllipseNode)`
   - `ShapeObject::Arc/Polygon/Curve` → `RenderNodeType::Path(PathNode)`
3. **Add text layout as child if TextBox exists** (maintain existing logic)

### Group Object Rendering

Process GroupShape's children recursively:
- Set Group position (common.horizontal_offset, vertical_offset) as reference point
- Add each child object's ShapeComponentAttr.offset_x/y to the Group reference point for absolute coordinate calculation
- Create visual node + TextBox for each child object

### Fill → ShapeStyle Conversion

```
FillType::Solid → fill_color = Some(solid.background_color)
FillType::None  → fill_color = None
ShapeBorderLine → stroke_color, stroke_width
```

## Verification Methods

1. Pass all existing 233 tests
2. Confirm rendering of diagram on pages 19~20 of `samples/hwp-3.0-HWPML.hwp`
3. Confirm existing TextBox rendering still works correctly
4. WASM build succeeds
