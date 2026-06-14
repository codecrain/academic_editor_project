# Task 242 Completion Report: Basic Shape Insertion (Line/Rectangle/Ellipse)

## Implementation Items

### Rust Backend
- **object_ops.rs**: `create_shape_control_native()` — Added `shape_type` parameter
  - `"rectangle"`: Existing Rectangle+TextBox (text box)
  - `"ellipse"`: EllipseShape (center/axis coordinates auto-calculated, white fill)
  - `"line"`: LineShape (start/end coordinates, direction determined by `lineFlipX/Y`, no fill/TextBox)
  - Default shape placement: InFrontOfText + Paper-based left/top
- **render_tree.rs**: Added section/para/control index fields to LineNode, EllipseNode
- **shape_layout.rs**: Set indices on Line/Ellipse render nodes
- **rendering.rs**: Collects Line/Ellipse as selectable shapes in `collect_controls`
  - Line includes `"line"` type + start/end coordinates (x1,y1,x2,y2)

### TypeScript Frontend
- **shape-picker.ts**: Shape selection dropdown (3 types: line/rectangle/ellipse)
- **shape-picker.css**: Dropdown styles
- **input-handler.ts**:
  - `enterShapePlacementMode(shapeType)` — Shape placement mode
  - SVG overlay: line→line, ellipse→ellipse, rectangle→rect
  - Shift+line → 0°/45°/90° snapping
  - Center point based paper coordinate offset calculation during drag
- **input-handler-picture.ts**:
  - `pointToSegmentDist()` — Line hit: point-to-segment distance within 5px
  - `findPictureAtClick` — Separate hit testing for line type
  - `renderPictureObjectSelection` — line type → calls `renderLine()`
- **table-object-renderer.ts**: `renderLine()` — 2 handles at start/end points + dashed guide
- **cursor.ts**: Added `'line'` type
- **insert.ts**: Activated `insert:shape` command
- **index.html**: Shape button `data-cmd` + menu activation

## Verification
- Rust tests 716 passed
- No TypeScript compilation errors
- WASM build successful
- All 3 shape types insert/select/resize/move/delete confirmed working
