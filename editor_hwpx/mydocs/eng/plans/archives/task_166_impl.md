# Task 166 Implementation Plan: Multi-Column Editing Design and Implementation

## Overview

| Item | Content |
|------|---------|
| Task | 166 (Backlog B-006 promotion) |
| Title | Multi-column editing design and implementation |
| Steps | 3 steps (minimal implementation) |
| Created | 2026-02-26 |

## Existing Infrastructure Analysis

### Render Tree Structure

```
Page → Body → Column(0) → TextLine → TextRun
                         → TextLine → TextRun
              Column(1) → TextLine → TextRun
                         → TextLine → TextRun
```

- `RenderNodeType::Column(u16)` nodes wrap column areas, containing TextLine/TextRun inside
- A single paragraph can span two columns → `PartialParagraph { start_line, end_line }`

### Existing Data

- `para_column_map[section_idx][para_idx] = column_index` — paragraph's **primary column** (determined during pagination)
- `PageContent.column_contents: Vec<ColumnContent>` — paragraphs/tables placed in each column
- `PageAreas.column_areas: Vec<Rect>` — body area coordinates per column

### Current Issues

1. `find_cursor_in_node()` — Ignores Column nodes during recursive traversal → may return first match (wrong column) when same `(sec, para)` TextRun exists in different columns
2. `collect_runs()` — Collects all TextRuns without Column info → "same Y line" fallback may match TextRun from different column
3. `handle_body_boundary()` — Only tries next paragraph index → cannot move from column 0 bottom to column 1 top
4. `collect_matching_runs()` — Matches without Column info → references wrong column TextRun during vertical movement
5. `get_selection_rects_native()` — No column distinction in selection area calculation → expected to auto-resolve after Steps 1-2 fixes

---

## Step 1: cursor_rect.rs Column Tracking (Cursor Coordinates + Hit Test)

### 1-1. Add column tracking to `find_cursor_in_node()`
Add `current_column: Option<u16>` parameter, propagate `Some(col_idx)` when entering `Column(col_idx)` nodes.

### 1-2. Add column tracking to `find_para_line()`
Same pattern — propagate `current_column` at `Column(col_idx)` nodes.

### 1-3. Add `column_index` field to `RunInfo`

### 1-4. Add column tracking to `collect_runs()`
Propagate `current_column` and set `column_index: current_column` when creating RunInfo.

### 1-5. Column filtering in "same Y line" fallback
Determine which column the click coordinate belongs to using `PageAreas.column_areas`, filter RunInfo to that column only.

### 1-6. Column filtering in "closest line" fallback as well

### 1-7. Helper: `find_column_at_x()`
Return column index that the click x-coordinate belongs to.

### Expected change volume
- cursor_rect.rs: ~40 lines modified/added
- mod.rs (or cursor_rect.rs): ~15 lines helper added

---

## Step 2: cursor_nav.rs Column-Boundary-Aware Vertical Movement

### 2-1. Add column boundary handling to `handle_body_boundary()`
When no next paragraph in same column, find first paragraph of next column. If no next column, fall through to existing logic (next/previous page).

### 2-2. Helper: `find_adjacent_column_paragraph()`
Find adjacent paragraph in same column; if none, return first/last paragraph of adjacent column.

### 2-3. Helper: `find_page_and_column_for_paragraph()`
Return `(page_index, column_index)` for a given paragraph.

### 2-4. Add column tracking to `collect_matching_runs()` (optional)
Add `column_index: Option<u16>` to `RunMatch` for preferredX accuracy in PartialParagraph cases.

### Expected change volume
- cursor_nav.rs: ~80 lines modified/added

---

## Step 3: Selection Area Column Width Restriction + Verification

### 3-1. Core requirement: Selection highlight renders within column width only

### 3-2. Leveraging existing infrastructure
`get_selection_rects_native()` already has `find_column_area()` helper. After Step 1 cursor coordinate fixes, this should automatically return correct column areas.

### 3-3. Manual and automated testing
- `cargo test` — 608 tests pass
- Studio manual testing with multi-column documents

### Expected change volume
- cursor_nav.rs (selection area): ~20 lines modified (if needed)

---

## Modified Files Summary

| File | Step | Change Description |
|------|------|-------------------|
| `src/document_core/queries/cursor_rect.rs` | 1 | find_cursor_in_node, find_para_line, collect_runs, RunInfo, hit test fallback column filter, find_column_at_x |
| `src/document_core/queries/cursor_nav.rs` | 2, 3 | handle_body_boundary, find_adjacent_column_paragraph, find_page_and_column_for_paragraph, collect_matching_runs, selection area verification |

## Verification Methods

```bash
cargo test                              # 608 tests pass
# Multi-column sample manual testing in Studio
```
