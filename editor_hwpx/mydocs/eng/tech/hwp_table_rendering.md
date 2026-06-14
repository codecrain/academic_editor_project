# HWP Table Rendering Technical Guide

## Overview

This document provides technical guidelines for rendering Table objects in HWP files.
**The official HWP specification contains errors and incorrect descriptions**, so only information verified against actual HWP binary data and the behavior of the Hancom Word Processor is recorded here.

---

## 1. BorderFill Record Binary Structure

### Specification Error

The HWP 5.0 specification (Table 25) describes 4-directional border data in a **sequential array format** (`UINT8 array[4]` x 3), but this is **incorrect**.

### Actual Binary Layout: Interleaved Format

```
Offset  Size   Description
──────  ─────  ──────────────────────────────
0       2      UINT16 attribute (attr)
2       6      Left border: type(1) + width(1) + color(4)
8       6      Right border: type(1) + width(1) + color(4)
14      6      Top border: type(1) + width(1) + color(4)
20      6      Bottom border: type(1) + width(1) + color(4)
26      1      Diagonal type
27      1      Diagonal width
28      4      Diagonal color
32      var    Fill information
```

**Each border repeats in 6-byte units** (type 1 + width 1 + COLORREF color 4):

```rust
for i in 0..4 {
    let line_type = read_u8();   // Line type
    let width     = read_u8();   // Line width index
    let color     = read_u32();  // COLORREF (LE)
}
```

### Verification Method

To confirm the interleaved format is correct:
- Verify that all border colors are exactly `0x00000000` (black)
- Reading in sequential array format produces abnormal values like `0x00000001`, `0x00010100` for colors

---

## 2. Border Line Type (BorderLineType)

### Specification Error

The specification appears to start at index 0 with "Solid", but in practice **0 = None (no line)**.

### Actual Mapping

```
Index   Type               Description
──────  ──────────────    ──────────
0       None              No line
1       Solid             Solid line
2       Dash              Dashed line
3       Dot               Dotted line
4       DashDot           Dash-dot line
5       DashDotDot        Dash-dot-dot line
6       LongDash          Long dashed line
7       Circle            Circular dashed line
8       Double            Double line
9       ThinThickDouble   Thin-thick double line
10      ThickThinDouble   Thick-thin double line
11      ThinThickThinTriple Thin-thick-thin triple line
12      Wave              Wave line
13      DoubleWave        Double wave line
14      Thick3D           3D
15      Thick3DReverse    3D reversed
16      Thin3D            3D thin line
17      Thin3DReverse     3D thin line reversed
```

### Notes

- When `None(0)`, the border must not be rendered
- Most cell borders default to `Solid(1)` + width `1` (0.12mm)
- Matches the order in Hancom Word Processor's table properties -> border tab "Type" list

---

## 3. Border Line Width Mapping

Converting the width index from HWP spec Table 28 from mm to px (96dpi):

```
Index   mm      px(@96dpi)
──────  ──────  ──────────
0       0.1     0.4
1       0.12    0.5
2       0.15    0.6
3       0.2     0.75
4       0.25    1.0
5       0.3     1.1
6       0.4     1.5
7       0.5     1.9
8       0.6     2.3
9       0.7     2.6
10      1.0     3.8
11      1.5     5.7
12      2.0     7.6
13      3.0     11.3
14      4.0     15.1
15      5.0     18.9
```

Hancom default border width: **Index 1 (0.12mm = 0.5px)**

---

## 4. BorderFill ID Reference Rules

- `border_fill_id` is **1-indexed** (subtract 1 for array access)
- `border_fill_id == 0` means no BorderFill reference -> do not draw borders
- Both Table and Cell have their own `border_fill_id`
  - `table.border_fill_id`: **Used for page-split boundary lines** (not the visual outline!)
  - `cell.border_fill_id`: Individual cell border style (the table's visual borders are determined solely by this)

### Important: table.border_fill_id Is Not the Visual Outline

Do not render `table.border_fill_id` as the table's overall outline. This value is the boundary line style used when a table is split at a page boundary. The table's visual outline is determined **only by individual cells' `cell.border_fill_id`**.

---

## 5. Table Object Attribute Structure (Based on Hancom Dialog)

Key rendering attributes for each tab in Hancom's table properties dialog:

### 5.1 Basic Tab

| Attribute | Description | Rendering Impact |
|------|------|------------|
| Width/Height | Total table size (mm) | Layout size calculation |
| treat_as_char | Inline vs. floating | Determines placement mode |
| Text wrapping | Text wrapping mode | Surrounding text placement |

### 5.2 Margin/Caption Tab

| Attribute | Description | Rendering Impact |
|------|------|------------|
| Outer margin | Table outer margin (left/right/top/bottom) | Spacing around the table |
| Caption position/size | Caption placement | Caption rendering position |

### 5.3 Border Tab

| Attribute | Description | Rendering Impact |
|------|------|------------|
| Type | Line type (0-17) | Determines BorderLineType |
| Width | Line width index (0-15) | Determines stroke-width |
| Color | Line color (COLORREF) | Stroke color |
| Cell spacing | Spacing between cells (mm) | Affects cell position calculation |

### 5.4 Background Tab

| Attribute | Description | Rendering Impact |
|------|------|------------|
| Fill type | None/Color/Gradient/Image | Background rendering method |
| Surface color | Background solid color | Fill color |

### 5.5 Table Tab

| Attribute | Description | Rendering Impact |
|------|------|------------|
| Cell inner padding | Cell internal text padding (mm) | Text start position within cell |
| Boundary line setting | Boundary line for page splits | Multi-page tables |

---

## 6. Cell Layout Calculation

### 6.1 Column Width Calculation

```
col_widths[col] = cell.width  (based on first cell in the same column, HWPUNIT -> px)
col_x[0] = table_start_x
col_x[i+1] = col_x[i] + col_widths[i] + cell_spacing  (except for last column)
```

### 6.2 Row Height Calculation

```
row_heights[row] = table.row_sizes[row]  (HWPUNIT -> px)
row_y[0] = table_start_y
row_y[i+1] = row_y[i] + row_heights[i] + cell_spacing  (except for last row)
```

### 6.3 Cell Spacing (cell_spacing)

- `table.cell_spacing` (HWPUNIT -> px)
- Applied only between adjacent cells (not applied to the outer edges)
- Hancom default: 0.00mm

### 6.4 Cell Inner Padding

- Hancom default: 0.50mm for each of left/right/top/bottom
- Shifts the text start position inward by the padding amount within the cell
- `cell.padding_left`, `cell.padding_right`, `cell.padding_top`, `cell.padding_bottom`

---

## 7. SVG Rendering Order

Order for rendering a table to SVG:

```
1. Table overall outline (referencing table.border_fill_id, only if not None)
2. Iterate through each cell:
   a. Cell background <rect> (if fill_color exists)
   b. Cell 4-directional border <line> (per direction, only if not None)
   c. Cell text <text>
```

### 7.1 Border Line SVG Conversion

| BorderLineType | SVG stroke-dasharray |
|---------------|---------------------|
| None          | (not rendered)      |
| Solid         | (none = solid line) |
| Dash          | "6 3"               |
| Dot           | "2 2"               |
| DashDot       | "6 3 2 3"           |
| DashDotDot    | "6 3 2 3 2 3"       |
| Double, etc.  | Substituted as Solid|

---

## 8. Verification Checklist

Items to verify when checking table rendering results:

- [ ] Are all cell borders rendered with the correct type (solid/dotted/none)?
- [ ] Do border widths match the original?
- [ ] Are border colors exactly black (#000000) (not abnormal approximations)?
- [ ] Are cell background colors correctly applied?
- [ ] Is the thick bottom border of header rows displayed?
- [ ] Do text positions within cells reflect inner padding?
- [ ] Is cell spacing correctly reflected?
- [ ] Is the table outline correctly displayed?

---

## Change History

| Date | Author | Content |
|------|--------|------|
| 2026-02-06 | Claude | Initial draft -- discovered 2 specification errors and documented based on actual implementation |
