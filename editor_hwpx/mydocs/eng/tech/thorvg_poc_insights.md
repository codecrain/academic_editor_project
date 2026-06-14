# ThorVG POC Insights Report

## Overview

A POC spanning Tasks 112-115 was conducted to validate ThorVG as an alternative rendering backend
for the HWP web editor (rhwp-studio). This report summarizes the technical insights gained through the POC.

### POC Progress

| Task | Content | Key Achievement |
|------|---------|----------------|
| 112 | Rust FFI bindings + native rendering | ThorVG C API -> Rust FFI 30 functions, HWP->PNG output successful |
| 113 | Emscripten WASM build + WebGL rendering | Docker build pipeline, JS bridge, WebGL 2.0 GPU direct rendering |
| 114 | rhwp-studio integration + editing feature validation | Renderer switch UI, caret/selection/IME all working on GL |
| 115 | TTF font metrics + per-character individual placement | ttf-parser based glyph measurement, charPositions array, width ratio transform |

---

## 1. What Was Validated: Strengths of rhwp Architecture

### 1.1 Renderer-Independent Editing Infrastructure

Pre-POC hypothesis:
> Since the editing infrastructure (caret, hit-testing, IME) uses WASM's document model coordinate system,
> editing features should work as-is by simply replacing the rendering backend.

**Result: Hypothesis confirmed.**

| Editing Feature | Works? | Reason |
|----------------|--------|--------|
| Caret position display | O | DOM overlay (`position:absolute` div) -- independent from renderer |
| Mouse click -> caret movement | O | WASM `hitTest()` API -- independent from renderer |
| Text input (Korean IME) | O | Hidden textarea -- independent from renderer |
| Text selection (drag) | O | DOM overlay -- independent from renderer |
| Deletion (Backspace/Delete) | O | WASM document model manipulation -- independent from renderer |

This result is because rhwp's architecture follows the same "Annotated Canvas" pattern as Google Docs
(Canvas rendering + DOM overlay + hidden textarea).
The fact that editing infrastructure is unaffected by rendering backend replacement
means the architecture design achieves proper separation.

### 1.2 Render Tree-Based Abstraction

The structure where the Rust parser/layout engine generates a **render tree (JSON)**
and each rendering backend consumes it worked effectively:

```
HWP Document -> Rust Parser -> Layout Engine -> Render Tree (JSON)
                                                      |
                                       +--------------+--------------+
                                       |                             |
                                Canvas 2D Rendering          ThorVG Rendering
                                (for web editor)             (for export/preview)
```

The render tree serves as an intermediate representation (IR) that enables renderer replacement.

---

## 2. Discovered Limitations: Areas Where ThorVG Is Unsuitable for Web Editors

### 2.1 Post-Edit Re-rendering Latency

**Symptom**: Perceptible lag from key input to screen update during Korean text input

**Cause**: Canvas 2D uses synchronous rendering, but ThorVG GL goes through an asynchronous pipeline

```
[Canvas 2D Edit Loop -- Synchronous]
Key input -> WASM insertText -> renderPageToCanvas() -> immediate screen update

[ThorVG GL Edit Loop -- Asynchronous]
Key input -> WASM insertText -> canvasPool.releaseAll() -> (blank screen)
  -> exportRenderTree() -> JSON.parse()
  -> setupCanvas() -> ThorVG canvas destroy/recreate
  -> preloadFonts() -> render tree traversal
  -> renderNode() -> full tree traversal + ThorVG object creation
  -> canvas_update/draw/sync -> GL rendering
  -> drawImage(GL->2D) -> screen update
```

Canvas 2D's `fillText()` is a single browser-native call,
while ThorVG GL must traverse the entire pipeline including JSON serialization/parsing +
WASM calls + GL rendering + canvas copying every time.

**Structural limitation**: This latency can be reduced through optimization but cannot be fundamentally eliminated.
Canvas 2D's `fillText()` is processed with GPU acceleration inside the browser,
whereas ThorVG must cross the multi-layer WASM <-> JS <-> WebGL boundary.

### 2.2 Concurrent Rendering Race Condition

**Symptom**: Page 1 blank on initial rendering, displays normally after scrolling and returning

**Cause**: ThorVG shares a single GL canvas, and when multiple pages start asynchronous rendering
simultaneously, `setupCanvas()` destroys the previous page's ThorVG canvas

```
Page 0: setupCanvas() -> await preloadFonts() (waiting for font fetch)
    | (yield)
Page 1: setupCanvas() -> destroys Page 0's ThorVG canvas!
    |
Page 0: renderNode() -> draws on already-destroyed canvas -> blank screen
```

**Solution**: Added a serialization queue (Promise chain) to `renderToCanvas()` to ensure sequential execution.
However, this serialization itself causes additional latency during multi-page rendering.

### 2.3 Font Handling Inefficiency

**Canvas 2D font handling**:
- Just declare CSS `@font-face` and the browser auto-handles loading/caching/fallback
- Rendering is not blocked when encountering new fonts (FOUT/FOIT browser policy)
- System fonts and web fonts are transparently supported

**ThorVG font handling**:
- Direct TTF binary fetch -> copy to WASM heap -> `tvg_font_load_data()` registration
- Each rendering traverses the render tree to collect font names -> wait for unregistered font fetches
- Font loading is **on the rendering hot path**, causing blocking
- Font fallback chain must be implemented manually

| Comparison | Canvas 2D | ThorVG |
|-----------|-----------|--------|
| Font Loading | Browser background | Direct fetch + WASM load |
| On New Font Discovery | Transparent handling | Rendering blocking |
| Font Fallback | Browser built-in chain | Manual implementation |
| Memory Management | Browser managed | Resident in WASM heap |
| Suitable Scenario | Dynamic/diverse fonts | Fixed small number of fonts |

ThorVG is optimized for **embedded environments with 1-2 fixed fonts** like Tizen TV and Lottie players.
The scenario of **real-time font binding with different fonts per document** as in word processors
is not included in ThorVG's design goals.

---

## 3. Comparison with Google Docs Architecture

Based on review of the `mydocs/feedback/font-metrics.md` document,
a comparative analysis was conducted with Google Docs' Canvas-based rendering architecture.

### 3.1 Layout vs Painting Separation

| Item | Google Docs | rhwp |
|------|-------------|------|
| Layout Engine | Custom WASM engine | Rust WASM engine |
| Painting | Canvas 2D `fillText()` (delegated to browser) | Canvas 2D `fillText()` (same) |
| Rendering Consistency | TTF server analysis + WASM parsing | TTF client parsing (`ttf-parser`) |

Google Docs follows a **"calculate ourselves, let browser draw"** strategy.
rhwp follows the same strategy, and the POC reconfirmed this is the correct approach.

### 3.2 HarfBuzz (Text Shaping)

| Item | Google Docs | rhwp |
|------|-------------|------|
| Shaping Engine | HarfBuzz WASM port (presumed) | Not used |
| Canvas 2D Path | Leverages browser's built-in HarfBuzz | Indirectly leverages browser's built-in HarfBuzz |
| ThorVG Path | N/A | TTF raw advance width (no shaping) |

Korean (precomposed syllables) and Latin alphabets do not require complex shaping,
so TTF advance width-based placement without HarfBuzz is sufficient.
HarfBuzz is only needed when supporting complex scripts like Arabic or Hindi.

### 3.3 Annotated Canvas (Accessibility)

| Item | Google Docs | rhwp |
|------|-------------|------|
| Rendering Surface | Canvas per page | Canvas per page (same) |
| Input Handling | Hidden textarea | Hidden textarea (same) |
| Caret/Selection | DOM overlay | DOM overlay (same) |
| Accessibility DOM Tree | Transparent parallel DOM (`<p>`,`<span>` + ARIA) | **Not implemented** |
| Screen Reader | `aria-live` announcements | Not supported |

rhwp has the same visual/input infrastructure as Google Docs,
but the accessibility annotation layer is not yet implemented.
Additional implementation will be needed when accessibility requirements for HWP viewer/editor become pressing.

---

## 4. Conclusion: ThorVG's Suitable Domain

### 4.1 Role Division

| Use Case | Suitable Renderer | Reason |
|----------|-------------------|--------|
| **Real-time editing** | Canvas 2D | Synchronous rendering, browser font system, immediate screen update |
| **Read-only preview** | ThorVG GL | GPU acceleration, high-quality vector rendering, font preloading possible |
| **PNG/PDF export** | ThorVG Native | Server-side rendering, no browser needed, pixel consistency |
| **Print preview** | ThorVG GL | Batch rendering, preparation time acceptable |

### 4.2 Key Insights

1. **Don't try to beat browser capabilities**
   - Canvas 2D `fillText()` is processed with HarfBuzz + GPU acceleration inside the browser
   - ThorVG crossing the WASM->JS->WebGL multi-layer boundary cannot beat this speed for real-time editing
   - Google Docs delegates painting to the browser for the same reason

2. **ThorVG's strength is "offline rendering"**
   - It shines when fonts are preloaded and rendering happens without time constraints
   - Suitable for export, thumbnail generation, server-side rendering
   - At 200-500KB lightweight binary, lower deployment overhead compared to Skia (2-5MB)

3. **Architecture separation is a key asset**
   - The render tree (JSON) abstraction enables rendering backend replacement
   - Editing infrastructure (DOM overlays) operates independently from the renderer
   - This separation structure allows selecting the optimal renderer per use case

### 4.3 Future Direction

```
+-------------------------------------------------------------+
|                     rhwp Rendering Strategy                   |
|                                                               |
|  [Edit Mode]                      [Viewer/Export Mode]       |
|  Canvas 2D                        ThorVG                     |
|  |- Browser fillText()            |- GL (web preview)        |
|  |- Browser font system           |- Native (PNG/PDF export) |
|  |- Synchronous rendering         |- Font preloading         |
|  +- Immediate screen update       +- Batch rendering         |
|                                                               |
|  [Shared Infrastructure]                                     |
|  |- Rust Parser/Layout Engine (WASM)                         |
|  |- Render Tree (JSON)                                       |
|  |- TTF Font Metrics (ttf-parser)                            |
|  +- DOM Overlays (Caret/Selection/IME)                       |
+-------------------------------------------------------------+
```

---

## Appendix: Bugs Discovered/Fixed During POC

| Bug | Cause | Fix |
|-----|-------|-----|
| Page overflow error after TTF metrics applied | Added TTF path to `estimate_text_width()` -> inconsistency with Canvas 2D layout | Removed TTF path from layout.rs, applied only to render_tree.rs charPositions |
| ThorVG PNG export blank page | Used TTF internal family name -> ThorVG uses file stem | Changed to `Path::file_stem()` based |
| "Malgun Gothic" -> "HCR Dotum" substitution | Hardcoded in `resolve_ttf_font()` | Removed mapping (already registered in font-loader.ts) |
| ThorVG GL initial rendering page 1 missing | Multiple pages simultaneously async rendering -> shared GL canvas conflict | Added serialization queue to `renderToCanvas()` |
| ThorVG GL async rendering CSS zoom not applied | canvas.width set before async completion with CSS applied | Passed zoom to renderPageThorvg, applied after rendering completion |
