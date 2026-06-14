# Task 30: Caret Position Accuracy Improvement

## Background

Currently, caret positioning and hit testing (click → character mapping) are inaccurate. The cause is that `compute_char_positions()` uses fixed heuristics (Korean=font_size, Latin=font_size*0.5) while Canvas `fill_text()` renders with the browser's actual font engine. This mismatch causes:
- Caret displays at a different position than the rendered character
- Clicking selects a different character than intended
- Cumulative error increases with more characters

## Solution Direction

Recalculate each run's `charX` on the JS side using the Canvas `measureText()` API. For this:
1. Add font info (font_family, font_size, bold, italic, ratio, letter_spacing) to WASM JSON output
2. Recalculate charX for each run on the JS side based on actual font metrics using an offscreen Canvas
3. Update run.w with the recalculated value for consistency with hitTest bbox

**The compositor (line breaking) `estimate_text_width()` is not changed in this task.**
- Line break errors are less noticeable than caret errors
- Modification would require WASM→JS measurement callbacks, greatly increasing architectural complexity

## Changed Files

| File | Task |
|------|------|
| `src/wasm_api.rs` | Add font style fields to `get_page_text_layout_native()` JSON |
| `web/text_selection.js` | Add measureText-based charX recalculation logic to `TextLayoutManager` |

## Verification Method

1. `docker compose run --rm test` — All existing tests pass
2. `docker compose run --rm wasm` — WASM build successful
3. Browser verification:
   - Verify caret positions exactly at rendered character boundaries
   - Verify correct character selection on click
   - Verify accuracy across Korean/English/mixed text
   - Verify caret position matches actual insertion point during text input
