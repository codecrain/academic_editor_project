# Task 36: Table Border Processing Enhancement - Stage 2 Completion Report

## Stage 2 Goal

Eliminate duplicate adjacent cell borders: convert from the approach where each cell independently draws 4-directional borders to an edge-based collection/merge/rendering approach, solving the double-rendering issue at adjacent cell boundaries.

## Work Performed

### 2-1. Border Merge Rules Implementation

Implemented `merge_border()` function to select the higher-priority border when two borders occupy the same position.

**Merge Priority:**
1. Border present > absent (None)
2. Thicker line > thinner line (`border_width_to_px()` comparison)
3. Double/triple line > single line (priority score by type)

| Line Type | Priority |
|-----------|---------|
| None | 0 |
| Solid, Dash, Dot, etc. (single) | 1 |
| Wave, DoubleWave | 2 |
| Double, ThinThickDouble, ThickThinDouble | 3 |
| ThinThickThinTriple | 4 |

### 2-2. Edge Grid-Based Collection Structure

Collects all table borders in a grid form.

```
h_edges[row_boundary][col]: horizontal edges
  - row_boundary: 0..=row_count (row boundary lines)
  - col: 0..col_count (column index)

v_edges[col_boundary][row]: vertical edges
  - col_boundary: 0..=col_count (column boundary lines)
  - row: 0..row_count (row index)
```

**Merged cell handling:**
- Top border of a cell with col_span=2: set in h_edges[row][col] and h_edges[row][col+1] two slots
- Left border of a cell with row_span=3: set in v_edges[col][row], v_edges[col][row+1], v_edges[col][row+2] three slots
- When two cells' borders overlap in the same slot, merged with `merge_border()`

### 2-3. Continuous Segment Merge Rendering

Merges consecutive edge segments with the same style on the same row/column boundary into a single Line for rendering.

**Reason:** For double/triple lines, `create_parallel_lines()` uses offsets, so separated segments can cause visual artifacts at intersections. Continuous merging prevents this.

**Example:** Top border of a 2x2 table
- Before: Cell(0,0) Line(x0→x1) + Cell(1,0) Line(x1→x2) = 2 lines
- After: Merged Line(x0→x2) = 1 line

### 2-4. Modified 4 Table Layout Functions

| Function | Changes |
|----------|---------|
| `layout_table()` | Per-cell borders → edge grid collection + batch rendering on table node |
| `layout_partial_table()` | Same. Grid composition based on render_rows mapping |
| `layout_nested_table()` | Same |
| `layout_embedded_table()` | Same |

**layout_partial_table special handling:**
- Determines grid dimensions based on `render_rows` array
- Maps cell row indices to render row indices for grid collection
- `grid_row_y = render_row_y + [partial_table_height]`

### 2-5. Test Updates

Updated `test_layout_table_basic` test for edge-based structure:
- Before: Verify 4+ Line children per cell node
- After: Verify 6+ Line children on table node (2x2 table: 3 horizontal + 3 vertical lines)

## Changed Files

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | 4 helper functions added, 4 layout functions modified, test modified |

### Added Functions

| Function | Role |
|----------|------|
| `merge_border()` | Select higher-priority border between two |
| `merge_edge_slot()` | Merge and store border in edge grid slot |
| `collect_cell_borders()` | Collect cell's 4-directional borders into grid |
| `render_edge_borders()` | Generate Line nodes from grid (continuous segment merge) |

## Verification Results

- **Unit tests**: All 416 passed
- **k-water-rfp.hwp**: Successfully exported all 30 pages as SVG
- **All samples**: All 20 HWP files exported successfully
- **WASM build**: Completed successfully
- **SVG output verification**: Border lines correctly generated as children of table node

## Structural Change Summary

```
[Before: Per-cell independent borders]
Table
  ├── Cell(0,0)
  │   ├── Background Rect
  │   ├── Text ...
  │   ├── Line (left) ← duplicate!
  │   ├── Line (right)
  │   ├── Line (top)
  │   └── Line (bottom) ← duplicate!
  ├── Cell(0,1)
  │   ├── Background Rect
  │   ├── Text ...
  │   ├── Line (left) ← duplicate!
  │   ├── Line (right)
  │   ├── Line (top) ← duplicate!
  │   └── Line (bottom)
  └── ...

[After: Edge-based deduplication]
Table
  ├── Cell(0,0)
  │   ├── Background Rect
  │   └── Text ...
  ├── Cell(0,1)
  │   ├── Background Rect
  │   └── Text ...
  ├── ... (no more borders on cells)
  ├── Line (horizontal edge 0)  ← table node child
  ├── Line (horizontal edge 1)
  ├── Line (horizontal edge 2)
  ├── Line (vertical edge 0)
  ├── Line (vertical edge 1)
  └── Line (vertical edge 2)
```
