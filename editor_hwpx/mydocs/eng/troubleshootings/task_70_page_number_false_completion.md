# Task 70 False Completion -- Troubleshooting

## Overview

In Task 70 "Header/Footer Rendering and Page Number Processing," the task was marked as complete despite page numbers not actually being rendered.

## Timeline

1. Implemented PageNumberPos parsing code, reading `position` value as `pnp.position = ((attr >> 4) & 0x0F)`
2. For k-water-rfp.hwp file with PageNumberPos attr=0x00000500, **position=0** was read
3. position=0 means "no page number," so it was concluded that "this document originally does not display page numbers"
4. The absence of page numbers in SVG export was considered normal
5. Reported as "code infrastructure is complete, visual confirmation pending because test file has position=0"
6. **Task was marked complete, committed, and merged to main**

## Root Cause

### 1. Bit Offset Parsing Error

`src/parser/control.rs` in `parse_page_num_pos()`:

```rust
// Before fix (incorrect)
pnp.format = (attr & 0x0F) as u8;           // bit 0-3
pnp.position = ((attr >> 4) & 0x0F) as u8;  // bit 4-7

// After fix (correct, per HWP spec Table 150)
pnp.format = (attr & 0xFF) as u8;           // bit 0-7
pnp.position = ((attr >> 8) & 0x0F) as u8;  // bit 8-11
```

According to HWP spec Table 150:
- bit 0-7: Number format
- bit 8-11: Display position

For attr=0x00000500:
- Before fix: format=0, position=0 -> no page number <- **incorrect result**
- After fix: format=0, **position=5** -> bottom center <- **correct result**

### 2. Verification Failure -- False Assumption That "It's Supposed to Be This Way"

Accepting the position=0 result without question was the core problem.

Error chain of reasoning:
1. "The parser returns 0" -> assumed the code was correct
2. "This document has no page numbers" -> assumed without checking the actual document
3. "Code infrastructure is complete, so the task is done" -> substituted non-functioning feature with infrastructure readiness

**What should have been done**:
- Open the original document in Hancom HWP viewer to verify whether page numbers are actually displayed
- When position=0 is returned, cross-reference with the spec to verify the bit offset is correct
- When the task goal is "page number processing" and page numbers are not visible, do not consider it complete

## Principles for Preventing Recurrence

### Principle 1: The Completion Criteria for a Feature Task Is "The Feature Works"

- Passing tests alone is insufficient
- The target feature must actually be visible on screen to be considered complete
- "Code infrastructure is ready" is not completion

### Principle 2: When a Parser Returns 0/null/None, Be Suspicious First

- Bit field parsing is especially prone to offset errors
- The conclusion "the value is originally 0" should only be drawn after cross-referencing with the spec
- Cross-validate across multiple sample files when possible

### Principle 3: Never Write "Visual Confirmation Pending" in a Completion Report

- If visual confirmation is not possible, that means the task is incomplete
- Listing non-functioning features under "Known Limitations" in a completion report is self-rationalization

## Issues with the Official HWP Spec Document

### Incorrect Cross-References

**Table 149 (Page Number Position)** data structure:
```
UINT32 | 4 | Attributes (see Table 148)    <- Incorrect reference!
```

Table 148 describes "Odd/Even Adjustment" (only bits 0-1 defined), while the actual page number position attributes are defined in **Table 150**.
Correct description: "Attributes (see **Table 150**)"

### Systematic Mismatch Between Section Titles and Table Numbers

Section titles in the spec document are offset by 2-3 from the actual table numbers, making it difficult to find the correct table even when searching by name.

| Section Title | Actual Tables Contained | Actual Table Content |
|---------------|------------------------|---------------------|
| Auto-Numbering | Table 142, Table 143 | Header/Footer |
| Odd/Even Adjustment | Table 145 | Auto-numbering attributes |
| Page Number Position | Table 146 | New number specification |
| Bookmark | Table 149 | Page number position |
| **Character Overlap** | **Table 150** | **Page number position attributes** |

### Was the Spec Document the Root Cause?

**No.** Table 150 itself clearly states "bit 0-7 number format, bit 8-11 display position."
The original code's `(attr & 0x0F)` / `((attr >> 4) & 0x0F)` layout matches neither Table 148 (odd/even) nor Table 150 (page number position) -- it was arbitrary guesswork, so **implementing without referencing the spec was the root cause.**

However, the cross-reference errors and section title mismatches in the spec document could cause similar mistakes in future parsing work, so caution is warranted.

## Fix Result

A single line fix for the bit offset correctly recognizes position=5 (bottom center) in k-water-rfp.hwp.
Page numbers now render correctly on all pages.
