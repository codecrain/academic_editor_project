# Task 23 - Stage 3 Completion Report: BodyText Serialization (Paragraphs, Text, Controls)

## Completed Items

### 3-1. `src/serializer/body_text.rs` (~380 lines)
Module that serializes Section/Paragraph into a record stream.

**Key functions:**
| Function | Role |
|----------|------|
| `serialize_section(section)` | Section → record byte stream (top-level) |
| `serialize_paragraph_list(paragraphs, base_level, records)` | Paragraph list → records (for recursive calls in cells, headers, etc.) |
| `serialize_paragraph(para, base_level, records)` | Single paragraph → records |
| `serialize_para_header(para)` | PARA_HEADER data (char_count, control_mask, shape_id, style_id, break_type) |
| `serialize_para_text(para)` | PARA_TEXT — text + controls → UTF-16LE |
| `serialize_para_char_shape(char_shapes)` | PARA_CHAR_SHAPE — (start_pos, char_shape_id) pairs |
| `serialize_para_line_seg(line_segs)` | PARA_LINE_SEG — 36 bytes/line |
| `serialize_para_range_tag(range_tags)` | PARA_RANGE_TAG — 12 bytes/tag |
| `control_char_code(ctrl)` | Control enum → PARA_TEXT control character code mapping |

**PARA_TEXT Serialization Algorithm:**
- Uses gaps between `char_offsets` (8 code-unit difference) to determine control character positions
- Tab (0x0009), extended controls (0x000B, etc.): 8 code-units (control code + 7 padding)
- Line break (0x000A), non-breaking space (0x0018): 1 code-unit
- Paragraph end (0x000D): Automatically appended at the end
- Regular characters including surrogate pairs: UTF-16LE encoding

### 3-2. `src/serializer/control.rs` (~570 lines)
Module that serializes all Control enum variants into CTRL_HEADER records (+child records).

**Supported controls:**
| Control | Function | Notes |
|---------|----------|-------|
| SectionDef | `serialize_section_def` | + PAGE_DEF, FOOTNOTE_SHAPE x2, PAGE_BORDER_FILL |
| ColumnDef | `serialize_column_def` | Includes attr reconstruction |
| Table | `serialize_table` | + Caption + HWPTAG_TABLE + Cell recursive |
| Cell | `serialize_cell` | LIST_HEADER + cell data + child paragraphs |
| Header/Footer | `serialize_header_control/footer_control` | LIST_HEADER + paragraphs |
| Footnote/Endnote | `serialize_footnote/endnote` | LIST_HEADER + paragraphs |
| HiddenComment | `serialize_hidden_comment` | LIST_HEADER + paragraphs |
| AutoNumber | `serialize_auto_number` | Simple CTRL_HEADER |
| NewNumber | `serialize_new_number` | Simple CTRL_HEADER |
| PageNumPos | `serialize_page_num_pos` | Simple CTRL_HEADER |
| PageHide | `serialize_page_hide` | Simple CTRL_HEADER |
| Bookmark | `serialize_bookmark` | CTRL_HEADER + CTRL_DATA |
| Picture | `serialize_picture_control` | gso + SHAPE_COMPONENT + SHAPE_COMPONENT_PICTURE |
| Shape (all) | `serialize_shape_control` | Line, Rectangle, Ellipse, Arc, Polygon, Curve, Group |
| Unknown | Minimal stub | Only CTRL_HEADER output |

### 3-3. `src/serializer/mod.rs` Update
Added `pub mod body_text;` and `pub mod control;`.

## Test Results

```
test result: ok. 319 passed; 0 failed; 0 ignored
```

| Category | New Tests | Description |
|----------|-----------|-------------|
| body_text | 13 | Round-trip: simple text, Korean, tab, line break, empty paragraph, multiple paragraphs, char_shape, line_seg, range_tag, control characters, break_type, control code mapping |
| control | 8 | Round-trip: SectionDef, ColumnDef, Table, AutoNumber, Bookmark, PageHide, Footnote, Header |

Existing 299 tests + 20 new = 319 total all passed.
