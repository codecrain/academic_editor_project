# Task 59: Intra-Row Page Splitting for Table Cells - Execution Plan

## Goal

Extend the current `PartialTable` row-level splitting to implement **line-level splitting of paragraphs within cells** for tables with the `page_break: CellBreak` attribute, filling pages to the margin.

## Current State Analysis

- **Problem**: When a tall row exceeds remaining space, it moves entirely to the next page -> blank space (k-water-rfp.hwp page 5 bottom ~432px whitespace)
- **Cause**: `pagination.rs` row splitting loop (line 592) splits only at row boundaries, not within cell content
- **Existing infrastructure**: `layout_composed_paragraph(start_line, end_line)` already supports line range rendering (for PartialParagraph)

## Core Design

1. **MeasuredCell**: Per-cell line-level measurement data (line_heights, para_line_counts)
2. **PartialTable extension**: Add `split_start_content_offset`, `split_end_content_limit` fields
3. **Shared content_offset**: All cells independently calculate line ranges from same reference
4. **Backward compatible**: Default (0.0, 0.0) -> 100% existing behavior preserved

## Changed Files

| File | Changes |
|------|---------|
| `src/renderer/height_measurer.rs` | MeasuredCell struct, measure_table extension, helper methods |
| `src/renderer/pagination.rs` | PartialTable extension, intra-row splitting logic, unit tests |
| `src/renderer/layout.rs` | layout_partial_table split row rendering |

## Verification

- WASM build + all tests pass
- k-water-rfp.hwp SVG: page 5 bottom filled with table content, page 6 continues rendering
- No behavior changes in existing files confirmed
