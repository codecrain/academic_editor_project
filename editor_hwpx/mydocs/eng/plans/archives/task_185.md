# Task 185: hwpp-001.hwp Paragraph Page Break Bug Fix

## 1. Problem Summary

In `samples/hwpp-001.hwp`, paragraphs/tables overflow beyond the body area on many pages. Over 30 overflows found across the 66-page document.

## 2. Root Cause

**Mismatch between HeightMeasurer's `total_height` and layout's actual rendering height**

| Component | Calculation Method | Notes |
|-----------|-------------------|-------|
| HeightMeasurer | `spacing_before + sum(line_height + line_spacing) + spacing_after` | Fixed values |
| Pagination | Uses HeightMeasurer's `total_height` directly | `current_height += para_height` |
| Layout (rendering) | `spacing_before`(conditional) + actual line rendering + `spacing_after` | sp_before skipped at column top |

### Specific Differences

Debug trace results (page_idx=3, section 1):
- HeightMeasurer measured a paragraph with `total_height=21.33` (sp_before=16.00, lines=5.33) but layout rendered it as `delta=34.13`
- Cumulative difference reached **76.80px**, causing last 2-3 paragraphs to exceed body area (930.51px)
- This pattern repeats throughout the document

## 3. Impact Scope

- Over 20 pages of 66 total in `samples/hwpp-001.hwp` have overflows
- FullParagraph, PartialParagraph, Table, PartialTable all affected
- Same pattern may occur in other HWP files

## 4. Fix Direction

Align HeightMeasurer's height measurement with layout's actual rendering height. Specifically:
1. Verify whether line data used by HeightMeasurer and layout are identical
2. Unify table paragraph spacing handling between pagination and layout
3. Review page_index==0 restriction on vpos-based correction

## 5. Verification Methods

- Full SVG export of `samples/hwpp-001.hwp` with overflow detection (0 paragraphs exceeding body area)
- All existing 657 tests pass
- WASM build and web browser page rendering verification
