# Task 33: Per-Language Font Branching (Korean-English Mixed Document Font Accuracy)

## Background

HWP files store font IDs for 7 language categories in `CharShape.font_ids[7]` (Korean, English, Chinese, Japanese, Other, Symbol, User). Currently rhwp uses only `font_ids[0]` (Korean) for all characters, causing English text to render with Korean fonts.

## Goal

- Determine language category for each character based on Unicode range
- Look up correct font name via `font_ids[lang]` → `font_faces[lang][font_id]`
- Split TextRun at font change points within same CharShape
- All existing tests pass + new tests

## Technical Approach

1. **Language detection**: Unicode code point range classification
2. **Style resolution extension**: Per-language font lookup in `resolve_char_style()`
3. **Run splitting**: Detect font changes during text layout, split Runs
4. **JSON extension**: Accurate `fontFamily` per Run in `getPageTextLayout()`
