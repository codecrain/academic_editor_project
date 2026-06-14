# Task 17 Implementation Plan: Text Selection (B-301)

## Step 1: Rust — Per-character Position Calculation API

**Changed files:**
- `src/renderer/layout.rs`
- `src/wasm_api.rs`

**Tasks:**
1. Change `is_cjk_char()` visibility to `pub(crate)`
2. Add `compute_char_positions(text, style) -> Vec<f64>` function
   - N characters → N+1 boundary values returned (0th is 0.0)
   - Reflect ratio (character width ratio), letter_spacing
3. Add `get_page_text_layout(page_num)` WASM method
   - Traverse render tree → collect TextRun nodes → JSON serialization

**Completion criteria:** Existing 233 tests pass, WASM build succeeds

---

## Step 2: JavaScript — TextLayoutManager and hit-test

**Changed files:**
- `web/text_selection.js` (new)

**Tasks:**
1. `TextLayoutManager` class: loadPage, hitTest, getSelectionRects, getSelectedText
2. Coordinate conversion: Canvas CSS scale correction

**Completion criteria:** hitTest call returns accurate run/char index

---

## Step 3: Overlay Canvas and Selection Highlight Rendering

**Changed files:**
- `web/index.html`
- `web/style.css`
- `web/text_selection.js`

**Tasks:**
1. Add `#canvas-wrapper` div + `#selection-canvas` overlay canvas
2. CSS: Overlay canvas absolute position, pointer-events: none
3. `SelectionRenderer` class: clear, drawSelection

**Completion criteria:** Selection area is displayed correctly on overlay

---

## Step 4: Mouse Event Integration and Clipboard Copy

**Changed files:**
- `web/text_selection.js`
- `web/app.js`

**Tasks:**
1. `SelectionController` class: mousedown/mousemove/mouseup/dblclick/keydown handling
2. Ctrl+C → clipboard copy, Ctrl+A → select all
3. `app.js` integration: Load text layout after page rendering and initialize controller

**Completion criteria:** Mouse drag selection, highlight display, Ctrl+C copy working
