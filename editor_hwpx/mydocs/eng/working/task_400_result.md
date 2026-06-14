# Task 400 — Completion Report: Text Width Measurement Conformance

> 2026-03-28~29

## Changes

### 1. Windows System Font Metrics Addition
- Added Batang, Gulim metrics to built-in DB
- Added .ttc file support to font-metric-gen
- Alias mapping: Batang->Batang, Gulim/GulimChe/DotumChe->Gulim

### 2. Per-Character Korean/CJK Line Break Point Handling
- In `fill_lines()`, treat single-character CJK/Korean tokens as break points
- Korean break points set only when `korean_break_unit=1` (per-character mode)
- CJK Hanja/Japanese are always break points

### 3. Hanging Indent (indent<0) Line Break Width Calculation Fix
- Subsequent line effective_width = available_width + indent (narrower)
- Before: indent<0 ignored (`.max(0.0)` clamp)

### 4. HWPUNIT Integer-Based Line Break Engine
- Fully converted `fill_lines()` `line_width` from f64(px) to i32(HWPUNIT)
- Same line break determination as Hancom's HWPUNIT integer arithmetic
- `measure_char_width_embedded`: round -> truncate

### 5. Unrounded Width Used in Tokenization
- Used `estimate_text_width_unrounded` in `tokenize_paragraph`
- Eliminated single character round(6.667->7.0) issue -> space 525->500 HU accurate

### 6. Line Break Tolerance 15 HU
- Allows minor differences from Hancom's HWPUNIT quantization (15 HU = approx 0.2mm)

## Match Rate Changes

### Controlled Samples (lseg-01 ~ lseg-06)

| Sample | Line Count (before->after) | Line Break (before->after) | Full (before->after) |
|--------|--------------------------|---------------------------|---------------------|
| lseg-01-basic | 100->**100** | 0->**100** | 0->**100** |
| lseg-02-mixed | 100->100 | 100->100 | 100->100 |
| lseg-03-spacing | **0->100** | 0->**100** | 0->**100** |
| lseg-04-indent | **75->100** | 0->25 | 0->25 |
| lseg-05-tab | 100->100 | 0->**100** | 0->**100** |
| lseg-06-multisize | 100->100 | 0->**100** | 0->**60** |

### Existing Samples (8 files, 45 paragraphs)

| Metric | Before | After |
|--------|--------|-------|
| Line count match rate | 88.9% | 86.7% |
| Line break position match rate | 64.4% | 60.0% |
| Full field match rate | 2.2% | 2.2% |

Existing sample decline cause: Batang/Gulim metrics addition changed Latin width in hongbo.hwp paragraph 17. HFT font vs Windows font metrics conflict.

## Remaining Issues

| No | Issue | Status |
|----|-------|--------|
| B-018 | Tab + justify space distribution overflow | Registered as backlog |
| - | lseg-04 text_start +/-1~3 difference (hanging indent paragraph) | Task 399 |
| - | lseg-06 per-line line_height/baseline differences | Task 401 |
| - | Existing sample HFT font metrics precision | Further investigation |
