# Task 3 — Final Report: HWP Parser Implementation

## Objective

Implement a parser that converts HWP 5.0 binary file data into an IR (Document Model). The `HwpDocument::from_bytes()` API should load actual HWP files, and the CLI should support document info inspection and SVG export.

## Step-by-Step Results

| Step | Description | Tests | Status |
|------|-------------|-------|--------|
| Step 1 | CFB container + Records + FileHeader | 88 -> 127 (+39) | Approved |
| Step 2 | DocInfo parsing (reference tables) | 127 -> 152 (+25) | Approved |
| Step 3 | BodyText parsing (paragraphs/text) + distribution document decryption | 152 -> 175 (+23) | Approved |
| Step 4 | Control parsing (tables/shapes/images/headers) + BinData | 175 -> 175 (+/-0, refactoring) | Approved |
| Step 5 | API integration + CLI + build verification + ctrl_id bug fix | 175 -> 177 (+2) | Approved |

## Implementation Results

### Parser Module (src/parser/)

| Module | File | Lines | Role |
|--------|------|-------|------|
| mod.rs | `src/parser/mod.rs` | 156 | Integrated parsing pipeline `parse_hwp()` |
| cfb_reader | `src/parser/cfb_reader.rs` | 245 | CFB container + decompression |
| header | `src/parser/header.rs` | 270 | FileHeader binary parsing |
| record | `src/parser/record.rs` | 224 | Record header parsing |
| tags | `src/parser/tags.rs` | 296 | HWP tag/control constants (ctrl_id BE encoding) |
| byte_reader | `src/parser/byte_reader.rs` | 250 | Binary reading utilities |
| crypto | `src/parser/crypto.rs` | 503 | Distribution document decryption (AES-128 ECB) |
| doc_info | `src/parser/doc_info.rs` | 773 | DocInfo reference table parsing |
| body_text | `src/parser/body_text.rs` | 920 | BodyText section/paragraph parsing |
| control | `src/parser/control.rs` | 893 | Control parsing (tables/shapes/images/headers) |
| bin_data | `src/parser/bin_data.rs` | 91 | BinData storage extraction |
| **Total** | **11 files** | **4,621** | |

### Parsing Pipeline

```
HWP bytes
  |
  +-- Open CFB container (cfb_reader)
  |
  +-- Parse FileHeader (header)
  |     +-- Version, compression, distribution, encryption flags
  |
  +-- Parse DocInfo (doc_info)
  |     +-- Fonts, CharShape, ParaShape, Styles, BorderFill, TabDef
  |
  +-- Parse BodyText sections (body_text + control)
  |     +-- [Distribution] Decrypt ViewText (crypto: AES-128 ECB)
  |     +-- Section definition (secd -> PageDef, FootnoteShape, PageBorderFill)
  |     +-- Column definition (cold -> ColumnDef)
  |     +-- Paragraph parsing (text + style references + line segments)
  |     +-- Control parsing (tables, shapes, images, headers/footers, footnotes/endnotes)
  |
  +-- Assemble Document IR
        |
        +-- WASM API (wasm_api.rs)
        |     +-- HwpDocument::from_bytes(data) -> parsing + pagination
        |     +-- render_page_svg() -> SVG rendering
        |     +-- document_info_json() -> JSON document info
        |
        +-- CLI (main.rs)
              +-- rhwp info <file.hwp>
              +-- rhwp export-svg <file.hwp>
```

### Coverage

| Item | Status | Notes |
|------|--------|-------|
| CFB container | Implemented | BodyText, ViewText, DocInfo, FileHeader |
| Decompression | Implemented | flate2 (zlib) |
| Distribution document decryption | Implemented | AES-128 ECB + LCG/XOR key generation |
| FileHeader | Implemented | Version, compression/encryption/distribution flags |
| DocInfo | Implemented | Fonts, CharShape, ParaShape, Styles, BorderFill, TabDef |
| Paragraph text | Implemented | UTF-16LE, inline/extended control codes |
| Paragraph style references | Implemented | CharShapeRef, LineSeg, RangeTag |
| Section/Column definitions | Implemented | PageDef, ColumnDef |
| Tables | Implemented | Table, Cell, recursive cell paragraph parsing |
| Shapes | Implemented | Line, Rectangle, Ellipse, Picture |
| Headers/Footers | Implemented | Recursive paragraph list parsing |
| Footnotes/Endnotes | Implemented | Recursive paragraph list parsing |
| BinData | Implemented | Embedded image extraction |
| Encrypted documents | Not supported | Returns ParseError::EncryptedDocument |
| Equations/Charts/OLE | Not supported | Future work |

## Bug Fix History

### ctrl_id() Byte Order Bug (Step 5)

**Root cause**: The `ctrl_id()` function in `tags.rs` used little-endian byte order, but HWP files store ctrl_id in big-endian string encoding.

```
Before fix: (s[0] as u32) | ((s[1] as u32) << 8) | ...     -> 0x64636573 ("secd" LE)
After fix:  ((s[0] as u32) << 24) | ((s[1] as u32) << 16) | ... -> 0x73656364 ("secd" BE)
```

**Impact**: All control IDs (secd, cold, tbl, etc.) mismatched -> SectionDef/PageDef not parsed -> SVG viewBox="0 0 0 0"
**Fix**: Single-line change in `tags.rs` normalized all control parsing

## Build and Test Results

| Item | Result |
|------|--------|
| Native build | Success (0 warnings) |
| All tests | **177 passed** (+89 from Task 2) |
| WASM build | Not verified (native verification complete) |

### Test Distribution

| Module | Tests |
|--------|-------|
| parser/cfb_reader | 9 |
| parser/header | 8 |
| parser/record | 7 |
| parser/tags | 4 |
| parser/byte_reader | 11 |
| parser/crypto | 4 |
| parser/doc_info | 12 |
| parser/body_text | 20 |
| parser/control | 14 |
| parser/mod | 2 |
| model/* | 6 |
| renderer/* | 55 |
| wasm_api | 15 |
| Other | 10 |
| **Total** | **177** |

## Real HWP File Verification

### Test Subjects

End-to-end verification with actual HWP files from the samples folder (`/home/edward/vsworks/shwp/samples/15yers/`). Compared against reference data (`/home/edward/vsworks/shwp/outputs/15years/`).

### info Command Results

```
File: Consolidated_Fiscal_Statistics(2014.8).hwp
Size: ... bytes
Version: 5.0.3.4
Compressed: Yes
Encrypted: No
Distribution: No
Sections: 1
Pages: 1
Fonts (Korean): HamchoromDotum, HamchoromBatang, ...
Styles: Body, Main text, Outline 1, ...
Total paragraphs: 17
```

### export-svg Results

| File | viewBox | Text | vs Reference |
|------|---------|------|-------------|
| hwp_table_test.svg | `0 0 793.69 1122.51` (A4) | 11 lines OK | Normal |
| Consolidated_Fiscal_Statistics(2014.8).svg | `0 0 793.71 1122.51` (A4) | 8 lines OK | Text matches reference .md |

### SVG Quality (Before/After ctrl_id Fix)

| Item | Before Fix | After Fix |
|------|-----------|-----------|
| viewBox | `0 0 0 0` | `0 0 793.71 1122.51` |
| width x height | 0 x 0 | 793.71 x 1122.51 (A4) |
| Text x-coordinate | 0 (no margins) | 94.49 (left margin applied) |
| Text y-coordinate | Overlapping | Distributed within page |

## Known Limitations (Renderer Task Scope)

| Item | Description |
|------|-------------|
| Font mapping | DocInfo font info not reflected in TextStyle (defaults to sans-serif) |
| Table rendering | Table handling not implemented in pagination/layout |
| Shape rendering | Shape handling not implemented in pagination/layout |
| Image rendering | SVG `<image>` tag generation not implemented |

## Overall Project Status

| Task | Status | Tests |
|------|--------|-------|
| 1. Development environment setup | Complete | - |
| 2. Viewer rendering engine design | Complete | 88 |
| 3. HWP parser implementation | **Complete** | **177** (+89) |

## Status

- Completion date: 2026-02-05
- Status: Pending approval
