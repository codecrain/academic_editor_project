# Task 86 — Stage 1 Completion Report

## Rust Model — delete_row / delete_column Implementation + Tests

### Changes

**`src/model/table.rs`**:
- Added `Table::delete_row(row_idx)` method
  - Range validation, minimum 1 row guarantee
  - Merged cell row_span reduction, moves to next row when anchor row is deleted
  - Below cell row shift, row_count/row_sizes update
- Added `Table::delete_column(col_idx)` method
  - Range validation, minimum 1 column guarantee
  - Merged cell col_span/width reduction, moves to next column when anchor column is deleted
  - Right cell col shift, col_count/row_sizes update
- Added 14 unit tests (7 for delete_row + 7 for delete_column)

### Verification
- Rust tests: All 510 passed (existing 496 + 14 new)
