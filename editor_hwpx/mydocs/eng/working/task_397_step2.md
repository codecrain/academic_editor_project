# Task 397 — Stage 2 Completion Report: cosmic-text Deep Analysis

## Architecture

### Pipeline

```
FontSystem (1 per app)
  -> fontdb-based font discovery/caching

Buffer (1 per text widget)
  -> set_text(text, Attrs) or set_rich_text(spans, Attrs)
  -> BufferLine[] (line-level management)
      -> shape(FontSystem)     // BiDi analysis -> shaping -> ShapeLine
      -> layout(font_size, width, wrap, hinting)  // Line breaking -> LayoutLine[]
  -> layout_runs()             // Iterator for rendering
  -> hit(x, y)                 // Coordinate -> Cursor reverse mapping
  -> draw(callback)            // Rendering
```

### Core Components

| Component | Role |
|-----------|------|
| **FontSystem** | fontdb-based font discovery. 3-level caching (font/matching/codepoint) |
| **Buffer** | Multi-line text container. Caches shaping/layout results |
| **BufferLine** | Single line (paragraph). Rich text with text + AttrsList |
| **AttrsList** | Per-character-range Attrs mapping. Multiple styles within one line |
| **Attrs** | Font family, weight, stretch, style, color, letter_spacing, font_features |
| **Metrics** | Only 2 values: font_size(px) + line_height(px) |
| **ShapeLine** | Shaping result (harfrust-based glyph sequences) |
| **LayoutLine** | Layout result (w, max_ascent, max_descent, glyphs) |
| **Editor** | Buffer wrapper. Cursor/selection/editing features |

### Internal Engine

- **Text shaping**: harfrust (Rust port of HarfBuzz) — ligatures, kerning, complex script support
- **Line breaking**: unicode-linebreak + 4 Wrap modes (None/Word/Glyph/WordOrGlyph)
- **BiDi**: unicode-bidi (full Unicode BiDi Algorithm)
- **Font fallback**: fontdb + platform-specific fallback lists (reuses Chromium/Firefox static lists)
- **Rendering**: swash (glyph rasterizing, 4x4 subpixel binning)

### Caching Strategy

| Level | Target | Invalidation |
|-------|--------|-------------|
| Shape cache | Per BufferLine | On text/attribute change |
| Layout cache | Per BufferLine | On Metrics/width/wrap change |
| Font cache | FontSystem global | Permanent (Arc shared) |
| Font match cache | FontSystem global | LRU 256 entries |
| Glyph raster cache | SwashCache | Permanent |
| Shape buffer reuse | Between calls | Reused per call |

## HWP Property Mapping Analysis

### CharShape <-> Attrs

| HWP CharShape | cosmic-text Attrs | Mapping Feasibility |
|---------------|-------------------|---------------------|
| `font_ids[7]` (per-language) | `family(Family)` | Partial: Single family only. Per-language font switching depends on font fallback |
| `base_size` (HWPUNIT) | `Metrics.font_size` (px) | Excellent: Unit conversion needed |
| `ratios[7]` (width ratio) | `stretch(Stretch)` | Partial: Stretch is CSS font-stretch, different concept from HWP width ratio |
| `spacings[7]` (letter spacing) | `letter_spacing_opt` (EM units) | Partial: Single value, per-language spacing impossible |
| `bold` | `weight(Weight::BOLD)` | Excellent |
| `italic` | `style(Style::Italic)` | Excellent |
| `text_color` | `color_opt(Color)` | Excellent |
| `underline/strikethrough` | N/A | None: Text decoration outside cosmic-text scope, external rendering |
| `shadow` | N/A | None: External rendering |
| `subscript/superscript` | `metrics_opt` (size adjustment) | Partial: Position offset is manual |
| `relative_sizes[7]` | `metrics_opt` | Partial: Per-language individual application impossible |
| `char_offsets[7]` | N/A | None |
| `kerning` | harfrust auto-processing | Excellent |
| `font_features` (OpenType) | `font_features` | Excellent: Directly supported in Attrs |
| `emboss/engrave/emphasis_dot` | N/A | None: External rendering |

### ParaShape <-> Buffer/Metrics

| HWP ParaShape | cosmic-text | Mapping Feasibility |
|---------------|-------------|---------------------|
| `alignment` | `Align` (Left/Right/Center/Justified/End) | Excellent |
| `line_spacing` + `line_spacing_type` | `Metrics.line_height` (single px value) | Partial: Difficult to correspond with HWP's 4 line spacing types |
| `margin_left/right` | N/A | — Handled in external layout |
| `indent` | N/A | — Handled in external layout |
| `spacing_before/after` | N/A | — Handled in external layout |
| `tab_def_id` | `Buffer.set_tab_width(u16)` | Partial: Fixed tab width only, custom tab stops unsupported |
| `numbering_id` | N/A | None: External implementation |
| `border_fill_id` | N/A | None: External implementation |

### LayoutLine <-> LINE_SEG

| cosmic-text LayoutLine | HWP LINE_SEG | Mapping Feasibility |
|------------------------|--------------|---------------------|
| `w` (width) | `segment_width` | Excellent |
| `max_ascent` | `baseline` (partial) | Partial |
| `max_descent` | `text_height - baseline` | Partial |
| `max_ascent + max_descent` | `text_height` | Partial |
| `line_height_opt` | `line_height` | Partial: HWP line_height includes spacing |
| `glyphs` (Vec\<LayoutGlyph\>) | N/A | — HWP has no glyph-level info |

## WASM Build Feasibility

### Current Status

| Item | Status |
|------|--------|
| Pure Rust | Excellent: No C/C++ dependencies |
| `wasm32-unknown-unknown` target | Partial: Not officially confirmed, but structurally possible |
| `no_std` support | Good: Shaping+layout usable with `default-features = false` |
| fontdb (font discovery) | None: System font access impossible in WASM |
| swash (rasterizing) | — Unnecessary since rhwp uses Canvas/SVG rendering |

### WASM Considerations

1. **Font loading**: Need `FontSystem::new_with_fonts([])` + manual font registration instead of `FontSystem::new()`
2. **Font data**: Include font files in WASM bundle or dynamic fetch loading
3. **no_std mode**: System dependencies removable when using only shaping+layout
4. **Binary size**: Expected WASM size increase with harfrust (estimated 1~3MB)

## Pros and Cons Summary

### Pros

1. **Pure Rust**: No C/C++ FFI. Clean build, high `wasm32-unknown-unknown` compatibility potential
2. **harfrust text shaping**: Automatic kerning, ligatures, complex script handling
3. **BiDi support**: unicode-bidi based RTL/LTR mixed text
4. **Rich text**: AttrsList for multiple style ranges within one line
5. **Built-in editing features**: Editor, Cursor, Selection, hit() coordinate reverse mapping
6. **Aggressive caching**: Shape/Layout/Font 3-level cache for incremental recalculation during editing
7. **Active maintenance**: Core library for System76/COSMIC desktop (v0.18.2, 2026-02)
8. **License**: MIT / Apache-2.0 (compatible with rhwp MIT)

### Cons

1. **HWP-specific properties unsupported**: Width ratio, per-language spacing/font, emphasis dot, emboss/engrave, etc.
2. **Metrics limitation**: Only font_size + line_height. HWP's 4 line spacing types, paragraph spacing, etc. unsupported
3. **Paragraph-level features lacking**: Margins, indentation, paragraph spacing, custom tab stops, etc. need external handling
4. **Text decoration unsupported**: Underline, strikethrough, shadow, etc. need external rendering
5. **WASM font loading**: System font access impossible, manual registration or dynamic loading required
6. **WASM binary size**: Size increase with harfrust

## Conclusion

cosmic-text is a modern text layout library with pure Rust + text shaping (harfrust) + BiDi + editing features, with high WASM compatibility potential and affinity with rhwp's tech stack (Rust + wasm-pack).

However, cosmic-text is a **general-purpose text editor** library, and the paragraph-level features (margins, indentation, line spacing types, paragraph spacing, tab definitions, etc.) required by HWP's **document typesetting engine** are out of scope. Therefore, rather than full adoption of cosmic-text, **selectively adopting only the shaping engine (harfrust) and line breaking engine** while maintaining and strengthening rhwp's own paragraph/page layout implementation is the realistic direction.
