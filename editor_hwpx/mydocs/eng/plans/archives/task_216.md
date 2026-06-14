# Task 216 Execution Plan: k-water-rfp.hwp p17 Last Paragraph Cropping Fix

## Problem Symptom

The last paragraph "3. Request for Proposal Contents" on page 17 of k-water-rfp.hwp is clipped at the bottom of the page.

## Root Cause Analysis

### Direct Cause
A **6.6px cumulative error** exists between pagination's `cur_h` (890.7) and layout's `y_offset` (897.3). Pagination determines "paragraph content fits in remaining space" (910.7 ≤ 915.5), but in layout it actually overflows (917.3 > 915.5).

### Fundamental Cause
The max_fs correction (maximum font size) is missing from height_measurer's **table cell height calculation**.

| Component | height_measurer (table cell) | layout |
|-----------|------------------------------|--------|
| Line height | `hwpunit_to_px(line.line_height)` (raw) | max_fs correction applied |
| Cell paragraph line spacing | LINE_SEG original | max font size × line spacing ratio |

Line spacing within a paragraph is proportional to the maximum font size of that line, but inter-paragraph spacing (spacing_before/after) is a fixed value independent of font size. The former (line height correction) is missing from height_measurer's table cell calculation, causing approximately 22.5px difference per table compared to layout, with 3.3px residual error per table accumulating even after vpos correction.

## Target File

- `src/renderer/height_measurer.rs` — add max_fs correction to table cell height calculation

## Implementation Plan

### Step 1: Apply max_fs Correction to Table Cell Height in height_measurer
### Step 2: Extract Common Function and Verify
### Step 3: Test and SVG Verification
