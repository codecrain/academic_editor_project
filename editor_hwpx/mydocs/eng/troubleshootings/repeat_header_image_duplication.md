# Image Duplication When Repeating Table Header Rows

> Discovered: 2026-02-10
> Related task: 35 (Resolve image handling issues inside tables)
> Modified files: `src/renderer/layout.rs`, `src/model/table.rs`, `src/parser/control.rs`, `src/renderer/height_measurer.rs`, `src/renderer/pagination.rs`

## Symptoms

In the `samples/20250130-hongbo.hwp` document:
- A 4-row, 1-column table is split across pages 3 and 4
- Page 4 displays 2 images (expected: 1)
- The header row (row=0) image from page 3 is duplicated on page 4

## Cause

### Table Structure

```
P29 Table: rows=4 cols=1, repeat_header=true
  Cell0: row=0  pic(bin=6)  is_header=false  <- Row containing only an image
  Cell1: row=1  (text)      is_header=false
  Cell2: row=2  pic(bin=1)  is_header=false  <- Body image
  Cell3: row=3  (text)      is_header=false
```

### Key: The is_header Cell Attribute

In HWP, table header row repetition operates based on two conditions:

1. **Table level**: `repeat_header=true` (table attribute bit 1)
2. **Cell level**: `is_header=true` (cell's "header cell" checkbox)

**Even if the table's `repeat_header` is true, if no cell in row 0 has `is_header=true`, the header is not repeated.**

### Missing Header Cell Attribute in HWP 5.0 Spec

The HWP 5.0 spec document (Table 67: Paragraph List Header, Table 82: Cell Properties) does not define the header cell attribute.

However, in the actual binary it exists as an extended attribute of LIST_HEADER, and is documented in the HWPML 3.0 spec (`hwp_spec_3.0_hwpml.md`) as the `Header` attribute:

```
| Attribute | Header | Whether this is a header cell | true | false | false |
```

### Discovering the Bit Position

The bit mapping was identified from hwplib (Java HWP library)'s `ListHeaderPropertyForCell` class:

| Bit | Attribute | HWP UI |
|-----|-----------|--------|
| 0-2 | Text direction | Vertical writing (E) |
| 3-4 | Line wrapping mode | Single-line input (S) |
| 5-6 | Vertical alignment | Vertical alignment |
| 16 | Inner margin specified | Inner margin specified (M) |
| 17 | Cell protection | Cell protection (P) |
| **18** | **Header cell** | **Header cell (G)** |
| 19 | Editable in form mode | Editable in form mode (F) |

### Field Layout Difference Between Our Parser and hwplib

The first 8 bytes of the LIST_HEADER record are interpreted differently:

```
Byte 0-1: [n_paragraphs (u16)]      / [paraCount lower 2B]
Byte 2-3: [list_attr lower 2B]      / [paraCount upper 2B]
Byte 4-5: [list_attr upper 2B]      / [property lower 2B]
Byte 6-7: [list_header_width_ref]   / [property upper 2B]
```

**hwplib's property bit 18 = our `list_header_width_ref` bit 2**

```rust
// list_header_width_ref (bytes 6-7) contains cell extended attributes
// Based on hwplib ListHeaderPropertyForCell:
//   bit 0 (=property bit 16): inner margin specified
//   bit 1 (=property bit 17): cell protection
//   bit 2 (=property bit 18): header cell
//   bit 3 (=property bit 19): editable in form mode
cell.is_header = (cell.list_header_width_ref & 0x04) != 0;
```

### webhwp (Hancom Official Viewer) Reference

webhwp validates the content type of all cells before repeating the header:
- If all cells are TEXT type, repetition is allowed
- If any cell contains non-text content (image/shape), repetition is disabled

## Resolution

### 1. Add `is_header` Field to Cell Model

```rust
// src/model/table.rs
pub struct Cell {
    // ...
    pub is_header: bool,  // Whether this is a header cell (list_attr bit 18)
}
```

### 2. Read `is_header` in Parser

```rust
// src/parser/control.rs - parse_cell()
cell.is_header = (cell.list_header_width_ref & 0x04) != 0;
```

### 3. Use `is_header`-Based Repetition Logic in Layout

```rust
// src/renderer/layout.rs - layout_partial_table()

// Only repeat header row when row 0 has is_header cells
let render_header = is_continuation && table.repeat_header && start_row > 0
    && table.cells.iter()
        .filter(|c| c.row == 0)
        .any(|c| c.is_header);

// Skip repeated cells that are not is_header
if is_repeated_header_cell && !cell.is_header {
    continue;
}

// Skip controls (images/shapes) in is_header repeated cells, only repeat text
if !is_repeated_header_cell {
    for ctrl in &para.controls { /* Picture, Shape, Table layout */ }
}
```

### 4. Reflect `has_header_cells` in Pagination as Well

```rust
// src/renderer/height_measurer.rs
pub struct MeasuredTable {
    pub has_header_cells: bool,  // Whether row 0 has is_header cells
}

// src/renderer/pagination.rs
let header_overhead = if is_continuation && mt.repeat_header
    && mt.has_header_cells && row_count > 1 { ... };
```

## Result

- Page 3: 1 image (Cell0's image)
- Page 4: 1 image (Cell2's image, no repeated header)
- 415 tests passing
