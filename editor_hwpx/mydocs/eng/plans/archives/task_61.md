# Task 61: SVG Text Rendering Improvement (Per-Character Placement for Width Ratio/Letter Spacing) - Execution Plan

## Background

SVG export (`svg.rs`) `draw_text()` outputs text as a single `<text>` element. In contrast, canvas (`web_canvas.rs`) uses `compute_char_positions()` for per-character individual rendering. This difference causes width ratio (scaleX) and letter spacing to apply differently.

### Current Differences

| Item | Canvas (web_canvas.rs) | SVG (svg.rs) |
|------|----------------------|-------------|
| Width ratio | Per-character `translate + scale(ratio,1)` | Entire text `translate + scale(ratio,1)` |
| Letter spacing | Per-character x-coordinate via `compute_char_positions` | SVG `letter-spacing` attribute (browser-delegated) |
| Character placement | Per-character individual rendering | Entire text as one output |

### Problems

1. SVG width ratio applies `scale(ratio,1)` to entire text, so `letter-spacing` values are also scaled
2. SVG `letter-spacing` depends on browser font metrics, differing from HWP quantized results
3. Native `compute_char_positions` CJK heuristics (fullwidth=font_size, halfwidth=font_size*0.5) should apply identically to SVG

## Change Scope

- **Modified file**: `src/renderer/svg.rs` (draw_text method, 1 location)
- **Reference**: `src/renderer/layout.rs` (compute_char_positions -- already exists, usable in native build)

## Change Direction

Convert SVG `draw_text()` to per-character individual rendering identical to canvas:
- Output each character as individual `<text>` element
- Place at x-coordinates calculated by `compute_char_positions()`
- Width ratio applied per-character: `transform="translate(x,y) scale(ratio,1)"`
- Remove SVG `letter-spacing` attribute (already included in coordinate calculation)
- Underline/strikethrough output as `<line>` elements based on full text width
