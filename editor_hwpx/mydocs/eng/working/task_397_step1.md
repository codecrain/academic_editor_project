# Task 397 — Stage 1 Completion Report: SkParagraph Deep Analysis

## Architecture

### Pipeline

```
ParagraphBuilder
  -> addText(text, TextStyle)   // Accumulate text + style
  -> Build()
  -> Paragraph (immutable object)
      -> layout(max_width)       // Line breaking, glyph placement calculation
      -> paint(canvas, x, y)     // Rendering
      -> getLineMetrics()        // Per-line metrics query
      -> getRectsForRange()      // Per-range bounding boxes
      -> getGlyphPositionAtCoordinate()  // Coordinate -> glyph reverse mapping
```

### Core Components

| Component | Role |
|-----------|------|
| **ParagraphBuilder** | Builder pattern. Accumulates text and styles to create Paragraph |
| **Paragraph** | Immutable layout object. Calculates line breaking/placement on layout() call |
| **TextStyle** | Character-level style (font, size, color, letter-spacing, word-spacing, decoration) |
| **ParagraphStyle** | Paragraph-level style (alignment, max lines, ellipsis, text direction) |
| **StrutStyle** | Forced line height setting (font size, height, leading, forced application) |
| **LineMetrics** | Per-line metrics (baseline, ascent, descent, width, height) |

### Internal Engine

- **Text shaping**: HarfBuzz (ligatures, kerning, complex scripts)
- **Line breaking**: ICU-based Unicode Line Breaking Algorithm
- **BiDi**: ICU BiDi (RTL/LTR mixed)
- **Font fallback**: Platform-specific + custom fallback chains

## HWP Property Mapping Analysis

### CharShape <-> TextStyle

| HWP CharShape | SkParagraph TextStyle | Mapping Feasibility |
|---------------|----------------------|---------------------|
| `font_ids[7]` (per-language) | `setFontFamilies(vector)` | Partial: 1:1 mapping impossible. HWP has 7 per-language fonts, Skia uses fallback chain |
| `base_size` (HWPUNIT) | `setFontSize(SkScalar)` | Excellent: Unit conversion needed (HWPUNIT -> pt) |
| `ratios[7]` (width ratio) | N/A | None: Skia has no width ratio concept. Different from font-stretch |
| `spacings[7]` (letter spacing) | `setLetterSpacing(SkScalar)` | Partial: HWP has per-language spacing, Skia has single value |
| `bold` / `italic` | `setFontStyle(SkFontStyle)` | Excellent |
| `underline_type/shape` | `setDecoration(TextDecoration)` + `setDecorationStyle()` | Partial: HWP has more line types |
| `strikethrough` / `strike_shape` | `setDecoration(kLineThrough)` | Partial |
| `text_color` | `setColor(SkColor)` | Excellent |
| `shadow_type/offset/color` | `addShadow(TextShadow)` | Partial |
| `subscript` / `superscript` | `setBaselineShift(SkScalar)` + size adjustment | Partial: Manual implementation needed |
| `relative_sizes[7]` (relative size) | N/A | None: Per-language relative size not directly supported |
| `char_offsets[7]` (char position) | `setBaselineShift()` | Partial: Per-language individual application impossible |
| `kerning` | HarfBuzz auto-processing | Excellent: Skia handles automatically |
| `emboss` / `engrave` | N/A | None: Custom rendering needed |
| `emphasis_dot` | N/A | None: Custom rendering needed |

### ParaShape <-> ParagraphStyle/StrutStyle

| HWP ParaShape | SkParagraph | Mapping Feasibility |
|---------------|-------------|---------------------|
| `alignment` | `setTextAlign()` | Excellent: Left/Right/Center/Justify correspondence |
| `margin_left/right` | N/A (external handling) | — Skia doesn't support paragraph margins, handled at layout level |
| `indent` | N/A | — First line indent not directly supported |
| `spacing_before/after` | N/A | — Paragraph spacing handled externally |
| `line_spacing` + `line_spacing_type` | StrutStyle `setHeight()` + `setLeading()` | Partial: Difficult to fully correspond with HWP's 4 line spacing types (Percent/Fixed/BetweenLines/AtLeast) |
| `tab_def_id` (tab definition) | `setReplaceTabCharacters()` | None: Skia tab support extremely limited |
| `numbering_id` (numbering/bullets) | N/A | None: External implementation needed |
| `border_fill_id` (paragraph border) | N/A | None: External implementation needed |

### LINE_SEG <-> LineMetrics

| HWP LINE_SEG | SkParagraph LineMetrics | Mapping Feasibility |
|--------------|------------------------|---------------------|
| `vpos` (vertical position) | `baseline` | Partial: Different coordinate systems |
| `line_height` | `height` (ascent + descent + leading) | Partial |
| `text_height` | `ascent + descent` | Partial |
| `baseline` | `baseline` | Excellent |
| `line_spacing` | `height - (ascent + descent)` | Partial |
| `column_spacing` | N/A | — External handling |
| `segment_width` | `width` | Excellent |

## skia-safe Rust Bindings and WASM Feasibility

### Rust Bindings (skia-safe crate)

- `skia_safe::textlayout` module provides Paragraph, ParagraphBuilder, etc.
- Major API bindings complete: Paragraph::layout(), paint(), get_line_metrics()
- Includes UTF-16 offset support methods (`get_line_number_at_utf16_offset()`, etc.)

### WASM Build Status

| Target | Status | Notes |
|--------|--------|-------|
| `wasm32-unknown-emscripten` | Supported | Requires Emscripten environment |
| `wasm32-unknown-unknown` | Not supported | Cannot use wasm-bindgen/wasm-pack |
| `wasm32-wasi` | Not supported | Compatibility issues |

**Key problem**: rhwp builds with `wasm32-unknown-unknown` + `wasm-pack`, but skia-safe does not support this target. Switching to Emscripten would require a complete overhaul of the existing WASM build chain.

## Pros and Cons Summary

### Pros

1. **Proven production quality**: Used in Flutter, Chrome. Complete text shaping/line breaking/BiDi support
2. **Rich query API**: LineMetrics, getRectsForRange(), getGlyphPositionAtCoordinate() — directly usable for editor features
3. **HarfBuzz integration**: Automatic kerning, ligatures, complex script handling
4. **Rust bindings exist**: Accessible via skia-safe crate

### Cons

1. **Critical WASM incompatibility**: `wasm32-unknown-unknown` not supported. Incompatible with rhwp WASM build chain
2. **C++ dependency**: Not pure Rust but FFI bindings. Build complexity greatly increased
3. **HWP special properties unsupported**: Width ratio, per-language spacing/font, emphasis dot, emboss/engrave — HWP-specific property mapping impossible
4. **Paragraph-level features lacking**: Margins, indentation, paragraph spacing, tab definitions, etc. must be handled outside Skia
5. **Massive dependency**: Full Skia build required (build time, binary size greatly increased)

## Conclusion

SkParagraph has top-tier text shaping/line breaking quality, but is difficult to adopt directly in rhwp due to **WASM (`wasm32-unknown-unknown`) non-support** and **HWP-specific property mapping limitations**. However, the API design patterns (ParagraphBuilder, LineMetrics, coordinate reverse mapping) are worth referencing when redesigning the rhwp typesetting system.
