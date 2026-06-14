# Task 3 - Execution Plan: HWP Parser Implementation

## Goal

Implement a parser that converts HWP 5.0 file binary data into the IR (Document Model) designed in Task 2. After parser completion, actual HWP files should be loadable through the `HwpDocument::from_bytes()` API.

## Current State Analysis

### Already Completed

| Module | Status | Notes |
|--------|--------|-------|
| IR Data Model (src/model/) | Complete | 12 files, 31 tests |
| Rendering Engine (src/renderer/) | Complete | 8 files, 44 tests |
| WASM API (src/wasm_api.rs) | Complete | 12 tests |
| External Crates (cfb, flate2, byteorder) | Ready | Registered in Cargo.toml |

### Needs Implementation

| Item | Description |
|------|-------------|
| CFB Container Parsing | Extract streams from OLE structure (using cfb crate) |
| Stream Decompression | Decode FLATE compressed streams (using flate2 crate) |
| File Header Parsing | Parse version, flags (compression/encryption/distribution) |
| DocInfo Parsing | ID mapping (fonts, char shapes, para shapes, borders, styles) |
| BodyText Parsing | Section/paragraph/control/table/shape record parsing |
| BinData Extraction | Extract embedded image/OLE binary data |

## HWP 5.0 File Structure Overview

```
HWP File (OLE/CFB Container)
+-- FileHeader          (256 bytes, uncompressed)
+-- DocInfo             (record stream, compressible)
+-- BodyText/
|   +-- Section0        (record stream, compressible)
|   +-- Section1
|   +-- ...
+-- BinData/
|   +-- BIN0001.png
|   +-- ...
+-- PrvText             (preview text)
+-- PrvImage            (preview image)
+-- DocOptions/         (other options)
```

### Record Structure

```
+--------------------------------------+
| Record Header (4 bytes)               |
|  bits 0~9:   Tag ID (0~1023)         |
|  bits 10~19: Level (0~1023)          |
|  bits 20~31: Size (0~4095)           |
|  size == 4095 => additional 4-byte size|
+--------------------------------------+
| Record Data (variable length)         |
+--------------------------------------+
```

## Implementation Scope

### First Pass (This Task)

- FileHeader parsing (version, flags)
- DocInfo: fonts, char shapes, para shapes, border fills, styles
- BodyText: paragraphs (text, char shape refs, line segments), section def, column def
- Controls: tables, rectangles, lines, ellipses, pictures
- BinData: embedded image extraction
- Headers/Footers

### Not Supported (Future)

- Encrypted documents
- Distribution documents
- Equations, charts, OLE objects
- Footnotes/Endnotes (structure is defined)
- Macros, forms

## Expected Results

- Load actual HWP files with `HwpDocument::from_bytes(&data)`
- Output document info with `rhwp info sample.hwp` CLI command
- Export SVG with `rhwp export-svg sample.hwp` CLI command (basic text/tables/shapes)
- HWP parser unit tests and integration tests

## Status

- Date written: 2026-02-05
- Status: Approved
