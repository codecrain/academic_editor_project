# Task 397 — Stage 3 Completion Report: Comparative Analysis and rhwp Application Strategy

## Comparison Targets Summary

Comparing 3 text layout engines with rhwp's current architecture. During the Stage 2 analysis, linebender/parley emerged as an additional review candidate and is included in the comparison.

## Technical Comparison Table

| Item | SkParagraph | cosmic-text | parley | rhwp Current |
|------|-------------|-------------|--------|--------------|
| **Language** | C++ (Rust FFI) | Pure Rust | Pure Rust | Pure Rust |
| **Shaping** | HarfBuzz (C++) | harfrust | harfrust | None (per-char independent measurement) |
| **Line breaking** | ICU (C++) | unicode-linebreak | ICU4X (Rust) | Custom implementation |
| **BiDi** | ICU BiDi | unicode-bidi | ICU4X | None |
| **Font fallback** | Platform + custom | fontdb + static list | fontique | None (built-in metrics) |
| **Font reading** | Skia internal | swash | skrifa (read-fonts) | None |
| **WASM compat** | None (emscripten only) | Partial (possible but unconfirmed) | Partial (pure Rust, high possibility) | Excellent (currently working) |
| **wasm32-unknown-unknown** | None | Partial | Partial | Excellent |
| **Editing features** | None | Editor (cursor/selection) | PlainEditor | Custom editor |
| **Rich text** | TextStyle stack | AttrsList ranges | StyleProperty ranges | CharShapeRef ranges |
| **Alignment** | L/R/C/Justify | L/R/C/Justified/End | L/R/C/Justified/End | L/R/C/Justify/Distribute |
| **Line spacing** | StrutStyle (height/leading) | Metrics (line_height) | line_height | 4 types (Percent/Fixed/BetweenLines/AtLeast) |
| **Paragraph margins/indent** | None | None | None | Excellent (custom implementation) |
| **Paragraph spacing** | None | None | None | Excellent (spacing_before/after) |
| **Tab definitions** | Limited | Fixed width only | Unknown | Excellent (L/R/C/Decimal + leader) |
| **Numbering/bullets** | None | None | None | Excellent (custom implementation) |
| **HWP width ratio** | None | None (stretch is different concept) | None | Excellent (ratios[7]) |
| **Per-language spacing** | None | None (single value) | None | Excellent (spacings[7]) |
| **Per-language fonts** | Font fallback dependent | Font fallback dependent | Font fallback dependent | Excellent (font_ids[7]) |
| **Text decoration** | Excellent | None (external) | Unknown | Excellent (custom rendering) |
| **Coordinate->glyph reverse mapping** | Excellent | Excellent (hit) | Excellent | Excellent (compute_char_positions) |
| **License** | BSD-3 | MIT/Apache-2.0 | MIT/Apache-2.0 | MIT |
| **Maturity** | Very high (Chrome/Flutter) | High (v0.18.2, COSMIC DE) | Growing (v0.8.0, NLnet support) | — |
| **Build complexity** | Very high (Skia C++) | Low | Low | — |

## rhwp Application Scenario Analysis

### Scenario A: Full cosmic-text Adoption

Delegate shaping + line breaking + layout entirely to cosmic-text.

| Item | Assessment |
|------|-----------|
| **Impact scope** | Complete replacement of text_measurement.rs, composer/, paragraph_layout.rs |
| **Migration difficulty** | Very high |
| **Pros** | Solves shaping/BiDi/font fallback in one go |
| **Risks** | Need to reimplement HWP-specific features (width ratio, per-language spacing, 4 line spacing types, tabs, numbering). cosmic-text Metrics has only font_size+line_height, fundamentally mismatched with HWP line spacing model. WASM font loading issues. Most of existing 755 tests destroyed |
| **Conclusion** | **Not recommended**. Losses outweigh gains |

### Scenario B: Full SkParagraph (skia-safe) Adoption

| Item | Assessment |
|------|-----------|
| **Impact scope** | Entire rendering pipeline |
| **Migration difficulty** | Extremely high |
| **Pros** | Highest quality text rendering |
| **Risks** | WASM build impossible due to `wasm32-unknown-unknown` non-support. Build complexity explosion from C++ dependency. HWP-specific property mapping limitations |
| **Conclusion** | **Impossible**. Cannot meet WASM compatibility requirements |

### Scenario C: Selective Shaping Engine Adoption

Directly adopt **harfrust** (pure Rust HarfBuzz) used by cosmic-text or parley to replace only text shaping. Maintain rhwp's own implementation for line breaking, paragraph layout, pagination.

| Item | Assessment |
|------|-----------|
| **Impact scope** | text_measurement.rs (TextMeasurer implementation), font_metrics_data.rs |
| **Migration difficulty** | Medium |
| **Replace targets** | 582 built-in font metrics -> harfrust real-time shaping |
| **Maintain targets** | composer/ (line breaking), paragraph_layout.rs, pagination/, all HWP-specific logic |
| **Pros** | (1) Accurate glyph measurement with kerning/ligatures -> improved editing line break accuracy (2) Eliminates unregistered font heuristics (3) No need for faux bold correction (4) Minimal changes to existing architecture |
| **Risks** | (1) Need font data loading strategy for WASM (2) Need to emulate HWP width ratio (ratios) with post-shaping scaling (3) WASM binary size increase (~1-3MB) |
| **WASM strategy** | Native: harfrust + system fonts. WASM: harfrust + JS Canvas fonts or bundled fonts |
| **Conclusion** | **Recommended for review**. Solves core problem (inaccurate text measurement) with minimal impact |

### Scenario D: Maintain Current + Selective Improvement

Incremental improvement within current architecture without external engine adoption.

| Item | Assessment |
|------|-----------|
| **Improvement items** | (1) Expand built-in font metrics (2) Improve WASM JS Canvas measurement accuracy (3) Enhance line breaking algorithm (4) Strengthen editing-time LINE_SEG recalculation logic |
| **Pros** | Complete preservation of existing architecture/tests. No WASM compatibility issues. Incremental progress possible |
| **Risks** | Fundamental limitations unresolvable (no shaping, no kerning). Font metrics maintenance cost continues increasing. Same type of bugs repeat as editing features advance |
| **Conclusion** | **Short-term effective**, long-term transition to Scenario C needed |

## Per-Scenario Summary Comparison

| Scenario | Shaping | WASM | HWP Compat | Difficulty | Recommended |
|----------|---------|------|-----------|-----------|-------------|
| A. cosmic-text full | Excellent | Partial | None | Very high | None |
| B. SkParagraph full | Excellent | None | None | Extremely high | None |
| **C. Shaping only** | **Excellent** | **Good** | **Excellent** | **Medium** | **Excellent** |
| D. Maintain+improve | None | Excellent | Excellent | Low | Partial (short-term) |

## Final Recommendation

### Short-term (Current~): Scenario D — Maintain Current + Selective Improvement

- Focus on bug fixes in editing-time LINE_SEG recalculation logic
- Enhance built-in font metrics
- Resolve current typesetting bugs one by one

### Medium-term (Subsequent tasks): Scenario C — harfrust Selective Adoption PoC

1. PoC for standalone adoption of harfrust + skrifa (or swash)
2. Add HarfrustMeasurer implementation to TextMeasurer
3. A/B comparison with existing EmbeddedTextMeasurer in native environment
4. Establish WASM font loading strategy (bundle vs fetch vs JS Canvas hybrid)
5. Gradual transition on success

### Note: parley Observation

parley (v0.8.0) is a stack integrating harfrust + ICU4X (line breaking/BiDi) + fontique (font fallback) + skrifa (font reading), offering an alternative to cosmic-text with a more modularized architecture. Under active development with NLnet support; worth re-evaluating as Scenario C implementation base once stabilized.
