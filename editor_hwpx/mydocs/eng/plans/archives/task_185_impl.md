# Task 185 Implementation Plan: Paragraph Page Break Bug Fix

## Problem Core

Pagination's `current_height` accumulation and Layout's `y_offset` accumulation are mismatched, causing paragraphs that pagination judged as "can fit" to exceed body area in actual rendering.

### Debug Trace Results (page_idx=3)

| para | HM total | PAG delta | LAYOUT delta | Difference |
|------|----------|-----------|--------------|------------|
| 40 | 21.33 | 21.33 | 34.13 | +12.80 |
| 41 | 21.33 | 21.33 | 43.73 | +22.40 |
| 47 | 21.33 | 21.33 | 43.73 | +22.40 |
| 48 | 18.67 | 18.67 | 37.87 | +19.20 |

**Why LAYOUT delta > HM total**: HM measured from composed line data as `lines=5.33` (single line), but layout actually renders the paragraph at greater height.

---

## Step-by-Step Implementation Plan

### Step 1: Precise Diagnosis of Height Mismatch

**Goal**: Determine why HM's lines_total differs from layout's actual line height sum

**Tasks**:
- Add debug output calculating each line's `line_height + line_spacing` sum in layout_paragraph
- Compare HM's `line_heights[]`, `line_spacings[]` with layout's `composed.lines[].line_height/line_spacing`
- Verify composed data is correctly passed at section boundaries

**Completion criteria**: Identify exact code lines causing the mismatch

### Step 2: Fix HeightMeasurer Height Calculation

**Goal**: Make HM's total_height match layout's actual rendering height

**Tasks**:
- Apply fix based on cause identified in Step 1
- Possible fixes: (A) Use same composed/line_seg data as layout, (B) Reflect layout's additional spacing in HM, (C) Apply same height accumulation method as layout in pagination
- Confirm existing 657 tests pass

**Completion criteria**: Significant overflow count reduction in hwpp-001.hwp full SVG export

### Step 3: Fix Remaining Overflows and Regression Testing

**Goal**: Resolve remaining overflow cases + regression test against other HWP files

**Tasks**:
- Track and fix remaining overflow cases after Step 2
- Regression verification via SVG export of major HWP files in `samples/`
- All 657 tests pass, WASM build and web browser testing

**Completion criteria**: hwpp-001.hwp 0 overflows, existing tests pass, WASM build succeeds
