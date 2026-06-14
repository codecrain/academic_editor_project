# Task 15 Implementation Plan: Character Width Ratio Rendering

## Step 1: Add ratio Field to TextStyle and Pass Through

**Changed files:**
- `src/renderer/mod.rs` — Add `pub ratio: f64` to `TextStyle`
- `src/renderer/layout.rs` — Pass `ratio` in `resolved_to_text_style()`

**Completion criteria:** Existing tests pass, ratio value is transferred through to TextStyle

---

## Step 2: Apply Ratio to Width Estimation and SVG/Canvas/HTML Renderers

**Changed files:**
- `src/renderer/layout.rs` — Reflect ratio in `estimate_text_width()`
- `src/renderer/svg.rs` — Apply transform in `draw_text()`
- `src/renderer/web_canvas.rs` — Apply scale in `draw_text()`
- `src/renderer/html.rs` — Apply scaleX in `draw_text()`

**Completion criteria:** Horizontal scaling works when ratio != 1.0, existing tests pass

---

## Step 3: Add Tests and Verify

**Tasks:**
- Add unit tests related to character width ratio
- Verify rendering with sample documents
- Confirm WASM build

**Completion criteria:** All tests pass, WASM build succeeds
