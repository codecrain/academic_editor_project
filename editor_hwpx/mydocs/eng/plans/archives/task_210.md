# Task 210 Execution Plan

## Title
kps-ai.hwp p61 Nested Table (treat_as_char) Paragraph Center Alignment Not Applied

## Symptom
- **File**: kps-ai.hwp, page 61 ("Personal Information Collection/Use/Provision Consent Form")
- **Structure**: Table > Cell > Table (treat_as_char)
- **Problem**: Cell paragraph alignment is set to "center", but nested treat_as_char table is rendered left-aligned
- **Hancom behavior**: Center alignment is applied (correct)

## Root Cause Analysis

When rendering controls (nested table) within a cell paragraph, `layout_table()` call has `Alignment::Left` hardcoded.

### Bug Locations (3 places)

1. **`src/renderer/layout/table_layout.rs`** (~line 1298)
   - `layout_cell_content()` passes `Alignment::Left` hardcoded when forwarding nested table to `layout_table()`

2. **`src/renderer/layout/table_partial.rs`** (~line 771, ~line 822)
   - Same `Alignment::Left` hardcoded in split table cell content rendering

### Fix Approach
Replace `Alignment::Left` → actual paragraph alignment value (`para_alignment`)

`para_alignment` is already computed in the relevant scope:
```rust
let para_alignment = styles.para_styles
    .get(para.para_shape_id as usize)
    .map(|s| s.alignment)
    .unwrap_or(Alignment::Left);
```

## Impact Scope
- All cases where treat_as_char table exists within a cell and paragraph alignment is not Left
- Existing Left-aligned tables are unaffected (default value is Left)

## Verification Method
1. `cargo test` — confirm all 684 existing tests PASS
2. SVG export for kps-ai.hwp p61 visual confirmation
3. E2E test (host Chrome CDP) for web rendering confirmation
