# Task 176: Line Spacing/Caret Height Not Updated on Font Size Change

## Symptom

When incrementally increasing font size with the `^` button in the format bar (style-bar):
- Text size increases but
- Line spacing (line_height) stays the same, causing lines to overlap
- Caret height does not match the changed font size

## Root Cause Analysis

### Fundamental Cause

`apply_char_format_native()` (formatting.rs) does not call `reflow_line_segs()` after changing fontSize (base_size), so `LineSeg.line_height` is not updated.

| Function | Line spacing recalculation | Result |
|----------|--------------------------|--------|
| `apply_para_format_native()` | Calls `reflow_line_segs()` | Normal |
| `apply_char_format_native()` | Does NOT call `reflow_line_segs()` | **Bug** |

### Additional Cause

Inside `reflow_line_segs()`, when original LineSeg exists (`has_valid_orig = true`), there is logic to preserve `line_height`, so simply calling reflow also reuses original values. On font size change, `line_segs.clear()` must invalidate the originals for new max_font_size-based calculation.

### Impact Scope

- Body paragraphs: `apply_char_format_native()`
- Cell paragraphs: `apply_char_format_in_cell_native()`

## Fix Approach

When font size change detected via `mods.base_size.is_some()`:
1. `para.line_segs.clear()` — Invalidate original LineSeg
2. `reflow_line_segs()` — Recalculate line_height based on max_font_size
3. Cell paragraphs: additionally mark `table.dirty = true`

## Modified Files

| File | Change Description |
|------|-------------------|
| `src/document_core/commands/formatting.rs` | Add reflow to body + cell apply_char_format |

## Verification Methods

1. `cargo test` — 615 tests pass
2. WASM build then confirm font size increment/decrement in web editor
