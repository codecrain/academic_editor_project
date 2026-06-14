# Task 92 — Completion Report

## Shape Rendering Transform (scale/offset/rotation) Application

### Changes

#### Root Cause Discovery: Fixed-Point Coordinate Format

During implementation, a **root cause** not found in the planning stage was additionally discovered:
- Polygon and Curve shape vertex coordinates are stored in HWP files in **fixed-point 16.16 format** (HWPUNIT x 65536)
- The parser read these values as-is as `i32` and stored them in `Point { x, y }`
- During rendering, `hwpunit_to_px()` converted these huge values as-is, resulting in coordinates rendering at millions of pixels

**Example** (KTX.hwp, `orig=5216x7880` polygon):
- Before: `pt[0] = (200802304, 59244544)` -> 14,316,403px
- After: `pt[0] = (3063, 904)` -> 218.5px (normal range)

#### Root Cause Discovery 2: Coordinate Array Read Order

The HWP 5.0 spec describes polygon coordinates as "X array -> Y array" order, but the actual binary format stores them as **(x,y) interleaved pairs**.

- Spec: `INT16 cnt`, `INT32[cnt] x_array`, `INT32[cnt] y_array`
- Actual: `INT16 cnt`, `(INT32 x, INT32 y) x cnt`

3 reference implementations (Java hwplib, Python pyhwp, Rust openhwp) all read as interleaved pairs.

**Symptom**: A 188-point polygon (South Korean peninsula outline) rendered in a zigzag pattern
- X/Y array separate read: `pt[0]=(3064,904), pt[1]=(0,7848)` -> Y values crossed
- Interleaved read: `pt[0]=(3064,0), pt[1]=(2068,600)` -> continuous coastline outline

#### Fix 1: Parser Coordinate Read Fix

**File**: `src/parser/control.rs`
- `parse_polygon_shape_data()`: Read as (x,y) interleaved pairs + `>> 16` fixed-point conversion
- `parse_curve_shape_data()`: Same interleaved pair read + `>> 16` conversion

#### Fix 2: Renderer Internal Coordinate Scaling

**File**: `src/renderer/layout.rs`
- **Line**: Applied `common.width / original_width` scale to `start/end` coordinates
- **Polygon**: Applied same scale to `points[]` coordinates
- **Curve**: Changed to `curve_to_path_commands_scaled()` function, added `sx/sy` parameters

Scale calculation:
```rust
let sx = if sa.original_width > 0 { w / hwpunit_to_px(sa.original_width as i32, dpi) } else { 1.0 };
let sy = if sa.original_height > 0 { h / hwpunit_to_px(sa.original_height as i32, dpi) } else { 1.0 };
```

#### Group Child Handling

In the existing `layout_shape_object()` recursive call structure, `child_w/child_h` is calculated as `current_width x render_sx`, so internal coordinate scaling is automatically applied to Group children.

#### Fix 3: Solid Fill Condition Fix

**File**: `src/renderer/layout.rs`

HWP `pattern_type` value meanings:
- `0` = No fill (transparent)
- `-1` = Solid fill (no pattern)
- `> 0` = Pattern fill

The existing condition `pattern_type <= 0` also treated `-1` (solid fill) as transparent, so solid backgrounds for shadow effect polygons (`#7f936b`) were not rendered. Fixed to `pattern_type == 0` so solid fills render correctly.

#### Fix 4: Group Object Parsing and Rendering Verification

**Files**: `src/parser/control.rs`, `src/renderer/layout.rs`

- `parse_gso_control()` detects group objects via `SHAPE_COMPONENT_CONTAINER` tag
- `parse_container_children()` recursively parses child shapes
- Renderer flattens groups: children rendered directly on parent with `render_tx/ty` offset applied
- KTX.hwp Dokdo group object (1 rectangle + 6 polygons) confirmed correctly parsed and rendered

#### Fix 5: Shape z-order Rendering Order Application

**Files**: `src/renderer/layout.rs`, `src/model/shape.rs`

- Added `ShapeObject::z_order()` method — returns `common.z_order` for all shape variants
- `build_render_tree()` second pass: sorts shapes by z-order before rendering
- Lower z-order -> rendered first (below), higher z-order -> rendered later (above)

### Verification Results

| Item | Result |
|------|--------|
| Rust tests | All 532 passed |
| WASM build | Succeeded |
| Vite build | Succeeded |
| KTX.hwp SVG | 2 straight lines + polygon (solid + gradient) + group object (Dokdo 7 children) rendered correctly, z-order applied |
| treatise sample.hwp SVG | 9 pages output normally |

### Modified Files

| File | Changes |
|------|---------|
| `src/parser/control.rs` | Polygon/curve parser: (x,y) interleaved pair read + fixed-point 16.16 -> HWPUNIT conversion |
| `src/renderer/layout.rs` | Line/Polygon/Curve internal coordinate scaling, solid fill condition fix, group flattening, z-order sorted rendering |
| `src/model/shape.rs` | Added `ShapeObject::z_order()` method |
