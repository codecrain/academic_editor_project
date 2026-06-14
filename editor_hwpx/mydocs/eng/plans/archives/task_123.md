# Task 123 Execution Plan — Vector Quality Zoom

## 1. Goal

Solve the issue where the current web editor's zoom uses CSS `transform: scale()` to scale the canvas raster, causing text to appear blurry when zoomed in. By using Canvas 2D `ctx.scale()` to re-render at the zoom ratio, text/lines/curves are re-rasterized at that resolution, yielding crisp vector quality.

## 2. Current Status Analysis

### Current Zoom Structure
- `applyZoom()` → CSS `transform: scale(zoomLevel)` on `#canvas-wrapper`
- Canvas always renders at 1:1 document size (doesn't change)
- Zoom in shows pixels (raster approach)

### Rendering Pipeline
- WASM `render_page_to_canvas(page_num, canvas)` → build_page_tree → WebCanvasRenderer
- Canvas size = page size (DPI-based)
- No scale/zoom parameters

### Coordinate System
- Render tree: document coordinates (HWPUNIT → px conversion, DPI-based)
- Mouse: `_toPageCoords()` — screen → canvas conversion (`canvas.width / rect.width` ratio)
- Hit-test: based on document coordinates

## 3. Core Principle

- `canvas.width/height` = page size × scale (high-resolution backing store)
- Apply `ctx.scale(scale, scale)` then draw with render tree coordinates (document units) as-is
- Remove CSS transform → canvas displays at actual size
- Mouse coordinate conversion: screen → document = `÷ zoomLevel`
- Performance: immediate CSS scale + 150ms debounce then vector re-render (hybrid)

## 4. Implementation Scope

### Files to Change

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | Add scale parameter to `render_page_to_canvas` |
| `src/renderer/web_canvas.rs` | scale field, set_scale(), ctx.scale() in begin_page |
| `web/editor.js` | Rewrite applyZoom, pass zoom to renderCurrentPage, fix zoomFit |
| `web/text_selection.js` | Zoom scale in SelectionRenderer/Controller, fix _toPageCoords |

### Unchanged Areas
- Render tree structure (document coordinates preserved)
- DPI/pagination (unrelated to zoom)
- SVG renderer (native only)
- Test code (WASM-only change)

## 5. Risk Factors

- Zoom 3x → canvas 9x pixels → memory/performance (mitigated by debounce, 16384px max guard)
- Overlay coordinate mismatch (selection/caret) → resolved by ctx.scale synchronization
- Backward compatibility (scale omitted) → default 1.0 if `scale <= 0`
