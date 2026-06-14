# Task 399: Line Break Algorithm Reverse Engineering

## Objective

Analyze line break mismatches unresolved in Task 400 to produce results identical to Hancom's line break algorithm.

## Background

Remaining mismatches after Task 400 completion:
- lseg-04-indent: 25% line break (text_start +/-1~3 in hanging indent paragraphs)
- Existing samples: 86.7% line count, 60.0% line break
- Existing sample decline cause: HFT font conflicts from adding Batang/Gulim metrics

## Implementation Plan

### Step 1: lseg-04-indent Mismatch Analysis

- Trace the cause of text_start +/-1~3 differences in hanging indent paragraphs
- Precise comparison of available_width calculation and line break boundaries with hanging indents

### Step 2: Resolve Existing Sample HFT Font Metric Conflicts

- Verify font for hongbo.hwp paragraph 17
- Check whether Gulim alias mapping conflicts with HFT fonts (HCR Dotum, etc.)
- Refine alias mapping conditions if needed

### Step 3: Fine-Tune Line Break Boundaries

- Verify appropriateness of 15 HU tolerance (widen or narrow)
- Refine trailing space absorption rules

## Deliverables

- Line break improvement code
- Match rate improvement report
