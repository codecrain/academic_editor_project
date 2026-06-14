# Task 74: Group Shape Parsing and Rendering with Picture Children

## Background

HWP's "Group Shape" (Drawing Object > Group) bundles multiple objects (images, shapes, etc.) into a single group for simultaneous movement/resizing. Currently, the code only parses shape children (Line, Rectangle, etc.) within groups, **failing to handle Picture children**, which causes images to be missing or rendered as incorrect rectangles.

### Problem Analysis

| Location | Problem |
|----------|---------|
| `model/shape.rs:266` | `GroupShape.children: Vec<ShapeObject>` — cannot contain Picture |
| `parser/control.rs:724-736` | `parse_container_children()` does not handle PICTURE tag → creates default empty Rectangle |
| `renderer/layout.rs:3741-3749` | Group child rendering only matches ShapeObject types, no Picture |

### Verification Target

- `samples/hwp-multi-001.hwp` page 2 bottom: group of 3 images (bin_data 3,4,5)

---

## Implementation Plan

### Step 1: Model Extension — Add Picture Variant to ShapeObject

**Modified file**: `src/model/shape.rs`

Add `Picture` variant to `ShapeObject` enum:
```rust
pub enum ShapeObject {
    Line(LineShape),
    Rectangle(RectangleShape),
    Ellipse(EllipseShape),
    Arc(ArcShape),
    Polygon(PolygonShape),
    Curve(CurveShape),
    Group(GroupShape),
    Picture(Box<crate::model::image::Picture>),  // added
}
```

This allows `GroupShape.children: Vec<ShapeObject>` to naturally include Picture.

**Impact**: All code matching `ShapeObject` needs `Picture` branch added. Compiler's non-exhaustive match warning will identify all locations.

### Step 2: Parser Modification — Parse Picture as Group Child

**Modified file**: `src/parser/control.rs`

Modify `parse_container_children()`:

1. **Add PICTURE to shape tag matching** (lines 724-736):
```rust
tags::HWPTAG_SHAPE_COMPONENT_PICTURE => {
    shape_tag_id = Some(record.tag_id);
    shape_tag_data = &record.data;
}
```

2. **Add Picture branch to shape creation matching** (lines 762-805):
```rust
Some(tags::HWPTAG_SHAPE_COMPONENT_PICTURE) => {
    let picture = parse_picture(
        CommonObjAttr::default(),  // group children have empty common
        attr,                       // size/position info from shape_attr
        shape_tag_data,
    );
    ShapeObject::Picture(Box::new(picture))
}
```

### Step 3: Renderer Modification — Render Picture within Group

**Modified file**: `src/renderer/layout.rs`

1. **Handle ShapeObject::Picture in `layout_shape_object()`** (lines 3617-3777):
   - Add new branch for Picture variant
   - Reuse existing `layout_picture()` function for image rendering

2. **Add Picture to Group child matching** (lines 3741-3749):
```rust
ShapeObject::Picture(pic) => (&pic.common, None),
```
   - Determine coordinates from Picture's shape_attr offset_x, offset_y

3. **Other ShapeObject match code**: Add Picture branch to all `match ShapeObject` blocks flagged by compiler (including info command in main.rs)

### Step 4: Build and Verification

1. `docker compose --env-file /dev/null run --rm test` — all tests pass
2. `samples/hwp-multi-001.hwp` SVG export → confirm 3 images rendered on page 2
3. Existing `samples/hwp-img-001.hwp` SVG export → confirm existing image rendering normal (no regression)

---

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/model/shape.rs` | Add Picture variant to ShapeObject | ~3 lines |
| `src/parser/control.rs` | Add PICTURE parsing to parse_container_children() | ~15 lines |
| `src/renderer/layout.rs` | Picture rendering in Group + complete all ShapeObject match | ~30 lines |
| `src/main.rs` | Add Picture to info command ShapeObject match | ~5 lines |
| Other (serializer etc.) | ShapeObject match exhaustive handling | ~10 lines |
