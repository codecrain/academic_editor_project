# Task 41 Step 2 Completion Report: DIFF-1, DIFF-5, DIFF-7 Fixes

## Fix Details

### DIFF-1: Empty Cell Space Removal (Severity: High)

**Status**: Already fixed (verification and test added)

Current `parse_table_html()` code (wasm_api.rs:3921-3936) already handles this correctly:
1. `html_to_plain_text(&pc.content_html).is_empty()` -> Converts `&nbsp;` to space then trims to detect empty cell
2. Empty cells generate `Paragraph::new_empty()` (char_count=0)
3. Cell correction code sets `char_count = 0 + 1 = 1`, `char_count_msb = true`
4. `has_para_text = false` maintained -> no PARA_TEXT record generated

**Verification**: `test_diff1_empty_cell_nbsp` test added
- `&nbsp;` cell: char_count=1, text empty, has_para_text=false
- `&nbsp;&nbsp;&nbsp;` cell: char_count=1, text empty, has_para_text=false

### DIFF-5: TABLE Record attr Flag (Severity: Low-Medium)

**Problem**: bit 1 (cell split prevention) was set only when `has_header_row`
**Fix**: `raw_table_record_attr` always set to `0x04000006` (bit 1 = cell split prevention always active)

```rust
// Before fix
let tbl_rec_attr: u32 = if has_header_row {
    0x04000006
} else {
    0x04000004  // bit 1 not set
};

// After fix
let tbl_rec_attr: u32 = 0x04000006; // bit 1 (cell split prevention) + bit 2 always set
```

**Code location**: wasm_api.rs:4129-4136

### DIFF-7: CTRL_HEADER Instance ID (Severity: Low)

**Problem**: `raw_ctrl_data[28..32]` instance_id was always 0
**Fix**: Hash-based non-0 instance_id generation combining row/column count, cell count, total width/height

```rust
let instance_id: u32 = {
    let mut h: u32 = 0x7c150000;
    h = h.wrapping_add(row_count as u32 * 0x1000);
    h = h.wrapping_add(col_count as u32 * 0x100);
    h = h.wrapping_add(total_width);
    h = h.wrapping_add(total_height.wrapping_mul(0x1b));
    h ^= cells.len() as u32 * 0x4b69;
    if h == 0 { h = 0x7c154b69; }
    h
};
raw_ctrl_data[28..32].copy_from_slice(&instance_id.to_le_bytes());
```

**Code location**: wasm_api.rs:4093-4107

## Modified Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | DIFF-5: raw_table_record_attr fix, DIFF-7: instance_id generation, test assertion updates |

## Tests

- `test_diff1_empty_cell_nbsp`: DIFF-1 verification (newly added)
- `test_paste_html_table_as_control`: DIFF-5, DIFF-7 verification (assertions updated)
- Total tests: 475 passed (474 -> 475, 1 DIFF-1 test added)
