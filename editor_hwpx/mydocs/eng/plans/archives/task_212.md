# Task 212 Execution Plan

## Title
kps-ai.hwp p67 Table Page Boundary Overflow Fix (B-013)

## Symptom
- **File**: kps-ai.hwp, page 67 ("Software Project Impact Assessment Report")
- **Problem**: Table renders ~26px beyond the editing paper bottom
  - body-clip lower bound: y=1046.88 (y=128.5 + height=918.37)
  - Table last cell bottom: y=1072.96 (cell-clip y=1049.3 + h=23.65)
  - Overflow: ~26px
- **Hancom behavior**: Table splits at page boundary and continues to next page

## Root Cause Analysis (Expected)

### Page Split Decision Flow
1. `paginate_table_control()` (engine.rs:535-703) — determines if table fits on current page
2. `split_table_rows()` (engine.rs:798-1063) — executes row-by-row splitting
3. `find_break_row()` (height_measurer.rs:989-1001) — binary search to determine split row

### Key Suspicion Points
1. **available_height calculation error**: missing or inaccurate deductions for margin/spacing/footnote in `table_available_height` calculation
2. **find_break_row() binary search precision**: floating-point error accumulation in target calculation causes inclusion of one extra row
3. **cell_spacing double/missing calculation**: mismatch between cell_spacing included in cumulative_heights and partial_height calculation
4. **26px ≈ 1~2 row heights or cell_spacing**: possible systematic underestimation

## Proposed Fix (Expected)
1. Debug output to trace available_height, table_total_height, find_break_row results for p67 table
2. Fix pagination/height_measurer after identifying the cause
3. Verify existing test regression

## Verification Method
1. `cargo test` — 684 existing tests PASS confirmation
2. SVG export for kps-ai.hwp p67 overflow resolution confirmation
3. Regression testing with hwpp-001.hwp and other documents
4. WASM build + E2E test

## Impact Scope
- Affects entire table split logic (pagination engine)
- Table page boundary handling across all documents
