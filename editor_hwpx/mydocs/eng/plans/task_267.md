# Task 267 Plan: Table Cell Height Bug Fix

## Symptoms

- samples/table-bug-1.hwp: Height of cells in merged rows rendered excessively
- Cause: Abnormally large values (1700) stored in cell padding fields, leading to incorrect row height/text position calculation

## Root Cause

HWP LIST_HEADER's `list_attr bit 16` ("apply inner margin", hwplib: `isApplyInnerMargin`) is
0 for cells where padding field values are stored but should be ignored during rendering.

## Implementation

### Parser Fix (control.rs)
- Check `list_attr bit 16`: If 0, clear cell padding to `{0,0,0,0}`
- Renderer automatically uses table default padding when `padding == 0` (existing logic)

## Cross-Validation

hwplib `ListHeaderPropertyForCell.java`:
- bit 16: `isApplyInnerMagin()` — Whether inner margin is specified
- true: Cell-specific padding, false: Table default padding

## Reference Files

| File | Change |
|------|------|
| src/parser/control.rs | list_attr bit 16 check + padding clear |
| src/parser/tags.rs | CTRL_PAGE_HIDE: pghi → pghd (discovered in previous task) |
