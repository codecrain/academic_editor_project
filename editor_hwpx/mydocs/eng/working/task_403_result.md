# Task 403 -- Completion Report: Automated HWP Sample Generation for Reverse Engineering

> 2026-03-29

## Implementation Details

### 1. Sample Generation Framework

- `re_sample_gen.rs`: Automated HWP sample generation as test cases
- Generated using `template/empty.hwp` + DocumentCore API (`insert_text_native`, `split_paragraph_native`)
- LINE_SEG left empty (`default`) on save -> Hancom recalculates internally when opened

### 2. 3-Type File Naming Scheme

| Suffix | Purpose |
|--------|---------|
| `re-*.hwp` | Version with rhwp-filled LINE_SEG (for rhwp rendering verification) |
| `re-*-empty.hwp` | Version with empty LINE_SEG (original for opening and saving in Hancom) |
| `re-*-empty-hancom.hwp` | Version saved by Hancom with LINE_SEG filled (reverse engineering answer key) |

### 3. Generated Samples (17)

| Category | Files | Verification Target |
|----------|-------|---------------------|
| Basic width (6) | re-01 ~ re-06 | Korean/space/English/digits/mixed/punctuation |
| Per-font (7) | re-font-* | Batang/Batangche/Gulim/Gulimche/Dotum/Dotumche/Malgun Gothic |
| Per-alignment (4) | re-align-* | Justify/left/center/right |

### 4. Reverse Engineering Process Verification

```
rhwp generation (*-empty.hwp)
  -> Supervisor opens in Hancom + saves (*-empty-hancom.hwp)
  -> rhwp compares Hancom LINE_SEG vs self reflow
  -> Derive Hancom calculation formulas from difference patterns
```

## Reverse Engineering Results: Comparison with Hancom Answer Keys (17 empty-hancom files)

| Sample | Line Count | Line Breaking | Overall |
|--------|-----------|---------------|---------|
| re-01-hangul-only | 100% | 100% | 100% |
| re-02-space-count | 100% | 100% | 100% |
| re-03-latin-only | 100% | 0% (ts=+1) | 0% |
| re-04-digit-only | 100% | 100% | 100% |
| re-05-mixed-koen | 100% | 0% (ts=-1/-8) | 0% |
| re-06-punctuation | 100% | 100% | 100% |
| re-font-batang | 100% | 100% | 100% |
| re-font-batangche | 100% | 100% | 100% |
| re-font-gulim | 100% | 100% | 100% |
| re-font-gulimche | 100% | 100% | 100% |
| re-font-dotum | 100% | 100% | 100% |
| re-font-dotumche | 100% | 100% | 100% |
| re-font-malgun | 100% | 100% | 100% |
| re-align-justify | 100% | 100% | 100% |
| re-align-left | 100% | 100% | 100% |
| re-align-center | 100% | 100% | 100% |
| re-align-right | 100% | 100% | 100% |
| **Total** | **100%** | **88.2%** | **88.2%** |

## Code Modified Additionally in Task 403

| Modification | File | Effect |
|-------------|------|--------|
| Added char_widths field to BreakToken | line_breaking.rs | Store individual character widths for variable-width English |
| Pass individual widths to char_level_break_hwp | line_breaking.rs | re-04 digits 100% resolved, re-03 English +7->+1 improvement |
| Collect individual widths for English word tokens | line_breaking.rs | Measure per-character width during tokenization |

## Remaining Discrepancies

| Sample | Difference | Suspected Cause | Next Action |
|--------|-----------|-----------------|-------------|
| re-03-latin-only | ts +1/+2 | Quantization micro-difference | Tolerance adjustment or quantization method refinement |
| re-05-mixed-koen | ts -1/-8 | Width accumulation method difference at Korean-English transition | Additional analysis with Korean-English mixed dedicated samples |

## Key Findings

1. **Hancom recalculates LINE_SEG internally even when empty** -- LINE_SEG is a cache and Hancom can always recalculate
2. **Reverse engineering process validated** -- empty -> Hancom save -> comparison yields Hancom's exact calculation results
3. **Korean/space/punctuation/per-font/per-alignment 100% match with Hancom** -- Basic typesetting is accurate
4. **English variable-width char_level_break precision** -- Major improvement by switching from even distribution to individual widths
