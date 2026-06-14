# Pagination Error for Multiple TAC Tables in a Single Paragraph

## Discovery

- **File**: `samples/p222.hwp` page 68 (`output/p222_068.svg`)
- **Symptom**: Hancom renders all 5 tables on one page, but our renderer splits the 5th table to the next page (PartialTable)
- **Source paragraph**: pi=103 -- a single paragraph with 2 TAC table controls (ctrl[0]: 6x5, ctrl[1]: 14x5)

## Root Cause

### 1. Pagination: `para_height_for_fit` Summation Problem

In `pagination/engine.rs`'s `paginate_table_control()`, the height determination for TAC tables:

```rust
let table_total_height = if is_tac_table && para_height > 0.0 {
    para_height_for_fit  // <- Total paragraph height (both tables summed)
} else {
    effective_height + host_spacing
};
```

- `para_height_for_fit` is the **total paragraph height** (ctrl[0] + ctrl[1] + captions + spacing summed)
- `process_controls()` iterates through ctrl[0] and ctrl[1], calling `paginate_table_control()` for each, but both receive the same `para_height_for_fit`
- When processing ctrl[1]: `st.current_height + (combined height of both tables) > available_height` -> overflow judgment -> unnecessary split

**Fix**: When a paragraph contains 2 or more TAC tables, use individual `effective_height + host_spacing` instead of `para_height_for_fit`

```rust
let tac_table_count = para.controls.iter()
    .filter(|c| matches!(c, Control::Table(t) if t.attr & 0x01 != 0))
    .count();
let table_total_height = if is_tac_table && para_height > 0.0 && tac_table_count <= 1 {
    para_height_for_fit
} else {
    effective_height + host_spacing
};
```

### 2. Layout: Inconsistent Spacing Between Tables in the Same Paragraph

In `layout.rs`'s TAC line_seg line spacing handling:

- Spacing between separate-paragraph tables: `line_spacing / 2` = 4px
- Spacing between same-paragraph tables: jumps to `line_seg[1].vertical_pos` -> full `line_spacing` = 8px (2x)

Cause: `line_seg[1].vertical_pos = line_seg[0].vertical_pos + line_seg[0].line_height + line_spacing`, so the full line_spacing is included

**Fix**: Removed `next_seg.vertical_pos` jump, select line_seg based on `control_index`, apply consistent `line_spacing / 2`

```rust
if is_tac {
    let seg_idx = *control_index;
    if let Some(seg) = para.line_segs.get(seg_idx) {
        let line_end = col_area.y
            + hwpunit_to_px(seg.vertical_pos + seg.line_height, self.dpi);
        if line_end > y_offset {
            y_offset = line_end;
        }
    }
    if let Some(seg) = para.line_segs.get(seg_idx) {
        y_offset += hwpunit_to_px(seg.line_spacing, self.dpi) / 2.0;
    }
    tac_seg_applied = true;
}
```

## Key Lessons

1. **A single paragraph can contain multiple TAC table controls** -- like pi=103 with consecutive tables without line breaks
2. **Using paragraph height for individual control fitness checks in pagination is incorrect** (summation error in multi-control paragraphs)
3. **line_seg's `vertical_pos` includes `line_spacing`**, so using it directly for table spacing calculation can result in doubled spacing

## Related Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | TAC table line_seg spacing: control_index-based seg selection + consistent line_spacing/2 |
| `src/renderer/pagination/engine.rs` | Multi-TAC table paragraph: use individual effective_height |

## Verification

- `cargo test`: 608 tests all passing
- `p222_068.svg`: All 5 tables + captions rendered on one page
- Total pages: 123 -> 122 (unnecessary split page removed)
- Confirmed identical page breaks as Hancom output
