# Task 81 Execution Plan: Vertical Text in Table Cells

## Background

When `text_direction != 0` is set on a table cell, text is currently rendered horizontally. In the HWP program, text flows top-to-bottom, and columns are arranged right-to-left.

### Current Status

- **Parser**: `cell.text_direction` already parsed (control.rs:215, bits 16-18)
- **Model**: `Cell::text_direction: u8` field exists (table.rs:89)
- **Rendering**: text_direction is **completely ignored** — only horizontal layout performed

### table-004.hwp Diagnostic Results

| Cell | Position | text_dir | Text | Size (HU) |
|------|----------|----------|------|-----------|
| Cell[12] | r=2,c=0 | **2** | "Infrastructure (Server)" | 3850x8055 (narrow and tall) |
| Cell[43] | r=10,c=0 | **2** | "Data" | 3850x7378 |
| Cell[74] | r=18,c=0 | **2** | "Analysis Model" | 3850x5273 |

All are narrow left-side category cells with row merging (row_span=3~7).

### HWP Vertical Text Rules (Help Documentation)

- **text_direction values**: 0=horizontal, 1=English sideways (vertical+English rotated), 2=English upright (vertical+English upright)
- **Text direction**: top-to-bottom, columns right-to-left
- **Alignment mapping**: vertical_align meaning transforms
  - Top → horizontal right
  - Center → horizontal center
  - Bottom → horizontal left

## Goal

1. Render vertical text cells in top-to-bottom direction
2. Correctly handle vertical alignment (horizontal position mapping)
3. No regression in existing horizontal text cell rendering

## Scope

### Step 1: Pass text_direction Through Render Pipeline

**Files**: `src/renderer/render_tree.rs`, `src/renderer/layout.rs`

- Add `text_direction: u8` field to `TableCellNode`
- Add `text_direction: u8` field to `CellContext`
- Pass `cell.text_direction` when creating cell nodes

### Step 2: Implement Vertical Text Layout Function

**File**: `src/renderer/layout.rs`

- New `layout_vertical_cell_text()` function
- Bypass existing `layout_composed_paragraph()` to directly place characters vertically
- Apply alignment mapping (vertical_align → horizontal position)

### Step 3: Testing and Build Verification

- table-004.hwp SVG export visual verification
- All tests pass confirmation
- WASM/Vite build confirmation

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/renderer/render_tree.rs` | Add text_direction to TableCellNode | ~3 lines |
| `src/renderer/layout.rs` | CellContext field addition, vertical layout branch + new function | ~100 lines |
| `src/wasm_api.rs` | Add regression test | ~40 lines |
