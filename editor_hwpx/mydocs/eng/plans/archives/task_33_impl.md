# Task 33: Implementation Plan — Per-Language Font Branching

## Step 1: ResolvedCharStyle Extension + Language Detection Function
- Add per-language arrays (font_families, letter_spacings, ratios) to ResolvedCharStyle
- Add `detect_lang_category(ch: char) -> usize` (Korean=0, English=1, Chinese=2, Japanese=3, Other=4, Symbol=5, User=6)
- Unit tests for language detection

## Step 2: Composer Run Splitting + Layout Application
- Add `lang_index` to ComposedTextRun
- Sub-split runs by language in `compose_line_runs()` (spaces follow previous language)
- Modify `resolved_to_text_style()` to accept `lang_index` parameter
- Use `font_families[lang_index]` with fallback to `font_families[0]`

## Step 3: WASM JSON Reflection + Format Toolbar Integration + Browser Testing
- Verify accurate fontFamily in getPageTextLayout() JSON
- Update getCharPropertiesAt() for language-appropriate font at caret position
