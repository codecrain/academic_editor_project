# Task 183: Table Background Feature Implementation — Execution Plan

## Background

Table cell background rendering is incomplete. Solid color backgrounds work, but pattern fill and image fill are not applied to table cells.

### Current Status

| Item | Status | Notes |
|------|--------|-------|
| Solid color background | Working | Rendered as fill_color |
| Gradient background | Working | Rendered as gradient |
| Pattern fill | Not implemented | SolidFill.pattern_type/pattern_color ignored |
| Image fill | Not connected | Exists in ResolvedBorderStyle but rendering not implemented |

### Test Example

- `samples/synam-001.hwp` — Second table on page 1

## Goal

1. Render table cell pattern fill correctly in SVG/Canvas
2. No impact on existing solid/gradient backgrounds
3. Connect image fill (if possible)

## Root Cause Analysis

### 1. `ResolvedBorderStyle` (style_resolver.rs)
- No `pattern` field
- `resolve_single_border_style()` does not extract SolidFill's `pattern_type`/`pattern_color`

### 2. `render_cell_background()` (table_layout.rs)
- Only processes `fill_color` and `gradient`
- Always passes None to `ShapeStyle.pattern`

### 3. Renderer infrastructure already exists
- SVG: `create_pattern_def()` — 6 pattern types (horizontal, vertical, diagonal, reverse diagonal, cross, grid)
- Canvas: `apply_pattern_fill()` — Canvas createPattern based
- `ShapeStyle.pattern: Option<PatternFillInfo>` already defined

## Fix Scope

| File | Change Description |
|------|-------------------|
| `src/renderer/style_resolver.rs` | Add pattern to ResolvedBorderStyle, extract pattern in resolve function |
| `src/renderer/layout/table_layout.rs` | Pass pattern in render_cell_background |

## Verification Methods

1. `cargo test` — All tests pass
2. `cargo build` — Native build succeeds
3. `cargo run --bin rhwp -- export-svg samples/synam-001.hwp` — Verify page 1 second table background
4. No impact on existing backgrounds (solid, gradient)
5. WASM build succeeds

## Schedule

Small implementation scope, can proceed as single step.
