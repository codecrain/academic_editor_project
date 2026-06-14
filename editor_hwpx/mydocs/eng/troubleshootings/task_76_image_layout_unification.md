# Troubleshooting: Repeated Regressions Due to Inconsistent Image Layout Logic

## Problem

When fixing image/shape placement, fixing one location would cause regressions in another, a pattern that occurred repeatedly.

## Root Cause

In `layout.rs`, coordinate calculations for Picture and Shape were **duplicated with different logic across two functions**.

### 3 Inconsistencies Found

| Axis/Reference | `layout_body_picture()` | `layout_shape()` | HWP Spec Correct Answer |
|----------------|------------------------|-------------------|------------------------|
| **VertRelTo::Page** | `col_area.y + offset` | `offset` (no reference point!) | `body_area.y + offset` |
| **HorzRelTo::Para** | `container.x + offset` | `col_area.x + offset` | `container.x + offset` |
| **Inline alignment** | Based on `container.x/width` | Based on `col_area.x/width` | `container.x/width` |

Additionally, `calculate_shape_reserved_height()` also used only offset without a reference point for `VertRelTo::Page`.

### Problem Mechanism

1. Fix a specific reference (e.g., VertRelTo::Page) in `layout_body_picture()`
2. `layout_shape()` is separate code, so the fix is not reflected
3. Shape-based images (grouped objects, etc.) regress
4. Fixing `layout_shape()` creates inconsistency with the Picture side

## Resolution

### Extracted Unified `compute_object_position()` Function

```rust
fn compute_object_position(
    &self,
    common: &CommonObjAttr,
    obj_width: f64,
    container: &LayoutRect,
    col_area: &LayoutRect,
    body_area: &LayoutRect,
    para_y: f64,
    alignment: Alignment,
) -> (f64, f64)
```

Unified rules (per HWP spec):

```
Horizontal (X):
  treat_as_char -> paragraph alignment (container-based)
  Paper  -> 0 + offset
  Page   -> body_area.x + offset
  Column -> col_area.x + offset
  Para   -> container.x + offset

Vertical (Y):
  treat_as_char -> para_y
  Paper  -> 0 + offset
  Page   -> body_area.y + offset
  Para   -> para_y + offset
```

### Refactoring Targets

1. `layout_body_picture()` -- replaced with unified function call
2. `layout_shape()` -- replaced with unified function call
3. `calculate_shape_reserved_height()` -- added `body_area` parameter, applied unified rules

### Refined Paper Bypass Condition

```rust
// Before: OR (bypass body clip if either axis is Paper)
let is_paper_based = vert == Paper || horz == Paper;

// After: AND (bypass only when both axes are Paper)
let is_paper_based = vert == Paper && horz == Paper;
```

## Verification

- 491 Rust tests passing (488 existing + 3 new regression tests)
- hwp-multi-001.hwp: 3 group images on page 2 correct
- hwp-3.0-HWPML.hwp: page 1 background image correct
- hwp-img-001.hwp: 4 standalone images correct
- Web browser verification complete

## Lessons Learned

1. **Unify coordinate calculations in a single function**: Distributing the same calculation across multiple locations inevitably produces inconsistencies.
2. **Regression tests are essential**: All sample files' image positions should be automatically verified when making image placement changes.
3. **Standardize on the HWP spec**: VertRelTo::Page means "relative to page area," so `body_area.y` is the correct answer. Different interpretations per function are unacceptable.
