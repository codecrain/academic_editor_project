# Task 275: Nested Table Cell Editing Support

## Goal

Ensure that cursor entry, text editing, and form field detection work correctly in table > cell > table > cell structures (nested tables).

## Current State Analysis

### Working Parts
- `hitTest`: Accurately returns nested table positions as `cellPath[]` array
- `cursor.moveTo()`: Stores `cellPath` in `DocumentPosition`
- `getCellParagraphCountByPath()`, `getCellParagraphLengthByPath()`: Path-based query APIs exist

### Problems
- Text editing WASM APIs only support **flat parameters** (depth=1 only)
  - `insertTextInCell(sec, ppi, ci, cei, cpi, offset, text)`
  - `deleteTextInCell(sec, ppi, ci, cei, cpi, offset, count)`
  - `splitParagraphInCell(sec, ppi, ci, cei, cpi, offset)`
  - `mergeParagraphInCell(sec, ppi, ci, cei, cpi)`
- TypeScript command layer (`command.ts`) ignores `cellPath` and only passes flat parameters
- `getFieldInfoAt` cannot detect fields inside nested tables
- `setActiveFieldInCell` doesn't support nested tables

### Impact Scope
- File: BlogForm_BookReview.hwp (table > cell > 7x2 table > cell > form field)
- All HWP files containing nested tables

## Implementation Plan

### Step 1: Add WASM Path-Based Editing APIs

**Modified Files**: `src/wasm_api.rs`, `src/document_core/commands/editing.rs`

- Add helper function to parse `cellPath` JSON string and access the actual paragraph in nested tables
  - `resolve_cell_path(document, sec, ppi, path_json) -> &mut Paragraph`
- Add 4 path-based editing APIs:
  - `insertTextInCellByPath(sec, ppi, path_json, offset, text)`
  - `deleteTextInCellByPath(sec, ppi, path_json, offset, count)`
  - `splitParagraphInCellByPath(sec, ppi, path_json, offset)`
  - `mergeParagraphInCellByPath(sec, ppi, path_json)`

### Step 2: TypeScript Command Layer Modification

**Modified Files**: `rhwp-studio/src/engine/command.ts`, `rhwp-studio/src/core/wasm-bridge.ts`

- Add path-based API wrappers to `wasm-bridge.ts`
- In `command.ts`'s `doInsertText`, `doDeleteText`, `doSplitParagraph`, `doMergeParagraph`:
  Call path-based API when `pos.cellPath?.length > 1`

### Step 3: Nested Table Field Detection + Active Field

**Modified Files**: `src/document_core/queries/field_query.rs`, `src/wasm_api.rs`

- Extend `getFieldInfoAt` to path-based: `getFieldInfoAtByPath(sec, ppi, path_json, offset)`
- Extend `setActiveFieldInCell` to path-based
- In TypeScript `updateFieldMarkers()`, use path-based API when `cellPath` exists

### Step 4: E2E Verification

**Modified Files**: `rhwp-studio/e2e/blogform.test.mjs`

- BlogForm_BookReview.hwp nested table cell click → form field hint hidden
- Text input in nested table cell → confirm normal input

## Verification Method

1. `cargo test` all passing
2. BlogForm_BookReview.hwp E2E: Nested table "Title" cell click → hint hidden + text input works
3. Confirm existing single-level table editing functions work normally
