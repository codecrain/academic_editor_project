# Task 337 Plan: TAC Image Subsequent Paragraph Position Layout Bug Fix

## Symptoms

In `samples/hwpspec-w.hwp` page 24, the paragraph (pi=135) after the image (pi=134) and its caption is placed **above** the image.

### Debug Data

```
# dump-pages result
FullParagraph  pi=134  h=215.4 (sb=2.7 lines=203.4 sa=9.3)
Shape          pi=134 ci=0  wrap=TopAndBottom tac=true
FullParagraph  pi=135  h=20.0 (sb=6.7 lines=13.3 sa=0.0)

# overlay y-trace
pi=133 y=201.7  (last text paragraph)
pi=134 y=471.8  (image paragraph — abnormal position)
pi=135 y=461.1  (subsequent paragraph — above image!)
```

### IR Analysis (dump -s 2 -p 134)

- **ParaShape**: ps_id=33, align=Center, spacing_before=400, spacing_after=1400
- **LINE_SEG**: vpos=13560, lh=15255 (includes image height), ls=628
- **Shape**: Group with 17 children, treat_as_char=true, wrap=TopAndBottom
- Shape size: 90.7mm x 47.5mm (25704x13455 HU)

## Suspected Cause

pi=134 is a TAC (treat_as_char=true) Shape paragraph with LINE_SEG `lh=15255` that includes the image height. This paragraph is split into two PageItems: FullParagraph and Shape.

When layout_column_item processes FullParagraph pi=134:
1. Shape may not be included in `has_block_table` check → processed via regular layout_paragraph
2. layout_paragraph calculates height based on LINE_SEG lh=15255, advancing y_offset significantly
3. Shape pi=134 is also processed separately, rendering the image
4. pi=135 is placed with y_offset already advanced

However, the vpos correction code may reverse-correct pi=135's y_offset based on pi=134's LINE_SEG (vpos=13560). This reverse correction doesn't account for image height, causing pi=135 to move above the image.

## Implementation Plan

### Step 1: Precise Root Cause Analysis

- Trace pi=134 (FullParagraph + Shape) processing flow in layout_column_item
- Determine how vpos correction code behaves for TAC Shape paragraphs
- Compare y_offset after pi=134 processing with y_offset before pi=135 processing

### Step 2: Implement Fix

- Fix vpos correction or TAC Shape height handling in layout_paragraph depending on root cause
- Verify compatibility with existing TAC table handling (exam_social #10, etc.)

### Step 3: Verification

- hwpspec-w.hwp p24: Confirm pi=134→135 spacing normalization
- Existing 716 tests passing
- SVG comparison of TAC-related samples (exam_kor, exam_social, etc.)

## Impact Scope

- `src/renderer/layout.rs` — vpos correction or FullParagraph TAC Shape handling
- `src/renderer/layout/paragraph_layout.rs` — TAC Shape height reflection in layout_paragraph (if needed)
