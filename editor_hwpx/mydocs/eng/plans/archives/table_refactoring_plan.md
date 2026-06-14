# Table Architecture Refactoring Plan (5 Phases)

## 1. Purpose

To transition from a viewer paradigm to an editor paradigm, the table object processing architecture will be incrementally refactored over 5 phases. Each phase is independently complete, and each subsequent phase builds on the achievements of the previous one.

## 2. Prerequisites

- After completing each phase, **all existing tests must pass** + **WASM/Vite build must succeed**
- Each phase is a non-destructive refactoring that **does not break existing behavior**
- No changes to HWP file parsing/serialization format (round-trip preservation)

## 3. Reference Documents

- [Table Architecture Status Analysis Report](../report/table_architecture_review.md)
- [Algorithm Research Report](../report/table_algorithm_research.md)

---

## Phase 1: Dense Grid Index + MeasuredTable Passing

### Goal

- O(n) cell lookup → O(1) cell lookup
- Eliminate duplicate height calculation (measure_table + layout_table redundancy)

### Scope

| Item | File | Changes |
|------|------|---------|
| Dense Grid | `src/model/table.rs` | Add `cell_grid: Vec<Option<usize>>` field, `rebuild_grid()` method |
| Grid Access API | `src/model/table.rs` | `cell_at(row, col) -> Option<&Cell>` O(1) method |
| Grid Synchronization | `src/model/table.rs` | Call `rebuild_grid()` after `insert_row/column`, `delete_row/column`, `merge_cells`, `split_cell` |
| Replace find_cell | `src/wasm_api.rs` | Switch `find_cell_at_row_col()` → `table.cell_at(row, col)` |
| MeasuredTable Passing | `src/renderer/layout.rs` | Add `&MeasuredTable` to `layout_table()` signature, remove row height recalculation code |
| MeasuredTable Storage | `src/wasm_api.rs` | Preserve `MeasuredSection` from `paginate()` result in `self.measured` field |

### Design

```rust
// src/model/table.rs

impl Table {
    /// 2D grid index: grid[row * col_count + col] = Some(cell_idx)
    /// Merged cell's span area entirely points to anchor cell index
    pub cell_grid: Vec<Option<usize>>,

    /// O(1) cell access
    pub fn cell_at(&self, row: u16, col: u16) -> Option<&Cell> {
        let idx = (row as usize) * (self.col_count as usize) + (col as usize);
        self.cell_grid.get(idx)?.map(|i| &self.cells[i])
    }

    /// Rebuild grid (call after structural changes)
    pub fn rebuild_grid(&mut self) {
        let rc = self.row_count as usize;
        let cc = self.col_count as usize;
        self.cell_grid = vec![None; rc * cc];
        for (idx, cell) in self.cells.iter().enumerate() {
            for r in cell.row..(cell.row + cell.row_span) {
                for c in cell.col..(cell.col + cell.col_span) {
                    let gi = (r as usize) * cc + (c as usize);
                    if gi < self.cell_grid.len() {
                        self.cell_grid[gi] = Some(idx);
                    }
                }
            }
        }
    }
}
```

### Verification

- Complete replacement of all `find_cell_at_row_col()` call sites
- Grid integrity tests after row/column add/delete/merge/split
- Comparison test that `layout_table()` row heights match `MeasuredTable.row_heights`
- All Rust tests pass + WASM/Vite build

### Impact

- **Performance**: All cell access improved to O(1)
- **Risk**: Low — internal index addition, external interface unchanged
- **Effort**: Small

---

## Phase 2: Unified Table Layout Engine

### Goal

- `layout_table()` (630 lines) + `layout_nested_table()` (250 lines) → single recursive function unification
- Eliminate nested table rendering code duplication

### Scope

| Item | File | Changes |
|------|------|---------|
| Function Unification | `src/renderer/layout.rs` | New `layout_table_unified()`, depth parameter |
| Page Split Branching | `src/renderer/layout.rs` | Process `PartialTable` only when `depth == 0` |
| Column Width/Row Height | `src/renderer/layout.rs` | Extract common `calc_col_widths()`, `calc_row_heights()` |
| Cell Rendering | `src/renderer/layout.rs` | Extract common `render_cell_content()` |
| Nested Recursion | `src/renderer/layout.rs` | `Control::Table` → `layout_table_unified(depth+1)` recursion |
| Remove Old Functions | `src/renderer/layout.rs` | Remove `layout_nested_table()`, `calc_nested_table_height()` |

### Design

```rust
/// Unified table layout (shared for top-level + nested)
fn layout_table_unified(
    &self,
    tree: &mut PageRenderTree,
    parent_node: &mut RenderNode,
    table: &Table,
    area: &LayoutRect,
    section_index: usize,
    styles: &ResolvedStyleSet,
    bin_data_content: &[BinDataContent],
    depth: usize,                          // 0=top-level, 1+=nested
    partial: Option<&PartialTableInfo>,    // Some only when depth==0
) -> f64 {
    let col_widths = self.calc_col_widths(table);
    let row_heights = self.calc_row_heights(table, &col_widths, styles);

    // If depth==0 and partial exists, render only start_row..end_row
    let (start_row, end_row) = match partial {
        Some(p) => (p.start_row, p.end_row),
        None => (0, table.row_count as usize),
    };

    // Cell rendering (common)
    for cell in &table.cells {
        // ... common cell rendering logic ...
        for ctrl in &para.controls {
            if let Control::Table(nested) = ctrl {
                // Recursion: depth + 1, partial = None (nested tables don't split)
                self.layout_table_unified(
                    tree, &mut cell_node, nested,
                    &inner_area, section_index, styles, bin_data_content,
                    depth + 1, None,
                );
            }
        }
    }
}
```

### Verification

- Rendering comparison of sample HWP files with nested tables (identical before and after refactoring)
- Confirm 0 references to `layout_nested_table` function
- All Rust tests pass + WASM/Vite build

### Impact

- **Code**: ~880 lines → ~500 lines (duplication removed)
- **Risk**: Medium — rendering logic change may cause visual regression
- **Effort**: Medium

---

## Phase 3: Path-Based Access + Recursive Height Measurement

### Goal

- 3-level fixed indexing → arbitrary-depth path-based access
- Remove `calc_cell_controls_height() → 0` → recursive height measurement
- Lay the foundation for nested table editing API

### Scope

| Item | File | Changes |
|------|------|---------|
| PathSegment Definition | `src/model/` (new) | `DocumentPath`, `PathSegment` types |
| Path-Based Access | `src/wasm_api.rs` | `get_table_by_path()`, `get_cell_by_path()` |
| Existing API Preservation | `src/wasm_api.rs` | `get_table_mut()` → internally delegates to `get_table_by_path()` |
| Recursive Height Measurement | `src/renderer/height_measurer.rs` | Recursively measure nested tables in `measure_table()` cell height calculation |
| calc Modification | `src/renderer/layout.rs` | `calc_cell_controls_height()` → actual nested table height calculation |
| Frontend Path | `rhwp-studio/src/core/types.ts` | `DocumentPath` type + nested table hitTest extension |

### Design

```rust
// src/model/path.rs (new)

/// Document tree path segment
#[derive(Debug, Clone)]
pub enum PathSegment {
    /// Body paragraph
    Paragraph(usize),
    /// Control (table, picture, etc.)
    Control(usize),
    /// Table cell (row, col)
    Cell(u16, u16),
}

/// Path pointing to an arbitrary location in the document tree
pub type DocumentPath = Vec<PathSegment>;
```

```rust
// src/wasm_api.rs

/// Path-based table access (supports arbitrary-depth nesting)
fn get_table_by_path(
    &mut self,
    section_idx: usize,
    path: &[PathSegment],
) -> Result<&mut Table, HwpError> {
    let mut paragraphs = &mut self.document.sections[section_idx].paragraphs;
    let mut current_table: Option<&mut Table> = None;

    for segment in path {
        match segment {
            PathSegment::Paragraph(idx) => { /* access paragraphs[idx] */ }
            PathSegment::Control(idx) => { /* extract Table from controls[idx] */ }
            PathSegment::Cell(row, col) => {
                /* enter cell_at(row, col) → cell.paragraphs of current table */
            }
        }
    }
    current_table.ok_or(HwpError::RenderError("No table in path".into()))
}
```

```rust
// src/renderer/height_measurer.rs

/// Recursive cell content height measurement (including nested tables)
fn measure_cell_content_recursive(
    &self,
    cell: &Cell,
    table_padding: &Padding,
    styles: &ResolvedStyleSet,
) -> f64 {
    let mut content_height = 0.0;

    for para in &cell.paragraphs {
        // Paragraph text height
        content_height += self.measure_paragraph_height(para, styles);

        // Nested table height (recursive)
        for ctrl in &para.controls {
            if let Control::Table(nested) = ctrl {
                let nested_measured = self.measure_table(nested, 0, 0, styles);
                content_height += nested_measured.total_height;
            }
        }
    }
    content_height
}
```

### Verification

- Parent cell height accuracy test when editing nested table cell
- Path access test with HWP file containing 3-level nested tables
- Confirm existing `get_table_mut()` call site behavior unchanged
- All Rust tests pass + WASM/Vite build

### Impact

- **Feature**: Technical foundation for nested table editing complete
- **Risk**: Medium — height measurement logic change (may cause minor rendering differences)
- **Effort**: Medium

---

## Phase 4: Page Split Optimization + Bottom-Up Dirty Propagation

### Goal

- Row linear scan → Prefix Sum + binary search
- Parent table back-propagation of nested table height changes
- Orphan/Widow penalty model

### Scope

| Item | File | Changes |
|------|------|---------|
| Prefix Sum | `src/renderer/height_measurer.rs` | Add `cumulative_heights: Vec<f64>` to `MeasuredTable` |
| Binary Search Split | `src/renderer/pagination.rs` | Row loop → `partition_point()`-based split point determination |
| Penalty Model | `src/renderer/pagination.rs` | `BreakPenalty` struct, orphan/widow/merged-span weights |
| Dirty Bit | `src/model/table.rs` | Add `dirty: bool`, `has_dirty_children: bool` to `Table` |
| Back-propagation | `src/wasm_api.rs` | Dirty marking on cell edit → upward propagation along parent path |
| Conditional Reflow | `src/wasm_api.rs` | Re-measure only dirty tables, skip re-pagination if height unchanged |

### Design

```rust
// Prefix Sum-based page splitting
impl MeasuredTable {
    /// Cumulative row heights (prefix sum)
    pub cumulative_heights: Vec<f64>,

    /// Pre-computation
    pub fn build_cumulative(&mut self, cell_spacing: f64) {
        self.cumulative_heights = vec![0.0; self.row_heights.len() + 1];
        for (i, &h) in self.row_heights.iter().enumerate() {
            let cs = if i > 0 { cell_spacing } else { 0.0 };
            self.cumulative_heights[i + 1] = self.cumulative_heights[i] + h + cs;
        }
    }

    /// O(log R) split point determination
    pub fn find_break_row(&self, available: f64, start_row: usize) -> usize {
        let base = self.cumulative_heights[start_row];
        let target = base + available;
        self.cumulative_heights[start_row..]
            .partition_point(|&h| h <= target)
            + start_row - 1
    }
}
```

```rust
// Bottom-Up Dirty Propagation
impl Table {
    pub dirty: bool,
    pub has_dirty_children: bool,
}

// wasm_api.rs — on cell edit
fn on_cell_edited(&mut self, path: &[PathSegment]) {
    // 1. Invalidate compose cache for paragraphs of the cell
    // 2. Traverse path in reverse, marking dirty
    for depth in (0..path.len()).rev() {
        if let Some(table) = self.get_table_at_depth(path, depth) {
            let old_height = table.measured.as_ref().map(|m| m.total_height);
            // Re-measure only the affected row
            self.remeasure_row(table, affected_row);
            let new_height = table.measured.as_ref().map(|m| m.total_height);

            if old_height == new_height {
                break;  // Early termination: no upward propagation needed if height unchanged
            }
            table.dirty = true;
        }
    }
}
```

### Verification

- Page split performance benchmark with large tables (100+ rows)
- Nested table cell edit → parent table height back-propagation behavior test
- Early termination scenario (height unchanged) test
- Penalty model: visual verification of orphan/widow row avoidance
- All Rust tests pass + WASM/Vite build

### Impact

- **Performance**: Page split O(R) → O(log R), re-measure only dirty tables
- **Risk**: Medium — pagination results may change slightly (penalty introduction)
- **Effort**: Medium

---

## Phase 5: Incremental Reflow (Comemo + Relayout Boundary)

### Goal

- Full section reflow → reflow only changed parts
- Automatic caching of `compose_paragraph()`, `measure_table()`
- Declare tables as Relayout Boundaries

### Scope

| Item | File | Changes |
|------|------|---------|
| comemo Dependency | `Cargo.toml` | Add `comemo` crate |
| Compose Memoization | `src/renderer/composer.rs` | `compose_paragraph()` → `#[comemo::memoize]` |
| Measure Memoization | `src/renderer/height_measurer.rs` | Memoize `measure_paragraph()`, `measure_table()` |
| Relayout Boundary | `src/wasm_api.rs` | Skip `compose_section()` condition for table internal edits |
| Partial Re-pagination | `src/renderer/pagination.rs` | Resume page split only from after the changed table |
| Partial Composed Update | `src/wasm_api.rs` | `composed[sec]` full replacement → update only changed paragraphs |

### Design

```rust
// Cargo.toml
[dependencies]
comemo = "0.4"

// src/renderer/composer.rs
#[comemo::memoize]
pub fn compose_paragraph(para: &Paragraph) -> ComposedParagraph {
    // Existing logic as-is (pure function)
}

// src/renderer/height_measurer.rs
#[comemo::memoize]
fn measure_paragraph_cached(
    para: &Paragraph,
    composed: &ComposedParagraph,
    styles: &ResolvedStyleSet,
) -> MeasuredParagraph {
    // Existing logic
}
```

```rust
// src/wasm_api.rs — Relayout Boundary application

fn insert_text_in_cell(&mut self, ...) {
    // 1. Text insertion (existing)
    self.document.sections[sec].raw_stream = None;

    // 2. Relayout Boundary: skip compose_section() for table internal edits
    //    Compose only the cell paragraph (comemo handles auto-caching)
    let composed_para = compose_paragraph(&cell_para);
    self.composed[sec][para_idx] = composed_para;  // Partial update

    // 3. Re-call measure_section()
    //    → comemo automatically skips unchanged paragraphs/tables
    //    → Actual cost: only re-measure paragraphs of the changed cell
    let measured = measurer.measure_section(...);

    // 4. Check if table height changed (Phase 4's dirty propagation)
    if table_height_changed {
        // Partial re-pagination: only from the table onwards
        self.repaginate_from(sec, para_idx);
    }
}
```

### Verification

- Performance benchmark: Cell edit response time measurement (before and after refactoring)
  - Goal: O(1) response for cell character input (height unchanged case)
- comemo cache hit rate monitoring
- Verify reflow scope during table editing in 20+ page documents
- Memory usage measurement (comemo cache overhead)
- All Rust tests pass + WASM/Vite build

### Impact

- **Performance**: Cell edit O(P + T×C) → O(1)~O(dirty) — extreme improvement
- **Risk**: High — fundamental change to reflow pipeline, comemo dependency addition
- **Effort**: Large

---

## 4. Phase-by-Phase Dependencies

```
Phase 1 (Dense Grid + MeasuredTable)
  │
  ├── Phase 2 (Unified Layout Engine) ─── Uses Phase 1's grid
  │
  └── Phase 3 (Path Access + Recursive Height) ─── Uses Phase 1's cell_at()
       │
       └── Phase 4 (Prefix Sum + Dirty Propagation) ─── Requires Phase 3's path/recursion
            │
            └── Phase 5 (Incremental Reflow) ─── Based on all of Phases 1~4
```

- Phase 1 is the foundation for all subsequent phases
- Phases 2 and 3 can **proceed in parallel** (mutually independent)
- Phase 4 comes after Phase 3 completion
- Phase 5 comes after all Phases 1~4 complete (final integration)

---

## 5. Overall Schedule and Expected Benefits

| Phase | Core Algorithm | Effort | Key Benefits |
|-------|---------------|--------|-------------|
| 1 | Dense Grid + Cache Passing | Small | O(1) cell access, eliminate dual computation |
| 2 | Recursive Unified Function | Medium | ~380 line code reduction, single maintenance |
| 3 | Path Encoding + Constraint Propagation | Medium | Nested table editing foundation, height accuracy |
| 4 | Prefix Sum + Bottom-Up Dirty | Medium | O(log R) split, early termination back-propagation |
| 5 | Comemo + Relayout Boundary | Large | O(1) cell edit response, extreme performance |

### Cumulative Expected Benefits

```
Phase 1 complete: Cell access O(n) → O(1), 50% render cost reduction
Phase 2 complete: + Code complexity reduction, nested table logic unification
Phase 3 complete: + Nested table editing possible, recursive height measurement
Phase 4 complete: + Page split optimization, dirty early termination
Phase 5 complete: + Cell edit O(P) → O(1), editor-level interactive performance
```

---

## 6. Risk Factors and Mitigation Strategies

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Rendering regression (Phase 2) | Medium | Pixel comparison testing before and after refactoring |
| Minor height changes (Phase 3) | Medium | Define tolerance range for HWP metadata vs recursive calculation differences |
| comemo WASM compatibility (Phase 5) | High | PoC build verification before starting Phase 5 |
| Cache memory increase (Phase 5) | Low | Set comemo cache size limit |
| HWP serialization impact (all phases) | High | Save → reload → open in Hancom Office verification at each phase |

---

*Created: 2026-02-15*
