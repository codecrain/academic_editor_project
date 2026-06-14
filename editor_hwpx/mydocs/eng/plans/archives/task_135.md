# Task 135 Execution Plan — Cell Split Feature Implementation

## Background

Hancom's "Cell Split" feature: After selecting a cell and specifying row/column counts in the dialog, the cell is divided into NxM sub-cells.

### Hancom Behavior

- **Single cell selection**: Split rows/columns within that cell
- **Multiple cell selection (F5)**: Split each selected cell individually with specified rows/columns
- **Rule**: Split/merge applies only to selected cells

### Existing Infrastructure

| Item | Status | File |
|------|--------|------|
| `Table::split_cell()` | Only supports merge undo | `src/model/table.rs:691` |
| `splitTableCell` WASM API | Merge undo only | `src/wasm_api.rs:533` |
| `table:cell-split` command | Only works on merged cells | `rhwp-studio/src/command/commands/table.ts:183` |
| `insert_row/column` | Row/column insertion pattern | `src/model/table.rs:292,371` |
| `Cell::new_from_template()` | Cell clone helper | `src/model/table.rs:133` |

## Implementation Steps (3 Steps)

---

### Step 1: Rust Model

**File**: `src/model/table.rs`

#### A. `split_cell_into()` — Single cell NxM split

- `extra_cols = max(0, m_cols - cs)`, `extra_rows = max(0, n_rows - rs)` (considering span)
- Adjust existing cells: shift right, extend same column/row span
- Distribute sub-cell col_span/row_span equally (distribute grid_cols among m_cols)
- 6 tests: 1x2, 2x1, 2x2, no-op, width distribution, split after merge

#### B. `split_cells_in_range()` — Multiple cell range split

- Column-first order (right to left), within each column process rows (bottom to top)
- Splitting within same column only extends col_span, so no effect on left cells
- Spans expanded by previous splits (cs=m_cols) are handled as extra_cols=0
- 2 tests: 2x2 range 1x2 split, single cell range

---

### Step 2: WASM API + TypeScript Bridge

- `splitTableCellInto` — Single cell split
- `splitTableCellsInRange` — Multiple cell split within range
- 2 TS wrappers added (`wasm-bridge.ts`)

---

### Step 3: Dialog UI + Command Connection

#### Dialog (`cell-split-dialog.ts`)

```
┌───────────────────────────────────────────┐
│ Cell Split                           [×]  │
├─────────────────────────────┬─────────────┤
│ ─ Row/Column Split ────────  │ [Split(D)]  │
│ ☐ Rows(R): [2  ▴▾]         │ [Cancel]    │
│ ☑ Cols(C): [2  ▴▾]         │             │
│                             │             │
│ ─ Options ─────────────────  │             │
│ ☐ Split rows equally(H)     │             │
│ ☐ Merge then split(M)       │             │
└─────────────────────────────┴─────────────┘
```

#### Command (`table:cell-split`)

- F5 cell selection mode: `splitTableCellsInRange` (range split)
- Single cell: `splitTableCellInto` (individual split)
- "Merge then split" checkbox: disabled in multi-cell mode

---

## Changed Files Summary

| File | Change | Scale |
|------|--------|-------|
| `src/model/table.rs` | `split_cell_into()` + `split_cells_in_range()` + 8 tests | +200 lines |
| `src/wasm_api.rs` | 2 WASM bindings + 2 native methods | +70 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | 2 TS wrappers | +20 lines |
| `rhwp-studio/src/ui/cell-split-dialog.ts` | Dialog (new) | +190 lines |
| `rhwp-studio/src/command/commands/table.ts` | Command connection (single/multi branching) | modified 30 lines |
| **Total** | | **+510 lines** |

## Verification Results

1. `docker compose run --rm test` — All 581 tests pass
2. `docker compose run --rm wasm` — WASM build succeeds
3. `npx tsc --noEmit` — TypeScript compilation succeeds
4. Manual testing: single cell split, multi-cell range split, merged cell split
