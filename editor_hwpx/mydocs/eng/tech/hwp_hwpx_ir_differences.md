# HWP <-> HWPX IR Differences Summary

This document records differences that require attention when generating identical IR (Intermediate Representation) from HWPX parsing as from HWP binary.
Reference this when implementing HWPX read/write or HWP<->HWPX conversion.

## 1. Table CommonObjAttr

### HWP Binary
- The entire `ctrl_data` of CTRL_HEADER is the CommonObjAttr structure (same as Shape/GSO)
- `table.common`: treat_as_char, text_wrap, vert_rel_to, horz_rel_to, width, height, etc. automatically parsed
- `table.attr`: synchronized from `table.common.attr`
- `table.raw_ctrl_data`: original binary preserved (for round-trip)

### HWPX XML
- `<tbl>` element attributes: `textWrap`, `rowCnt`, `colCnt`, etc.
- `<pos>` child element: `treatAsChar`, `vertRelTo`, `horzRelTo`, `vertOffset`, `horzOffset`, etc.
- `<sz>` child element: `width`, `height`
- `<outMargin>` child element: `left`, `right`, `top`, `bottom`
- `raw_ctrl_data` is empty -> **can be used as HWPX detection criterion**

### Caution
- Must use `table.common` fields instead of `table.attr` bit operations for HWPX compatibility
- Conversion completed in pagination/engine.rs in Task 278
- Remaining renderer conversions (~40 locations) in Task 286

## 2. Cell apply_inner_margin

### HWP Binary
- LIST_HEADER's `list_attr bit 16`: "specify inner margin"
- `cell.apply_inner_margin = (list_attr >> 16) & 0x01 != 0`
- When false, cell padding is ignored and table default padding is used

### HWPX XML
- `<tc>` element's `hasMargin` attribute: `true`/`false`
- OWPML schema: `<xs:attribute name="hasMargin" type="xs:boolean" default="false"/>`

### Caution
- Default value is `false` -> when `hasMargin` is not specified in HWPX, table default padding is used

## 3. LINE_SEG (lineSegArray)

### HWP Binary
- Stored as PARA_LINE_SEG record
- `vpos`: absolute position from section start (pre-calculated)
- `line_height`: includes height of inline controls such as tables/images
- Pagination/layout can precisely position based on vpos

### HWPX XML
- `<linesegarray>` element (may be missing in some HWPX files)
- `vpos`: **always 0** (not pre-calculated)
- `line_height`: reflects only text font height, **does not include inline table/image heights**
- Some HWPX files have no lineSegArray at all -> `reflow_line_segs()` required

### Caution
- Since `vpos=0`, vpos-based positioning logic does not work
- Code exists in the layout engine that skips vpos correction when `vpos==0 && para_idx > 0`
- Future: consider computing and populating vpos during HWPX loading

## 4. Square (Text Wrap) Detection

### HWP Binary
- `(table.attr >> 21) & 0x07 == 0` -> Square wrapping (text_wrap=Square)
- Square-wrapped tables have subsequent paragraphs positioned beside the table

### HWPX XML
- `table.attr=0` -> bit operations result in **all tables being incorrectly detected as Square!**
- Must use `table.common.text_wrap` for accuracy

### Impact
- Incorrect Square detection causes subsequent text paragraphs to not occupy height -> overlapping
- Discovered and fixed in Task 286

## 5. raw_ctrl_data Usage

### HWP Binary
- `table.raw_ctrl_data`: CTRL_HEADER original binary (42+ bytes)
- Used for extracting position/size/margin information
- Referenced in `get_table_vertical_offset()`, etc.

### HWPX XML
- `table.raw_ctrl_data`: **empty Vec** (no binary original)
- Position/size information is directly referenced from `table.common` fields
- **HWPX detection**: `raw_ctrl_data.is_empty()` -> table from HWPX file

## 6. Items Requiring Further Investigation

| Item | HWP | HWPX | Status |
|------|-----|------|--------|
| Shape CommonObjAttr | CTRL_HEADER parsing | `<shapeObject>` element | Partially implemented |
| Footnotes/Endnotes | CTRL_FOOTNOTE | `<footNote>` | HWPX not implemented |
| Header/Footer | CTRL_HEADER/FOOTER | `<headerFooter>` | HWPX not implemented |
| Drawing Objects | control/shape.rs | `<rect>`, `<line>`, etc. | HWPX not implemented |
| Fields/Hyperlinks | CTRL tags | `<ctrl>` | HWPX not implemented |
| HWPX -> HWP Conversion | - | - | Not implemented |
| HWP -> HWPX Conversion | - | - | Not implemented |
