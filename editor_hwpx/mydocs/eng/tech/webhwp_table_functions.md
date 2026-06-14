# Hancom WebGian -- Table-Related JS Function Inventory

> Analysis target: `webhwp/js/hwpApp.*.chunk.js` (5.17MB minified)
> Date: 2026-02-21
> Reference: `mydocs/tech/webhwp/02_table.md` (existing structural analysis)

## 1. Border Rendering

| Function | Role | Canvas API |
|----------|------|-----------|
| `bbr()` | Basic line drawing. `moveTo`->`lineTo`->`stroke` + `setLineDash` for dash patterns | `moveTo`, `lineTo`, `stroke`, `setLineDash` |
| `Cbr()` | Corner border rendering. Clipping region for intersection handling | `clip`, `stroke` |
| `Tbr()` | General border dispatcher. Coordinate transform + zoom applied, then calls `bbr()` or `Cbr()` | -- |
| `gbr()` | Double line corner handling. 2 parallel line renders | `moveTo`, `lineTo`, `stroke` |
| `xbr()` | Triple line handling. 3 parallel line renders | `moveTo`, `lineTo`, `stroke` |

### Border Line Type Constants (mt)

| Constant | Type | Dash Pattern |
|----------|------|-------------|
| `mt.NEt` | Solid | None |
| `mt.kEt` | Dashed | `[2, 1.2]` |
| `mt.HEt` | Dash-Dot | `[10, 1.2, 2, 1.2]` |
| `mt.PEt` | Dash-Dot-Dot | `[10, 1.2, 2, 1.2, 2, 1.2]` |
| `mt.xEt` | Special | -- |
| `mt.OEt` | Default/None | -- |

### Border Direction Constants

| Constant | Direction | Reference Count |
|----------|-----------|----------------|
| `mt.OCt` | Top | 308 |
| `mt.kCt` | Bottom | 257 |
| `mt.ACt` | Left | 321 |
| `mt.RCt` | Right | 257 |

### Border Property Object

```javascript
{
    uqt: borderType,     // Line type (NEt, kEt, etc.)
    rqt: linePattern,    // Line style pattern
    strokeStyle: color,  // RGB color (#rrggbb)
    lineWidth: width,    // Thickness (px)
    ec: capStyle,        // "round" | "square"
    lw: lineWidthValue,  // Original line width value
    lc: lineColor,       // CREF format color
    lt: lineType         // Line kind
}
```

## 2. Cell Background/Fill Rendering

| Function | Role | Canvas API |
|----------|------|-----------|
| `CREFtoRGB()` | HWP COLORREF -> RGB hex conversion (`#rrggbb`) | -- |
| `Ubr()` | Pattern color conversion. `globalCompositeOperation = "source-in"` to apply color to pattern canvas | `globalCompositeOperation`, `fillRect` |
| (inline) | Solid fill: `fillStyle = CREFtoRGB(color)` -> `fillRect(x, y, w, h)` | `fillStyle`, `fillRect` |
| (inline) | Pattern fill: `createPattern(patternCanvas, "repeat")` -> `fillRect` | `createPattern`, `fillRect` |

### Pattern Types (8 types)

```javascript
e[mt.eyt]   // Grid (5x5 crosshatch)
// Others: horizontal lines, vertical lines, backslash, forward slash, cross, X-pattern, dot pattern
```

## 3. Table Layout Calculation

| Function | Role | Description |
|----------|------|-------------|
| `M1n()` | Column width distribution | Sum each column's `columnWidth` -> proportionally adjust difference from total width (`gUn`) -> recalculate merged cell widths |
| `B1n()` | Multi-span space distribution | Distribute space for cells with `colSpan`/`rowSpan > 1` to relevant columns/rows |
| `K1n()` | Sparse table empty cell filling | Create missing cells in irregular table structures |
| `nzn()` | Proportional width calculation | `columnWidth x (targetWidth / totalWidth)` proportional distribution |

### Width/Height Modes

```javascript
// Fixed width (gUn > 0): Total table width is specified
if (i.gUn > 0) {
    // Proportional distribution: (gUn - usedWidth) / (VUn - allocatedCols)
}

// Auto width (gUn <= 0): Content-based measurement
// Automatically calculated from columnWidth

// Fixed height (jUn > 0): (jUn - usedHeight) / (zUn - allocatedRows)
// Auto height (jUn <= 0): Cell content + padding
```

## 4. Cell Data Structure

### Cell (qUn) -- 223 References

| Property | Refs | Description |
|----------|------|-------------|
| `.JUn` | 23 | Row index |
| `.ZUn` | 28 | Column index |
| `.$Un` | 21 | Cell width (-1 = auto) |
| `.tWn` | 20 | Cell height (-1 = auto) |
| `.Bun` | 56 | Address array `[colAddr, rowAddr]` |
| `.Fun` | 23 | Merge range `[colSpan, rowSpan]` |
| `.iWn` | 17 | Cell content (text/HTML) |
| `.nWn` | 14 | Flag array |
| `.eWn` | 19 | Style property array |
| `.rWn` | 16 | Style value array |
| `.MUn` | 13 | Measured width after layout |

### Column Metadata (LUn/QUn) -- 23 References

| Property | Description |
|----------|-------------|
| `.columnWidth` | Column width (-1 = auto/unset) |
| `.MUn` | Measured width |
| `.BUn` | Additional width from borders |
| `.FUn` | Row merge accumulation value |

### Row Metadata (UUn)

| Property | Refs | Description |
|----------|------|-------------|
| `.WUn` | 28 | Row height (-1 = auto) |
| `.GUn` | 5 | Width adjustment value |
| `.KUn` | 4 | Additional height |

### Table Overall Structure (YUn)

| Property | Refs | Description |
|----------|------|-------------|
| `.jUn` | -- | Total table height |
| `.gUn` | 10 | Total table width |
| `.VUn` | 24 | Column count |
| `.zUn` | 16 | Row count |

### Cell Access Functions

| Function | Role |
|----------|------|
| `r.Chn(h, u)` | Access row `h`, cell `u` |
| `r.Phn(h)` | Return cell count for row `h` |

## 5. Cell Merge/Split

| Function | Role | Shortcut |
|----------|------|----------|
| `MergeCell(t)` | Merge selected rectangular cell range. Update `Fun[colSpan, rowSpan]` -> update `QUn` matrix -> recalculate layout | Alt+M |
| `SplitCell(t, i)` | Split merged cell. Check editability with `ZRe()` -> get cell reference with `nse()` -> mark split -> recalculate layout | Alt+S |
| `unMergeCell` | Undo previous merge (MergeCell inverse) | -- |

### Merge Detection Logic

```javascript
rowSpan = v.Fun[1];
colSpan = v.Fun[0];
// Single cell: 1 == colSpan && $Un > 0
// Merged cell: 1 == colSpan && $Un > QUn[ZUn].columnWidth

// Sum widths of merged columns
for (let n = 0; n < e.colSpan; n++) {
    if (e.ZUn + n < i.VUn)
        t += i.QUn[e.ZUn + n].columnWidth;
}
e.$Un = t;
```

## 6. Row/Column Insert/Delete

| Function (Menu Command) | Role | Operation Type Constant |
|--------------------------|------|------------------------|
| `tRowInsert` | Insert row | `Jw` |
| `tCellInsert` | Insert cell | -- |
| `insertRow` | Insert row (alternative) | -- |
| `insertColumn` | Insert column | `Kw` |
| `insertCell` | Insert cell (DOM: `f.insertCell(t)`) | -- |
| `tRowDelete` | Delete row | `$w` |
| `tCellDelete` | Delete cell | -- |
| `deleteCell` | Remove cell | -- |
| `deleteColumn` | Delete column | `Lw` |
| `deleteTable` | Delete entire table | -- |

## 7. Equal Distribution / Resize

| Function | Role | Shortcut |
|----------|------|----------|
| `equalTableRow` | Equal row height distribution | Alt+H |
| `equalTableCol` | Equal column width distribution | Alt+W |
| `EqualCellWidth` (`yi.z3t`) | Equalize selected cell widths | -- |
| `EqualCellHeight` (`yi.jLt`) | Equalize selected cell heights | -- |

### Drag Resize Handles

| CSS Class / ID | Role |
|----------------|------|
| `hcwo_table_resize_dragger` / `hcwoTableResizeDragger` | Table overall resize handle |
| `hcwo_table_row_resize_dragger` / `hcwoTableRowResizeDragger` | Row height resize handle |
| `hcwo_table_col_resize_dragger` / `hcwoTableColResizeDragger` | Column width resize handle |

## 8. Cell Selection / Navigation

| Function (Menu Command) | Role |
|--------------------------|------|
| `selectTable` | Select entire table |
| `selectCell` | Select individual cell |
| `selectRow` | Select entire row |
| `selectColumn` | Select entire column |

### CSS Classes

| Class | Purpose |
|-------|---------|
| `hcwo_table` | Table container |
| `hcwo_hwp_table_grid` | HWP-style table grid |
| `hcwo_table_grid` | Table grid display |
| `hcwo_selected_cell` | Selected cell indicator |
| `hcwo_vmerge_cell` | Vertical merge cell indicator |

### Keyboard Navigation

| Feature | Description |
|---------|-------------|
| `TabMoveCell` | Move to next cell with Tab key |
| Arrow keys | Navigate between cells |
| Enter | Line break within cell or add row |

## 9. Cell Formatting / Alignment

| Function (Menu Command) | Role |
|--------------------------|------|
| `alignCell` | Cell content alignment (horizontal/vertical) |
| `borderCell` | Cell border configuration |
| `highlightColorCell` | Cell background/highlight color |
| `tableLine` | Table line configuration |
| `formatCopy` | Format copy |

### Alignment Properties

```javascript
// Horizontal alignment
textAlign: "left" | "center" | "right"   // r.TIr reference

// Vertical alignment
textBaseline: "top" | "middle" | "bottom" // r.vAlign reference
```

## 10. Dialogs

| Dialog | Dispatcher | Role |
|--------|-----------|------|
| `TableCreateDialog` | -- | New table creation (row/column count, size settings) |
| `TablePropertyDialog` | `F9s()` | Table properties (width/height, margins, placement) |
| `TableSplitCellDialog` | `F6s()` | Cell split settings (row/column split count) |
| `TableCellBorderFillDialog` | -- | Cell border/background settings |
| `PasteCellDialog` | -- | Cell paste options |

## 11. Operation Type Constants (for Undo/Redo)

| Constant | Function | Description |
|----------|----------|-------------|
| `yi.W3t` | MergeCell | Cell merge |
| `yi.zLt` | SplitCell | Cell split |
| `yi.VLt` | unMergeCell | Unmerge |
| `yi.P3t` | Row/Col operations | Row/column insert/delete |
| `yi.H3t` | EqualCellHeight | Height equalization |
| `yi.z3t` | EqualCellWidth | Width equalization |
| `yi.jLt` | CellHeight | Cell height |
| `yi.C3t` | Cell operations | Cell-related |
| `yi.L3t` | Left/Indent | Indentation |

## 12. Rendering Pipeline Summary

```
Server JSON received
  |
Table structure validation -> M1n() column width distribution
  |
for each cell:
  |- Position calculation: JUn(row), ZUn(col), Bun[colAddr, rowAddr]
  |- Merge size: Fun[colSpan, rowSpan] -> column width summation
  |- Background fill:
  |   |- Solid: CREFtoRGB() -> fillStyle -> fillRect()
  |   +- Pattern: Ubr() color application -> createPattern() -> fillRect()
  |- Border (each of 4 sides):
  |   |- Direction: OCt(top)/kCt(bottom)/ACt(left)/RCt(right)
  |   |- Type: lookup line style from eWn/rWn
  |   |- Dispatch: Tbr() -> bbr()(basic) or Cbr()(corner)
  |   +- Dash: setLineDash() + strokeStyle + lineWidth
  +- Text: set textAlign/textBaseline -> fillText()
```

## 13. Canvas 2D API Usage Frequency

| API | Count | Purpose |
|-----|-------|---------|
| `lineWidth` | 80 | Border thickness |
| `strokeStyle` | 55 | Border color |
| `fillStyle` | 47 | Background color/pattern |
| `setLineDash()` | 23 | Dash pattern |
| `globalCompositeOperation` | 16 | Pattern color compositing |
| `fillRect()` | 11 | Background fill |
| `createPattern()` | 6 | Pattern fill |
| `strokeRect()` | 4 | Rectangle border |
| `textBaseline` | 4 | Vertical alignment |

## 14. Implementation Status Compared to rhwp

| Feature | Hancom webhwp | rhwp Current | Notes |
|---------|--------------|--------------|-------|
| Cell border rendering | 6+ types (solid/dashed/double/triple, etc.) | Solid only | Reference `bbr`/`Cbr`/`gbr`/`xbr` |
| Pattern fill | 8 patterns + `createPattern` | Not implemented | Reference `Ubr` color compositing approach |
| Cell merge/split | Full `MergeCell`/`SplitCell` support | Merge rendering only | Editing not implemented |
| Row/column insert/delete | 6 commands | Not implemented | `tRowInsert`, etc. |
| Drag resize | 3 handle types: row/column/table | Not implemented | Reference CSS draggers |
| Equal distribution | `equalTableRow`/`equalTableCol` | Not implemented | |
| Table creation dialog | `TableCreateDialog` | Not implemented | |
| Cell selection | Individual/row/column/all 4 types | Individual/all | |
| Keyboard navigation | Tab cell navigation supported | Tab supported | |
| Width distribution algorithm | `M1n`/`B1n`/`K1n` | Fixed width only | Auto width not supported |
| Nested tables | Included in `iWn` cell content | Supported | |

---

*Analysis source: `webhwp/js/hwpApp.1827379d2f5132ffd00b.chunk.js` (5.17MB)*
