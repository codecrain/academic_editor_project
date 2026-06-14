# Task 92 — Shape Rendering Transform (scale/offset/rotation) Application

## Background

Shape rendering error discovered during KTX.hwp (multi-column route map document) testing.
Internal coordinates of lines, polygons etc. (start/end, points) are rendered using original coordinate system, resulting in incorrect size/position.

## Root Cause

### Problem 1: Scale Not Applied to Shape Internal Coordinates

Shape internal coordinates (Line's start/end, Polygon's points, Curve's points) are defined in the **original coordinate system**. However, during rendering these coordinates are directly converted via `hwpunit_to_px()`, causing mismatch with actual display size (common.width/height).

**KTX.hwp first line example:**
- `common.width = 36000` (127mm) — actual display size
- `shape_attr.original_width = 54356` — original coordinate system size
- `line.start = (0, 79)`, `line.end = (54356, 0)` — original coordinates
- `shape_attr.render_sx = 0.662` (= 36000 / 54356)
- **Current**: end.x = 54356 → rendered as 192mm (original size)
- **Correct**: end.x = 54356 x 0.662 = 36000 → rendered as 127mm (display size)

### Problem 2: Group Child Shape Internal Coordinate Scale

For grouped child shapes, position (render_tx/ty) and size (current_width x render_sx) are applied, but child shape **internal coordinates** (polygon vertices etc.) have no scale applied.

### Impact Area

| Shape Type | Internal Coordinates | Impact |
|------------|---------------------|--------|
| Line | start, end | Line length/direction error |
| Polygon | points[] | Polygon shape error |
| Curve | points[] | Curve shape error |
| Rectangle | (no coordinates, BoundingBox only) | No impact |
| Ellipse | (BoundingBox only) | No impact |
| Arc | (BoundingBox only) | No impact |

## Fix Direction

Apply original → display coordinate system scaling when rendering shape internal coordinates:

```
scale_x = common.width / shape_attr.original_width
scale_y = common.height / shape_attr.original_height
```

For group children where `common.width == 0`:
```
scale_x = (current_width * render_sx) / original_width
scale_y = (current_height * render_sy) / original_height
```

## Verification Targets

- `samples/basic/KTX.hwp` — 2 lines (127mm, 150mm) + multiple polygons + group objects
- `samples/basic/treatise sample.hwp` — confirm existing normal rendering maintained
- All existing tests pass
