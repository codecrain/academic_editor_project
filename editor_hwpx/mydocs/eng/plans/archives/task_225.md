# Task 225: synam-001.hwp Page Bottom Empty Return Paragraph Overflow Investigation

## Problem Symptom

In synam-001.hwp, empty `<Return>` paragraphs at page bottoms overflow to the next page. Hancom keeps them on the same page, but our renderer honestly calculates height and moves them to the next page.

## Root Cause Analysis

HWP Spec **Table 132: Section Definition Properties** bit 19: **"Hide empty lines"**

- synam-001.hwp's `section_def.flags = 0x00080000` → bit 19 = 1 (hide empty lines enabled)
- In newly created normal documents, this flag is off and works correctly
- Currently the parser does not read this flag, and pagination does not reflect it

## Result

- 41 pages → changed to 35 pages, identical to Hancom
- 694 tests pass, WASM build complete
- Implementation: when empty paragraphs at page end would cause overflow, treat height as 0 for up to 2 paragraphs per page
- In layout, hidden paragraphs are rendered (paragraph marks displayed) but y_offset remains unchanged
