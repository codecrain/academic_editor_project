# Task #3 — Stage Completion Report

## Stage 1: Per-Line TAC Distribution Logic Implementation

### Modified Files

- `src/renderer/layout/table_layout.rs` — Modified TAC image placement logic

### Changes

1. **Changed `total_inline_width` calculation to per-line max width**
   - Before: Summed all TAC widths (treated as single line)
   - After: Built per-line width sum vector (`tac_line_widths`), aligned by per-line max width

2. **LINE_SEG-based line detection and vertical placement**
   - Empty paragraphs (no runs): 1:1 mapping to LINE_SEG by TAC sequence number (`tac_seq_index`)
   - Paragraphs with text: Line detection by char position (existing logic maintained)
   - When line changes, `inline_x` resets, `tac_img_y` moves to LINE_SEG vpos basis

## Stage 2: SVG Export Verification and Regression Testing

- `tac-img-02.hwpx` page 14: Confirmed 3 images vertically arranged
- WASM build + web canvas verification complete
- `cargo test`: 777 passed, 0 failed
- Full 67-page export: No errors/panics

## Stage 3: dump Code Cleanup

- Cell internal control detailed output code (`src/main.rs`) **retained** (useful for debugging)

## Separate Issues Found

- [#4](https://github.com/edwardkim/rhwp/issues/4): Non-TAC picture (flow-around placement) height not reflected in subsequent element y (page 21)
