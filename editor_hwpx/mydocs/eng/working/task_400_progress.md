# Task 400 — Progress Report: Text Width Measurement Conformance

> 2026-03-28

## Work Done

### Stage 1: Per-Character Width Difference Analysis Tool Implementation (Complete)

- Per-line text width diagnostic test (`test_lineseg_width_diagnosis_basic`)
- Tokenization result analysis test (`test_lineseg_linebreak_width_analysis`)

### Stage 2: Font Metric Correction (Complete)

- **Discovered and resolved missing Batang (Windows) metrics**
  - Generated metrics from batang.ttc, gulim.ttc (added .ttc support to font-metric-gen)
  - Added FONT_582 (Batang), FONT_583 (Gulim) to built-in DB
  - Alias mapping: Batang->Batang, Gulim/GulimChe/DotumChe->Gulim

- **Discovered and fixed missing per-character line break points** (Key Fix)
  - Root cause: In `fill_lines()`, single-character Korean Text tokens did not update line break possible points -> on overflow, reverted to previous space position -> fewer characters than Hancom
  - Fix: When `korean_break_unit=1` (per-character), treat Korean tokens as break points
  - CJK Hanja/Japanese are always break points (regardless of word mode)

### Stage 3: Match Rate Measurement (In Progress)

## Match Rate Changes

### Controlled Samples (lseg-01 ~ lseg-06)

| Sample | Line Count (before->after) | Line Break (before->after) | Full (before->after) |
|--------|--------------------------|---------------------------|---------------------|
| lseg-01-basic | 100%->100% | 0%->**50%** | 0%->**50%** |
| lseg-02-mixed | 100%->100% | 100%->100% | 100%->100% |
| lseg-03-spacing | **0%->100%** | 0%->0% | 0%->0% |
| lseg-04-indent | 75%->75% | 0%->0% | 0%->0% |
| lseg-05-tab | 100%->100% | 0%->**43%** | 0%->**43%** |
| lseg-06-multisize | 100%->100% | 0%->**80%** | 0%->**60%** |

### Existing Samples (8 files, 45 paragraphs)

| Metric | Before | After |
|--------|--------|-------|
| Line count match rate | 88.9% | 86.7% |
| Line break position match rate | 64.4% | 64.4% |
| Full field match rate | 2.2% | 2.2% |

Existing sample line count drop 88.9->86.7: Adding Batang/Gulim metrics changed hongbo.hwp paragraph 17 from 7 lines to 6 lines. Per-font metric precision improvement needed.

## Remaining Mismatch Patterns

| Pattern | Impact | Estimated Cause | Response |
|---------|--------|----------------|----------|
| text_start +/-1~2 UTF-16 | Minor line break position differences | Minor width measurement error (rounding, space width, etc.) | Task 399 |
| lseg-04 pi=1 5 lines->4 lines | Hanging indent paragraph | Hanging indent available_width calculation difference | Task 399 |
| lseg-06 line_height/baseline | Per-line differences with mixed sizes | Per-line line_height not calculated | Task 401 |
| Space em/2 vs actual glyph width | TBD | Hancom's space handling rules unknown | Further investigation |
