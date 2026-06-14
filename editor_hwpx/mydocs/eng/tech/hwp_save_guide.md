# HWP Save Technical Guide

## 1. Editing Area Coordinate System

### 1.1 Basic Structure

Page structure of an HWP document:

```
┌─────────────────────────────────┐ <- Paper top (0)
│         margin_top (20mm)       │
├─────────────────────────────────┤ <- margin_top (5668)
│       margin_header (15mm)      │ <- Header area
├─────────────────────────────────┤ <- body_area.top = margin_top + margin_header (9920)
│                                 │
│         Editing area (body)     │ <- LineSeg coordinate origin (0, 0)
│         body_area               │
│         height: 65764           │
│         width: 42520            │
│                                 │
├─────────────────────────────────┤ <- body_area.bottom (75684)
│       margin_footer (15mm)      │ <- Footer area
├─────────────────────────────────┤
│        margin_bottom (15mm)     │
└─────────────────────────────────┘ <- Paper bottom (84188)
```

### 1.2 Key Finding: LineSeg Coordinates Are Relative to the Editing Area

Analysis of `template/empty.hwp`:

| Item | PageAreas Calculated Value | LineSeg Actual Value | Meaning |
|------|-----------------|---------------|------|
| vertical_pos | 9920 (body_area.top) | **0** | Relative coordinate within editing area |
| column_start | 8504 (body_area.left) | **0** | Relative coordinate within editing area |
| segment_width | 42520 | **42520** | Matches editing area width |

**Conclusion**: LineSeg's `vertical_pos` and `column_start` are **relative coordinates based on the editing area (body_area), not page absolute coordinates**.

### 1.3 First Line LineSeg Values for an Empty Document

```
LineSeg[0]:
  text_start:         0
  vertical_pos:       0        <- Top of editing area
  line_height:        1000     <- Based on 10pt character
  text_height:        1000
  baseline_distance:  850      <- Distance to baseline
  line_spacing:       600      <- Line spacing (160% x 1000 x 0.6?)
  column_start:       0        <- Left of editing area
  segment_width:      42520    <- Full width of editing area
  tag:                0x00060000
```

### 1.4 A4 Default Paper Settings (template/empty.hwp)

| Item | HWPUNIT | mm |
|------|---------|-----|
| Paper width | 59528 | 210.0 |
| Paper height | 84188 | 297.0 |
| Left margin | 8504 | 30.0 |
| Right margin | 8504 | 30.0 |
| Top margin | 5668 | 20.0 |
| Bottom margin | 4252 | 15.0 |
| Header margin | 4252 | 15.0 |
| Footer margin | 4252 | 15.0 |
| Gutter margin | 0 | 0.0 |

### 1.5 DocProperties Caret Information

Based on empty document:

| Field | Value | Meaning |
|------|-----|------|
| caret_list_id | 0 | Body section 0 |
| caret_para_id | 0 | First paragraph |
| caret_char_pos | 16 | 2 controls (SectionDef, ColumnDef) x 8 WCHAR |

### 1.6 Default Styles for an Empty Document

| Item | Value |
|------|-----|
| CharShape | base_size=1000 (10pt) |
| ParaShape | line_spacing_type=Percent, line_spacing=160 |
| Paragraph[0] | text='' char_count=17 controls=2 (SectionDef, ColumnDef) |

### 1.7 HWPUNIT Conversion

- 1 inch = 7200 HWPUNIT
- 1 mm = 7200 / 25.4 = 283.46 HWPUNIT
- 1 pt = 100 HWPUNIT (based on CharShape.base_size)

---

## 2. Specification Cross-Verification Results

### 2.1 Paragraph Record Structure

| Record | Bytes/Items | Verification Result |
|--------|-----------|----------|
| PARA_HEADER | 24 bytes (base) + raw_header_extra | Exact match |
| PARA_TEXT | 2 x nchars (UTF-16LE) | Exact match |
| PARA_CHAR_SHAPE | 8 bytes/item (start_pos:4 + char_shape_id:4) | Exact match |
| PARA_LINE_SEG | 36 bytes/item (9 x 4 bytes) | Exact match |
| PARA_RANGE_TAG | 12 bytes/item (start:4 + end:4 + tag:4) | Exact match |

### 2.2 Required Record Matrix by Control Type

| Control | char_code | ctrl_id | Required Records (order) | Level |
|--------|-----------|---------|-------------------|------|
| SectionDef | 0x0002 | 'secd' | CTRL_HEADER -> PAGE_DEF -> FOOTNOTE_SHAPE x 2 -> PAGE_BORDER_FILL | L+1 -> L+2 |
| ColumnDef | 0x0002 | 'cold' | CTRL_HEADER (data embedded) | L+1 |
| Table | 0x000B | 'tbl ' | CTRL_HEADER -> [Caption] -> TABLE -> Cell(LIST_HEADER + Paragraphs) x N | L+1 -> L+2 |
| Picture | 0x000B | 'gso ' | CTRL_HEADER -> SHAPE_COMPONENT -> SHAPE_COMPONENT_PICTURE | L+1 -> L+2 -> L+3 |
| Shape | 0x000B | 'gso ' | CTRL_HEADER -> SHAPE_COMPONENT -> SHAPE_COMPONENT_* | L+1 -> L+2 -> L+3 |
| Header | 0x0010 | 'head' | CTRL_HEADER -> LIST_HEADER -> Paragraphs | L+1 -> L+2 |
| Footer | 0x0010 | 'foot' | CTRL_HEADER -> LIST_HEADER -> Paragraphs | L+1 -> L+2 |
| Footnote | 0x0011 | 'fn  ' | CTRL_HEADER -> LIST_HEADER -> Paragraphs | L+1 -> L+2 |
| Endnote | 0x0011 | 'en  ' | CTRL_HEADER -> LIST_HEADER -> Paragraphs | L+1 -> L+2 |
| HiddenComment | 0x000F | 'tcmt' | CTRL_HEADER -> LIST_HEADER -> Paragraphs | L+1 -> L+2 |
| AutoNumber | 0x0012 | - | CTRL_HEADER only | L+1 |
| NewNumber | 0x0012 | - | CTRL_HEADER only | L+1 |
| PageNumberPos | 0x0015 | - | CTRL_HEADER only | L+1 |
| PageHide | 0x0015 | - | CTRL_HEADER only | L+1 |
| Bookmark | 0x0016 | - | CTRL_HEADER only | L+1 |
| Field | 0x0003 | '%hlk' etc. | CTRL_HEADER -> [CTRL_DATA] | L+1 -> L+2 |
| Equation | 0x000B | 'eqed' | CTRL_HEADER -> SHAPE_COMPONENT -> EQ_EDIT | L+1 -> L+2 -> L+3 |

### 2.3 TABLE Record Detailed Structure

```
CTRL_HEADER (level L+1, ctrl_id='tbl ')
  +- attr: u32 (4 bytes)
  +- raw_ctrl_data (variable)
TABLE (level L+2)
  +- attr: u32 (4)
  +- row_count: u16 (2)
  +- col_count: u16 (2)
  +- cell_spacing: i16 (2)
  +- padding: i16 x 4 (8)
  +- row_sizes: i16[row_count] (2 x N)
  +- border_fill_id: u16 (2)
LIST_HEADER (level L+2) <- repeated per cell
  +- n_paragraphs: u16 (2)
  +- list_attr: u32 (4)
  +- width_ref: u16 (2)
  +- col/row/col_span/row_span: u16 x 4 (8)
  +- width/height: u32 x 2 (8)
  +- padding: i16 x 4 (8)
  +- border_fill_id: u16 (2)
  PARA_HEADER (level L+2) <- paragraphs within cell
    PARA_TEXT (level L+3)
    PARA_CHAR_SHAPE (level L+3)
    PARA_LINE_SEG (level L+3)
```

### 2.4 DOCUMENT_PROPERTIES Record (26 bytes)

| Field | Type | Size |
|------|------|------|
| section_count | u16 | 2 |
| page_start_num | u16 | 2 |
| footnote_start_num | u16 | 2 |
| endnote_start_num | u16 | 2 |
| picture_start_num | u16 | 2 |
| table_start_num | u16 | 2 |
| equation_start_num | u16 | 2 |
| caret_list_id | u32 | 4 |
| caret_para_id | u32 | 4 |
| caret_char_pos | u32 | 4 |

### 2.5 ID_MAPPINGS Record (72 bytes)

18 u32 counts: bin_data, font x 7, border_fill, char_shape, tab_def, numbering, bullet, para_shape, style, memo_shape, trackchange, trackchange_author

### 2.6 Verification Status Summary

| Item | Status |
|------|------|
| PARA_HEADER | Exact match |
| PARA_TEXT (control character encoding) | Exact match |
| PARA_CHAR_SHAPE | Exact match |
| PARA_LINE_SEG (36 bytes) | Exact match |
| PARA_RANGE_TAG (12 bytes) | Exact match |
| CTRL_HEADER structure | Exact match |
| TABLE record hierarchy | Exact match |
| HEADER/FOOTER structure | Exact match |
| FOOTNOTE/ENDNOTE structure | Exact match |
| ID_MAPPINGS (72 bytes) | Exact match |
| Record level hierarchy | Exact match |
| DOCUMENT_PROPERTIES | 26 bytes (spec says 30 bytes, preserved as raw_data) |

---

## 3. Control Character Sizes

- Inline controls (Tab, LineBreak, etc.): **1 WCHAR** (2 bytes)
  - Applicable codes: 0, 10, 13, 24-31
- Extended controls (SectionDef, Table, Picture, etc.): **8 WCHAR** (16 bytes)
  - Applicable codes: 1-3, 11-12, 14-18, 21-23
  - Composition: char_code(2) + ctrl_id(8) + reserved(4) + char_code_repeat(2) = 16 bytes

---

## 4. Save Verification Records by Control Type

### 4.1 Text Only (Step 2 Complete)

**Test Cases:**

| File | Inserted Text | char_count | PARA_TEXT Size |
|------|-----------|-----------|---------------|
| save_test_korean.hwp | Korean characters | 25 (8 chars + 16 controls + 1 CR) | 50 bytes |
| save_test_english.hwp | Hello World | 28 (11 chars + 16 controls + 1 CR) | 56 bytes |
| save_test_mixed.hwp | Korean Hello 123 !@# | 33 (16 chars + 16 controls + 1 CR) | 66 bytes |

**Changed Records (compared to original):**
- PARA_HEADER: Only char_count changed (original 17 -> text addition)
- PARA_TEXT: Text data added (original 34 bytes -> increased size)

**Unchanged Records:**
- PARA_CHAR_SHAPE: Same (8 bytes)
- PARA_LINE_SEG: **Original values preserved** (36 bytes) -- editing area coordinates maintained
- All records after CTRL_HEADER: Same (SectionDef, ColumnDef, etc.)

**Verification Results:**
- All 3 files re-parsed successfully
- Record count identical (original 12 = saved 12)
- All 466 tests passed
- Output: `output/save_test_*.hwp`
- Hancom Word Processor open verification: **All 3 files opened normally, caret position correct**

### 4.2 Table -- Step 3 Complete

**Reference File**: `output/1by1-table.hwp` (created directly with Hancom Word Processor)

**Key Findings (reference file analysis):**

1. **CTRL_HEADER Structure**: ctrl_id(4) + attr(4) + CommonObjAttr(38) = **46 bytes**
   - CommonObjAttr: y_offset(4) + x_offset(4) + width(4) + height(4) + z_order(4) + margins(8) + instance_id(4) + extra(6)
   - `attr = 0x082A2210` (table common object attribute flags)

2. **Table Paragraph Structure**: Must have **2 paragraphs**
   - Paragraph[0]: Paragraph containing the table (SectionDef + ColumnDef + Table + CR, char_count=25)
   - Paragraph[1]: Empty paragraph below the table (CR only, char_count=1)

3. **Table Paragraph LineSeg**: `segment_width = 0` (table occupies entire line)

4. **control_mask**: Paragraph with a table has `0x00000804`

5. **Cell Paragraph Level**: **Same level** as LIST_HEADER (level=L+2)
   - PARA_HEADER level=L+2, PARA_TEXT/CHAR_SHAPE/LINE_SEG level=L+3

6. **Caret Position**: `caret_list_id=1` (second paragraph = empty line below table)

7. **BorderFill**: Solid border BorderFill must be added to DocInfo
   - `BorderLineType::Solid, width=1, color=0` (black solid line)
   - `diagonal_type=1`

**TABLE Record Details (reference basis):**

| Record | Size | Notes |
|--------|------|------|
| CTRL_HEADER | 46B | attr(4) + CommonObjAttr(38) + ctrl_id(4) |
| TABLE | 24B | attr(4) + rows(2) + cols(2) + spacing(2) + padding(8) + row_sizes(2) + bf_id(2) + extra(2) |
| LIST_HEADER | 47B | Base 34B + raw_list_extra(13B) |

**Test Cases:**

| File | Table Size | Record Count | Result |
|------|---------|----------|------|
| save_test_table_1x1.hwp | 1x1 empty cell | 21 (same as reference) | Hancom opens normally |

**Modification History:**
- First attempt: Missing CommonObjAttr in CTRL_HEADER -> file corruption
- Implemented LenientCfbReader: bypass FAT validation for Hancom-generated files
- After reference file analysis: structure fully matches, border BorderFill added

### 4.3 Image (Picture) -- Step 4 Complete

**Reference File**: `output/pic-01-as-text.hwp` (image inserted as treat_as_char into empty document using Hancom Word Processor)
**Image Used**: `output/3tigers.jpg` (4,774,959 bytes, JPEG)

**Key Findings (reference file analysis):**

1. **Paragraph Structure**: Single paragraph (different from tables!)
   - Paragraph[0]: SectionDef + ColumnDef + Picture + CR (char_count=25, msb=true)
   - Tables require 2 paragraphs (table + empty line) but images need only 1

2. **CTRL_HEADER (GenShape)**: 242 bytes
   - ctrl_id='gso ' + CommonObjAttr(attr, offsets, width, height, z_order, margins, instance_id, description, raw_extra)
   - `attr = 0x040A6311` (treat_as_char image attribute flags)
   - raw_extra: 200 bytes (file path/UUID metadata)

3. **SHAPE_COMPONENT**: 196 bytes (level=L+2)
   - ctrl_id x 2: `$pic` (0x24706963) -- must be written twice (top-level GSO)
   - ShapeComponentAttr: offset(8) + group_level(2) + file_version(2) + original/current size(16) + flip(4)
   - raw_rendering: 146 bytes (identity matrix + additional data)
   - Rendering data: cnt(u16=1) + identity_matrix(48B: 1.0,0.0,0.0,1.0,0.0,0.0) + additional

4. **SHAPE_COMPONENT_PICTURE (tag=85)**: 82 bytes (level=L+3)
   - border_color(4) + border_width(4) + border_attr(4)
   - border_x[4](16) + border_y[4](16) -- rectangle coordinates
   - crop(16) + padding(8) + image_attr(5) + raw_picture_extra(9)

5. **border coordinate pattern**: Where W=width, H=height:
   - border_x = [0, 0, W, 0]
   - border_y = [W, H, 0, H]

6. **crop values**: Store original image size (in HWPUNIT)
   - crop.right = 127560 (approx. original image width)
   - crop.bottom = 191400 (approx. original image height)

7. **BinData Pipeline**:
   - DocInfo: BIN_DATA record (attr=0x0001, Embedding, status=NotAccessed)
   - CFB: `/BinData/BIN0001.jpg` stream
   - Picture.image_attr.bin_data_id = 1 (1-indexed)
   - ID_MAPPINGS bin_data count automatically reflected

8. **Caret Position**: list_id=0, para_id=0, char_pos=24 (just before CR)
   - Single paragraph so list_id=0 maintained (different from table's list_id=1)

9. **LineSeg**: line_height = image height (14775), segment_width = editing area width (42520)

**Record Comparison Results (reference vs. saved):**

| Record | Reference Size | Saved Size | Match |
|--------|----------|----------|------|
| PARA_HEADER | 22B | 22B | Match |
| PARA_TEXT | 50B | 50B | Exact match |
| PARA_CHAR_SHAPE | 8B | 8B | ~= (char_shape_id difference) |
| PARA_LINE_SEG | 36B | 36B | Exact match |
| CTRL_HEADER (SectionDef) | 38B | 38B | Exact match |
| CTRL_HEADER (ColumnDef) | 16B | 16B | Exact match |
| CTRL_HEADER (GenShape) | 242B | 242B | Exact match |
| SHAPE_COMPONENT | 196B | 196B | Exact match |
| SHAPE_PICTURE | 82B | 82B | Exact match |
| Others (PAGE_DEF, etc.) | - | - | Exact match |

**14 of 15 total records perfectly match, 1 minor difference (char_shape_id)**

**Test Cases:**

| File | Image | Record Count | Result |
|------|--------|----------|------|
| save_test_picture.hwp | 3tigers.jpg (4.8MB) | 15 (same as reference) | Hancom opens normally |

**Verification Items:**
- Image position normal
- Caret position normal
- Re-parsing successful
- BinData stream created correctly

### 4.4 Other Controls Round-Trip -- Step 5 Complete

**Verification Method**: Round-trip of actual HWP files containing various controls (parse -> re-serialize -> save -> re-parse)

**Verification Results:**

| Sample File | Target Controls | Preserved | Record Count | Match Rate |
|-----------|-----------|------|----------|--------|
| k-water-rfp.hwp | Header(3), Footer(2), Shape(2), Picture(15), Table(19) | All | 266=266 | 89% |
| 20250130-hongbo.hwp | Shape(1), Picture(4), Table(6) | All | 306=306 | 100% |
| hwp-multi-001.hwp | Shape(1), Picture(2), Table(26) | All | 8702->8697 | 43% |
| hwp-multi-002.hwp | Picture(3), Table(7) | All | 1261->1243 | 10% |
| 2010-01-06.hwp | Footnote(30), Table(12) | All | 2711=2711 | 90% |

**Control Preservation Status:**

| Control | Files Verified | Total Instances | Preserved | Notes |
|--------|-------------|-----------|------|------|
| Header | 1 | 3 | Yes | k-water-rfp |
| Footer | 1 | 2 | Yes | k-water-rfp |
| Footnote | 1 | 30 | Yes | 2010-01-06 |
| Shape | 3 | 4 | Yes | k-water, hongbo, multi-001 |
| Picture | 4 | 24 | Yes | All files |
| Table | 5 | 70 | Yes | All files |
| Endnote | 0 | 0 | - | No sample |
| Bookmark | 0 | 0 | - | No sample |

**Record Difference Analysis:**

1. **LIST_HEADER Size Difference**: Header/Footer/Footnote LIST_HEADER produces different sizes during serialization (34B -> 6B)
   - Cause: Some raw data omitted during serialization
   - Impact: Controls themselves are preserved but byte-level match rate decreases

2. **Level Shift**: Paragraph levels inside Header/Footer are shifted by +1
   - Cause: Parser interpretation difference due to LIST_HEADER size difference
   - Impact: Record structure identical, only level differs

3. **CTRL_HEADER Size Difference**: ColumnDef CTRL_HEADER shrinks from 16B to 8B
   - Cause: Extended attributes not preserved (occurs in multi-column documents)

4. **100% Match Possible**: 20250130-hongbo.hwp -- simple structure with only tables/images/shapes

**Notes:**
- Endnote and Bookmark are not verified due to absence in test samples
- Header/Footer LIST_HEADER serialization is a future improvement target
- Complex multi-column documents (hwp-multi-*) have low match rates but control preservation is normal

### 4.5 Field Controls (Field) -- Save Rules

**Applies to**: All field types including ClickHere (form fields), Hyperlink, Unknown (ctrl_id `%hlk`, `%clk`, `%unk`, etc.)

#### CTRL_HEADER Serialization Structure

```
CTRL_HEADER (level L+1)
  +- ctrl_id: u32 (4 bytes) -- '%hlk', '%clk', '%unk', etc.
  +- properties: u32 (4 bytes) -- see Table 155
  |   +- bit 15: Whether field content has been modified (0=initial state, 1=user modified)
  +- extra_properties: u8 (1 byte)
  +- command_len: u16 (2 bytes) -- command string length (WCHAR units)
  +- command: u16[command_len] -- UTF-16LE string
  +- field_id: u32 (4 bytes) -- Field identifier within document
  +- memo_index: u32 (4 bytes) -- * Not in spec, must be serialized
```

**Note**: `memo_index` is not in the official spec but **4 bytes must be serialized**. If omitted, Hancom reports CTRL_HEADER size mismatch -> file corruption (see errata section 18).

#### ClickHere (Form Field) command String Structure

```
Clickhere:set:{total_len}:Direction:wstring:{n}:{guide_text} HelpState:wstring:{n}:{memo} Name:wstring:{n}:{name}
```

| Field | Meaning | Example |
|------|------|------|
| Direction | Guide text (displayed in red italic) | `Direction:wstring:7:Enter here ` |
| HelpState | Memo/help text | `HelpState:wstring:43:Company name is...` |
| Name | Field name | `Name:wstring:2:Title ` |

**Save precautions**:
1. **Trailing space is required** after each wstring value -- do not call `trim_end()`
2. `{n}` is the string length (WCHAR count including spaces)
3. If HelpState is absent (no memo input), the entire field can be omitted

#### CTRL_DATA (Form Field Name Storage)

```
CTRL_DATA (level L+2, optional)
  +- ParameterSet (id=0x021B)
      +- ParameterItem (id=0x4000, type=String) -> field name
```

- Hancom **only updates CTRL_DATA** when changing field name, does not rebuild the command's Name:
- Name lookup priority: 1st: CTRL_DATA name -> 2nd: command Name: -> 3rd: command Direction:

#### FIELD_BEGIN / FIELD_END Serialization (within PARA_TEXT)

```
Within PARA_TEXT:
  ... | FIELD_BEGIN(0x0003, 8 WCHAR) | {field content text} | FIELD_END(0x0004, 1 WCHAR) | ...
```

- FIELD_BEGIN is an extended control character (8 WCHAR = 16 bytes)
- FIELD_END is an inline control character (1 WCHAR = 2 bytes)
- Empty field (initial state): FIELD_END immediately after FIELD_BEGIN
- control_mask **must** include bit 3 (FIELD_BEGIN) and bit 4 (FIELD_END)

#### properties bit 15 -- Initial State Handling

| bit 15 | Field Value | Rendering |
|--------|---------|--------|
| 0 (initial) | Empty or equals guide text | Display guide text (red italic) |
| 0 (initial) | Equals guide text (after memo input) | **Display guide text** -- text removal needed on document load |
| 1 (modified) | User-input text | Display as normal text |

- Hancom inserts guide text as field value when adding memos while keeping bit 15=0
- This project normalizes on load via `clear_initial_field_texts()`

#### TAB Extended Data Preservation

When TAB(0x0009) is included inside a field:
```
TAB code(2B) + additional 7 code units(14B) = 16 bytes
```
- Additional data contains tab width/type information
- The 7 code units must be preserved as-is during round-trip (filling with 0 causes tab spacing errors)

---

## 5. Final Summary

### Verified Items

| Step | Target | Reference File | Hancom Opens | Notes |
|------|------|----------|---------|------|
| 2 | Text only | - | Yes | 3 files normal |
| 3 | Table | 1by1-table.hwp | Yes | 21 records exact match |
| 4 | Image (Picture) | pic-01-as-text.hwp | Yes | 15 records 14/15 match |
| Extra | Image in table (Table+Picture) | pic-in-tb-01.hwp | Yes | 25 records 21/25 match |
| 5 | Others (Header/Footer/Footnote/Shape) | Round-trip | - | All controls preserved |
| - | Field (Field/ClickHere) | Round-trip | - | memo_index 4 bytes, command structure, CTRL_DATA preserved |

### Known Limitations

1. **Header/Footer LIST_HEADER**: Size difference during serialization compared to original (no functional impact)
2. **ColumnDef extended attributes**: Some extended attributes not preserved in multi-column documents
3. **Endnote/Bookmark**: No verification samples available (parser/serializer code exists)
4. **char_shape_id difference**: Occurs when using empty.hwp defaults for newly created documents (affects formatting only)
5. **Field command string**: Internal parsing is implemented, but when editing (rebuilding), wstring length fields and trailing spaces must be maintained precisely

---

**Written**: 2026-02-11
**Last updated**: 2026-03-16 -- Added field control (ClickHere/form field) save rules (section 4.5)
