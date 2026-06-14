# Task 390: TAC Table Subsequent Paragraph vpos Excessive Gap Fix

## Symptoms

- **File**: samples/synam-001.hwp page 8
- **Paragraph**: s0:pi=82 ci=0 (TAC table 19x4) → s0:pi=83 (text)
- **Issue**: **43.5px excessive** gap from pi=82 table bottom (~920px) to pi=83 (963.5px)
- **Expected**: vpos-based gap = 0 HU → paragraph placed immediately after table

## Root Cause Analysis

In the last TAC's `line_end` correction (Task 375/386):
```rust
line_end = para_y + (seg.vpos + seg.lh) / 7200 * 96
```
- `seg.lh = 61313` HU (height recorded in LINE_SEG)
- Actual table height = `61031` HU (common.size.height)
- **Difference = 282 HU = 3.8px** → line_end is higher than actual table bottom
- `line_end > y_offset` → y_offset set excessively
- Additional drift occurs in subsequent lazy_base reverse calculation

## Fix Direction

Add **upper bound clamp** to last TAC's `line_end` correction:
- Clamp `line_end` to `layout_table return value (actual table bottom) + line_spacing`
- Prevent the difference between actual table height and LINE_SEG lh from creating excessive gaps

## Implementation Plan (3 Steps)

### Step 1: Implement line_end Clamp
- Store `layout_table` return value as `table_y_end`
- Apply upper bound: `line_end = line_end.min(table_y_end + ls_px)`

### Step 2: Verification
- synam-001.hwp p8: Confirm pi=82→pi=83 gap normalization
- kps-ai.hwp p19: Confirm consecutive TAC table spacing maintained
- bodo-01/02: Confirm existing fixes maintained
- cargo test all passing

### Step 3: Commit + merge
