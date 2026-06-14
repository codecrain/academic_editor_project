# Task 36: Table Border Processing Enhancement - Stage 1 Completion Report

## Stage 1 Goal

Fix the issue where gradient backgrounds of decorative cells at the top/bottom of the table on page 1 of k-water-rfp.hwp render as transparent.

## Work Performed

### 1-1. Data Model Extension

- Defined `GradientFillInfo` struct in `src/renderer/mod.rs`
- Added `gradient: Option<Box<GradientFillInfo>>` field to `RectangleNode`, `EllipseNode`, `PathNode`
- Did not add gradient to `ShapeStyle` (to avoid performance issues: preventing RenderNodeType enum size explosion)

### 1-2. Style Resolver Extension

- Added `gradient: Option<Box<GradientFillInfo>>` field to `ResolvedBorderStyle`
- Implemented `FillType::Gradient` handling logic in `resolve_single_border_style()`
- Validation: 2~64 colors, center value within 200

### 1-3. Layout Engine Modification

- Changed `drawing_to_shape_style()` return type to `(ShapeStyle, Option<Box<GradientFillInfo>>)` tuple
- Modified all 5 call sites (Rectangle, Ellipse, Path, etc.)
- Passed gradient to `RectangleNode` at 4 cell background rendering locations

### 1-4. SVG Renderer Extension

- `<defs>` section management: records insertion position in `begin_page()`, inserts in `end_page()`
- `create_gradient_def()`: generates `<linearGradient>` / `<radialGradient>` SVG elements
- `build_gradient_stops()`: generates `<stop>` elements per color
- `angle_to_svg_coords()`: HWP angle → SVG x1/y1/x2/y2 coordinate conversion
- Added `draw_rect_with_gradient()`, `draw_ellipse_with_gradient()`, `draw_path_with_gradient()`

### 1-5. HWP Gradient Parsing Fix (Critical Bug Fix)

**Problem**: OOM (436M color array) caused by gradient field size errors in the HWP 5.0 spec document

**Cause**: The spec document states INT16 (2 bytes) but the actual binary uses different sizes

| Field | HWP 5.0 Spec | Actual Binary (Reference Verified) |
|-------|-------------|-------------------------------|
| kind | INT16 (2B) | u8 (1B) |
| angle | INT16 (2B) | u32 (4B) |
| center_x | INT16 (2B) | u32 (4B) |
| center_y | INT16 (2B) | u32 (4B) |
| step | INT16 (2B) | u32 (4B) |
| count | INT16 (2B) | u32 (4B) |

**Cross-verification**: Verified against Rust hwp crate (https://docs.rs/hwp) reference implementation
- Code comment: "Overall documentation errors exist, bytes differ"
- change_points: reads only 1 u32 when count > 2
- Additional info: additional_info_count(u32) + step_center(u8) + alpha(u8) required

## Changed Files

| File | Changes |
|------|---------|
| `src/parser/doc_info.rs` | Fixed gradient field sizes in `parse_fill()` |
| `src/renderer/mod.rs` | Defined `GradientFillInfo` struct |
| `src/renderer/render_tree.rs` | Added gradient field to 3 node types |
| `src/renderer/style_resolver.rs` | Added gradient resolution logic |
| `src/renderer/layout.rs` | Modified gradient passing logic |
| `src/renderer/svg.rs` | Implemented SVG gradient rendering |

## Verification Results

- **Unit tests**: All 416 passed
- **k-water-rfp.hwp**: Successfully exported all 30 pages as SVG (no OOM)
  - 2 `<radialGradient>` elements generated for page 1 decorative rows
  - Colors: #d6e6fe (light blue) → #000080 (navy)
  - center: cx=50%, cy=52%
- **All samples**: All 20 HWP files exported successfully

## SVG Output Example (k-water-rfp_001.svg)

```xml
<defs>
  <radialGradient id="grad1" cx="50%" cy="52%" r="50%" fx="50%" fy="52%">
    <stop offset="0.0%" stop-color="#d6e6fe"/>
    <stop offset="100.0%" stop-color="#000080"/>
  </radialGradient>
</defs>
...
<rect x="84.81" y="247.73" width="630.37" height="11" fill="url(#grad1)"/>
```
