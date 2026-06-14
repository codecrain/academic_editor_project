# Task #9: tac-img-02.hwpx Page 19 Pagination Overflow Fix

## Objective

Fix the pagination bug where content after a TAC table is placed beyond the body area on page 19.

## Symptoms

- From `pi=293` table (tac=true), content exceeds body bottom (1046.9px) by 23~90px
- Typeset vs paginator page count mismatch: 67 vs 69 (2-page difference)

## Root Cause Analysis

Suspected direct cause from `fixed_overlay_remaining` logic added in Task #8 (fixed line spacing TAC table parallel layout, commit `7165229`):

```rust
// engine.rs — Added in Task #8
if fixed_overlay_remaining > 0.0 && !has_table {
    if is_fixed {
        st.current_height -= consumed;  // ← Subtract height for overlap handling
    }
}
```

After a negative `line_spacing` TAC table, Fixed line spacing paragraph heights are subtracted from `current_height`, but this subtraction is applied excessively, causing `current_height` to be lower than actual on page 19. Consequently, upon reaching `pi=293` table, the system incorrectly judges "there's space remaining" and fails to trigger page break.

## Implementation Steps

### Step 1: Reproduce and Pinpoint Exact Cause

- Track `current_height` vs `available_height` after pi=290 table placement
- Log why flush decision fails upon reaching pi=293
- Determine whether `tac_table_count_for_flush` condition or height capping is the cause

### Step 2: Fix and Verify

- Fix flush condition or height calculation depending on cause
- Confirm tac-img-02.hwpx page 19 overflow resolved
- Confirm existing tests (`cargo test`) pass
- Check regression on other sample documents

### Step 3: Completion Report

- Write final results report

## Approval Request

Please review and approve the above plan.
