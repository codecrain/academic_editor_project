# Task 3 — Implementation Plan: HWP Parser Implementation

## Parsing Order Principle

HWP 5.0 uses a **reference-based style system**. DocInfo stores lists of style objects (fonts, char shapes, para shapes, etc.), and each element in BodyText references them by ID (index).

```
Parsing order: CFB container → FileHeader → DocInfo (reference tables) → BodyText (body)
```

Without building the DocInfo reference table, BodyText cannot be correctly interpreted.

## Phase Structure (5 Phases)

### Phase 1: CFB Container + Record-Based Structure

Implement the foundation code to open the HWP file's OLE/CFB container, extract streams, and parse record headers.

- `src/parser/mod.rs` extension — Parser module restructuring
- `src/parser/cfb_reader.rs` creation — Open CFB container, extract streams
  - Identify `FileHeader`, `DocInfo`, `BodyText/Section{N}`, `BinData/` streams
  - Decompress compressed streams using flate2
  - Identify and extract distribution document (`ViewText/Section{N}`) streams
- `src/parser/record.rs` creation — Record header parsing
  - Tag ID (bits 0~9), Level (bits 10~19), Size (bits 20~31)
  - Extended size handling (additional 4 bytes when size == 4095)
  - `Record { tag_id, level, size, data: Vec<u8> }` struct
- `src/parser/tags.rs` creation — HWP tag constant definitions
  - HWPTAG_BEGIN (0x010), DocInfo tags, BodyText tags
- `src/parser/header.rs` extension — FileHeader binary parsing
  - Signature verification, version, flags (compression/encryption/distribution) parsing
  - Distribution document flag detection and handling

**Verification**: CFB stream extraction → record list parsing → FileHeader info output test

### Phase 2: DocInfo Parsing (Reference Table Construction)

Parse the style object lists referenced by BodyText.

- `src/parser/doc_info.rs` creation — DocInfo stream parsing
  - Record iteration → tag-based branching
  - ID mapping table construction (parse results serve as reference indices)
- Target tags:
  - `HWPTAG_ID_MAPPINGS` — Count per type
  - `HWPTAG_BIN_DATA` → `Vec<BinData>`
  - `HWPTAG_FACE_NAME` → `Vec<Vec<Font>>` (7 languages)
  - `HWPTAG_BORDER_FILL` → `Vec<BorderFill>`
  - `HWPTAG_CHAR_SHAPE` → `Vec<CharShape>`
  - `HWPTAG_TAB_DEF` → `Vec<TabDef>`
  - `HWPTAG_PARA_SHAPE` → `Vec<ParaShape>`
  - `HWPTAG_STYLE` → `Vec<Style>`
- `src/parser/byte_reader.rs` creation — Byte reading utilities
  - `read_u8`, `read_u16`, `read_u32`, `read_i16`, `read_i32`
  - `read_utf16_string(len)`, `read_hwp_string()` (2-byte length prefix + UTF-16LE)
  - `read_color_ref()` (4-byte BGR)

**Verification**: Parse DocInfo from sample HWP → verify font/char shape/para shape counts and contents

### Phase 3: BodyText Parsing — Paragraphs (Text + Style References)

Parse sections and paragraphs. Map paragraph text and style references to the IR.

- `src/parser/body_text.rs` creation — BodyText section parsing
  - Iterate per-section streams (`BodyText/Section0`, `Section1`, ...)
  - Distribution documents: read from `ViewText/Section{N}` streams (same record structure)
  - Parse record tree structure (level-based parent-child)
- Target tags:
  - `HWPTAG_PARA_HEADER` → Paragraph basic info (char count, control mask, para_shape_id, style_id)
  - `HWPTAG_PARA_TEXT` → Text (UTF-16LE, inline control code handling)
  - `HWPTAG_PARA_CHAR_SHAPE` → `Vec<CharShapeRef>` (position-based char_shape_id references)
  - `HWPTAG_PARA_LINE_SEG` → `Vec<LineSeg>` (line segment information)
  - `HWPTAG_PARA_RANGE_TAG` → `Vec<RangeTag>`
  - `HWPTAG_CTRL_HEADER` → Control type identification (ctrl_id 4 bytes)
  - `HWPTAG_PAGE_DEF` → PageDef (paper size, margins)
  - `HWPTAG_COLUMN_DEF` → ColumnDef
  - `HWPTAG_SECTION_DEF` → SectionDef
- Inline control code handling:
  - 0x0002: Section/column definition
  - 0x0003: Field start
  - 0x000B: Control insertion point (table, shape, picture, etc.)
  - 0x000D: Paragraph break
  - 0x0018: Tab
  - Other special characters → ignore or replace with space

**Verification**: Extract paragraph text from sample HWP, verify char shape reference mapping

### Phase 4: BodyText Parsing — Controls (Tables, Shapes, Pictures, Headers/Footers)

Parse control objects inserted within paragraphs.

- `src/parser/control.rs` creation — Control parser
  - Branching by ctrl_id: `tbl ` (table), `gso ` (drawing), `pic ` (picture), `head` (header), `foot` (footer), etc.
- Target items:
  - **Table**: `HWPTAG_TABLE` → Table properties, `HWPTAG_LIST_HEADER` → Cell, recursive parsing of paragraphs within cells
  - **Shape**: `HWPTAG_SHAPE_COMPONENT` → CommonObjAttr, individual shape properties
    - Line (`lin `), Rectangle (`rec `), Ellipse (`ell `), Arc (`arc `), Polygon (`pol `), Curve (`cur `), Group (`grp `)
  - **Picture**: `HWPTAG_SHAPE_COMPONENT` + image properties → Picture, bin_data_id reference
  - **Header/Footer**: `HWPTAG_LIST_HEADER` → Recursive paragraph list parsing
  - **TextBox**: Text within shapes → Recursive parsing of TextBox.paragraphs
- `src/parser/bin_data.rs` creation — Image extraction from BinData storage
  - Read `BinData/BIN{XXXX}.{ext}` streams
  - Store byte data in BinDataContent

**Verification**: Parse HWP with tables/shapes/pictures → verify structural accuracy

### Phase 5: API Integration + CLI + Build Verification

Connect the parser to the WASM API and CLI, and perform integration tests.

- `src/wasm_api.rs` modification — Connect `from_bytes()` to actual parser
  - Replace `Document::default()` → actual parse result
  - Error handling (return HwpError on parse failure)
- `src/main.rs` modification — Use actual parse results in CLI
  - Replace `create_empty()` → `from_bytes(&data)`
  - `info` command: output actual document info (version, section count, fonts, styles)
  - `export-svg` command: connect actual rendering pipeline
- Integration tests
  - Empty document, text document, document with tables, document with shapes
  - Parse → pagination → SVG rendering end-to-end verification
- Build verification (native, test, WASM)

**Verification**: Verify `rhwp info sample.hwp`, `rhwp export-svg sample.hwp` actually work

## Expected Files to Create/Modify

| File | Phase | Description |
|------|-------|-------------|
| `src/parser/mod.rs` | 1 | Parser module reorganization |
| `src/parser/cfb_reader.rs` | 1 | CFB container + decompression |
| `src/parser/record.rs` | 1 | Record header parsing |
| `src/parser/tags.rs` | 1 | HWP tag constants |
| `src/parser/header.rs` | 1 | FileHeader binary parsing extension |
| `src/parser/byte_reader.rs` | 2 | Byte reading utilities |
| `src/parser/doc_info.rs` | 2 | DocInfo reference table parsing |
| `src/parser/body_text.rs` | 3 | Section/paragraph parsing |
| `src/parser/control.rs` | 4 | Control parsing (tables/shapes/pictures) |
| `src/parser/bin_data.rs` | 4 | BinData image extraction |
| `src/wasm_api.rs` | 5 | Parser integration |
| `src/main.rs` | 5 | CLI actual parsing integration |

## Status

- Written: 2026-02-05
- Status: Approved
- Note: Distribution document (ViewText) support included in scope
