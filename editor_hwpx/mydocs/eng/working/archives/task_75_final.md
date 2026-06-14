# Task 75 Final Report: Fix Text Before Table Rendering Below Table

## Summary

Fixed an issue where 2 lines of text in paragraph 28 of `hwp-multi-001.hwp` page 2 were rendered below or missing from table 8. Improved pagination logic based on the table's CTRL_HEADER `vertical_offset` value, so that when a table is positioned below the paragraph start point in reserved-space placement, text is placed before the table.

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/pagination.rs` | Replaced `find_table_char_position`/`find_line_for_char_pos` with `get_table_vertical_offset`. When vertical_offset > 0, all text is placed before the table |
| `src/wasm_api.rs` | Modified test — allowed PartialParagraph(start_line=0) to come before Table |

## Root Cause

Paragraph 28 is a mixed paragraph containing both table control characters and text. The table control character is at the start of the char stream (code units 0~7), but due to the table's **reserved-space** placement attribute and `vertical_offset = 9.77mm`, the table should be physically positioned below the text.

The existing `char_offsets`-based approach only analyzed the logical position in the character stream, determining "table is before text", but the actual physical placement is determined by the table's CTRL_HEADER `vertical_offset`.

## Solution

```
vertical_offset > 0 -> Place all text before table (PartialParagraph + Table)
vertical_offset = 0 -> Place text after table (Table + PartialParagraph, maintains Task 66 behavior)
```

## Verification Results

- 488 Rust tests passed
- SVG export: hwp-multi-001.hwp page 2, 2 lines of text rendered correctly above table 8
- Regression check: img-start-001.hwp, hwp-multi-001.hwp all pages normal
- WASM build succeeded
- Vite build succeeded
- Web browser rendering confirmed normal
