# Task 30: Caret Position Accuracy Improvement — Final Report

## Change Summary

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | Added 6 font style fields to `get_page_text_layout_native()` JSON |
| `web/text_selection.js` | Added `_remeasureCharPositions()` method, called from `loadPage()` |

## Change Details

### Stage 1: Font Style Info Added to WASM JSON (src/wasm_api.rs)

Added the following info from each TextRunNode's `style` field to JSON in `collect_text_runs()`:
- `fontFamily`: Font name
- `fontSize`: Font size (px)
- `bold`: Bold flag
- `italic`: Italic flag
- `ratio`: Width ratio (1.0 = 100%)
- `letterSpacing`: Letter spacing (px)

### Stage 2: JS measureText-Based charX Recalculation (web/text_selection.js)

Added `_remeasureCharPositions()` method to `TextLayoutManager` class:
1. Creates offscreen Canvas (once per instance)
2. Sets Canvas context using font info from WASM for each run
3. Calls `measureText()` per text prefix to reconstruct charX array
4. Reflects width ratio and letter spacing
5. Updates `run.w` with last recalculated charX value

Called `_remeasureCharPositions()` immediately after WASM data parsing in `loadPage()`.

## Root Cause and Solution

| Item | Before | After |
|------|--------|-------|
| charX calculation | Heuristic (Korean=font_size, Latin=font_size*0.5) | Canvas `measureText()` actual font metrics |
| Caret position | Misaligned with rendered characters | Matches browser rendering position |
| hitTest accuracy | Wrong character selected on click | Accurate character selection |

## Test Results

- `docker compose run --rm test` — 390 tests all passed
- `docker compose run --rm wasm` — WASM build successful

## Unresolved Items

- `estimate_text_width()` (for compositor line breaking) retains existing heuristic. Improving line break accuracy requires a WASM↔JS measurement callback architecture, which can be separated as a separate task.
