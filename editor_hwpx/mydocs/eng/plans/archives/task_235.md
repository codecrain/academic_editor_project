# Task 235: TAC Table Space Inline Placement and Page Overflow Fix

## Symptom

1. **TAC table horizontal position error**: Editors use space characters before/after TAC tables to adjust horizontal position (`·[Table]··`), but currently spaces are ignored and tables are placed independently, causing incorrect positioning
2. **Page overflow**: 11 out of 78 pages in kps-ai.hwp have LAYOUT_OVERFLOW (max 28.1px). Mismatch in TAC table height calculation between pagination and layout is the cause

## Execution Plan

### Step 1: Improve TAC Table Inline Classification Criteria
### Step 2: Reflect Spaces in TAC Table Inline Rendering
### Step 3: Synchronize pagination/layout Height
### Step 4: Verification and Regression Testing
