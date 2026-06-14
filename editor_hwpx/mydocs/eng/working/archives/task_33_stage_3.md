# Task 33 — Stage 3 Completion Report: WASM JSON Reflection + Formatting Toolbar Integration

## Work Performed

### 3-1. getPageTextLayout() JSON — Automatic Reflection Confirmed

`getPageTextLayout()` outputs `text_run.style.font_family` in JSON, and this value already reflects the correct per-language font through `font_family_for_lang(lang_index)` used by the `resolved_to_text_style()` modified in stage 2. **No separate modification needed.**

### 3-2. getCharPropertiesAt() Per-Language Font Reflection (`wasm_api.rs`)

Modified `build_char_properties_json()`:
- Calls `detect_lang_category()` using the Unicode value of the character at the caret position (`char_offset`)
- Uses `cs.font_family_for_lang(lang_index)` to return the font name for that language
- Before: Always returned `cs.font_family` (Korean font)
- After: English position → English font, Korean position → Korean font

### 3-3. Formatting Toolbar Font Display — Automatic Reflection

`format_toolbar.js`'s `_updateCharUI(props)` displays `props.fontFamily`, so when the WASM API returns the correct font, the formatting toolbar automatically shows the accurate font name. **No separate modification needed.**

## Changed Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | build_char_properties_json() returns per-language font based on caret position character |

## Test Results

- **Total**: 414 passed / 1 failed (pre-existing failure: `test_svg_render_with_table_after_cell_edit` — unrelated to this change)
- **WASM build**: Success

## Effects

1. **Rendering**: In mixed Korean-English text, English renders with English fonts and Korean with Korean fonts
2. **Formatting toolbar**: When the caret is on English text, shows English font (e.g., Arial); when on Korean text, shows Korean font (e.g., HamChoRomDotUm)
3. **Letter spacing/character width ratio**: Per-language letter spacing (spacings) and width ratio (ratios) values are applied correctly for each language
