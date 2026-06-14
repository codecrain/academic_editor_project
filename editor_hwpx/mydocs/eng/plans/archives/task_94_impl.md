# Task 94: Implementation Plan

## Step-by-Step Implementation Plan (3 steps)

### Step 1: Model + Parser Modification

**Files**: `src/model/shape.rs`, `src/parser/control.rs`

- Add `vert_align: VertAlign`, `horz_align: HorzAlign` fields to `CommonObjAttr`
- `VertAlign` enum: Top(0), Center(1), Bottom(2), Inside(3), Outside(4)
- `HorzAlign` enum: Left(0), Center(1), Right(2), Inside(3), Outside(4)
- Parse attr bits 5-7 → vert_align, bits 10-12 → horz_align in `parse_common_obj_attr()`

### Step 2: Renderer Position Calculation Fix

**File**: `src/renderer/layout.rs`

- Add `obj_height` parameter to `compute_object_position()`
- Vertical alignment calculation:
  - Top(0): existing `base_y + v_offset`
  - Center(1): `base_y + (ref_height - obj_height) / 2 + v_offset`
  - Bottom(2): `base_y + ref_height - obj_height - v_offset`
- Horizontal alignment calculation:
  - Left(0): existing `base_x + h_offset`
  - Center(1): `base_x + (ref_width - obj_width) / 2 + h_offset`
  - Right(2): `base_x + ref_width - obj_width - h_offset`
- Update all `compute_object_position()` call sites

### Step 3: Build, Test, Verification

- `docker compose --env-file /dev/null run --rm test` — all tests pass
- `export-svg samples/basic/BookReview.hwp` — position confirmed
- Commit and merge
