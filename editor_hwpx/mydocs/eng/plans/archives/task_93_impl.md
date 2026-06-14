# Task 93: Implementation Plan

## Step-by-Step Implementation Plan (4 steps)

### Step 1: Data Model Modification

**File**: `src/model/shape.rs`

- `LineShape.attr: u16` → `LineShape.started_right_or_bottom: bool` (hwplib: startedRightOrBottom)
- `ArcShape.attr: u32` → `ArcShape.arc_type: u8` (hwplib: ArcType enum, 0=Arc, 1=CircularSector, 2=Bow)
- Search and update all related reference code

### Step 2: Parser Function Fixes

**File**: `src/parser/control.rs`

| Function | Changes |
|----------|---------|
| `parse_line_shape_data()` | `read_u16()` → `read_i32()`, boolean conversion |
| `parse_rect_shape_data()` | x[0..4]+y[0..4] → (x1,y1),(x2,y2),(x3,y3),(x4,y4) interleaved |
| `parse_polygon_shape_data()` | count `read_i16()` → `read_i32()`, remove `>>16` shift |
| `parse_curve_shape_data()` | count `read_i16()` → `read_i32()`, remove `>>16`, add `skip(4)` |
| `parse_arc_shape_data()` | `read_u32()` → `read_u8()` |

### Step 3: Renderer Code Adjustment

**File**: `src/renderer/layout.rs` and related files

- `LineShape.attr` reference → `started_right_or_bottom` reference
- `ArcShape.attr` reference → `arc_type` reference
- Verify rectangle coordinate indices (x_coords/y_coords usage locations)
- Verify polygon/curve coordinate scaling logic (check for >>16 related post-processing)

### Step 4: Build, Test, Verification

- `docker compose run --rm test` — all tests pass
- `docker compose run --rm dev cargo run -- export-svg samples/basic/KTX.hwp` — shape rendering
- Additional sample file SVG output comparison
- Commit
