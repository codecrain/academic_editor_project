# Troubleshooting: Text Before Table Rendered Below the Table

## Problem

In `samples/hwp-multi-001.hwp` page 2, text contained in paragraph 28 ("* 2024 detailed statistics on overseas direct investment...") was rendered below table 8 or omitted entirely.

### Document Structure

```
Paragraph 21: Table 7 (4 rows x 6 cols) -- Page 1
Paragraph 22-27: Text paragraphs
Paragraph 28: Table 8 (2 rows x 6 cols) + 2 lines of text -- Page 2
Paragraph 29: Group (grouped image)
```

### The Uniqueness of Paragraph 28

Paragraph 28 is a **mixed paragraph that contains both a table control character and text**.

- Paragraph text: "* 2024 detailed statistics on overseas direct investment, please refer to the attached reference materials..." (284 chars, 2 lines)
- line_segs: 2 (LineSeg[0] text_start=0, LineSeg[1] text_start=71)
- char_offsets[0] = 8 -> table control character (8 code units) is at the start of the character stream
- Table attributes:
  - Placement relative to body text: **treat_as_char (space-occupying)**
  - Vertical: Relative to paragraph top, **9.77mm**
  - Horizontal: Relative to paragraph left, 0.00mm

## Analysis

### First Attempt: char_offsets-Based Approach (Failed)

In Task 66, a `PartialParagraph(start_line=1)` approach was introduced to place text after the table for mixed text+table paragraphs. This approach worked well for the common case where the table is at the start of the paragraph and text follows.

Why the problem occurred with paragraph 28:
- `char_offsets[0] = 8` -> table control character occupies code units 0-7 at the character stream start
- Gap analysis of char_offsets determined "the table precedes the text" -> all text placed after the table
- Result: text rendered below the table or omitted

**Root cause**: char_offsets only indicates the **logical position** of control characters within the character stream; it cannot determine the table's **physical placement position**.

### Key Discovery: The Table's CTRL_HEADER vertical_offset

The HWP help document (`objectattribute(arrange).htm`) describes the **treat_as_char (space-occupying)** placement concept:
> "Because the object occupies lines equal to the height of the object, body text cannot enter the area occupied by the object."

The table's CTRL_HEADER contains a `vertical_offset` field:

```
raw_ctrl_data layout (after 4-byte attr):
  [0..4]  vertical_offset  (u32, HWPUNIT)
  [4..8]  horizontal_offset (u32, HWPUNIT)
  [8..12] width            (u32, HWPUNIT)
  [12..16] height           (u32, HWPUNIT)
  ...
```

Paragraph 28's table 8: `vertical_offset = 9.77mm ~ 2769 HWPUNIT (> 0)`

When this value is > 0, the table is positioned below the paragraph start point, so text lines should be placed first in that space.

## Resolution

### Changes (`pagination.rs`)

Removed the two helpers `find_table_char_position()` / `find_line_for_char_pos()` and replaced them with a single `get_table_vertical_offset()`:

```rust
fn get_table_vertical_offset(table: &Table) -> u32 {
    if table.raw_ctrl_data.len() >= 4 {
        u32::from_le_bytes(table.raw_ctrl_data[0..4].try_into().unwrap())
    } else {
        0
    }
}
```

Text splitting logic before/after the table:

```rust
let vertical_offset = Self::get_table_vertical_offset(table);

let pre_table_end_line = if vertical_offset > 0 && !para.text.is_empty() {
    total_lines  // Place all text lines before the table
} else {
    0            // Place text after the table (existing behavior)
};
```

### How It Works

| vertical_offset | Meaning | Text Placement |
|-----------------|---------|----------------|
| > 0 | Table is below paragraph start (space-occupying) | All text -> before table |
| = 0 | Table is at paragraph start position | All text -> after table (Task 66 behavior) |

### Before and After Comparison

**Before fix** (char_offsets-based):
```
[Table 8]
[Text missing or below table]
```

**After fix** (vertical_offset-based):
```
[* 2024 detailed statistics on overseas direct investment...]  <- y=529.83
[Statistics available from Korea Eximbank overseas invest...]   <- y=548.92
[Table 8: Department | Foreign Economy Division...]            <- y=569.89
```

## Verification

- 488 Rust tests passing
- `hwp-multi-001.hwp` SVG export: 2 lines of text correctly rendered above table 8 on page 2
- `img-start-001.hwp` SVG export: existing behavior maintained (no regression)
- WASM build successful
- Web browser rendering confirmed

## Lessons Learned

1. **Character stream position != physical rendering position**: The logical order of char_offsets alone cannot determine an object's actual placement.
2. **Use CTRL_HEADER position information**: `vertical_offset`/`horizontal_offset` are the key data for determining an object's physical position in "space-occupying" placement.
3. **Reference HWP help documentation**: Beyond the spec document, Hancom's help feature descriptions provide important clues for rendering logic design.
