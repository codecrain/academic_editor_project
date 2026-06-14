# Task 96 Execution Plan

## Task Name
Container/Group Object Rendering Implementation

## Background

The Dokdo (Korean island) area in KTX.hwp is composed of a `[Group] children=7` group shape.
- Group position: horizontal=115.0mm, vertical=68.0mm, size=17.5mm x 20.6mm
- child[0~5]: 6 Dokdo polygons (including negative offsets, rotation angles 23~24 degrees)
- child[6]: rectangle border (offset=0,0)

**Current problem**: Group child shape coordinates are calculated as `base_x + render_tx`, so the group local coordinate system → page coordinate system transformation is inaccurate. Dokdo polygons render outside the rectangle.

## hwplib Reference

- `ControlContainer.java` — manages child controls as `ArrayList<GsoControl>`
- `ShapeComponent.java` — `offsetX/Y`: "X/Y offset within the group the object belongs to"
- `ShapeComponentContainer.java` — container-specific properties (childControlIdList)

hwplib code takes precedence over spec documentation as reference.

## Analysis Results

### Current Rendering Logic (layout.rs:4391-4418)

```rust
// Current: flattened approach
let child_x = base_x + hwpunit_to_px(child_shape_attr.render_tx as i32, self.dpi);
let child_y = base_y + hwpunit_to_px(child_shape_attr.render_ty as i32, self.dpi);
let child_w = hwpunit_to_px((original_width * render_sx.abs()) as i32, self.dpi);
let child_h = hwpunit_to_px((original_height * render_sy.abs()) as i32, self.dpi);
```

### Problems

1. `render_tx/ty` is the affine transform composition result, not relative coordinates within group
2. Cannot correctly calculate child's relative position from group's coordinate origin (`base_x, base_y`)
3. Group's `shape_attr` (scale, offset) is not propagated to children

### Dokdo Group Coordinate Analysis

```
Group: position=(32607, 19274) HU, size=(4950, 5850) HU
  child[6] rectangle: offset=(0,0), orig=(5700,7350), curr=(4950,5850), scale=(0.868,0.796)
  child[0] polygon: offset=(3229,-4683), orig=(236,224), scale=(5.264,5.419)
```

- Rectangle starts at group origin (0,0), scaled down to match group size
- Polygon at offset=(3229,-4683) in group local coordinate system
- render_tx/ty may already have group transforms composed → measurement needed

## Implementation Plan

### Step 1: Analyze Group Coordinate Transform and Fix Rendering

1. Print actual render_tx/ty values for each child of KTX.hwp Dokdo group
2. Compare group origin + offset vs render_tx/ty analysis
3. Derive correct coordinate transform formula
4. Fix group rendering logic in `layout.rs`
5. Verify with SVG export

### Step 2: Build and Verification

1. Confirm tests pass
2. WASM build
3. Vite build
4. Confirm web Canvas rendering

## Expected Modified Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Fix group child coordinate transform logic |
| `src/main.rs` | Debug output (if needed) |

## Branch

`local/task96`
