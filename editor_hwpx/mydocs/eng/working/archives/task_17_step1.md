# Task 17 - Step 1 Completion Report: Rust Per-Character Position Calculation API

## Changes

### `src/renderer/layout.rs`
1. Changed `is_cjk_char()` visibility from `fn` → `pub(crate) fn`
2. Added `compute_char_positions(text, style) -> Vec<f64>` function
   - N characters → N+1 boundary values (0th is 0.0)
   - CJK characters: font_size, Latin characters: font_size * 0.5
   - ratio (character width ratio), letter_spacing reflected

### `src/wasm_api.rs`
1. Added `get_page_text_layout(page_num)` WASM method (JS name: `getPageTextLayout`)
2. Added `get_page_text_layout_native()` native implementation
   - Recursively traverses render tree after `build_page_tree()` call
   - JSON serialization of TextRun node bbox, text, charX (per-character position boundaries)

## Verification
- 233 tests passed
- WASM build success
