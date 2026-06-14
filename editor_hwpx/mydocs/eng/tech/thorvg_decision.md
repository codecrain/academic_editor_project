# ThorVG Technical Review Decision Record

## Document Information

| Item | Details |
|------|---------|
| Date | 2026-02-19 |
| Review Period | Tasks 112-115 (2026-02-18 -- 2026-02-19) |
| Decision | ThorVG **not adopted** as rhwp rendering backend |
| Code Rollback | Restored main/devel to Task 111 completion commit (`46d417a`) |

## Summary

A POC spanning 4 tasks was conducted to validate ThorVG (Samsung open-source vector graphics engine)
as an alternative rendering backend for the HWP web editor (rhwp-studio) to replace Canvas 2D.
The conclusion was that it is **unsuitable for real-time editing** and was decided against adoption.

## POC Work Summary

| Task | Content | Result |
|------|---------|--------|
| 112 | Rust FFI bindings + native PNG rendering | ThorVG C API -> Rust FFI 30 functions, HWP->PNG output successful |
| 113 | Emscripten WASM build + WebGL rendering | Docker build pipeline, JS bridge, WebGL 2.0 GPU direct rendering |
| 114 | rhwp-studio integration + editing feature validation | Renderer switch UI, caret/selection/IME all working on GL |
| 115 | TTF font metrics + per-character individual placement | ttf-parser based glyph measurement, charPositions array, width ratio transform |

## Reasons for Non-Adoption

### 1. Post-Edit Re-rendering Latency (Structural Limitation)

Canvas 2D's `fillText()` is processed synchronously with GPU acceleration inside the browser.
ThorVG GL must go through an asynchronous multi-layer pipeline:

```
Canvas 2D: Key input -> WASM -> fillText() -> immediate display (1 hop)

ThorVG GL: Key input -> WASM -> JSON serialization -> JS JSON.parse()
  -> setupCanvas() -> preloadFonts() -> renderNode()
  -> GL rendering -> drawImage(GL->2D) -> screen display (7+ hops)
```

This latency can be reduced through optimization but **cannot be fundamentally eliminated**
as long as the **WASM <-> JS <-> WebGL boundary** must be crossed. Perceptible lag occurred during Korean text input.

### 2. Font Handling Inefficiency

| Comparison | Canvas 2D | ThorVG |
|-----------|-----------|--------|
| Font Loading | CSS `@font-face` -> browser auto-handles | TTF fetch -> WASM heap copy -> `tvg_font_load_data()` |
| On New Font Discovery | Transparently handled | Rendering blocking (on hot path) |
| Font Fallback | Browser built-in chain | Must implement manually |
| Memory Management | Browser managed | Resident in WASM heap |

ThorVG is optimized for **embedded environments with 1-2 fixed fonts** (Tizen TV, Lottie).
The scenario of **real-time font binding with different fonts per document** as in word processors
is outside its design scope.

### 3. Shared GL Canvas Race Condition

ThorVG uses a single GL canvas, and when multiple pages start asynchronous rendering simultaneously
in a virtual scroll environment, `setupCanvas()` destroys the previous page's ThorVG canvas.
Resolvable with a serialization queue, but this introduces additional latency during multi-page rendering.

### 4. Native Build Dependency

The ThorVG C library (`libthorvg-1`) is required for native builds,
necessitating additional installation in the Docker development environment. This complicates the existing pure Rust build chain.

## Positive Findings from the POC

### Architecture Validation Succeeded

- **Renderer-independent editing infrastructure**: Confirmed that caret, hit-testing, and IME operate completely independently from the rendering backend since they are based on DOM overlays and WASM APIs
- **Render tree (JSON) abstraction**: Confirmed that renderer replacement via intermediate representation actually works
- **Same pattern as Google Docs**: Reconfirmed that the Canvas + DOM overlay + hidden textarea structure is the correct design

This architecture validation serves as a useful foundation when reviewing other rendering backends in the future.

## Decisions Made

1. **Remove ThorVG code**: Roll back all ThorVG-related code added in Tasks 112-115
2. **Keep Canvas 2D**: Continue using Canvas 2D as the default rendering backend for real-time editing
3. **Keep render tree structure**: The render tree (JSON) abstraction is already used for SVG export, so it is retained
4. **Preserve ThorVG code**: Code is preserved in `local/task112`~`local/task115` branches, available for reference when server-side rendering or export features are needed

## Conditions for Future ThorVG Re-evaluation

ThorVG reintroduction can be considered when the following conditions are met:

- When server-side PNG/PDF export functionality is needed (native environment, no time constraints)
- When GPU-accelerated rendering is needed in a read-only viewer
- When ThorVG's web font support has improved

## Reference Documents

- [thorvg_poc_insights.md](thorvg_poc_insights.md) -- Detailed POC insights report
- [mydocs/plans/task_112.md](../plans/task_112.md) ~ [task_115.md](../plans/task_115.md) -- Individual task plans
- [mydocs/feedback/font-metrics.md](../feedback/font-metrics.md) -- Font metrics related feedback
