# Task 124 Implementation Plan -- Glyph Path Rendering (Vector Text)

## Overall Implementation Phases (4 Phases)

---

## Phase 1: Add ttf-parser Dependency and Implement Glyph Cache Module

### Goal
Build infrastructure to parse TTF font files, extract glyph outlines, and cache them.

### Changed Files and Content

**Cargo.toml**
- Add `ttf-parser = "0.25"` dependency (zero-allocation, no_std compatible)

**src/renderer/glyph_cache.rs** (new)
- `GlyphOutline` struct: `Vec<PathCommand>` (reuse existing PathCommand)
- `FontFace` struct: ttf-parser Face wrapper + units_per_em cache
- `GlyphCache` struct:
  - `fonts: HashMap<String, FontFace>` -- font name -> parsed Face
  - `glyphs: HashMap<(String, GlyphId), GlyphOutline>` -- (font, glyph) -> path
- `load_font(name: &str, data: &[u8])` -- register after ttf-parser::Face::parse()
- `get_glyph_outline(font_name: &str, ch: char) -> Option<&GlyphOutline>` -- lazy parse + cache
- `OutlineBuilder` trait implementation: move_to/line_to/quad_to/curve_to/close -> PathCommand conversion
  - TTF's quad_to (quadratic Bezier) -> Canvas's bezier_curve_to (cubic Bezier) degree elevation

**src/renderer/mod.rs**
- Add `pub mod glyph_cache;`

### Key Coordinate Conversion
- TTF glyph: em units (based on units_per_em), Y-axis positive upward
- Canvas: px units, Y-axis positive downward
- Conversion: `x_px = x_em * font_size / units_per_em`, `y_px = -y_em * font_size / units_per_em`

### Verification
- `cargo build` succeeds
- `cargo test` 571 tests pass
- Unit test: verify glyph outline extraction for character 'ga' from HamChoRom Batang

---

## Phase 2: WASM Font Loading API and draw_text Glyph Path Rendering

### Goal
Receive font files in WASM, register them in the glyph cache, and render using glyph paths instead of fillText in draw_text().

### Changed Files and Content

**src/wasm_api.rs**
- Add `load_font(name: &str, data: &[u8]) -> Result<(), JsValue>` WASM API
- Add `glyph_cache: GlyphCache` field to `HwpDocument`
- Pass glyph_cache reference to renderer in `render_page_to_canvas()`

**src/renderer/web_canvas.rs**
- Add `glyph_cache: Option<&GlyphCache>` field to `WebCanvasRenderer`
- Modify `draw_text()`:
  ```
  for each cluster:
    if glyph outline lookup succeeds in glyph_cache:
      ctx.save()
      ctx.translate(char_x, y)
      ctx.scale(font_size/upm, -font_size/upm)  // em->px + Y-axis flip
      if has_ratio: ctx.scale(ratio, 1.0)
      ctx.beginPath()
      for cmd in outline.commands:
        moveTo/lineTo/bezierCurveTo
      ctx.fill()
      ctx.restore()
    else:
      existing fillText() fallback
  ```

### Verification
- WASM build succeeds
- Verify Korean text glyph path rendering after loading HamChoRom Batang TTF in web
- Verify fillText fallback behavior (for fonts not loaded)

---

## Phase 3: JS Font Loading and Font Matching

### Goal
Auto-load TTF fonts in the web editor and match them with HWP document font names.

### Changed Files and Content

**web/editor.js**
- Add `_loadDefaultFonts()` function:
  - `fetch('/ttfs/hamchob-r.ttf')` -> `doc.loadFont('HamChoRom Batang', arrayBuffer)`
  - `fetch('/ttfs/hamchod-r.ttf')` -> `doc.loadFont('HamChoRom Dotum', arrayBuffer)`
  - Re-render current page after loading completes
- Ensure font loading -> rendering order in `openFile()` flow
- Font name matching (HWP font name -> TTF file):
  - "HamChoRom Batang" -> hamchob-r.ttf
  - "HamChoRom Dotum" -> hamchod-r.ttf
  - English names like HCR Batang / HCR Dotum also matched

**web/index.html** (or web server config)
- Verify TTF file serving path (`/ttfs/` accessible)

### Verification
- Rendering after font load: text displayed via glyph paths
- Rendering before font load: normal display via fillText fallback
- Verify TTF file loading and caching in network tab

---

## Phase 4: Integration Testing and Performance Verification

### Verification Items

| Item | Method |
|------|--------|
| 571 regression tests | `docker compose run --rm test` |
| WASM build | `docker compose run --rm wasm` |
| Korean text rendering | Verify glyph path quality at zoom 100%/200%/300% |
| English text rendering | HamChoRom's English glyphs or fillText fallback |
| Special character/symbol rendering | Characters without glyphs -> fillText fallback |
| Old Korean jamo | Cluster-level glyph processing |
| 300% zoom | Text quality comparison against Hancom |
| Performance | Page rendering time measurement (vs. fillText) |
| Font loading failure | fillText fallback works normally |

---

## Impact Scope Summary

| File | Phase | Changes |
|------|-------|---------|
| Cargo.toml | 1 | ttf-parser dependency addition |
| src/renderer/glyph_cache.rs | 1 | Glyph cache module (new) |
| src/renderer/mod.rs | 1 | glyph_cache module declaration |
| src/wasm_api.rs | 2 | load_font API, glyph_cache field |
| src/renderer/web_canvas.rs | 2 | draw_text glyph path rendering |
| web/editor.js | 3 | Font loading and matching |

## Technical Details

### TTF Coordinate System -> Canvas Coordinate System

```
TTF: Y-up (positive upward), em units (units_per_em = 2048, etc.)
Canvas: Y-down (positive downward), px units

Conversion:
  canvas_x = glyph_x * (font_size_px / units_per_em)
  canvas_y = -glyph_y * (font_size_px / units_per_em)

Origin: translate to (char_x, baseline_y) then apply scale
```

### Quadratic Bezier -> Cubic Bezier Degree Elevation

Convert ttf-parser's `quad_to(x1, y1, x, y)` (TrueType curve) to Canvas's `bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)` (cubic):

```
From start point (x0, y0):
  cp1x = x0 + 2/3 * (x1 - x0)
  cp1y = y0 + 2/3 * (y1 - y0)
  cp2x = x + 2/3 * (x1 - x)
  cp2y = y + 2/3 * (y1 - y)
```

Or use Canvas's `quadraticCurveTo` directly (verify web-sys support).
