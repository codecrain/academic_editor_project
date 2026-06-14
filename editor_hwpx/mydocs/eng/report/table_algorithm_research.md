# Table Architecture Improvement: Algorithm Research Report

## 1. Overview

For the 6 pain points in the current architecture (Rust WASM + Canvas/JS), we researched proven algorithms from browser engines, typesetting systems, and spreadsheet engines, and summarized application strategies.

---

## 2. Pain Point Analysis by Algorithm

### 2.1 Flat Cell Array O(n) Lookup

**Current**: `find_cell_at_row_col()` linearly scans `Vec<Cell>` every time

#### Dense Grid (Row x Column Dense Array)

```rust
// grid[row * col_count + col] = Some(cell_idx)
cell_grid: Vec<Option<usize>>  // size: row_count x col_count
```

- **Complexity**: O(1) lookup, O(RxC) space, O(n) construction
- **Merged cells**: Fill entire span area with anchor cell index
- **Used by**: Chrome Blink LayoutNG, Firefox Gecko table layout, CSSWG table algorithm spec
- **WASM suitability**: Cache-friendly, no hash overhead. HWP tables are mostly under 100x100, making this optimal

> **Advantage over HashMap**: Since HWP table dimensions are fixed, dense arrays are faster and more memory-predictable than hashing

**Recommendation**: Adopt Dense Grid. O(RxC) rebuild after structure changes (row/column add/delete) — negligible cost for typical tables.

---

### 2.2 Full Section Reflow

**Current**: A single character edit in a cell triggers full `compose_section()` + `measure_section()` + `paginate()`

#### 2.2.1 Double Dirty Bit (Gecko/Blink Model)

```
2 bits per node:
  IS_DIRTY              — this node itself needs re-layout
  HAS_DIRTY_CHILDREN    — at least 1 descendant is dirty

Marking: Set IS_DIRTY on changed node -> propagate HAS_DIRTY_CHILDREN to root (O(depth))
Layout: Skip subtrees where both bits are clean
```

- **Complexity**: Marking O(depth), layout O(dirty node count)
- **Used by**: Firefox Gecko (`NS_FRAME_IS_DIRTY` + `NS_FRAME_HAS_DIRTY_CHILDREN`), Chrome Blink
- **Note**: 2025 PLDI paper "Spineless Traversal" achieves 1.80x additional performance improvement over Double Dirty Bit using priority queues

#### 2.2.2 Relayout Boundary (Flutter Model)

```
Declare specific nodes as "relayout boundary"
  -> Guarantees descendant changes do not affect ancestor layout
  -> Dirty propagation stops at boundary

Natural boundaries:
  - Fixed column width tables -> cell content changes do not affect table width
  - Fixed height cells -> content changes do not affect row height (overflow clipped)
```

- **Complexity**: Dirty propagation stops at nearest boundary -> O(subtree) layout
- **Used by**: Flutter `RenderObject._relayoutBoundary`, Chrome Blink "layout root"
- **Application**: Tables are natural relayout boundaries. Cell edit -> if row height unchanged, no reflow needed outside the table

#### 2.2.3 Constrained Memoization (Typst/Comemo Model)

```rust
#[comemo::memoize]
fn compose_paragraph(para: &Paragraph) -> ComposedParagraph { ... }

#[comemo::memoize]
fn measure_table(table: &Table, styles: &StyleSet) -> MeasuredTable { ... }
```

- **Principle**: `#[memoize]` annotation on pure functions. Framework tracks actual accessed inputs. Returns cached result if accessed inputs unchanged
- **Complexity**: Cache hit O(1), miss O(function cost)
- **Used by**: **Typst** (Rust typesetting engine) — achieves sub-second incremental compilation with comemo. **rust-analyzer** — incremental semantic analysis with Salsa
- **WASM suitability**: [comemo](https://github.com/typst/comemo) Rust crate, WASM-compilable
- **Application**: `compose_paragraph()`, `measure_paragraph()`, `measure_table()` are all pure functions -> comemo application **automatically skips unchanged paragraphs/tables**

**Recommendation**: Combination of all 3 — Double Dirty Bit (signaling) + Relayout Boundary (propagation limiting) + Comemo (automatic caching)

---

### 2.3 Height Double Calculation

**Current**: `measure_table()` and `layout_table()` independently execute the same row height calculation

#### Measure-Once, Layout-Reuse

```rust
// Current: layout_table() independently recalculates row heights
// Improved: Pass MeasuredTable to layout phase

fn layout_table(
    &self,
    measured: &MeasuredTable,  // <- pre-measured results
    // ...
)
```

- **Principle**: Browser engines perform measurement and placement in a single pass (Flutter `performLayout()`). However, document engines with pagination inevitably separate measurement -> page split -> render. Solution: cache measurement results and pass to render
- **Complexity**: O(n) -> O(n) (total cost unchanged but deduplication halves constant factor)
- **Used by**: TeX (box measurement then passed to page builder), Typst (region-based layout)

**Recommendation**: Pass `MeasuredTable` directly to `layout_table()`. Automatically resolved with Comemo.

---

### 2.4 Nested Table Height Back-Propagation

**Current**: `calc_cell_controls_height()` returns 0. Nested table height changes do not propagate to parent.

#### 2.4.1 Bottom-Up Dirty Propagation (Gecko/Flutter Model)

```
Leaf node (paragraph) height change
  -> Set IS_DIRTY
  -> Parent cell -> parent row -> parent table -> ... propagate HAS_DIRTY_CHILDREN to root
  -> On re-layout, process bottom-up:
    Recalculate height from innermost dirty table
    -> Update parent row height
    -> Update parent table height
    -> ...
```

- **Complexity**: Propagation O(depth), re-layout O(depth x cells per level)
- **Used by**: Gecko `NS_FRAME_IS_DIRTY` table frame propagation, Flutter `markNeedsLayout`

#### 2.4.2 Constraint Propagation with Fixed-Point (CSS Table Algorithm)

```
Row height = max(content height per cell)
Cell content height = padding + sum(paragraph heights) + sum(nested table heights)
Nested table height = sum(row heights) + cell spacing

-> Acyclic constraints -> guaranteed convergence in O(depth) iterations
```

- **Complexity**: O(depth x cells per level)
- **Used by**: CSS 2.1 table layout algorithm, CSSWG table algorithm draft
- **Application**: Extend current `height_measurer.rs` merged cell constraint resolution loop to nested tables

**Recommendation**: Bottom-Up Dirty Propagation (signaling) + Constraint Propagation (calculation). Natural extension of existing `height_measurer.rs` constraint resolution loop.

---

### 2.5 Table Page Split Optimization

**Current**: Linear scan of rows to determine page boundaries

#### 2.5.1 Prefix Sum + Binary Search

```rust
// Pre-compute cumulative row heights
cumulative[0] = 0;
cumulative[r+1] = cumulative[r] + row_heights[r] + cell_spacing;

// Page split point: "maximum row fitting within remaining height" -> binary search
let break_row = cumulative.partition_point(|&h| h <= available_height);
```

- **Complexity**: Preprocessing O(R), split point determination O(log R) (currently O(R))
- **Used by**: PDF generation libraries, large table pagination
- **Application**: Replace row loop in `paginate_with_measured()` with binary search

#### 2.5.2 Penalty-Based Splitting (TeX Page Builder)

```
Assign penalty to each split candidate:
  - Split after first row (orphan)       -> high penalty
  - Split before last row (widow)        -> high penalty
  - Split inside merged cell span        -> very high penalty
  - Split after header row               -> low penalty
  - Normal row boundary                  -> 0 penalty

Greedily fill pages, preferring split points with lower penalty
```

- **Complexity**: O(R) greedy, O(R^2) optimal DP (Knuth-Plass extension)
- **Used by**: TeX page builder, Typst region-based layout
- **Application**: Generalize current `MIN_SPLIT_CONTENT_PX = 10.0` threshold to a penalty model

**Recommendation**: Prefix Sum (performance) + Penalty weighting (quality) combination.

---

### 2.6 Path-Based Nested Structure Access

**Current**: `get_table_mut(sec, ppi, ci)` — 3-level fixed indexing. Cannot access nested tables.

#### 2.6.1 Path Encoding

```rust
enum PathSegment {
    Paragraph(usize),       // Paragraph index
    Control(usize),         // Control index (Table, Picture, etc.)
    Cell(u16, u16),         // Cell (row, col)
}

type DocumentPath = Vec<PathSegment>;

// Usage example
let nested_path = vec![
    PathSegment::Paragraph(5),   // Body paragraph 5
    PathSegment::Control(0),     // First control (top-level table)
    PathSegment::Cell(2, 1),     // Cell (2,1)
    PathSegment::Paragraph(0),   // Cell paragraph 0
    PathSegment::Control(0),     // Nested table
    PathSegment::Cell(0, 0),     // Nested cell (0,0)
];
```

- **Complexity**: Access O(depth), dirty propagation O(depth)
- **Used by**: Google Docs API structural element model, XPath/JSONPath addressing
- **Application**: Current `DocumentPosition`'s 7 fields can be unified into `DocumentPath`

#### 2.6.2 Arena-Based Tree (indextree)

```rust
// Store all nodes in a flat Arena
let arena: Arena<DocumentNode> = Arena::new();

// Node access: O(1)
let node = arena[node_id];

// Parent tracking: O(1)
let parent = node.parent();

// Nested table access: arena index sequence
let path = [section_id, para_id, table_id, cell_id, nested_table_id];
```

- **Complexity**: O(1) node access, O(1) parent access, O(depth) path traversal
- **Used by**: Servo layout engine, Rust DOM implementations ([indextree](https://github.com/saschagrunert/indextree)), [generational-arena](https://github.com/fitzgen/generational-arena)
- **Advantages**: Natural parent pointer support -> optimal for dirty back-propagation. Resolves Rust ownership issues (flat vector instead of recursive structures)
- **Disadvantages**: Requires complete data model restructuring

**Recommendation**: Short-term — Path Encoding (minimal change). Long-term — Arena-Based Tree (fundamental solution).

---

## 3. Key Reference System Comparison

### 3.1 Layout Engine Comparison

| System | Dirty Mechanism | Propagation Direction | Boundary Concept | Incremental Strategy |
|--------|-----------------|--------------------|-----------------|---------------------|
| **Gecko** (Firefox) | 2-bit (IS_DIRTY, HAS_DIRTY_CHILDREN) | Bottom-up marking, top-down reflow | Reflow Root | Per-frame dirty tracking |
| **Blink** (Chrome) | Dirty flags + invalidation sets | Bottom-up + horizontal | Layout Root | LayoutNG input/output separation |
| **Flutter** | markNeedsLayout | Bottom-up -> Relayout Boundary | RelayoutBoundary | Constraints down, sizes up |
| **Typst** | Comemo cache | Per-function automatic | Function boundary | Constraint memoization |
| **TeX** | None (single pass) | Top-down | Page | No incrementality (batch) |

### 3.2 Rust WASM Compatible Crates

| Crate | Purpose | WASM | Integration Difficulty |
|-------|---------|------|----------------------|
| [comemo](https://github.com/typst/comemo) | Constrained memoization | Yes | Low (annotations) |
| [salsa](https://github.com/salsa-rs/salsa) | Query-based incremental computation | Yes | High (program restructuring) |
| [indextree](https://github.com/saschagrunert/indextree) | Arena-based tree | Yes | Medium |
| [generational-arena](https://github.com/fitzgen/generational-arena) | Generational arena | Yes | Medium |
| [slotmap](https://github.com/orlp/slotmap) | Key-value arena | Yes | Medium |

---

## 4. Integrated Application Strategy

### 4.1 3-Layer Incremental Layout Architecture

```
+-------------------------------------------------+
| Layer 1: Signaling (Double Dirty Bit)            |
| - IS_DIRTY + HAS_DIRTY_CHILDREN 2 bits           |
| - O(depth) upward propagation on change           |
| - Complete skip of clean subtrees                  |
+------------------------+------------------------+
                         v
+-------------------------------------------------+
| Layer 2: Boundaries (Relayout Boundary)           |
| - Tables = natural relayout boundary              |
| - Cell change -> no reflow outside table if row   |
|   height unchanged                                |
| - Row height change -> propagate to table only,   |
|   stop if table height unchanged                  |
+------------------------+------------------------+
                         v
+-------------------------------------------------+
| Layer 3: Caching (Comemo Memoization)             |
| - compose_paragraph() -> O(1) on cache hit        |
| - measure_table() -> auto-skip unchanged tables   |
| - measure_section() re-call has effective cost     |
|   O(dirty) only                                   |
+-------------------------------------------------+
```

### 4.2 Nested Table Back-Propagation Integration

```
Cell (depth=2) edit
  |
  +-- [Comemo] compose_paragraph() cache miss -> recalculate
  |
  +-- [Constraint Propagation] depth=2 row height recalculation
  |     row_height = max(cell_content_heights)
  |
  +-- [Dirty Bit] depth=2 table total_height changed?
  |     +-- NO -> [Relayout Boundary] propagation stops (done)
  |     +-- YES -> HAS_DIRTY_CHILDREN -> depth=1 parent cell
  |               |
  |               +-- [Constraint Propagation] depth=1 row height recalculation
  |               +-- [Dirty Bit] depth=1 table total_height changed?
  |               |     +-- NO -> propagation stops
  |               |     +-- YES -> depth=0 top-level table
  |               |               |
  |               |               +-- [Prefix Sum] page split recalculation
  |               |               +-- Section re-pagination
  |
  +-- [Comemo] All other paragraphs/tables -> cache hit -> O(1) skip
```

---

## 5. Implementation Priority

| Order | Pain Point | Algorithm | Effort | Impact | Prerequisites |
|-------|-----------|-----------|--------|--------|--------------|
| 1 | Cell lookup O(n) | Dense Grid | Small | High | None |
| 2 | Height double calculation | MeasuredTable pass-through | Small | Medium | None |
| 3 | Path-based access | Path Encoding | Medium | High | None |
| 4 | Nested height back-propagation | Bottom-Up Dirty + Constraint | Medium | High | #3 |
| 5 | Page split | Prefix Sum + Penalty | Medium | Medium | #2 |
| 6 | Full section reflow | Dirty Bit + Boundary + Comemo | Large | Extreme | #1~#5 |

- **#1, #2**: Independently implementable quick wins
- **#3**: Prerequisite for #4 (nested back-propagation)
- **#6**: All other improvements provide the foundation. Maximum impact but maximum effort

---

## 6. References

### Browser Engines
- [BlinkNG Pipeline](https://developer.chrome.com/docs/chromium/blinkng)
- [LayoutNG Architecture](https://developer.chrome.com/docs/chromium/layoutng)
- [Gecko Reflow Documentation](https://www-archive.mozilla.org/newlayout/doc/reflow.html)
- [Firefox Layout Overview](https://firefox-source-docs.mozilla.org/layout/LayoutOverview.html)
- [Spineless Traversal (PLDI 2025)](https://arxiv.org/html/2411.10659v8) — 1.80x performance improvement over Double Dirty Bit

### Typesetting Systems
- [Typst Layout Models](https://laurmaedje.github.io/posts/layout-models/)
- [Comemo: Constrained Memoization](https://github.com/typst/comemo)
- [TeX Page Breaking](https://link.springer.com/chapter/10.1007/978-1-4613-9142-5_1)
- [Knuth-Plass Algorithm](https://en.wikipedia.org/wiki/Knuth%E2%80%93Plass_line-breaking_algorithm)

### Text Editors
- [Xi-editor: Incremental Word Wrapping](https://xi-editor.io/docs/rope_science_05.html)
- [VS Code: Piece Table](https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation)

### Flutter / React
- [Flutter markNeedsLayout](https://api.flutter.dev/flutter/rendering/RenderObject/markNeedsLayout.html)
- [Flutter Relayout Boundary](https://flutter.megathink.com/rendering/layout)

### Spreadsheets
- [Excel Recalculation Algorithm](https://saturncloud.io/blog/what-algorithm-does-excel-use-to-recalculate-formulas/)
- [Spreadsheet Recalculation Methodology](https://lord.io/spreadsheets/)

### CSS Table Algorithms
- [CSSWG Table Algorithms Draft](https://drafts.csswg.org/css3-tables-algorithms/Overview.src.htm)

### Rust Crates
- [Salsa (Incremental Computation)](https://github.com/salsa-rs/salsa)
- [indextree (Arena Tree)](https://github.com/saschagrunert/indextree)
- [generational-arena](https://github.com/fitzgen/generational-arena)

---

*Written: 2026-02-15*
