# Task 77 Implementation Plan: Image Handling in Table Cells at Page Bottom

## Implementation Overview

During pagination intra-row splitting, when a row's cells consist entirely of unsplittable single lines (images), prohibit splitting and move the entire row to the next page.

---

## Step 1: Add Row Splittability Check Method to MeasuredTable

**File**: `src/renderer/height_measurer.rs`

Add a method to `MeasuredTable` that determines whether a row can be intra-row split.

```rust
/// Determines if the specified row can be intra-row split.
/// If all cells in the row have single lines (<=1), splitting is not possible (image cells).
/// If at least one cell has 2+ lines, splitting is possible (text cells).
pub fn is_row_splittable(&self, row: usize) -> bool {
    let cells_in_row: Vec<&MeasuredCell> = self.cells.iter()
        .filter(|c| c.row == row && c.row_span == 1)
        .collect();
    if cells_in_row.is_empty() {
        return false;
    }
    cells_in_row.iter().any(|c| c.line_heights.len() > 1)
}
```

**Scale**: ~10 lines new method

---

## Step 2: Add Splittability Check to Pagination Intra-Row Split Conditions

**File**: `src/renderer/pagination.rs`

Add `is_row_splittable()` check to 2 locations that attempt intra-row splitting.

### Modification Location 1: First Row Overflow (line 740)

```rust
// Before
if can_intra_split {

// After
if can_intra_split && mt.is_row_splittable(r) {
```

### Modification Location 2: Middle Row Partial Placement (line 758)

```rust
// Before
if can_intra_split {

// After
if can_intra_split && mt.is_row_splittable(r) {
```

With this modification, single-line (image) rows will not enter the intra-row split branch:
- If first row: fallback to force include minimum 1 row (line 755)
- If middle row: "do not include this row" moves to next page (line 773)

**Scale**: 2 lines modified

---

## Step 3: Regression Tests + Build Verification

**File**: `src/wasm_api.rs`

### Test 1: Table 6 Cell 2 Image Next Page Rendering

```rust
#[test]
fn test_task77_partial_table_image_cell_no_split() {
    // Verify that row 2 (image cell) of table 6 (paragraph 30) in 20250130-hongbo.hwp
    // is not intra-row split and renders completely on the next page
}
```

### Build Verification

1. `docker compose --env-file /dev/null run --rm test` — all tests pass
2. SVG export: verify `20250130-hongbo.hwp` page-by-page image positions
3. WASM build + Vite build + web browser verification

**Scale**: Test ~30 lines

---

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/renderer/height_measurer.rs` | Add `is_row_splittable()` method | ~10 lines |
| `src/renderer/pagination.rs` | Add `is_row_splittable()` check to intra-row split conditions (2 locations) | ~2 lines |
| `src/wasm_api.rs` | Add regression test | ~30 lines |
