# Task 76 Final Report: Image Placement Logic Root Cause Analysis and Systematization

## Summary

Resolved the issue where Picture and Shape coordinate calculations in `layout.rs` were duplicated with different logic by creating a unified `compute_object_position()` function. Fixed inconsistencies in VertRelTo::Page, HorzRelTo::Para, and inline alignment at 3 locations, and refined Paper bypass conditions.

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Extracted unified `compute_object_position()` function. Replaced coordinate calculations in 3 functions (`layout_body_picture()`, `layout_shape()`, `calculate_shape_reserved_height()`) with unified function calls. Refined Paper bypass condition from OR to AND |
| `src/wasm_api.rs` | Added 3 regression tests (multi_001 group image, background image body clip, img-001 standalone image) |

## Key Fixes

| Inconsistency | Before | After |
|----------------|--------|-------|
| VertRelTo::Page (Shape) | `offset` (no base point) | `body_area.y + offset` |
| HorzRelTo::Para (Shape) | `col_area.x + offset` | `container.x + offset` |
| Paper bypass | OR (either axis is Paper) | AND (both axes are Paper) |

## Verification Results

- 491 Rust tests passed (existing 488 + 3 new)
- SVG export: hwp-multi-001, hwp-3.0-HWPML, hwp-img-001, img-start-001 normal
- WASM build succeeded
- Vite build succeeded
- Web browser rendering confirmed normal
