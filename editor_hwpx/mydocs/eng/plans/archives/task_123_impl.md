# Task 123 Implementation Plan -- Vector Quality Zoom

## Overall Implementation Phases (4 Phases)

---

## Phase 1: Add scale Parameter to WASM render_page_to_canvas

### Goal
Add a scale parameter to the WASM rendering API to render the canvas at zoom magnification.

### Changed Files and Content

**src/wasm_api.rs** (lines 199-216)
- Add `scale: f64` to `render_page_to_canvas` signature
- Default to 1.0 if `scale <= 0` (backward compatibility)
- Canvas size = `(width * scale) as u32`, `(height * scale) as u32`
- Max canvas size 16384px guard
- Call `renderer.set_scale(scale)`

**src/renderer/web_canvas.rs**
- Add `scale: f64` field to `WebCanvasRenderer` (default 1.0)
- Add `set_scale(scale: f64)` public method
- Apply `ctx.scale(scale, scale)` in `begin_page()`
- On `clear()`: reset with `set_transform(1,0,0,1,0,0)` then re-apply

### Verification
- `cargo build` succeeds
- `cargo test` 571 tests pass

---

## Phase 2: Change JS applyZoom to Vector Re-rendering

### Goal
Replace CSS transform raster zoom with vector re-rendering zoom.

### Changed Files and Content

**web/editor.js**

Module variable additions:
- `_basePageWidth`, `_basePageHeight` -- page size at zoom 1.0 baseline
- `_zoomRenderTimer` -- debounce timer

`renderCurrentPage()` modification:
- Call `doc.renderPageToCanvas(currentPage, canvas, zoomLevel)`
- Store `_basePageWidth = canvas.width / zoomLevel`
- Pass `zoomLevel` to async re-render (lines 604-608) as well

`applyZoom()` rewrite:
- Immediate: CSS `transform: scale(cssRatio)` (target ratio relative to current canvas)
- Scaler size = `_basePageWidth * zoomLevel`
- 150ms debounced `_renderAtZoom(zoomLevel)` call

`_renderAtZoom(zoom)` new function:
- `doc.renderPageToCanvas(currentPage, canvas, zoom)`
- Overlay canvas size synchronization
- Remove CSS transform
- Update scaler size
- Redraw selection/caret/search highlights

`zoomFit()` modification:
- `baseWidth = canvas.width / zoomLevel`

### Verification
- WASM build succeeds
- Verify zoom 100%/200%/50% rendering in web

---

## Phase 3: Mouse Coordinate Conversion and Overlay Zoom Application

### Goal
Ensure mouse hit testing, caret, selection, and search highlights work accurately in zoomed state.

### Changed Files and Content

**web/text_selection.js**

SelectionRenderer modifications:
- Add `_zoom` field (default 1.0)
- `setZoomScale(zoom)` method
- In `clear()`: `setTransform(1,0,0,1,0,0)` -> clearRect -> `setTransform(zoom,0,0,zoom,0,0)`

SelectionController modifications:
- `_zoom` field, `setZoomScale(zoom)` method
- `_toPageCoords()`: `/ this._zoom` (screen -> document conversion)
- `_drawCaret()`: width `Math.max(1, 2 / this._zoom)` (minimum 1px on screen)

**web/editor.js**

Context menu hit test (lines 1892-1896):
- Apply `/ zoomLevel` to `cx`, `cy` calculation

### Verification
- At 200% zoom: text click -> caret position accurate
- At 200% zoom: drag selection -> area accurate
- At 200% zoom: table cell click/right-click -> cell selection accurate

---

## Phase 4: Integration Testing and Verification

### Verification Items

| Item | Method |
|------|--------|
| 571 regression tests | `docker compose run --rm test` |
| WASM build | `docker compose run --rm wasm` |
| 100% zoom rendering | Open document in web -> verify default rendering |
| Zoom in (200%) | Verify text sharpness |
| Zoom out (50%) | Verify normal rendering |
| Ctrl+wheel zoom | Debounce behavior (immediate CSS -> 150ms later vector) |
| Mouse hit test | Text click accuracy in zoomed state |
| Text selection | Drag selection accuracy in zoomed state |
| Search highlight | Highlight position in zoomed state |
| Table cell select/right-click | Cell selection accuracy in zoomed state |
| Zoom fit (zoomFit) | Page fit calculation |
| Caret blinking | Caret display after zoom change |

---

## Impact Scope Summary

| File | Phase | Changes |
|------|-------|---------|
| src/wasm_api.rs | 1 | scale parameter for render_page_to_canvas |
| src/renderer/web_canvas.rs | 1 | scale field, ctx.scale() |
| web/editor.js | 2, 3 | applyZoom rewrite, renderCurrentPage, zoomFit, context menu |
| web/text_selection.js | 3 | SelectionRenderer/Controller zoom scale |
