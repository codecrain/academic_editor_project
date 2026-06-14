# Task 104 — Completion Report

## Task Name
Fix Forced First Page Jump When Clicking Nested Table Cells

## Work Period
2026-02-17

## Background
Clicking a cell in a nested table (table within a table) caused a `para=4294967295(u32::MAX)` error and forced navigation to the first page.

### Root Cause
When `layout_table()` recursively calls for nested tables, it passes `table_meta: None`.
→ Cell context (parent_para_index, control_index, etc.) for TextRuns within nested tables all become None.
→ hitTest → isInCell()=false → getCursorRect receives invalid paragraphIndex → error.

## Change Details

### `src/renderer/layout.rs`

#### 1. Added `enclosing_cell_ctx: Option<CellContext>` to `layout_table` Signature
- Allows TextRuns in nested tables to inherit the outer cell context

#### 2. Changed Horizontal Cell Context Creation Logic
```rust
// If enclosing_cell_ctx exists (nested table), inherit outer cell context
let cell_context = if let Some(ctx) = enclosing_cell_ctx {
    Some(ctx)
} else {
    table_meta.map(|(pi, ci)| CellContext { ... })
};
```

#### 3. Passed cell_context at 2 Nested Table Call Sites
- Horizontal nested (within layout_table)
- Vertical nested (within layout_partial_table)

#### 4. Passed None at 3 Top-Level Call Sites

#### 5. Also Added `enclosing_cell_ctx` to `layout_vertical_cell_text` Signature
- Vertical cell TextRuns also reflect correct cell context in nested tables

## Limitations
- When clicking a nested table cell, the caret positions at the **outer cell** level (crash prevention)
- Accurately positioning the caret inside a nested table cell requires `DocumentPosition` model extension (separate task)

## Test Results
- 564 tests passed
- WASM build success

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | `layout_table` signature + cell context propagation logic + 6 call sites |
