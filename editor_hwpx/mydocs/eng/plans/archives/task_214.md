# Task 214 Execution Plan: Single-Pass Layout Engine Transition — Phase 1: Paragraph Typesetting

## Goal

Transition the current 3-stage pipeline (height_measurer → pagination → layout) to a single-pass typesetting engine. Phase 1 handles **paragraph (non-table) element** typesetting in a single pass, integrating measurement and placement.

## Current Problems

1. Discrepancy between heights measured by height_measurer and heights actually placed by layout
2. Since pagination trusts measured values, errors accumulate causing overflow and empty pages
3. No feedback loop — fixing one case breaks another in a vicious cycle (7+ days of repetition)

## Transition Strategy

Build the **new typeset path** in **parallel** with the existing path while protecting all 684 existing tests. Remove the old path once the new path is verified to produce identical results.

## Implementation Steps

### Step 1: TypesetEngine Framework Construction

**Goal**: Define core structs and interfaces for single-pass typesetting

- Create `TypesetEngine` struct (src/renderer/typeset.rs)
- `PageState` — manage remaining height and column info for current page
- `TypesetResult` — typesetting result (list of PageContent per page)
- Core methods:
  - `typeset_section()` — entry point (paragraphs + page_def + styles → TypesetResult)
  - `format_paragraph()` — paragraph height calculation (integrate existing height_measurer logic)
  - `fits()` — determine if content fits in remaining space
  - `place()` — confirm placement on current page
  - `move_to_next_page()` — move to next page (reset height)

**Verification**: Struct definition + empty implementation compiles

### Step 2: Paragraph Typesetting Implementation

**Goal**: Implement format → fits → place/split flow for non-table paragraphs

- `format_paragraph()`: integrate existing `HeightMeasurer::measure_paragraph()` logic
  - LINE_SEG-based line height calculation
  - spacing_before/after reflection
  - Non-inline image height inclusion
- `fits()`: determine if total paragraph height ≤ remaining height
- `place()`: create PageItem::FullParagraph, update y_offset
- `split_paragraph()`: line-by-line splitting
  - Lines that fit → PageItem::PartialParagraph (master)
  - Remaining lines continue on next page (follow)
- Page/column breaks: force_new_page, column_break handling

**Verification**: Compare with existing pagination results using non-table documents (simple multi-page paragraphs)

### Step 3: Special Case Handling and Existing Path Integration

**Goal**: Handle multi-column, headers/footers, footnotes and other special cases; connect with existing code

- Multi-column handling: column switching based on ColumnDef
- Header/footer area height deduction
- Footnote area height deduction
- Page number position determination
- Tables/Shapes maintained with existing approach (transition in Phase 2)
  - When encountering a table, use existing MeasuredTable for fits/place/split
- Connect new path to `DocumentCore::paginate()`
  - Run both existing and new paths and compare results (debug mode)

**Verification**: 684 tests PASS, kps-ai.hwp/hwpp-001.hwp 0 overflows, WASM build success

### Step 4: Remove Existing Path and Cleanup

**Goal**: Clean up existing 3-stage pipeline's paragraph-related code after verification

- Remove `HeightMeasurer::measure_paragraph()` (keep table measurement)
- Delegate paragraph pagination logic within `Paginator` to TypesetEngine
- Clean up unnecessary intermediate data structures
- Confirm LayoutOverflow self-verification at 0

**Verification**: 684 tests PASS, visual accuracy maintained across all documents, WASM build success

## Risk Factors

1. **Existing test regression**: Minimize risk through parallel path gradual transition
2. **Table handling compatibility**: Keep tables in existing approach in Phase 1, align interfaces only
3. **vpos correction logic**: Existing layout.rs vpos-based y_offset correction should be unnecessary in new engine

## Reference Documents

- [Single-pass layout design document](../tech/single_pass_layout_design.md)
