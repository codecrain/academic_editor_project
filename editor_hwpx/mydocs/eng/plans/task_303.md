# Task 303 Implementation Plan: HWPX Image Layout Bug Fix

## 1. Current State Analysis

### 1.1 Problem
- Example: `samples/hwpx/hang_job_01.hwpx` page 3
- Paragraph 0.36 has Picture (bin_data_id=2), `treat_as_char=false, wrap=TopAndBottom`
- Size: 40758x31094 HU (approx. 543x414px)
- Image height ignored, next paragraph outputs overlapping

### 1.2 Cause
`calculate_shape_reserved_heights()` only matches `Control::Shape` and ignores `Control::Picture`.
TopAndBottom Picture's height is not registered in `shape_reserved`, so the y_offset jump in layout.rs does not occur.

### 1.3 Spec Check
Picture and Shape share the same `CommonObjAttr` → TopAndBottom layout rules are identical.

## 2. Implementation Plan

### 2.1 Step 1: Add Picture/Equation Support to calculate_shape_reserved_heights
- Add `Control::Picture(pic)` match arm, use `pic.common`
- Check if Equation can also be TopAndBottom, add same treatment if needed
- Exclude `treat_as_char=true` Pictures as before (LINE_SEG includes height)
- Extract coordinate calculation logic (v_offset, shape_y, bottom_y) into common helper function to avoid duplication

### 2.2 Step 2: threshold_y Filter Verification
- Current filter: `threshold_y = col_area.y + col_area.height / 3.0`
- Verify that the target image passes this filter
- Adjust filter condition for Pictures if needed

### 2.3 Step 3: Regression Tests
- HWPX: hang_job_01.hwpx page 3 image layout normal
- HWP: Existing TopAndBottom Picture layout regression check
- TAC Picture (treat_as_char=true): No change confirmed
- TopAndBottom Shape: Existing behavior regression check

## 3. Impact Scope
- `src/renderer/layout/shape_layout.rs` — calculate_shape_reserved_heights
- No pagination changes needed (Shape also doesn't consume height in process_controls; handled via shape_reserved mechanism)

## 4. Review History
- Expert review: Removed Step 2 (pagination modification) → shape_reserved alone is sufficient
- Added Equation review, threshold_y filter verification
