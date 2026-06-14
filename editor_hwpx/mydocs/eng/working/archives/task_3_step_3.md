# Task 3 - Step 3 Completion Report: BodyText Paragraph Parsing

## Work Performed

### Files Created/Modified

| File | Lines | Description |
|------|-------|-------------|
| `src/parser/body_text.rs` | 866 | BodyText section/paragraph parsing (record tree -> Section/Paragraph) |
| `src/parser/mod.rs` | +2 | body_text module registration |
| `src/model/document.rs` | fix | Added Clone derive to SectionDef |

### Implementation Details

#### body_text.rs - Section/Paragraph Parsing

##### Record Tree Traversal

HWP records form parent-child relationships via the level field:
```
PARA_HEADER (level 0) -> Paragraph
  PARA_TEXT (level 1)       -> text
  PARA_CHAR_SHAPE (level 1) -> char_shapes
  PARA_LINE_SEG (level 1)   -> line_segs
  PARA_RANGE_TAG (level 1)  -> range_tags
  CTRL_HEADER (level 1)     -> controls
    PAGE_DEF (level 2)
    FOOTNOTE_SHAPE (level 2)
    ...
```

Recursive decomposition via `parse_body_text_section()` -> `parse_paragraph()` -> `parse_ctrl_header()`.

##### Text Parsing (UTF-16LE + Control Characters)

- HWP text is stored in UTF-16LE
- 0x0000~0x001F range are control characters
- **Extended controls** (8 code units = 16 bytes): 0x0002 (section/column), 0x0003 (field start), 0x000B (table/shape), etc.
- **Inline controls** (1 code unit = 2 bytes): 0x0009 (tab), 0x000A (line break), 0x000D (paragraph end), etc.
- Surrogate pair handling for Unicode outside BMP

##### Parsing Function List

| Function | Input | Output |
|----------|-------|--------|
| `parse_body_text_section()` | Record bytes | `Section` |
| `parse_paragraph()` | Record group | `Paragraph` |
| `parse_para_header()` | PARA_HEADER data | `Paragraph` base fields |
| `parse_para_text()` | PARA_TEXT data | `String` |
| `parse_para_char_shape()` | PARA_CHAR_SHAPE | `Vec<CharShapeRef>` |
| `parse_para_line_seg()` | PARA_LINE_SEG | `Vec<LineSeg>` |
| `parse_para_range_tag()` | PARA_RANGE_TAG | `Vec<RangeTag>` |
| `parse_ctrl_header()` | CTRL_HEADER group | `Control` |
| `parse_section_def()` | secd data | `SectionDef` |
| `parse_column_def_ctrl()` | cold data | `ColumnDef` |
| `parse_page_def()` | PAGE_DEF | `PageDef` |
| `parse_footnote_shape_record()` | FOOTNOTE_SHAPE | `FootnoteShape` |
| `parse_page_border_fill()` | PAGE_BORDER_FILL | `PageBorderFill` |

##### Control Handling (Step-by-Step Division)

- **Step 3 implemented**: `SectionDef(secd)`, `ColumnDef(cold)` -> Full parsing
- **Step 4 reserved**: `Table(tbl)`, `Shape(gso)`, `Header(head)`, `Footer(foot)`, etc. -> `Control::Unknown(ctrl_id)` stub

### Model Changes

- `SectionDef`: `#[derive(Debug, Default)]` -> `#[derive(Debug, Clone, Default)]` added
  - Needed when copying SectionDef to Section in `parse_body_text_section()`

## Build Verification

| Item | Result |
|------|--------|
| Native build | Success (0 warnings) |
| All tests | **162 passed** (+19, compared to step 2) |
| WASM build | Success |

### Test Increase Breakdown

| Module | Step 2 | Step 3 | Increase |
|--------|--------|--------|----------|
| parser::body_text | - | 19 | +19 |
| Other | 143 | 143 | 0 |
| **Total** | **143** | **162** | **+19** |

### New Test List

| Test | Verified Content |
|------|-----------------|
| test_parse_para_text_simple | English text parsing |
| test_parse_para_text_korean | Korean text parsing |
| test_parse_para_text_with_tab | Tab character handling |
| test_parse_para_text_with_extended_ctrl | Extended control skipping |
| test_parse_para_text_empty | Empty paragraph |
| test_is_extended_ctrl_char | Control character classification |
| test_parse_para_char_shape | CharShapeRef parsing |
| test_parse_para_line_seg | LineSeg parsing |
| test_parse_para_range_tag | RangeTag parsing |
| test_parse_page_def | A4 paper settings |
| test_parse_page_def_landscape | Landscape orientation |
| test_parse_section_simple | Single paragraph section |
| test_parse_section_multiple_paragraphs | Multiple paragraphs |
| test_parse_section_with_section_def | Section with SectionDef |
| test_parse_section_with_column_def | Section with ColumnDef |
| test_parse_unknown_control | Unimplemented control stub |
| test_parse_para_header_fields | PARA_HEADER fields |
| test_parse_page_border_fill | Page border/background |
| test_parse_empty_section | Empty section |

## Next Step

Step 4: Control parsing (tables, shapes, pictures, headers/footers)

## Status

- Completion date: 2026-02-05
- Status: Approved
