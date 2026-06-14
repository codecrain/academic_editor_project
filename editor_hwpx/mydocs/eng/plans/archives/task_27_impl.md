# Task 27: Table Page Breaking - Implementation Plan

## Target Problem

`samples/k-water-rfp.hwp` pages 5-6:
- Table 2 (4 rows x 4 cols, 15 cells): total height ~1053px, page body area ~1010px
- Current: Table moves entirely to page 6 with overflow (y=1166 > page height 1122)
- Goal: Table starts at bottom of page 5, overflowing rows continue on page 6 with header row repeated

## Implementation Phases (3 Phases)

---

### Phase 1: PageItem::PartialTable + Pagination Splitting Logic

**File**: `src/renderer/pagination.rs`

#### 1-1. PageItem enum extension

```rust
/// Placing only some rows of a table (page splitting)
PartialTable {
    para_index: usize,
    control_index: usize,
    /// Start row (inclusive)
    start_row: usize,
    /// End row (exclusive)
    end_row: usize,
    /// Continuation page flag (if true, repeat header row)
    is_continuation: bool,
},
```

#### 1-2. Table splitting logic (within paginate_with_measured)

Modify existing table handling block (lines 308-391):

```
IF effective_height <= available_remaining:
    → Place as PageItem::Table as before
ELSE:
    → Determine row range that fits on current page by cumulative row height
    → PageItem::PartialTable { start_row: 0, end_row: split_row }
    → Remaining rows loop to new pages as PartialTable (is_continuation=true)
    → When repeat_header, deduct header row height from available
```

Row height info calculated from `MeasuredTable.row_heights` + cell_spacing accumulation.

#### 1-3. Add cell_spacing field to MeasuredTable

**File**: `src/renderer/height_measurer.rs`

```rust
pub struct MeasuredTable {
    // ... existing fields
    pub cell_spacing: f64,  // new field
}
```

---

### Phase 2: layout_table Row Range Rendering

**File**: `src/renderer/layout.rs`

#### 2-1. Add PartialTable handling branch in PageItem matching

#### 2-2. Add layout_partial_table() function

Reuse existing `layout_table()` logic with:
- Column width calculation: based on all cells (same)
- Row height calculation: based on all rows (same)
- Cell rendering: render only cells in `start_row..end_row` range
- `is_continuation && repeat_header`: render header row (row 0) first, then start_row~end_row below
- row_y coordinates: recalculate for rendering range (starting from 0)
- Merged cell (row_span) handling: clip at range boundaries

#### 2-3. Code sharing with existing layout_table()

Delegate `layout_table()` to `layout_partial_table(start_row=0, end_row=row_count, is_continuation=false)` to eliminate duplication.

---

### Phase 3: Testing and Verification

#### 3-1. Unit Tests
- Pagination: verify PartialTable generation when table overflows page
- Pagination: verify header row height reflected on continuation pages with repeat_header
- Layout: verify only correct row range output when rendering PartialTable

#### 3-2. Integration Verification
- `docker compose run --rm test` → Existing 381 + new tests pass
- `docker compose run --rm wasm` �� WASM build successful
- `k-water-rfp.hwp` SVG output: table split rendered across pages 5-6
