# Task 69 Execution Plan: Page Setup Top Margin and Header Height Correction

## Background

From Hancom Help (hwpkor.chm) page margin description:
> "Regardless of whether headers/footers have content, the body text starts after leaving space equal to the height specified in [Page Setup - Header/Footer Margins]."

## Problem

Currently `PageAreas::from_page_def()` calculates **body start = margin_top**,
but the actual HWP behavior is **body start = margin_top + margin_header**.

### Example (hwp-multi-001.hwp)

| Item | Current implementation | Actual HWP behavior |
|------|-----------------------|---------------------|
| margin_top | 15mm | 15mm |
| margin_header | 10mm | 10mm |
| **Body start** | **15mm** (56.7px) | **25mm** (94.5px) |
| **Difference** | - | **10mm (37.8px) lower** |

### HWP Margin Structure (Hancom standard)

```
Paper top (0)
+-- margin_header (10mm)     <- Header start position
+-- margin_header zone       <- Header content area
+-- margin_top zone (15mm)   <- Header height
+-- Body start (25mm)        <- margin_top + margin_header
|   ...body...
+-- Body end                 <- height - margin_bottom - margin_footer
+-- margin_bottom zone       <- Footer height
+-- margin_footer zone       <- Footer end
+-- Paper bottom
```

## Modification Scope

Core modification: 1 location in `src/model/page.rs` `PageAreas::from_page_def()`

| File | Action |
|------|--------|
| `src/model/page.rs` | Fix body area top/bottom calculation |

## Verification

1. 488 Rust tests pass
2. Confirm body start y-coordinate via SVG export (hwp-multi-001.hwp)
3. Confirm rendering regression-free across multiple sample documents
