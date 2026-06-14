# Task 242 Execution Plan: Basic Shape Insertion (Line/Rectangle/Ellipse)

## Current Implementation Status

### Already Implemented

| Area | Status | Details |
|------|--------|---------|
| Shape model | Complete | Line, Rectangle, Ellipse, Arc, Polygon, Curve, Group |
| Parsing/Serialization | Complete | Round-trip working |
| Rendering | Complete | Both SVG/Canvas display shapes correctly |
| Rectangle+TextBox creation | Complete | `createShapeControl()` WASM API |
| Placement mode | Complete | Drag overlay pattern (used in text box/image) |
| Selection/Handles | Complete | 8-direction resize + rotation handle (green) |
| Resize/Move/Rotate | Complete | Mouse drag, minimum size limit, 15-degree snap |
| Property query/modify | Complete | 50+ properties JSON-based get/set |
| Z-order | Complete | Front/Back/To Front/To Back |
| Deletion | Complete | `deleteShapeControl()` |
| Rotation/Flip | Complete | 90-degree rotation, horizontal/vertical flip |

### Needs Implementation

| Area | Difficulty | Details |
|------|-----------|---------|
| Shape type selection UI | Low | Icon buttons in dropdown panel |
| Various shape creation API | Medium | Extend `create_shape_control_native()` (type parameter) |
| Line creation | Medium | LineShape instance + start/end point calculation |
| Ellipse creation | Low | Similar structure to Rectangle |
| Connector (ObjectLinkLine) | High | `$col` ctrl_id, start/end object connection, control points, auto routing. Model/parser not implemented |
| Line arrow properties | Medium | LineType, ArrowStart/End UI |
| Polygon/Curve editing | High | Vertex/control point editing mode |
| Group objects | High | Multi-select + group/ungroup |
| Text editing inside shapes | Medium | TextBox focus switch (same as text box) |

### Connector ($col, ObjectLinkLine) Analysis

hwplib-based connector-specific properties:
- Start/end coordinates (startX/Y, endX/Y)
- Connector type (LinkLineType)
- Start/end connection targets (startSubjectID/Index, endSubjectID/Index)
- Control point list (ControlPoint[]) — bend points
- **Special note**: Connects two objects and auto-tracks when objects are moved

Current state:
- Model undefined, parser not implemented, renderer not implemented
- Unlike simple lines, requires **managing connection relationships between objects**, making difficulty high

## Implementation Level Analysis

### Level 1: Basic Shape Insertion (Estimated: 1 day)

Achievable with existing infrastructure alone. Minimal new code.

- **Shape selection dropdown**: 3 icon buttons for line, rectangle, ellipse
- **Extend `create_shape_control_native()`**: Add shape_type parameter
  - Rectangle: Reuse existing code
  - Ellipse: Same structure as Rectangle, change to ShapeObject::Ellipse
  - Line: Add start_x/y, end_x/y calculation
- **Placement mode**: Reuse existing textboxPlacementMode pattern
- **Activate `insert:shape` command**

**Result**: Drag-insert 3 shape types → select/resize/move/rotate/delete all work with existing code

### Level 2: Shape Property Editing UI (Additional: 1-2 days)

- **Extend shape properties dialog**: Add tabs to existing PicturePropsDialog
  - Border: color, width, line style
  - Fill: none/solid/gradient
  - Line-specific: arrow start/end shape, size
- **Text input inside shapes**: When Rectangle/Ellipse includes TextBox, double-click → text editing
  - Existing text box editing mode code applicable

### Level 3: Advanced Shape Editing (Additional: 3-5 days)

- **Polygon editing**: Display vertex handles, drag to move, add/delete
- **Curve editing**: Bezier control point handles
- **Arc editing**: Start angle/end angle handles
- **Corner rounding**: Rectangle corner roundness handles
- **Connector ($col)**: New model/parser/renderer implementation + inter-object connection tracking
- **Group objects**: Multi-select (Shift+click), group/ungroup commands

### Level 4: Hancom-Level Completion (Separate Project Scale)

- Shape categories (basic, callout, stars/banners, flowchart, etc.)
- Smart guides (alignment guide lines)
- Text flow connected to shapes
- 3D effects, shadow editing
- Connector auto-routing

## Recommendation

**Proceeding with Level 1 as the scope of this task** is recommended.

Reasons:
1. Existing infrastructure (placement mode, handles, property API) is complete, minimizing new code
2. 3 shape types (line/rectangle/ellipse) fulfill basic shape requirements
3. Resize/move/rotate/delete work without additional implementation
4. Levels 2-3 can be separated into individual tasks for incremental expansion
