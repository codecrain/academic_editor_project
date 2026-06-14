# Task 196 Execution Plan — Web Editor Text Flow Processing

## Background

Verify that text flow (line breaking, line spacing, Enter paragraph split, page overflow) works correctly during text editing in the web editor (rhwp-studio) and fix any deficiencies.

## Current Status Analysis

### Already Implemented (Rust Core)
- **Text input**: `insert_text_native()` → reflow → recompose → paginate
- **Enter (paragraph split)**: `split_paragraph_native()` → paragraph split → reflow → paginate
- **Line breaking**: `reflow_line_segs()` → token-based line breaking (Korean/English/CJK distinction)
- **Line spacing**: LineSeg.line_spacing → hwpunit_to_px conversion in layout
- **Page splitting**: pagination engine → `advance_column_or_new_page()` → dynamic page creation

### TS Integration Status
- Enter key → `SplitParagraphCommand` → WASM `splitParagraph()` → cursor movement
- `afterEdit()` → `document-changed` event → `refreshPages()` → page count update
- `refreshPages()` → `wasm.getPageInfo(i)` loop → virtual scroll update

### Potential Issues
1. New canvas creation and scroll area update timing on page increase
2. Auto-scroll when cursor moves to next page
3. Real-time line spacing reflection in edit mode
4. Performance during long text input (reflow + paginate repetition)
5. Page decrease handling on Backspace paragraph merge

## Approach

1. WASM build then test actual behavior in web editor
2. Fix discovered bugs as individual steps
3. Test verification with cargo test + manual end-to-end confirmation
