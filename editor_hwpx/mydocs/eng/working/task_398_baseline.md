# Task 398 — LINE_SEG Match Rate Baseline Report

> 2026-03-28 | Original LINE_SEG vs rhwp reflow_line_segs() Comparison Results

---

## 1. Measurement Environment

- Font: Batang 10pt (controlled sample), various fonts (existing samples)
- DPI: 96
- Comparison method: Parse HWP file -> copy original LINE_SEG -> reflow under same conditions -> per-field comparison

## 2. Controlled Sample Results (lseg-01 ~ lseg-06)

| Sample | Paragraphs | Line Count Match | Line Break Match | Full Match | Key Mismatch |
|--------|-----------|-----------------|-----------------|-----------|-------------|
| lseg-01-basic | 2 | 100% | 0% | 0% | text_start -2~-3 |
| lseg-02-mixed | 1 | 100% | **100%** | **100%** | Full match |
| lseg-03-spacing | 4 | **0%** | 0% | 0% | 4 lines->5 lines (all paragraphs) |
| lseg-04-indent | 4 | 75% | 0% | 0% | 1 indented paragraph line count mismatch |
| lseg-05-tab | 7 | 100% | 0% | 0% | text_start +/-2~4 |
| lseg-06-multisize | 5 | 100% | 0% | 0% | Per-line line_height/baseline differences |

## 3. Existing Sample Results (8 files, 45 paragraphs)

| Metric | Result |
|--------|--------|
| Line count match rate | 88.9% |
| Line break position match rate | 64.4% |
| Full field match rate | 2.2% |

## 4. Mismatch Pattern Analysis

### Pattern A: text_start Error (Most Frequent)

- **Direction**: Consistently **negative** (-2~-4 UTF-16 units)
- **Meaning**: rhwp measures character width slightly **narrower** than Hancom -> fits more characters per line
- **Impact**: Shifts line break positions, accumulates to line count differences
- **Estimated cause**: Minor differences between built-in font metrics and Hancom metrics
- **Affected samples**: lseg-01, lseg-04, lseg-05 (Batang proportional)
- **Task 400 target**

### Pattern B: Line Count Mismatch — 4 lines->5 lines (lseg-03-spacing)

- All 4 paragraphs show **identical** pattern (regardless of line spacing 130%/160%/200%/fixed 20pt)
- Independent of line spacing type, so it's a **line breaking algorithm difference**
- Narrow text width measurement causes boundary issue where last word fits on one line
- **Task 399 + 400 target**

### Pattern C: line_height/baseline Mismatch with Mixed Sizes (lseg-06)

- When mixing 10pt + 16pt in one paragraph, Hancom generates **different line_height per line**
- Current `reflow_line_segs()` applies first line's line_height **identically to all lines**
- pi=0: line_height +600, baseline +510 at L1 (line with 16pt characters)
- pi=2: line_height -200 at L1 (large value applied to line with only 10pt)
- **Task 401 key target**

### Pattern D: segment_width Minor Differences (2~3 HWPUNIT)

- Occurs in nearly all paragraphs
- Estimated rounding method differences during px->HWPUNIT conversion
- No practical layout impact (less than 0.01mm)
- **Low priority**

## 5. Task 399~401 Priority Assessment

| Order | Task | Target Pattern | Rationale |
|-------|------|---------------|-----------|
| **1** | 400 (text width measurement) | Patterns A, B | text_start error is the root cause of line break and line count mismatches |
| **2** | 399 (line breaking algorithm) | Pattern B | Resolves remaining line break differences after width measurement correction |
| **3** | 401 (line_height/baseline) | Pattern C | Reverse engineering per-line metric calculation for mixed sizes |

## 6. Future Measurement Plans

- Re-run same tests after Tasks 399~401 improvements to track match rate changes
- Add Gothic-family (Dotum, Gulim) samples to verify per-font differences
- Add multi-column layout and table-internal paragraph samples
