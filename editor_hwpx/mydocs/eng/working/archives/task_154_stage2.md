# Task 154 Step 2 Completion Report

> **Date**: 2026-02-23
> **Step**: 2/3 — HWPX Image Coordinate Fix + Picture Property Mapping Enhancement

---

## Changes

### 1. Added `<hp:pos>` vertAlign/horzAlign Parsing

**File**: `src/parser/hwpx/section.rs`

- Parsed `vertAlign`, `horzAlign` attributes from `<hp:pos>` element, mapped to `common.vert_align`, `common.horz_align`
- Supported values: TOP/CENTER/BOTTOM/INSIDE/OUTSIDE (vert), LEFT/CENTER/RIGHT/INSIDE/OUTSIDE (horz)

### 2. Prevented `<offset>` → `<pos>` Overwrite

**File**: `src/parser/hwpx/section.rs`

- **Problem**: `<hp:offset>` element (shape-transform offset) was overwriting `<hp:pos>`'s `vertOffset`/`horzOffset` (page-level coordinates)
  - Example: Picture 2's `<pos>` vertOffset=20745 → overwritten by `<offset>` y=4294947388 (=-19908 signed)
- **Fix**: Introduced `has_pos` flag
  - Set `has_pos = true` when `<pos>` is parsed
  - Apply `common.horizontal_offset`/`common.vertical_offset` from `<offset>` only when `has_pos` is false
  - Always store in `shape_attr.offset_x`/`offset_y` (preserve group-internal coordinates)

### 3. Added ShapeComponentAttr Parsing

**File**: `src/parser/hwpx/section.rs`

Mapped `shape_attr` fields from HWPX XML attributes that the HWPX parser previously never set:

| HWPX Element/Attribute | HWP Model Field | Purpose |
|------------------------|-----------------|---------|
| `<hp:pic groupLevel="N">` | `shape_attr.group_level` | Depth within group |
| `<hp:orgSz width="W" height="H">` | `shape_attr.original_width/height` | Renderer image fill size calculation (shape_layout.rs:559-560) |
| `<hp:curSz width="W" height="H">` | `shape_attr.current_width/height` | Current display size |
| `<hp:offset x="X" y="Y">` | `shape_attr.offset_x/offset_y` | Group-internal transform coordinates |

---

## Verification Results

| Item | Result |
|------|--------|
| `cargo test` | **608 passed**, 0 failed |
| `cargo clippy -- -D warnings` | **0 warnings** |
| HWPX 9 files SVG export | 84 SVGs, **0 errors** |
| FDI press release HWPX images | `<pos>` coordinates maintained (offset overwrite prevented) |
| Fiscal statistics HWP | HWP file no impact |

---

## Changed Files Summary

| File | Changes |
|------|---------|
| `src/parser/hwpx/section.rs` | `ShapeComponentAttr` import added, `has_pos` flag, vertAlign/horzAlign parsing, orgSz→shape_attr, curSz→shape_attr, offset→shape_attr, groupLevel parsing, shape_attr set on Picture creation |
