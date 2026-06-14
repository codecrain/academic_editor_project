# Table Object Processing Architecture Status Analysis Report

## 1. Overview

This report analyzes the current project's table object processing architecture across three layers: **backend abstract tree management**, **event handlers**, and **user UI**.

---

## 2. Backend Abstract Tree Management (Rust)

### 2.1 Data Model

**`src/model/table.rs:8-40`** — `Table` struct:

```rust
pub struct Table {
    pub row_count: u16,
    pub col_count: u16,
    pub cells: Vec<Cell>,       // Flat array (row-major order)
    pub row_sizes: Vec<HwpUnit16>,
    pub border_fill_id: u16,
    pub page_break: TablePageBreak,
    pub repeat_header: bool,
    pub caption: Option<Caption>,
    // ...round-trip preservation fields
}
```

- `cells` is a **flat `Vec<Cell>`** — stored in row-major order without 2D indexing
- `row_count`, `col_count` only hold dimensional info and are not used for cell access
- Consistency between row/column counts and actual cell placement is not guaranteed at runtime

**`src/model/table.rs:67-96`** — `Cell` struct:

```rust
pub struct Cell {
    pub col: u16,
    pub row: u16,
    pub col_span: u16,
    pub row_span: u16,
    pub width: HwpUnit,
    pub height: HwpUnit,
    pub padding: Padding,
    pub border_fill_id: u16,
    pub paragraphs: Vec<Paragraph>,
    pub text_direction: u8,
    pub vertical_align: VerticalAlign,
    pub is_header: bool,
    // ...round-trip preservation fields
}
```

- Each cell individually holds absolute coordinates `(row, col, row_span, col_span)`
- Cell content supports rich text via `paragraphs: Vec<Paragraph>`
- Merged cells are represented by `row_span > 1` or `col_span > 1`

### 2.2 Cell Lookup Method

**`src/wasm_api.rs:7014-7018`** — `find_cell_at_row_col()`:

```rust
fn find_cell_at_row_col(table: &Table, target_row: u16, target_col: u16) -> Option<usize> {
    table.cells.iter().position(|cell| {
        cell.row <= target_row && target_row < cell.row + cell.row_span
            && cell.col <= target_col && target_col < cell.col + cell.col_span
    })
}
```

- **O(n) linear scan on every cell access**
- Repeatedly called during cursor movement, cell editing, table structure changes, etc.
- Span range calculated from scratch each time for merged cell lookup

### 2.3 Table Access Path (Tree Traversal)

**`src/wasm_api.rs:2005-2034`** — `get_table_mut()`:

```
Document -> sections[sec] -> paragraphs[ppi] -> controls[ci] -> Control::Table(table)
```

- 3-level index dereference to access a table
- This path is repeatedly traversed on every table modification (no caching)
- Requires `Control` enum pattern matching to `Table`

### 2.4 Post-Modification Invalidation Pattern

When a table modification occurs, **full section re-serialization + re-layout** is triggered:

```rust
// Same pattern repeated at 8 locations (wasm_api.rs)
self.document.sections[section_idx].raw_stream = None;       // Invalidate serialization cache
self.composed[section_idx] = compose_section(...);           // Full section re-layout
```

Occurs at:
- Text insert/delete (`insert_text`, `delete_text`)
- Paragraph split/merge (`split_paragraph`, `merge_paragraph`)
- Row/column add/delete (`insert_row`, `insert_column`, `delete_row`, `delete_column`)
- Cell merge/split (`merge_cells`, `split_cell`)
- Format application (`apply_char_format`)

### 2.5 Row/Column Structure Change Cost

**`src/model/table.rs`** — `rebuild_row_sizes()`:

- Completely rebuilds the `row_sizes` vector after row add/delete
- Iterates all cells to calculate maximum height per row -> O(nxm) cost
- `row_sizes` is the per-row height array needed for HWP serialization

---

## 3. Event Handlers (TypeScript)

### 3.1 InputHandler Structure

**`rhwp-studio/src/engine/input-handler.ts:18`** — The `InputHandler` class **handles all table-related events in a single class**:

```typescript
export class InputHandler {
    private cursor: CursorState;
    private caret: CaretRenderer;
    private selectionRenderer: SelectionRenderer;
    private cellSelectionRenderer: CellSelectionRenderer | null = null;
    private tableObjectRenderer: TableObjectRenderer | null = null;
    // ...
}
```

Table-specific event handling is intermixed with body text editing handling in the same class.

### 3.2 State Machine (3 Modes)

| Mode | Entry Condition | Main Actions | Exit Condition |
|------|----------------|-------------|----------------|
| **Cell editing** | Click inside table, Tab navigation | Same as normal text editing | Esc -> table object selection |
| **F5 cell selection** | F5 key (inside cell) | Arrow movement, Shift+click range selection, Ctrl+click toggle | Enter or Esc |
| **Table object selection** | Esc (from cell editing), table border click | Delete removes table, blue border + 8 handles displayed | Esc -> body text outside table, Enter -> cell editing |

### 3.3 Key Handling Flow

Inside `onKeyDown()`:

```
onKeyDown(e)
  +-- F5 cell selection mode?
  |     +-- Arrow -> change cell anchor/focus
  |     +-- Enter -> exit mode
  |     +-- Esc -> exit mode
  +-- Table object selection?
  |     +-- Delete -> table:delete command
  |     +-- Esc -> cursor exits table
  +-- Inside cell?
  |     +-- Tab/Shift+Tab -> cell navigation (WASM navigate_cell_horizontal call)
  |     +-- Up/Down arrows -> vertical cell navigation (WASM navigate_cell_vertical call)
  |     +-- Esc -> enter table object selection mode
  +-- Body -> normal text editing
```

### 3.4 Context Menu Branching

| Context | Method | Menu Items |
|---------|--------|-----------|
| Inside cell | `getTableContextMenuItems()` | Cut/Copy/Paste, Cell/Row/Column/Table properties, Merge/Split, Add/Delete rows/columns |
| Table object selection | `getTableObjectContextMenuItems()` | Cut/Copy/Paste, Table properties, Delete table |
| Body text | `getDefaultContextMenuItems()` | Cut/Copy/Paste |

### 3.5 Cell Navigation Logic

**`rhwp-studio/src/engine/cursor.ts:150-158`**:

```typescript
moveHorizontal(delta: number): void {
    if (this.isInTextBox()) this.moveHorizontalInTextBox(delta);
    else if (this.isInCell()) this.moveHorizontalInCell(delta);
    else this.moveHorizontalInBody(delta);
}
```

- Horizontal movement: `cellIndex`-based (flat array index +/-1)
- Vertical movement: WASM `navigate_cell_vertical()` call -> `find_cell_at_row_col()` O(n) lookup
- Tab movement: Move to next/previous cell, add row on Tab from last cell

---

## 4. User UI (TypeScript)

### 4.1 DocumentPosition (Cursor Position Representation)

**`rhwp-studio/src/core/types.ts:55-66`**:

```typescript
interface HitTestResult {
    sectionIndex: number;       // Section index
    paragraphIndex: number;     // Body paragraph index or cell paragraph index
    charOffset: number;         // Character offset
    parentParaIndex?: number;   // Body paragraph containing the table (inside cell only)
    controlIndex?: number;      // Table's control index (inside cell only)
    cellIndex?: number;         // Cell index — flat array based (inside cell only)
    cellParaIndex?: number;     // Cell paragraph index (inside cell only)
    isTextBox?: boolean;        // Inside textbox flag
}
```

- **7 fields** — simultaneously represents body and cell contexts
- Inside a cell, all 4 fields `parentParaIndex + controlIndex + cellIndex + cellParaIndex` are required
- Position comparison with mixed body/cell cases is complex (`comparePositions()` 100 lines)

### 4.2 Dual Coordinate System Problem

| Purpose | Coordinate System | Used In |
|---------|-------------------|---------|
| Sequential cell movement (Tab, horizontal) | `cellIndex` (flat array index) | cursor.ts `moveHorizontalInCell()` |
| Cell range selection (F5) | `(row, col)` 2D coordinates | cursor.ts `cellAnchor`, `cellFocus` |
| Cell data access | `(row, col)` -> `find_cell_at_row_col()` -> `cellIndex` | wasm_api.rs |
| Rendering | `cellIndex` -> `getCellBbox()` | cell-selection-renderer.ts |

WASM calls occur everywhere coordinate system conversion is needed.

### 4.3 Visual Feedback Renderers (3 types)

| Renderer | File | Purpose |
|----------|------|---------|
| `CaretRenderer` | `caret-renderer.ts` | Blinking cursor inside cell |
| `CellSelectionRenderer` | `cell-selection-renderer.ts` | F5 cell range selection (blue overlay) |
| `TableObjectRenderer` | `table-object-renderer.ts` | Table object selection (black border + 8 resize handles) |

Each renderer independently fetches bbox information from WASM to create/update DOM elements.

---

## 5. Key Pain Points

### 5.1 Performance

| Problem | Location | Complexity | Description |
|---------|----------|-----------|-------------|
| Flat `Vec<Cell>` linear scan | `find_cell_at_row_col()` | O(n) | Full cell array traversal on every access |
| `rebuild_row_sizes()` | `table.rs` | O(nxm) | Full row height recalculation on every row/column change |
| Full section reflow | `raw_stream=None` + `compose_section()` | O(section) | Full section re-layout even for single character edit in table |

### 5.2 Complexity

| Problem | Description |
|---------|-------------|
| 7-field DocumentPosition | Body/cell/textbox contexts mixed in one type. 4 optional fields make state representation ambiguous |
| Dual coordinate system (`cellIndex` <-> `(row,col)`) | WASM call + O(n) lookup everywhere coordinate conversion needed |
| Single event handler class | `InputHandler` handles 4 modes (body/cell/F5/table object) with complex branching |
| Uncached table access path | `get_table_mut()` 3-level dereference repeated on every modification |

### 5.3 Extensibility

| Problem | Description |
|---------|-------------|
| No cell address-based formulas/references | Flat array has no Excel-style "A1" address system |
| No partial layout update | Always full section layout recalculation on table modification |
| Inefficient merged cell lookup | Span range computed against all cells every time |

---

## 6. Reflow Pipeline Analysis: Table Page Boundary Splitting

### 6.1 Overall Pipeline Structure

Reflow triggered by table modification is a **4-stage pipeline**:

```
[Trigger] wasm_api.rs — text editing / table structure change
    |
    |  raw_stream = None          // Invalidate serialization cache
    |  composed[sec] = compose_section(...)  // Stage 1
    |  self.paginate()                       // Stages 2-3
    |
    v
+-------------------------------------------------------------+
| Stage 1: Composition                                         |
| composer.rs:compose_section() — line 78                      |
| Paragraph text -> LineSeg-based line splitting -> CharShapeRef boundary TextRuns |
| Output: Vec<ComposedParagraph>                               |
+------------------------+------------------------------------+
                         v
+-------------------------------------------------------------+
| Stage 2: Height Measurement                                  |
| height_measurer.rs:measure_section() — line 107              |
| Pre-calculate actual rendering heights for all paragraphs + tables |
| Tables: measure_table() -> per-row height, per-cell line height measurement |
| Output: MeasuredSection { paragraphs, tables }               |
+------------------------+------------------------------------+
                         v
+-------------------------------------------------------------+
| Stage 3: Page Splitting (Pagination)                         |
| pagination.rs:paginate_with_measured() — line 184            |
| Determine page boundaries from measured heights, table row/intra-row splitting |
| Output: PaginationResult { pages: Vec<PageContent> }         |
+------------------------+------------------------------------+
                         v
+-------------------------------------------------------------+
| Stage 4: Rendering (Layout)                                  |
| layout.rs:build_render_tree() -> layout_table() — line 1125 |
| Build per-page render tree, **recalculate** column widths/row heights |
| Output: PageRenderTree (SVG/Canvas nodes)                    |
+-------------------------------------------------------------+
```

### 6.2 Table Page Split Detailed Logic

**`pagination.rs:632-907`** — Executed when a table exceeds the current page's remaining height:

#### 6.2.1 Row-Unit Split Loop

```rust
// pagination.rs:684-907
let mut cursor_row: usize = 0;        // Current start row being processed
let mut is_continuation = false;       // Continuation page flag
let mut content_offset: f64 = 0.0;    // Intra-row content offset

while cursor_row < row_count {
    // 1. Determine row range for this page (cursor_row..end_row)
    // 2. If last row only partially fits, attempt intra-row split
    // 3. Create PageItem::PartialTable -> proceed to next page
}
```

#### 6.2.2 Intra-Row Split Decision

**`pagination.rs:737-776`** — When a row does not fit on the page:

```
Row doesn't fit in remaining page space
  +-- is_row_splittable(r) == true?
  |     +-- Both sides >= 10px content?
  |     |     +-- YES -> intra-row split (set split_end_limit)
  |     +-- NO -> fallback (move entire row to next page)
  +-- is_row_splittable(r) == false?
        +-- Force-place entire row (overflow + clipPath hiding)
```

#### 6.2.3 `is_row_splittable()` Determination

**`height_measurer.rs:536-544`**:

```rust
pub fn is_row_splittable(&self, row: usize) -> bool {
    let cells_in_row: Vec<&MeasuredCell> = self.cells.iter()
        .filter(|c| c.row == row && c.row_span == 1)
        .collect();
    if cells_in_row.is_empty() { return false; }
    // Splittable if at least 1 cell in row has 2+ lines
    cells_in_row.iter().any(|c| c.line_heights.len() > 1)
}
```

- Multiline cells (text wrapping) -> splittable
- Single-line cells (images, short text) -> not splittable
- **If entire row is image cells, splitting is prohibited** (added in Task 77)

#### 6.2.4 `PageItem::PartialTable` Data Structure

**`pagination.rs:118-133`**:

```rust
PartialTable {
    para_index: usize,                  // Paragraph containing the table
    control_index: usize,               // Control index
    start_row: usize,                   // Start row (inclusive)
    end_row: usize,                     // End row (exclusive)
    is_continuation: bool,              // Continuation page flag (for header row repetition)
    split_start_content_offset: f64,    // Start row content offset (px)
    split_end_content_limit: f64,       // End row max content height (px, 0=all)
}
```

#### 6.2.5 Header Row Repetition

**`pagination.rs:706-710`**:

```rust
let header_overhead = if is_continuation
    && mt.repeat_header && mt.has_header_cells && row_count > 1
{
    header_row_height + cell_spacing  // Subtract header row height from available height
} else { 0.0 };
```

Automatically repeats row 0 (header row) rendering on continuation pages.

### 6.3 Height Measurement Double Calculation Problem

Currently row heights are **duplicated in Stage 2 (measurement) and Stage 4 (rendering) with identical logic**:

| Calculation Location | File | Logic |
|---------------------|------|-------|
| **Measurement stage** | `height_measurer.rs:214-380` `measure_table()` | Iterate all cells -> `compose_paragraph()` -> sum line heights |
| **Rendering stage** | `layout.rs:1230-1400` `layout_table()` | Iterate all cells -> `compose_paragraph()` -> sum line heights |

Both functions:
1. Extract per-row maximum height from `row_span==1` cells
2. Call `compose_paragraph()` per cell paragraph -> sum line heights
3. Resolve merged cell constraints (Gaussian elimination)
4. Extend last row for merged cell content overflow

**`compose_paragraph()` is called 2x per cell**, so for a table with n cells, 2n total calls.

### 6.4 Impact of Full Section Reflow

Currently, even **a single character edit in a table cell** executes all of:

```
1. compose_section()        — recompose all section paragraphs
2. measure_section()        — re-measure all section paragraph+table heights
3. paginate_with_measured() — re-perform full page splitting
4. build_render_tree()      — rebuild requested page render tree
```

**Cost analysis** (assuming P paragraphs, T tables, C cells per table in a section):

| Stage | Cost | Description |
|-------|------|-------------|
| compose_section | O(P) | Recompose all paragraphs |
| measure_section | O(P + TxC) | Measure all paragraphs + compose cell paragraphs per table |
| paginate | O(P + TxR) | Iterate all paragraphs + iterate rows per table |
| layout_table | O(TxC) | Re-compose cell paragraphs per table |
| **Total** | O(P + TxC) | Full section cost for editing one table |

---

## 7. Key Pain Points

### 7.1 Performance

| Problem | Location | Complexity | Description |
|---------|----------|-----------|-------------|
| Flat `Vec<Cell>` linear scan | `find_cell_at_row_col()` | O(n) | Full cell array traversal on every access |
| `rebuild_row_sizes()` | `table.rs` | O(nxm) | Full row height recalculation on every row/column change |
| Full section reflow | `raw_stream=None` + `compose_section()` | O(section) | Full section re-layout for single table character edit |
| Row height double calculation | `measure_table()` + `layout_table()` | O(2x cells) | Same logic repeated in measurement + rendering |
| `compose_paragraph()` double call | Measurement + rendering | O(2x cells x paragraphs) | Cell paragraph composition runs 2x |

### 7.2 Complexity

| Problem | Description |
|---------|-------------|
| 7-field DocumentPosition | Body/cell/textbox contexts mixed in one type. 4 optional fields make state ambiguous |
| Dual coordinate system (`cellIndex` <-> `(row,col)`) | WASM call + O(n) lookup everywhere conversion needed |
| Single event handler class | `InputHandler` handles 4 modes (body/cell/F5/table object) with complex branching |
| Uncached table access path | `get_table_mut()` 3-level dereference repeated on every modification |

### 7.3 Extensibility

| Problem | Description |
|---------|-------------|
| No cell address-based formulas/references | Flat array has no Excel-style "A1" address system |
| No partial layout update | Always full section layout recalculation on table modification |
| Inefficient merged cell lookup | Span range computed against all cells every time |

---

## 8. Efficient Reflow Design Direction

### 8.1 Design Principles

The fundamental inefficiency of table page splitting lies in the **"table internal change -> full section reflow"** pattern. To resolve this, a design is needed that **separates table internal reflow from section reflow**.

### 8.2 Target Architecture: 3-Level Separated Reflow

```
[Current] Table cell edit -> Full section Compose -> Full section Measure -> Full section Paginate

[Target] Table cell edit -> Compose only that cell -> Measure only that row -> Re-run table Paginate only
                                                                               |
                                                                    Table height changed?
                                                                     +-- NO -> Update render only
                                                                     +-- YES -> Re-run section Paginate
```

#### Level 1: Cell Internal Reflow (Table Height Unchanged)

When cell text editing **does not change the overall table height** (no line count change):
- Apply `compose_paragraph()` only to the modified paragraph in the cell
- Reuse row height/page split results
- Update only the cell node in the render tree

#### Level 2: Row Reflow (Table Height Changed, Page Split Unchanged)

When cell editing **changes the row height but page boundaries do not shift**:
- Execute `compose_paragraph()` on the changed cell
- Re-measure only the affected row height (`measure_row()`)
- Recalculate total table height (row height summation only, O(R))
- Quickly verify if the previous `PartialTable` split result is still valid
- If valid, only update the render tree

#### Level 3: Table Page Re-Split (Page Boundary Shifts)

When row height changes cause **page boundaries to shift**:
- Regenerate only the table's `MeasuredTable` (O(C), cell count)
- Re-paginate only from the table's position to section end
- Reuse results from previous pages

### 8.3 Required Data Structure Changes

#### 8.3.1 MeasuredTable Caching

```rust
// Current: MeasuredSection created temporarily on each paginate() call and discarded
// Target: Cache MeasuredTable in the table model

pub struct Table {
    // ...existing fields...
    /// Cached measurement result (invalidated on table modification)
    measured: Option<MeasuredTable>,
}
```

- On cell edit: Update only the affected row's `MeasuredCell` -> recalculate `measured.row_heights[row]`
- On structure change: `measured = None` -> full re-measurement

#### 8.3.2 Eliminating layout_table() Double Calculation

```rust
// Current: layout_table() recalculates row heights from scratch
// Target: Receive and use cached row heights from MeasuredTable

fn layout_table(
    &self,
    measured: &MeasuredTable,  // <- pre-measured results passed in
    start_row: usize,
    end_row: usize,
    // ...
) -> f64
```

### 8.4 Synergy with 2D Grid Index

Once 2D grid abstraction (`grid[row][col]`) is introduced:

| Current Cost | Improved Cost | Description |
|-------------|--------------|-------------|
| Row height measurement O(n) full cell traversal | O(col_count) only that row | Direct row cell access from grid |
| Merged cell constraint resolution O(n^2) | O(merged cell count) | Direct lookup from merged cell registry |
| Intra-row split feasibility check O(n) | O(col_count) | Inspect only that row's cells |
| Header row repetition re-rendering | O(col_count) | Direct row 0 cell access |

### 8.5 Gradual Invalidation Strategy

```
Cell text edit
  +-- Invalidate that cell's composed cache
  +-- Invalidate that row's measured_row cache
  +-- Recalculate table total_height (O(R) -- row height summation)
  +-- total_height changed?
  |     +-- NO -> Invalidate render cache only (Level 1)
  |     +-- YES -> Recalculate table PartialTable split
  |               +-- Page boundary changed?
  |               |     +-- NO -> Invalidate render cache only (Level 2)
  |               |     +-- YES -> Re-paginate section after this table (Level 3)
  +-- raw_stream = None (serialization cache invalidation maintained)

Row/column add/delete
  +-- Full table re-measurement + Level 3 re-pagination
```

### 8.6 Expected Benefits

| Scenario | Current Cost | Improved Cost | Improvement |
|----------|-------------|--------------|-------------|
| Single character in cell (line count unchanged) | O(P + TxC) | O(1) compose + O(1) render | Extreme |
| Line break in cell (row height changes) | O(P + TxC) | O(C_row) measure + O(R) paginate check | Large |
| Row height change shifts page boundary | O(P + TxC) | O(C) measure + O(P_after) repaginate | Medium |
| Row/column add/delete | O(P + TxC) | O(C) measure + O(P) repaginate | Small |

---

## 9. Nested Table (Table Within Table) Current Status

### 9.1 HWP Nested Table Structure

HWP allows tables to be nested to arbitrary depth within cells. Recursive structure in the data model:

```
Table
  +-- cells: Vec<Cell>
       +-- Cell.paragraphs: Vec<Paragraph>
            +-- Paragraph.controls: Vec<Control>
                 +-- Control::Table(Box<Table>)    <- recursive
                      +-- cells: Vec<Cell>
                           +-- Cell.paragraphs
                                +-- ... (infinite nesting possible)
```

- `Box<Table>` resolves the recursive type issue (`src/model/control.rs:20`)
- No depth limit -- depends only on Rust stack size
- Real HWP documents typically nest 2-3 levels deep

### 9.2 Nested Table Support Status by Layer

| Layer | Support Level | File | Key Limitation |
|-------|-------------|------|---------------|
| **Parsing** | **Complete** | `parser/control.rs:54-149` | Recursive parsing supports arbitrary depth |
| **Serialization** | **Complete** | `serializer/control.rs:305-332` | Recursive serialization, level management |
| **Rendering** | **Partial** | `layout.rs:1125, 2845` | `layout_table()` != `layout_nested_table()` dual implementation |
| **Height measurement** | **Not supported** | `layout.rs:2519-2523` | `calc_cell_controls_height()` -> **always returns 0** |
| **Page splitting** | **Not supported** | `pagination.rs` | No nested table page split logic |
| **WASM API** | **Not supported** | `wasm_api.rs:2005-2034` | Only 3-level indexing possible, cannot access nested |

### 9.3 Rendering Dual Implementation Problem

Currently table rendering functions are **split into two**:

**`layout_table()`** — Top-level table only (`layout.rs:1125-1755`, 630 lines):
- Supports page splitting (`PartialTable`)
- On discovering `Control::Table` in cell content, calls `layout_nested_table()`

**`layout_nested_table()`** — Nested table only (`layout.rs:2845-3096`, 250 lines):
- No page splitting support (renders only within parent cell boundaries)
- Recursively calls itself for deeper nesting
- Column width/row height calculation logic **duplicated** with `layout_table()`

```
layout_table() [top-level table, 630 lines]
  +-- Control::Table(nested) -> layout_nested_table() [nested table, 250 lines]
                                  +-- Control::Table(sub) -> layout_nested_table() [recursive]
```

**Problem**: The same concern of "table layout" is distributed across two functions, requiring simultaneous changes to both on modification.

### 9.4 Structural Flaw in Height Measurement

**`layout.rs:2519-2523`**:
```rust
/// Calculate total height of controls (nested tables) within a cell.
/// Both Picture and Table are already reflected in cell.height, so return 0.
fn calc_cell_controls_height(&self, _cell: &Cell) -> f64 {
    0.0
}
```

**`layout.rs:2484-2517`** — `calc_nested_table_height()`:
- Uses only `cell.height` HWP metadata
- Does not measure actual rendering height of paragraphs within cells
- Does not recursively measure height of nested tables within nested tables

**Conclusion**: In viewer mode, trusting HWP file's pre-calculated heights works, but **in editor mode, when nested table content changes, parent cell/parent table heights are not updated**.

### 9.5 WASM API Access Impossible

Current WASM API table access path:

```
get_table_mut(section_idx, parent_para_idx, control_idx)
  -> sections[sec].paragraphs[ppi].controls[ci]
  -> Control::Table(table)
```

**Only 3-level indexing supported** — accessing a nested table requires:

```
Required path:
  sections[sec]
    .paragraphs[ppi]                   // 1. Body paragraph
      .controls[ci]                    // 2. Top-level table
        -> Table.cells[cell_idx]       // 3. Cell
          .paragraphs[cell_para_idx]   // 4. Cell paragraph
            .controls[nested_ci]       // 5. Nested table
              -> Table.cells[...]      // 6. Nested cell
                .paragraphs[...]       // 7. ...
```

**Currently impossible to access 5+ levels** — all operations on nested tables (editing, row/column add, cell merge, etc.) are blocked.

### 9.6 Viewer -> Editor Transition Limitations

| Feature | Viewer Mode | Editor Mode (Current Limitation) |
|---------|------------|-------------------------------|
| Nested table rendering | HWP metadata-based -> works | Height not updated on content change |
| Nested table page split | Clipped within parent cell boundaries | Independent nested table split impossible |
| Nested table editing | N/A | WASM API access impossible |
| Nested table structure changes | N/A | No row/column/cell manipulation API |
| Height propagation | N/A | Nested table change -> parent cell -> parent table back-propagation absent |

---

## 10. Structural Redesign Direction

### 10.1 Core Recognition

The current architecture originated from a **viewer paradigm** (read-only, trusting HWP metadata). Evolving to an editor reaches the following structural limits:

1. **Height calculation inversion**: Viewer "uses heights provided by HWP", but editor must "calculate heights from content"
2. **Unidirectional -> bidirectional propagation**: Viewer is parse->layout->render unidirectional, but editor needs content change->height change->page re-split->render bidirectional propagation
3. **Flat access -> tree access**: Viewer only needs to access top-level tables, but editor must access/modify nested tables at arbitrary depth

### 10.2 Redesign Principles

#### Principle 1: Unified Table Layout Engine

```
[Current] layout_table() (630 lines) + layout_nested_table() (250 lines) = dual implementation

[Target] layout_table_recursive() = single function
  - Depth parameter distinguishes top-level/nested
  - Page splitting applied only at depth==0
  - Column width/row height/cell rendering logic fully unified
```

#### Principle 2: Recursive Height Measurement

```
[Current] calc_cell_controls_height() -> 0 (trusts HWP metadata)

[Target] measure_cell_recursive() = recursive measurement
  - Sum cell paragraph heights
  - Cell nested table -> recursive measure_table_recursive() call
  - Nested table height reflected in parent cell row height
```

#### Principle 3: Path-Based Table Access

```
[Current] get_table_mut(sec, ppi, ci) — 3-level fixed

[Target] get_table_by_path(path: &[TablePathSegment])
  where TablePathSegment = {
      para_idx: usize,    // Paragraph index
      control_idx: usize, // Control index
      cell_row: u16,      // Cell row
      cell_col: u16,      // Cell column
  }
```

Path examples:
```
Top-level table:  [(ppi=5, ci=0)]
Nested table:     [(ppi=5, ci=0, row=2, col=1), (ppi=0, ci=0)]
3-level nesting:  [(ppi=5, ci=0, row=2, col=1), (ppi=0, ci=0, row=0, col=0), (ppi=0, ci=0)]
```

#### Principle 4: Bidirectional Height Propagation

```
Nested table cell content change
  |
Nested table row height recalculation
  |
Nested table total height change
  |
Parent cell row height recalculation (back-propagation)
  |
Parent table total height changed?
  +-- NO -> Update parent table render only
  +-- YES -> Parent table page split recalculation
              |
           Is parent table also nested?
              +-- NO -> Section re-pagination
              +-- YES -> Continue back-propagation to parent table
```

### 10.3 2D Grid + Nested Table Integrated Design

```rust
/// Table internal abstraction (Excel sheet + recursive nesting support)
pub struct TableGrid {
    row_count: usize,
    col_count: usize,
    /// O(1) cell access: grid[row][col] = Some(cell_idx)
    grid: Vec<Vec<Option<usize>>>,
    /// Actual cell data
    cells: Vec<Cell>,
    /// Cached row heights (incrementally updated during editing)
    row_heights: Vec<f64>,
    /// Cached column widths
    col_widths: Vec<f64>,
    /// Cached total table height
    total_height: Option<f64>,
}

impl Cell {
    /// Cell paragraph list (existing)
    pub paragraphs: Vec<Paragraph>,

    // If Paragraph.controls contains Control::Table, it's a nested table
    // -> each nested table also has its own TableGrid
}
```

### 10.4 Recursive Invalidation + Back-Propagation

```
Cell (depth=2) edit
  +-- Invalidate that cell's compose cache
  +-- Re-measure affected row height in depth=2 table
  +-- depth=2 table total_height changed?
  |     +-- NO -> Update depth=2 render only (done)
  |     +-- YES -> Re-measure parent cell row height in depth=1 (back-propagation)
  |               +-- depth=1 table total_height changed?
  |               |     +-- NO -> Update depth=1 render only (done)
  |               |     +-- YES -> Re-measure parent cell row height in depth=0 (back-propagation)
  |               |               +-- Recalculate depth=0 table page splitting
  |               |                    +-- Section re-pagination
  +-- raw_stream = None
```

**Key**: If height does not change, back-propagation terminates early, so most edits are processed at O(1)~O(cell count) cost.

### 10.5 Current Architecture vs Target Architecture Comparison

| Aspect | Current (Viewer-Based) | Target (Editor-Based) |
|--------|----------------------|----------------------|
| **Height calculation** | Trusts HWP metadata | Content-based recursive measurement |
| **Height propagation** | None (unidirectional) | Bidirectional back-propagation |
| **Table layout** | `layout_table` + `layout_nested_table` dual | Single recursive function |
| **Table access** | 3-level fixed indexing | Path-based arbitrary depth |
| **Cell lookup** | O(n) flat linear scan | O(1) 2D grid index |
| **Page splitting** | Top-level table only | Recursive splitting (per-depth policy) |
| **Invalidation** | Full section reflow | Incremental + early-termination back-propagation |
| **Editing scope** | Top-level table editing only | Arbitrary depth nested table editing |

---

*Written: 2026-02-15*
