# Task 92 — Implementation Plan

## Step Division (3 steps)

### Step 1: Top-level Shape Internal Coordinate Scaling

**Target**: `src/renderer/layout.rs` — `layout_shape_object()` function

**Changes**:
- Line rendering: Apply `common.width/original_width`, `common.height/original_height` scale to `start/end` coordinates
- Polygon rendering: Apply same scale to `points[]` coordinates
- Curve rendering: Pass scale parameters to `curve_to_path_commands()`

**Scale calculation**:
```rust
let (sx, sy) = compute_shape_internal_scale(common, &drawing.shape_attr);
```

**Verification**:
- KTX.hwp SVG export → confirm first line 127mm, second line 150mm
- Existing tests pass

### Step 2: Group Child Shape Internal Coordinate Scaling

**Target**: `src/renderer/layout.rs` — `layout_shape_object()` Group branch

**Changes**:
- Propagate internal coordinate scale when calling `layout_shape_object()` for Group children
- Child's effective size = `current_width * render_sx` (already applied)
- Child's internal coordinate scale = `effective_size / original_size`

**Verification**:
- KTX.hwp group objects (route map, legend) rendering confirmed
- Existing tests pass

### Step 3: Build Verification + SVG Comparison

**Work**:
- `docker compose run --rm test` — all Rust tests pass
- `docker compose run --rm wasm && npm run build` — WASM/Vite build
- KTX.hwp SVG export → shape position/size visual verification
- treatise sample.hwp SVG export → existing rendering maintained

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Line/Polygon/Curve internal coordinate scaling, Group child scale propagation |
