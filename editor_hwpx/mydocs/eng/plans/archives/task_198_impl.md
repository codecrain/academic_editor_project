# Task 198 Implementation Plan — Table Page Boundary Split Handling Verification and Bug Fix

## Discovered Bugs

### BUG-1: Non-TAC Table Height Tracking Mismatch (pagination vs layout)

- **Symptom**: Tables in the latter part of a page are rendered beyond the body area (e.g., hwpp-001.hwp page 31)
- **Cause**: Layout (layout.rs:1208-1213) adds the host paragraph's `line_spacing` below non-TAC tables, but pagination (engine.rs) `host_spacing` does not include this value
- **Impact**: Cumulative error increases with more tables per page, causing later tables to exceed the body area
- **Fix**: Add non-TAC table `line_spacing` to `host_spacing` calculation (already applied)

### BUG-2: Missing spacing_after in PartialTable Final Placement

- **Symptom**: The layout's `spacing_after` is not reflected in pagination when placing the final portion of a split table
- **Cause**: `split_table_rows` PartialTable final placement (line 976) does not include `spacing_after`
- **Fix**: Add `spacing_after` to final placement (already applied)

### BUG-3: Nested Table Exceeds PartialTable Cell Boundary During Rendering

- **Symptom**: Nested tables within PartialTable cells render beyond cell height, outside the body area
- **Cause**: `layout_partial_table` renders nested tables within cells at full height, using cell clipPath for visual clipping. However, clipped portions are not displayed on the next page, causing content loss
- **Impact**: Some rows of nested tables within cells are invisible when the nested table is large
- **Fix**: Apply `NestedTableSplit` when splitting rows containing nested tables, rendering only the visible portion

## Step-by-Step Implementation Plan

### Step 1: BUG-1, BUG-2 Fix and Native Tests (Complete)

- Add non-TAC table `line_spacing` to `host_spacing`
- Include `spacing_after` in PartialTable final placement
- Verify all 677 existing tests pass

### Step 2: Nested Table Boundary Overflow Fix (BUG-3)

- Apply `NestedTableSplit` in PartialTable layout when nested tables exceed cell boundaries
- Pass available rendering space (`visible_space`) within cells to nested tables
- Modify to render only visible rows of nested tables

### Step 3: Native Unit Test Additions

- S1: 10-row table starts at page bottom — verify row-by-row split
- S2: 50-row large table — verify multi-page split
- S3: Verify split of rows containing nested tables within cells
- S4: B-011 bug reproduction test (table height must not exceed body area)

### Step 4: E2E Browser Test and Final Report

- Visual verification of table page boundary splitting after creation in web editor
- Confirm absence of overflow via SVG output comparison
- Write final report
