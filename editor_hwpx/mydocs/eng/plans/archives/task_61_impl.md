# Task 61: SVG Text Rendering Improvement - Implementation Plan

## Phase 1: svg.rs draw_text() Per-Character Rendering Conversion (~40 lines)

### svg.rs

1. Add `compute_char_positions()` call in `draw_text()` method
2. Change from single `<text>` output to per-character loop:
   - Skip space characters (same as canvas)
   - Each character's x-coordinate = base_x + char_positions[i]
   - Width ratio (ratio != 1.0): `transform="translate(char_x,y) scale(ratio,1)"`
   - No width ratio (ratio approximately 1.0): `x="char_x" y="y"`
3. Remove SVG `letter-spacing` attribute (already reflected in coordinates)
4. Underline/strikethrough: output as `<line>` SVG element (using full text width)
5. Add `use super::layout::compute_char_positions;` import

## Phase 2: Fix Existing Tests + Add New Tests (~20 lines)

### svg.rs tests

1. `test_svg_text_ratio` -- Change assertions to verify per-character output
2. `test_svg_text_ratio_default` -- Verify per-character x-coordinates
3. New test: `test_svg_text_letter_spacing` -- Verify per-character x-coordinate spacing with letter spacing applied
4. New test: `test_svg_text_char_positions` -- Verify SVG x-coordinates match compute_char_positions results

## Phase 3: Build + Test + Visual Verification

1. Native build
2. Full test suite (480 pass)
3. WASM build
4. k-water-rfp.hwp SVG export -- verify text rendering with width ratio/letter spacing applied
