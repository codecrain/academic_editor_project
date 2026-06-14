# Task 166 Execution Plan: Multi-Column Editing Design and Implementation

## Overview

| Item | Content |
|------|---------|
| Task | 166 (Backlog B-006 promotion) |
| Title | Multi-column editing design and implementation |
| Priority | P0 |
| Created | 2026-02-26 |

## Background

Currently multi-column layout only supports **rendering**.
- `ColumnDef` model, `PageLayoutInfo.column_areas`, `PaginationState.current_column`, `ColumnContent` etc. rendering infrastructure complete
- `Column(u16)` node exists in render tree, column separator rendering works
- However, editing (cursor movement, hit testing, selection) does not recognize columns

## Current Issues

1. **Cursor coordinate query error**: `get_cursor_rect_native()` may find wrong column's TextRun when same `(sec, para)` TextRun exists in multiple columns
2. **Hit test fallback error**: `hit_test_native()`'s "same Y line" fallback may match TextRun from different column
3. **Vertical movement impossible**: ArrowDown cannot move from column 0 bottom to column 1 top
4. **Selection area errors**: Potential rendering issues with cross-column selection

## Core Insight

**Adding `columnIndex` field to `DocumentPosition` is unnecessary.** Columns are a rendering concept, and columns are determined by the combination of `(sectionIndex, paragraphIndex, charOffset)` and pagination data (`PartialParagraph { start_line, end_line }`).

The actual modification scope is making Rust-side query functions (cursor coordinates, hit test, vertical movement) track `Column(u16)` render tree nodes.

## Modified Target Files

| File | Role |
|------|------|
| `src/document_core/queries/cursor_rect.rs` | Cursor coordinate query + hit test |
| `src/document_core/queries/cursor_nav.rs` | Vertical movement + selection area |
| `src/document_core/mod.rs` | Pagination data access helpers |

## Implementation Steps (4 Steps)

### Step 1: Column-Tracking Render Tree Traversal (cursor_rect.rs)
Track `Column(u16)` nodes in cursor coordinate queries and hit tests to match only TextRuns from the correct column

### Step 2: Column-Boundary-Aware Vertical Movement (cursor_nav.rs)
Modify ArrowDown/Up to navigate across column boundaries

### Step 3: Selection Area Column Recognition
Selection rectangles should automatically render in correct columns after Step 1 fixes. Additional edge case handling.

### Step 4: Verification and Edge Cases
- Existing 608 tests pass (no regression)
- Manual testing with multi-column sample files in Studio
- Edge cases: uneven column widths, column count change boundaries, tables in multi-column

## Verification Methods

```bash
cargo test                              # 608 tests pass
cargo run --bin rhwp -- export-svg samples/multi-column.hwp --output output/
# Multi-column document editing test in Studio
```

## Expected Schedule

4 steps, completion report and approval request after each step
