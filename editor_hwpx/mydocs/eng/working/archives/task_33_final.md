# Task 33: Final Report — Per-Language Font Branching

## Overview

Implemented accurate per-language font application using the 7 language categories stored in HWP file's `CharShape.font_ids[7]`. Previously only `font_ids[0]` (Korean) was used for all characters; now each character's Unicode range determines the appropriate language category's font/spacing/width-ratio.

## Implementation Stage Summary

### Stage 1: ResolvedCharStyle Extension + Language Detection Function
- Added `font_families[7]`, `letter_spacings[7]`, `ratios[7]` vectors to `ResolvedCharStyle`
- `detect_lang_category()` function: Unicode codepoint → language category mapping
- `font_family_for_lang()`, `letter_spacing_for_lang()`, `ratio_for_lang()` helper methods
- All 7 languages resolved in `resolve_single_char_style()`

### Stage 2: Composer Run Splitting + Layout Application
- Added `lang_index` field to `ComposedTextRun`
- `split_runs_by_lang()`: Additional splitting at language transition points within same CharShape
- `is_lang_neutral()`: Space/punctuation → maintains previous language (prevents unnecessary splitting)
- Added `lang_index` parameter to `resolved_to_text_style()`, updated all call sites

### Stage 3: WASM JSON + Format Toolbar Integration
- `build_char_properties_json()`: Detects language of character at caret position → returns corresponding font
- `getPageTextLayout()` JSON: Automatically reflected from stage 2 (no modification needed)
- Format toolbar: Automatically reflected since WASM API returns correct font

## Changed Files

| File | Changes |
|------|---------|
| `src/renderer/style_resolver.rs` | font_families/spacings/ratios arrays, detect_lang_category(), helper methods |
| `src/renderer/composer.rs` | ComposedTextRun.lang_index, split_runs_by_lang(), is_lang_neutral() |
| `src/renderer/layout.rs` | resolved_to_text_style() lang_index parameter, all call sites |
| `src/wasm_api.rs` | build_char_properties_json() per-language font return |

## New Tests (16)

| File | Test | Verification |
|------|------|-------------|
| style_resolver.rs | test_detect_lang_category_korean | Hangul syllables/jamo → 0 |
| style_resolver.rs | test_detect_lang_category_english | ASCII letters/digits → 1 |
| style_resolver.rs | test_detect_lang_category_cjk | CJK ideographs → 2 |
| style_resolver.rs | test_detect_lang_category_japanese | Hiragana/Katakana → 3 |
| style_resolver.rs | test_detect_lang_category_symbol | Symbols/arrows → 5 |
| style_resolver.rs | test_detect_lang_category_default | Space/punctuation → 0 (default) |
| style_resolver.rs | test_resolve_char_style_font_families | Per-language font names (7) |
| style_resolver.rs | test_resolve_char_style_lang_ratios | Per-language width ratios (7) |
| style_resolver.rs | test_resolve_char_style_lang_spacings | Per-language letter spacings (7) |
| style_resolver.rs | test_font_family_for_lang_fallback | Empty string/out-of-range fallback |
| composer.rs | test_split_runs_by_lang_korean_english | Korean-English mix → 3 runs |
| composer.rs | test_split_runs_by_lang_no_split | Single language → no split |
| composer.rs | test_split_runs_by_lang_space_follows_prev | Space follows previous language |
| composer.rs | test_split_runs_by_lang_empty | Empty run preserved |
| composer.rs | test_split_runs_by_lang_english_only | English only → lang_index=1 |
| composer.rs | test_is_lang_neutral | Neutral character detection |

## Test Results

- **Total**: 414 passed / 1 failed (pre-existing failure: test_svg_render_with_table_after_cell_edit — unrelated to this change)
- **New 16**: All passed
- **WASM build**: Successful

## Effects

1. **Rendering accuracy**: "안녕 Hello 世界 あいう" → each segment rendered with correct font
2. **Format toolbar**: Displays correct language-specific font name at caret position
3. **Letter spacing/width ratio**: Per-language individual values applied (e.g., English 80% width ratio, Korean 100%)
4. **Performance**: Spaces/punctuation follow previous language, minimizing unnecessary run splits
