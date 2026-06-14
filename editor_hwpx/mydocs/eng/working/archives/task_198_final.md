# Task 198 Final Report — Table Page Boundary Split Verification and Bug Fixes

## Overview

Verified accuracy of row-level split handling when tables cross page boundaries, and fixed 5 discovered bugs.

## Bugs Fixed

### BUG-1: Non-TAC Table Height Tracking Mismatch (pagination vs layout)
- Layout adds host paragraph's `line_spacing` below non-TAC tables, but pagination's `host_spacing` didn't include it
- Fix: Added `line_spacing` to `host_spacing` calculation

### BUG-2: PartialTable Final Placement Missing spacing_after
- Fix: Added `spacing_after` to final placement

### BUG-3: Nested Table Exceeds PartialTable Cell Boundary
- Non-split rows passed `split_ref=None` for nested tables, rendering full height
- Fix: Applied `NestedTableSplit` when nested table exceeds available space

### BUG-4: TAC Table Height Double Calculation
- `line_end` correction guard allowed `seg_height` range, causing double height on non-first pages
- Fix: Reduced guard to `line_spacing * 2 + 1000 HU`

### BUG-5: Space-occupying (text_wrap=1) Table spacing_before Double Calculation
- Layout positions via `v_offset` (no spacing_before), but pagination included it → ~6.67px/table cumulative error
- Fix: Excluded `spacing_before` from `host_spacing` for space-occupying non-TAC tables

## Test Results
- **681 passed** (existing 677 + new 4)
- hwpp-001.hwp 67 pages: **0 overflow**
- WASM build success
