# Task 96 — Final Report: Container/Group Object Rendering Implementation

## Date
2026-02-16

## Summary

Implemented correct positioning of child shapes within HWP document container/group objects. Includes affine transform matrix composition order fix, textbox vertical alignment support, and web Canvas arrow rendering.

## Work Performed

### 1. Affine Transform Matrix Composition Order Fix

**Problem**: Group child shape rendering positions did not match the original HWP
**Cause**: Transform matrix composition order in `parse_shape_component_full()` was `T x S x R`, but the actual HWP spec requires `T x R x S`
**Fix**: `src/parser/control.rs` — corrected to compose rotation first, then scale

```rust
// Before: result = compose(&result, &scale); compose(&result, &rotation);
// After:
result = compose(&result, &rotation);  // rotation first
result = compose(&result, &scale);     // scale after
```

**Verification**: SVG comparison of `samples/basic/docdo.hwp` (grouped) vs `docdo-1.hwp` (ungrouped) — error within ~0.1px

### 2. TextBox Vertical Alignment (Top/Center/Bottom)

**Problem**: Legend textbox text in KTX.hwp displayed stuck to the top
**Cause**: `list_attr` bits 5-6 (vertical alignment flags) were not being parsed

**Modified files**:
- `src/model/shape.rs` — Added `TextBox.vertical_align` field
- `src/parser/control.rs` — Parsed vertical alignment from LIST_HEADER for both independent shapes and group children
- `src/renderer/layout.rs` — Calculated vertical alignment offset in `layout_textbox_content()`

### 3. Group Child LIST_HEADER Data Parsing

**Problem**: Vertical alignment worked for independent shapes but not when grouped
**Cause**: `parse_container_children()` skipped LIST_HEADER records with `continue`, not parsing data (list_attr, margins, max_width)

**Fix**: Captured LIST_HEADER data and reflected attributes when creating TextBox. Added SHAPE_COMPONENT inline text attributes as fallback.

### 4. Web Canvas Arrow Rendering

**Problem**: Legend arrows displayed in SVG but not in web Canvas
**Cause**: SVG supports arrows via `<marker>` elements, but Canvas 2D has no equivalent feature

**Fix**: `src/renderer/web_canvas.rs`
- `calc_arrow_dims()` — Arrow size calculation (same logic as SVG renderer)
- `draw_arrow_head()` — Canvas path drawing for 9 ArrowStyle types (Arrow, ConcaveArrow, Diamond, Circle, Square, etc.)
- `draw_line()` — Start/end arrow support and line endpoint adjustment

## Modified Files

| File | Changes |
|------|---------|
| `src/model/shape.rs` | `TextBox.vertical_align` field, `render_b`/`render_c` affine components |
| `src/parser/control.rs` | Matrix composition order fix, LIST_HEADER parsing, 4-tuple return |
| `src/renderer/layout.rs` | Affine transform layout, vertical alignment offset, group child routing |
| `src/renderer/web_canvas.rs` | Arrow rendering (9 types, start/end) |
| `src/main.rs` | dump-controls improvement |
| `mydocs/tech/hwp_spec_5.0.md` | Spec typo fix, matrix composition order annotation |

## Commit History

| Hash | Description |
|------|-------------|
| `b2da7f3` | Group child shape rendering coordinate fix (affine transform + spec document) |
| `e4cda09` | TextBox vertical alignment + web Canvas arrow rendering |

## Troubleshooting Documents

- `mydocs/troubleshootings/task_96_group_child_matrix_composition_order.md` — Matrix composition order
- `mydocs/troubleshootings/task_96_group_child_textbox_vertical_align.md` — Group child vertical alignment

## Test Results

- 532 tests passed
- WASM build successful
- Vite build successful

## Sample Verification

| File | Verification Item | Result |
|------|------------------|--------|
| docdo.hwp / docdo-1.hwp | Group vs ungrouped position match | Normal (~0.1px) |
| tbox-center.hwp | Independent textbox vertical center alignment | Normal |
| tbox-center-02.hwp | Group child textbox vertical center alignment | Normal |
| KTX.hwp | Legend vertical alignment + arrows | Normal |

## Known Limitations

- Web Canvas space/tab width may appear narrower than SVG (native): native uses `font_size x 0.5` heuristic, WASM uses browser `measureText()` actual values, causing discrepancy
