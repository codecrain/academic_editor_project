# Task 213 Execution Plan

## Title
kps-ai.hwp p66 Empty Page Generation and Nested Table Remaining Content Loss During Table Split (B-014)

## Symptom
- **File**: kps-ai.hwp, pages 66~68
- **Problem 1**: When table on p66 (para 674, 3 rows) is split, only rows 0~1 (51.7px) placed on one page and row 2 (946px) moved entirely to next page → p66 is nearly empty → **Fixed**
- **Problem 2**: After placing rows 0~2 with split_end_limit=862.88 on p66, remaining content (~83px) of row 2 does not continue on next page → remaining_content_for_row returns 0 → **Fixed**
- **Problem 3 (Current)**: p67~p68 composed only of empty paragraphs (para 675~751, text="", controls=0) rendering as empty pages. These empty paragraphs are table cell internal paragraphs incorrectly paginated at section level

## Root Cause Analysis

### Problem 3 Core
Para 674's table (row 2) contains cells with nested tables. These nested tables contain many paragraphs (para 675~751). These paragraphs are correctly nested within cells at the parser/model level, but the pagination engine treats them as **external paragraphs** and places them on separate pages.

Possible causes:
1. Pagination engine's `paginate_paragraphs()` traverses cell internal paragraphs in the section-level paragraph list and continues beyond the table range
2. Table control's cell paragraph indices are confused with section paragraph indices, judging para 675~ as external

## Proposed Fix
1. Investigate logic in pagination engine that checks whether paragraphs after a table are cell internal paragraphs
2. Exclude consecutive empty paragraphs (text="", controls=0) from pagination or correctly assign them to their table cells
3. Verify existing test regression

## Verification Method
1. `cargo test` — 684 existing tests PASS confirmation
2. SVG export: kps-ai.hwp p66~p68 empty page resolution confirmation
3. Regression testing with hwpp-001.hwp and other documents
4. Confirm 0 total overflows

## Impact Scope
- Pagination engine's paragraph traversal logic
- All documents containing cell internal nested table structures
