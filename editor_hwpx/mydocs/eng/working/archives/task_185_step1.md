# Task 185 - Step 1 Completion Report: Height Mismatch Precision Diagnosis

## Diagnosis Result

### Root Cause

In `layout_paragraph` (paragraph_layout.rs:562-578), when LineSeg's `line_height` is smaller than the maximum font size of that line, there's a correction logic that recalculates line_height using ParaShape's line spacing settings.

**HeightMeasurer's `measure_paragraph()` lacks this correction.** It uses LineSeg's raw line_height (5.33px = 400 HWPUNIT) directly for `lines_total` calculation.

### Verification Data (page_idx=3, para 40)

| Item | HM | Layout |
|------|-----|--------|
| raw line_height | 5.33px (400 HU) | 5.33px (400 HU) |
| max_font_size | (not calculated) | 21.33px (16pt) |
| Correction applied | None → 5.33 used | raw < max_fs → 21.33 x 160% = 34.13 |
| lines_total | 5.33 | 34.13 |

### Impact
- Height difference accumulates for every paragraph where this correction applies
- At page_idx=3: cumulative difference 76.80px → last 3 items exceed body area

## Fix Direction
Apply same correction formula when calculating line_height in HeightMeasurer's `measure_paragraph()`.
