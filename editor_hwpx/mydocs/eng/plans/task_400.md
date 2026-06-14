# Task 400: Text Width Measurement Accuracy

## Objective

Correct font metrics so that rhwp's text width measurement results match the text_start values in Hancom original LINE_SEG. Identify and resolve the root cause of the consistently negative text_start error (-2~-4 UTF-16) found in the Task 398 baseline.

## Background

Task 398 measurement results:
- text_start error is consistently **negative** → rhwp measures character widths narrower than Hancom
- This causes more characters to fit on a line, making line break positions differ
- Root cause of the 4-line→5-line mismatch in lseg-03-spacing

## Implementation Plan

### Step 1: Per-Character Width Difference Analysis Tool

- Reverse-calculate per-line text widths from lseg-01-basic.hwp's original text_start
- Compare with rhwp `estimate_text_width()` results
- Identify width difference patterns for Korean/English/space/special characters

### Step 2: Built-in Font Metric Correction

- Correct width differences found in BatangChe metrics
- Reverse-engineer using Hancom original text_start as reference
- Measure match rate change with Task 398 tests after correction

### Step 3: Match Rate Improvement Verification

- Re-measure controlled samples (lseg-01~06) + existing samples
- Verify text_start match rate and line count match rate improvements
- Write improvement report

## Deliverables

- Width difference analysis results
- Font metric correction code
- Match rate improvement report (`mydocs/working/task_400_result.md`)

## Notes

- Uses Task 398 measurement infrastructure as verification tool
- Correction scope: BatangChe first, extendable to other fonts later
