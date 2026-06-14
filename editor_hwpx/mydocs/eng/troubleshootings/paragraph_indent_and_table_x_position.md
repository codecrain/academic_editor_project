# Paragraph Indent/Outdent Model and Table X Position Fix

## Date
2026-02-17

## Symptoms

### 1. Paragraph Text X Position Error
- In paragraphs with indent/outdent applied, the X start position of the first line and subsequent lines were reversed
- Example: The "1)" numbering in an outdented paragraph rendered at the indented position instead of the body margin position

### 2. Table X Position Error
- Tables were always positioned at body left (x=80), not reflecting the host paragraph's margin
- PartialTable (page-split tables) did not receive host_margin_left

## Root Cause Analysis

### HWP Paragraph Indent/Outdent Model

When a paragraph begins, the paragraph's margin (`margin_left`) is always applied.

| Mode | First Line (Start Line) | Subsequent Lines (Line 2+) |
|------|------------------------|---------------------------|
| **Normal** (indent=0) | margin_left | margin_left |
| **Indent** (indent>0) | margin_left + indent | margin_left |
| **Outdent** (indent<0) | margin_left | margin_left + \|indent\| |

- **Indent**: Only the first line gets additional rightward margin by the specified amount; subsequent lines use only the paragraph margin
- **Outdent**: The first line uses only the paragraph margin; from the second line onward, additional rightward margin is applied
- The indent value for outdent is stored internally as a negative number in HWP

### Actual Data Example (k-water-rfp.hwp page 5)

| Line | pi | psid | margin_left | indent | Mode | First Line x | Content |
|------|-----|------|-------------|--------|------|--------------|---------|
| 1 | 45 | 81 | 1.33 | 0.00 | Normal | 81.33 | "1.2. Proposal Participation Guide" |
| 2 | 47 | 2 | 0.00 | 0.00 | Normal | 80.00 | "  A. Proposal Application" |
| 3 | 48 | 82 | 46.67 | -22.61 | Outdent | 126.67 | "1) Submission deadline..." |
| 4 | 49 | 82 | 46.67 | -22.61 | Outdent | 126.67 | "2) Proposal..." |
| 5 | 50 | 83 | 60.00 | -23.71 | Outdent | 140.00 | "A) Documents to..." |
| 6 | 51 | 84 | 46.67 | -23.71 | Outdent | 126.67 | "- Bid..." |
| **Table** | **52** | **75** | **46.67** | **0.00** | **Normal** | **126.67** | **[Table]** |

- The paragraph containing the table (pi=52) has a different style (psid=75) from the line above (pi=51), but inherits the same margin_left (46.67)
- The table's indent is 0, so only margin_left is applied -> the table and "1)", "2)" text align at the same X position

### Table X Position Calculation

The table's horizontal position is determined by CommonObjAttr bit fields:

```
attr bit fields:
  bit 0:     treat_as_char
  bit 8-9:   horz_rel_to (horizontal reference: Paper/Page/Column/Para)
  bit 10-12: horz_align (horizontal alignment: Left/Center/Right/Inside/Outside)

raw_ctrl_data layout:
  [0..4]:  attr (u32)
  [4..8]:  h_offset (i32, HWPUNIT)
```

Horizontal reference area:
- `HorzRelTo::Para` -> col_area.x + host_margin_left
- `HorzRelTo::Column` etc. -> col_area.x

## Changes

### 1. Paragraph Text Indent (`layout.rs` layout_composed_paragraph)

**Before (incorrect):**
```rust
// Apply indent to first line (for outdent, first line moves left)
let line_indent = if line_idx == 0 { indent } else { 0.0 };
```

**After:**
```rust
let line_indent = if indent > 0.0 {
    // Indent: add to first line only
    if line_idx == 0 { indent } else { 0.0 }
} else if indent < 0.0 {
    // Outdent: add |indent| rightward from second line onward
    if line_idx == 0 { 0.0 } else { indent.abs() }
} else {
    0.0
};
let effective_margin_left = margin_left + line_indent;
```

### 2. Table X Position -- CommonObjAttr-Based (`layout.rs` layout_table)

**Before:**
```rust
// Alignment-based -- inaccurate
let table_x = match host_alignment {
    Alignment::Center => col_area.x + (col_area.width - table_width) / 2.0,
    _ => col_area.x,
};
```

**After:**
```rust
// Parse horz_rel_to, horz_align, h_offset from CommonObjAttr bit fields
let (ref_x, ref_w) = match horz_rel_to {
    HorzRelTo::Para => (col_area.x + host_margin_left, col_area.width - host_margin_left),
    _ => (col_area.x, col_area.width),
};
let table_x = match horz_align {
    HorzAlign::Left => ref_x + h_offset,
    HorzAlign::Center => ref_x + (ref_w - table_width).max(0.0) / 2.0 + h_offset,
    HorzAlign::Right => ref_x + (ref_w - table_width).max(0.0) + h_offset,
};
```

### 3. Same Logic Applied to PartialTable

- Added `host_margin_left` parameter to `layout_partial_table` function
- In the `PageItem::PartialTable` handler, calculate the host paragraph's effective_margin and pass it
- Parameter order note: `host_margin_left` placed after `split_end_content_limit`

## Related Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Indent model fix, table X position calculation, PartialTable host_margin_left propagation |

## Lessons Learned

1. HWP's indent/outdent determines the X start position of **subsequent lines, not the first line**
2. Table position is determined by **CommonObjAttr bit fields** (horz_rel_to, horz_align, h_offset), not paragraph alignment
3. The host paragraph's **margin_left** must be reflected in the table position (when HorzRelTo::Para)
4. When adding function parameters, inserting between existing parameters can shuffle values -- it is **safer to add at the end**
