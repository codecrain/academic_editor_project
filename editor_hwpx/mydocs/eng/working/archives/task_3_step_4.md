# Task 3 - Step 4 Completion Report: Control Parsing (Tables, Shapes, Pictures, Headers/Footers)

## Work Performed

### Files Created/Modified

| File | Lines | Description |
|------|-------|-------------|
| `src/parser/control.rs` | ~610 | Control parsing (tables, shapes, pictures, headers/footers, footnotes/endnotes, hidden comments, simple controls) |
| `src/parser/bin_data.rs` | ~91 | BinData storage extraction utility |
| `src/parser/body_text.rs` | Modified | parse_paragraph/parse_paragraph_list made public, control delegation |
| `src/parser/mod.rs` | +2 | control, bin_data module registration |

### Implementation Details

#### control.rs - Control Parsing Dispatcher

`parse_control(ctrl_id, ctrl_data, child_records) -> Control`

Receives delegation from body_text.rs `parse_ctrl_header` for controls other than secd/cold.

##### Supported Controls

| ctrl_id | Control | Parsing Function | Output |
|---------|---------|-----------------|--------|
| `tbl ` | Table | `parse_table_control()` | `Control::Table(Table)` |
| `gso ` | Drawing object | `parse_gso_control()` | `Control::Shape(CommonObjAttr, ShapeObject)` |
| `daeh` | Header | `parse_header_control()` | `Control::Header(Header)` |
| `toof` | Footer | `parse_footer_control()` | `Control::Footer(Footer)` |
| `fn  ` | Footnote | `parse_footnote_control()` | `Control::Footnote(Footnote)` |
| `en  ` | Endnote | `parse_endnote_control()` | `Control::Endnote(Endnote)` |
| `tcmt` | Hidden comment | `parse_hidden_comment_control()` | `Control::HiddenComment(HiddenComment)` |
| `atno` | Auto number | `parse_auto_number()` | `Control::AutoNumber(AutoNumber)` |
| `nwno` | New number | `parse_new_number()` | `Control::NewNumber(NewNumber)` |
| `pgnp` | Page number position | `parse_page_num_pos()` | `Control::PageNumberPos(PageNumberPos)` |
| `pghi` | Page hide | `parse_page_hide()` | `Control::PageHide(PageHide)` |
| `bokm` | Bookmark | `parse_bookmark()` | `Control::Bookmark(Bookmark)` |
| Other | Unregistered | - | `Control::Unknown(UnknownControl)` |

##### Table Parsing Structure

```
CTRL_HEADER (tbl) -> parse_table_control
  |-- HWPTAG_TABLE -> parse_table_record (row count, col count, cell spacing, border)
  |-- HWPTAG_LIST_HEADER x N -> parse_cell (each cell)
       |-- HWPTAG_PARA_HEADER x M -> parse_paragraph_list (paragraphs within cell)
```

- `parse_table_record()`: row_count, col_count, cell_spacing, padding, border_fill_id
- `parse_cell()`: row_addr, col_addr, row_span, col_span, width, height, padding, border_fill_id, vert_align + internal paragraphs

##### Shape/Picture Parsing Structure

```
CTRL_HEADER (gso) -> parse_gso_control
  |-- parse_common_obj_attr (common attributes: position, size, wrapping)
  |-- HWPTAG_SHAPE_COMPONENT -> parse_shape_component_attr
       |-- HWPTAG_SHAPE_COMPONENT_LINE -> LineShape
       |-- HWPTAG_SHAPE_COMPONENT_RECTANGLE -> RectangleShape
       |-- HWPTAG_SHAPE_COMPONENT_PICTURE -> Picture
```

- `parse_common_obj_attr()`: Extracts attribute bits, vertical/horizontal reference, wrap, position/size from ctrl_data
- `parse_shape_component_attr()`: offset_x, offset_y, rotation, scale_x, scale_y
- `parse_picture()`: bin_data_id, border info, crop info
- `parse_line_shape_data()`: start_x, start_y, end_x, end_y
- `parse_rect_shape_data()`: round_ratio

##### Header/Footer, Footnote/Endnote Parsing

Uses `find_list_header_paragraphs()` helper to recursively parse paragraphs under LIST_HEADER:

```
CTRL_HEADER (daeh/toof/fn/en) -> parse_header/footer/footnote_control
  |-- HWPTAG_LIST_HEADER
       |-- HWPTAG_PARA_HEADER x N -> parse_paragraph_list
```

#### bin_data.rs - BinData Storage Extraction

| Function | Description |
|----------|-------------|
| `extract_all_bin_data()` | Extract all streams under CFB BinData/ |
| `bin_data_storage_name()` | bin_id -> "BIN{XXXX}.{ext}" conversion (XXXX = ID+1, hex 4 digits) |
| `read_bin_data_by_name()` | Read specific named BinData |

#### body_text.rs Changes

- `parse_paragraph()`: Changed from private to `pub fn` (reused in control.rs)
- `parse_paragraph_list()`: New `pub fn`, parses paragraphs by PARA_HEADER units from record array
- `parse_ctrl_header()`: Delegates controls other than secd/cold to `super::control::parse_control()`

### Architecture Design

```
body_text.rs                    control.rs
  parse_ctrl_header()
    |-- secd -> SectionDef
    |-- cold -> ColumnDef
    |-- other --> parse_control()
                    |-- tbl  -> parse_table_control
                    |-- gso  -> parse_gso_control
                    |-- daeh -> parse_header_control
                    |-- ...
                    |-- _    -> Unknown

                  | (recursive call)
                  body_text::parse_paragraph_list()
                    -> Paragraphs inside cells/headers/footers/footnotes
```

## Build Verification

| Item | Result |
|------|--------|
| Native build | Success (0 warnings) |
| All tests | **175 passed** (+13, compared to step 3) |
| WASM build | Success |

### Test Increase Breakdown

| Module | Step 3 | Step 4 | Increase |
|--------|--------|--------|----------|
| parser::control | - | 10 | +10 |
| parser::bin_data | - | 2 | +2 |
| parser::body_text | 19 | 20 | +1 |
| Other | 143 | 143 | 0 |
| **Total** | **162** | **175** | **+13** |

### New Test List

| Test | Verified Content |
|------|-----------------|
| test_parse_table_basic | Basic table attribute parsing |
| test_parse_header_control | Header parsing (LIST_HEADER + paragraphs) |
| test_parse_footer_control | Footer parsing |
| test_parse_footnote_control | Footnote parsing |
| test_parse_auto_number | Auto number parsing |
| test_parse_bookmark | Bookmark parsing |
| test_parse_page_hide | Page hide parsing |
| test_parse_hidden_comment | Hidden comment parsing |
| test_parse_common_obj_attr | Common object attribute parsing |
| test_parse_control_dispatch | ctrl_id dispatch (including Unknown) |
| test_bin_data_storage_name | BinData storage name generation |
| test_bin_data_content | BinDataContent struct |
| test_parse_table_control_delegation | body_text -> control.rs delegation verification |

## Next Step

Step 5: API connection + CLI + build verification
- Connect parser to wasm_api.rs (CFB -> Document parsing pipeline)
- Connect main.rs CLI
- Integration testing and final build verification

## Status

- Completion date: 2026-02-05
- Status: Approved
