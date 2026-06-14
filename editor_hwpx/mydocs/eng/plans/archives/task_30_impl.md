# Task 30: Caret Position Accuracy Improvement - Implementation Plan

## Phase 1: Add Font Style Information to WASM JSON

### File: `src/wasm_api.rs`

Add font style fields to the JSON output of `get_page_text_layout_native()` within `collect_text_runs()`.

**Additional fields:**
- `fontFamily`: Font name (e.g., "HamchoromDotum", "sans-serif")
- `fontSize`: Font size (px)
- `bold`: Bold flag
- `italic`: Italic flag
- `ratio`: Width ratio (1.0 = 100%)
- `letterSpacing`: Letter spacing (px)

**JSON output example (after change):**
```json
{
  "text": "Hello",
  "x": 100.0, "y": 200.0, "w": 500.0, "h": 20.0,
  "charX": [0.0, 100.0, 200.0, 300.0, 400.0, 500.0],
  "fontFamily": "HamchoromDotum",
  "fontSize": 10.0,
  "bold": false,
  "italic": false,
  "ratio": 1.0,
  "letterSpacing": 0.0,
  "secIdx": 0, "paraIdx": 0, "charStart": 0
}
```

### Verification
- `docker compose run --rm test` — Existing tests pass
- `docker compose run --rm wasm` — WASM build successful

---

## Phase 2: measureText-Based charX Recalculation in JS

### File: `web/text_selection.js`

Add `_remeasureCharPositions()` method to the `TextLayoutManager` class.

**Algorithm:**
1. Create offscreen Canvas (once)
2. For each run:
   a. Set run's font on Canvas 2D context
   b. If ratio != 1.0, apply `ctx.setTransform(ratio, 0, 0, 1, 0, 0)` before measurement
   c. Measure each prefix of the text with `measureText()` to reconstruct charX array
   d. Apply letterSpacing: add cumulative letterSpacing to each character position
   e. Update `run.w` to `charX[charX.length - 1]`

**Call location:** Call `this._remeasureCharPositions()` at the end of `loadPage()`

### Verification
- Verify in browser that caret is exactly at character boundaries
- Verify accuracy across Korean, English, and mixed text
- Verify click → caret position accuracy
- Verify caret restoration accuracy after text input

---

## Phase 3: Integration Testing and Wrap-Up

### Verification Items
1. `docker compose run --rm test` — All tests pass
2. `docker compose run --rm wasm` — WASM build successful
3. Browser verification:
   - Caret accuracy across documents with various fonts/sizes
   - Caret accuracy inside table cell text
   - Text selection (drag) highlight matches character ranges
4. Update today's task status
