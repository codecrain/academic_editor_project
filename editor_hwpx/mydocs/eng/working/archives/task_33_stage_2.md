# Task 33 — Stage 2 Completion Report: Composer Run Splitting + Layout Application

## Work Performed

### 2-1. Added lang_index to ComposedTextRun (`composer.rs`)

```rust
pub struct ComposedTextRun {
    pub text: String,
    pub char_style_id: u32,
    pub lang_index: usize,    // 0~6 language category
}
```

Added `lang_index: 0` default value to all `ComposedTextRun` creation points.

### 2-2. Language-based Run Splitting Function (`composer.rs`)

- `split_runs_by_lang()`: After CharShape-based splitting, performs additional splitting at language change points within each run
- `is_lang_neutral()`: Identifies language-neutral characters such as spaces and punctuation — prevents unnecessary splitting
- Inserted `split_runs_by_lang()` call in all return paths of `split_by_char_shapes()` and the fallback path of `compose_lines()`

Example:
```
Input: [Run("안녕 Hello 세계", id=0)]
Output: [Run("안녕 ", id=0, lang=0), Run("Hello ", id=0, lang=1), Run("세계", id=0, lang=0)]
```

### 2-3. Modified resolved_to_text_style() (`layout.rs`)

- Signature: `fn resolved_to_text_style(styles, char_style_id, lang_index) -> TextStyle`
- Uses `font_family_for_lang(lang_index)`, `letter_spacing_for_lang(lang_index)`, `ratio_for_lang(lang_index)`
- Modified all 8 call sites: passes `run.lang_index` during run iteration, `0` for others (numbering/empty runs)

### 2-4. Modified ResolvedCharStyle Default (`style_resolver.rs`)

- Initialized `font_families`, `letter_spacings`, `ratios` as empty vectors
- When vectors are empty, helper methods fall back to scalar fields (`font_family`, `letter_spacing`, `ratio`)
- Ensures scalar values work correctly in tests that construct styles directly

## Changed Files

| File | Changes |
|------|---------|
| `src/renderer/composer.rs` | ComposedTextRun.lang_index, split_runs_by_lang(), is_lang_neutral() |
| `src/renderer/layout.rs` | resolved_to_text_style() lang_index parameter, all call sites modified |
| `src/renderer/style_resolver.rs` | Changed vector fields to empty vectors in Default implementation |

## New Tests (6)

| Test | Verification |
|------|-------------|
| `test_split_runs_by_lang_korean_english` | Korean-English mixed → 3 run split |
| `test_split_runs_by_lang_no_split` | Single language → no split |
| `test_split_runs_by_lang_space_follows_prev` | Space follows previous language |
| `test_split_runs_by_lang_empty` | Empty run preserved |
| `test_split_runs_by_lang_english_only` | English only → lang_index=1 |
| `test_is_lang_neutral` | Neutral character identification |

## Test Results

- **Total**: 414 passed / 1 failed (pre-existing failure: `test_svg_render_with_table_after_cell_edit` — unrelated to this change)
- **New 6**: All passed
- **Existing tests**: All passed (including 10 from stage 1)
