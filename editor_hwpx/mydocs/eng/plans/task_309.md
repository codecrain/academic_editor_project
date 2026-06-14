# Task 309 Plan: HWPX Unparsed Attributes Comprehensive Audit and Parsing Completion

## 1. Current State

Task 308 found 10px rendering difference due to table caption skip.
Comprehensive audit of HWPX parser for attributes specified in XML but not reflected in IR.

## 2. Audit Results (Expert Review)

### P0 — Fix Immediately
- Table `<pos>` attributes: **vertAlign, horzAlign** not parsed (already parsed for images/shapes)

### P1 — High Impact
- `<secPr>` inner **pageBorderFill** — Page border/background (frequent in government documents)

### P2 — Medium Impact
- `<secPr>` inner **startNum** — Page number start value
- `<secPr>` inner **visibility** — Header/footer hiding
- **footNotePr / endNotePr** — Footnote/endnote settings

### P3 — Low Impact
- grid, lineNumberShape, flowWithText, allowOverlap, zOrder, noAdjust

## 3. Implementation Plan

### 3.1 Step 1: P0 Fix — Table pos Attribute Parsing
- Add vertAlign, horzAlign to `_ => {}` at `section.rs:549`
- Implement identically to image/shape parsing code (lines 961, 1202)

### 3.2 Step 2: P1 Fix — pageBorderFill
- Parse pageBorderFill child element of secPr
- Handle borderFillIDRef reference

### 3.3 Step 3: P2 Fix — startNum, visibility
- Parse secPr child elements

### 3.4 Step 4: Verification
- Compare HWP vs HWPX IR with reference files
- cargo test 716 tests passing

## 4. Review History
- Expert review: Priority classification + recommendation to fix identified items immediately
