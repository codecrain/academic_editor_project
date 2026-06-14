# Task 198 — Step 2 Completion Report: BUG-3 Nested Table Boundary Overflow Fix

## BUG-3: Non-Split Row Nested Table Exceeds PartialTable Cell Boundary

**Cause**: In `layout_partial_table` non-split row handling, nested tables passed to `layout_table()` with `split_ref=None`, rendering full height. When nested table exceeds cell's available space, it overflows body area.

**Fix**: In `table_partial.rs` non-split row code (line 771~):
1. Calculate cell's available height (`available_h`)
2. When nested table height exceeds `available_h`, create `NestedTableSplit` via `calc_nested_split_rows()`
3. Pass `split_ref` to `layout_table()` when row range filtering needed
4. Applied same mechanism already used for split rows to non-split rows

## Verification
- Existing tests: 677 passed, 1 ignored — all passed
- hwpp-001.hwp 68 pages: **No table content overflow on any page**
