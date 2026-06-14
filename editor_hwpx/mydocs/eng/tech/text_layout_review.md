# Text Layout Technical Review Report

> Task 397 | 2026-03-28 | High-level text layout technology review (SkParagraph + cosmic-text)

## 1. Purpose

Industry-standard text layout engine technical review for systematizing rhwp's typesetting system.

**Problem Context**: rhwp started as an HWP viewer and has since implemented editor features, but numerous detailed bugs occur during the page re-typesetting process when editing paragraphs (modify/add/delete). The root cause is that the pre-typesetting (LINE_SEG)-based structure from the viewer era does not align with the editor's dynamic re-typesetting requirements.

## 2. Technologies Reviewed

| Technology | Description | Version |
|-----------|-------------|---------|
| **SkParagraph** | Google Skia text layout module (C++, used by Flutter/Chrome) | Skia HEAD |
| **cosmic-text** | System76 pure-Rust text layout (COSMIC desktop) | v0.18.2 |
| **parley** | linebender pure-Rust rich text layout (NLnet-funded) | v0.8.0 |

## 3. rhwp Current Architecture and Limitations

### Architecture

```
Text input → Built-in font metrics (582 fonts) → Per-character independent width measurement
           → Custom line breaking (Hangul syllable/English word/CJK character)
           → LINE_SEG-based line placement
           → Paragraph layout (margins, indentation, alignment, tabs)
           → Pagination
           → SVG/Canvas rendering
```

### Key Limitations

| Component | Current State | Limitation |
|-----------|--------------|------------|
| Text measurement | Built-in metrics + WASM JS Canvas | Unregistered fonts → heuristic (CJK=1.0, Latin=0.5) |
| Shaping | None | No kerning, ligatures, or contextual substitution |
| Line breaking | Custom implementation | Incomplete UAX#14 |
| Font fallback | None | Cannot use unregistered fonts |
| BiDi | None | No RTL support |
| Bold | Faux Bold with empirical correction | Not actual glyph metrics |
| Re-typesetting on edit | LINE_SEG recalculation | Mismatch between line-break recalculation and LINE_SEG regeneration |

## 4. Technical Comparison

### 4.1 Text Shaping

| | SkParagraph | cosmic-text | parley | rhwp |
|-|-------------|-------------|--------|------|
| Engine | HarfBuzz (C++) | harfrust (Rust) | harfrust (Rust) | None |
| Kerning | Excellent | Excellent | Excellent | Not supported |
| Ligatures | Excellent | Excellent | Excellent | Not supported |
| Complex scripts | Excellent | Excellent | Excellent | Not supported |
| OpenType features | Excellent | Excellent | Excellent | Not supported |

### 4.2 Line Breaking / BiDi

| | SkParagraph | cosmic-text | parley | rhwp |
|-|-------------|-------------|--------|------|
| Line breaking | ICU (C++) | unicode-linebreak | ICU4X (Rust) | Custom |
| BiDi | ICU BiDi | unicode-bidi | ICU4X | None |
| Korean line breaking | Excellent | Good | Excellent (ICU4X) | Good (custom) |

### 4.3 WASM Compatibility

| | SkParagraph | cosmic-text | parley | rhwp |
|-|-------------|-------------|--------|------|
| wasm32-unknown-unknown | Not supported | Partial | Partial | Excellent |
| wasm-pack compatible | Not supported | Partial | Partial | Excellent |
| Pure Rust | No (C++ FFI) | Excellent | Excellent | Excellent |
| Build complexity | Extremely high | Low | Low | — |

### 4.4 HWP-specific Feature Compatibility

| HWP Feature | SkParagraph | cosmic-text | parley | rhwp |
|-------------|-------------|-------------|--------|------|
| Character width ratio (ratios) | Not supported | Not supported | Not supported | Excellent |
| Per-language letter spacing (spacings[7]) | Not supported | Not supported | Not supported | Excellent |
| Per-language fonts (font_ids[7]) | Depends on fallback | Depends on fallback | Depends on fallback | Excellent |
| 4 types of line spacing | Not supported | Not supported | Not supported | Excellent |
| Paragraph margins/indentation | Not supported | Not supported | Not supported | Excellent |
| Paragraph spacing | Not supported | Not supported | Not supported | Excellent |
| Custom tab stops | Limited | Fixed only | Unconfirmed | Excellent |
| Numbering/bullets | Not supported | Not supported | Not supported | Excellent |
| Emphasis marks/emboss/engrave | Not supported | Not supported | Not supported | Excellent |

## 5. Application Scenarios

### Scenario A: Full Adoption of cosmic-text → **Not Recommended**
- Most HWP-specific features would need reimplementation, WASM font loading issues, breaks existing tests

### Scenario B: Full Adoption of SkParagraph → **Not Feasible**
- `wasm32-unknown-unknown` not supported, WASM build impossible

### Scenario C: Selective Adoption of Shaping Engine (harfrust) Only → **Recommended for Medium-term**
- Add harfrust-based implementation to TextMeasurer
- Keep line breaking/paragraph layout/pagination as rhwp's own implementation
- Resolves the core issue (inaccurate text measurement) with minimal impact
- WASM: harfrust + font bundle or JS Canvas hybrid

### Scenario D: Maintain Current + Selective Improvements → **Recommended for Short-term**
- Focus on fixing LINE_SEG recalculation bugs
- Augment built-in font metrics
- Fundamental limitations (no shaping) remain unresolved

## 6. Final Assessment

### External Engine Adoption Deemed Unsuitable

All three reviewed technologies (SkParagraph, cosmic-text, parley) are libraries designed for **source code editors or RTF-level text widgets**, which differ in scope and requirements from what an HWP document typesetting engine demands.

**Fundamental Characteristics of the HWP Format:**
- HWP uses a per-character independent measurement approach (CharShape's per-language font_ids/spacings/ratios presuppose this)
- Width control is based on letter spacing/character width ratios, not OpenType shaping (kerning/ligatures)
- Therefore, adopting a shaping engine like harfrust is unnecessary from an HWP compatibility perspective

**Gap with Document Typesetting Engines:**
- The reviewed technologies aim at shaping + line breaking + rendering for a single text block
- Pagination, table row splitting, multi-column layout, headers/footers/background pages, footnotes/endnotes, object placement (TopAndBottom/TAC), etc. required by HWP are all out of scope
- Comparable technologies would need to be at the level of LibreOffice Writer engine, TeX, or Typst

### Decision to Self-implement

rhwp's typesetting system will **maintain and strengthen its own implementation**.

**Rationale:**
1. HWP's per-character independent measurement approach is well-suited to the current built-in font metrics
2. The pipeline from textRun → line alignment → line breaking → pagination is tightly coupled with HWP-specific rules (4 types of line spacing, paragraph spacing, prohibited characters, tab definitions, numbering/bullets, etc.) and cannot be separated into an external engine
3. The root cause of typesetting bugs during editing is not the absence of shaping but **issues in the LINE_SEG recalculation and pagination coordination logic**

### Follow-up Direction

**Systematization of LINE_SEG recalculation + pagination re-typesetting logic** will proceed as a follow-up task to resolve typesetting bugs during editing.

- Ensure consistency between built-in font metrics and original LINE_SEG during LINE_SEG regeneration
- Determine the scope of impact after paragraph editing (add/delete/modify) and implement progressive re-typesetting
- Synchronize pagination recalculation with layout

## 7. References

- [Skia Text API Overview](https://skia.org/docs/dev/design/text_overview/)
- [SkParagraph Source](https://github.com/google/skia/tree/main/modules/skparagraph)
- [skia-safe Rust Bindings](https://rust-skia.github.io/doc/skia_safe/textlayout/type.Paragraph.html)
- [cosmic-text GitHub](https://github.com/pop-os/cosmic-text)
- [cosmic-text API Docs](https://docs.rs/cosmic-text)
- [cosmic-text DeepWiki](https://deepwiki.com/pop-os/cosmic-text)
- [parley GitHub](https://github.com/linebender/parley)
- [W3C Korean Text Layout Requirements (klreq)](https://www.w3.org/TR/klreq/)
- [skia-safe WASM Issue #855](https://github.com/rust-skia/rust-skia/issues/855)
- [skia-safe WASM Issue #1078](https://github.com/rust-skia/rust-skia/issues/1078)
