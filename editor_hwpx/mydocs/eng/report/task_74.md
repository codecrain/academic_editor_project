# Task 74: Group Shape Parsing and Rendering — Final Report

## Overview

Implemented the HWP "Group Shape" (Drawing Object > Group) feature. This groups multiple objects (images, shapes, etc.) into a single unit. Previously, child objects that were Pictures within groups could not be processed, resulting in missing images or empty rectangles.

## Problems Solved

### 1. Model Extension — Added Picture Variant to ShapeObject

- Added `Picture(Box<Picture>)` variant to `ShapeObject` enum
- `GroupShape.children: Vec<ShapeObject>` can now include picture objects
- Manual Default implementation ensures `render_sx/sy` default to 1.0

### 2. Parser — Group Child Picture Parsing

- Added `HWPTAG_SHAPE_COMPONENT_PICTURE` tag matching in `parse_container_children()`
- Fixed legacy group detection: Changed from checking only `child_records[1]` to scanning all records for deeper-level SHAPE_COMPONENT
- Fixed `HorzRelTo` bit mapping: Per HWP spec, 0,1=page, 2=column, 3=para

### 3. Rendering Transform Matrix Parsing (Core)

Discovered that `current_width/height` in group child images represents the original image dimensions, and the actual display size is determined by the **rendering transform matrix** (affine transform) in SHAPE_COMPONENT.

- Added `render_tx/ty/sx/sy` fields to `ShapeComponentAttr`
- Implemented affine matrix composition (Translation x Scale[0] x Rot[0] x ...) in `parse_shape_component_full()`
- Group child coordinates: position via `render_tx/ty`, size via `current_size x render_sx/sy`

| Child | Original Size | Scale | Effective Size | Position |
|-------|--------------|-------|---------------|----------|
| Image 0 | 9480x3300 | (0.724, 0.724) | 6860x2387 | (0, 1133) |
| Image 1 (Banner) | 53640x8340 | (0.518, 0.446) | 27778x3720 | (9360, 0) |
| Image 2 | 6082x2457 | (1.472, 1.287) | 8949x3162 | (38559, 474) |

### 4. HorzRelTo::Page Body Area Reference Fix

- Changed `HorzRelTo::Page` from `x=0` (paper left edge) to `body_area.x + offset` (body area reference)
- Added `body_area` parameter to `layout_shape()` and `layout_body_picture()`

## Verification

- 488 Rust tests passed
- `samples/hwp-multi-001.hwp` page 2: 3 group images rendered correctly
- `samples/hwp-img-001.hwp`: 4 independent images normal (no regression)
- WASM build successful, verified in web browser

## Modified Files

| File | Changes |
|------|---------|
| `src/model/shape.rs` | Added Picture variant to ShapeObject, render_tx/ty/sx/sy to ShapeComponentAttr, manual Default |
| `src/parser/control.rs` | PICTURE parsing, rendering transform matrix composition, HorzRelTo bit fix, legacy group detection fix |
| `src/renderer/layout.rs` | Group child rendering transform application, HorzRelTo::Page body reference, body_area parameter addition |
| `src/serializer/control.rs` | Added ShapeObject::Picture branch |
| `src/main.rs` | Info command group child info output |
| `mydocs/plans/task_74_impl.md` | Implementation plan |
