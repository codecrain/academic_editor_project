# Task 3 - Step 2 Completion Report: DocInfo Parsing + Distribution Document Decryption

## Work Performed

### Files Created/Modified

| File | Lines | Description |
|------|-------|-------------|
| `src/parser/byte_reader.rs` | 250 | Binary data reading utility (LE integers, UTF-16LE strings, colors) |
| `src/parser/crypto.rs` | 503 | Distribution document decryption (MSVC LCG + XOR, AES-128 ECB, ViewText pipeline) |
| `src/parser/doc_info.rs` | 773 | DocInfo stream parsing -> reference table construction (9 tags handled) |
| `src/parser/mod.rs` | +3 | New module registration (byte_reader, crypto, doc_info) |
| `src/parser/cfb_reader.rs` | fix | Unused import cleanup |
| `src/parser/record.rs` | fix | Unused import cleanup |

### Implementation Details

#### byte_reader.rs - Binary Reading Utility

- `ByteReader<'a>` - Cursor-based byte stream reader
- Little-Endian integer reading: `read_u8/u16/u32/i8/i16/i32/i64`
- `read_hwp_string()` - 2-byte length prefix + UTF-16LE string reading
- `read_utf16_string(char_count)` - Fixed-length UTF-16LE string reading
- `read_color_ref()` - 4-byte BGR color value reading
- `read_bytes(len)`, `skip(n)`, `read_remaining()` - General byte operations
- 13 tests

#### crypto.rs - Distribution Document Decryption

ViewText/Section{N} decryption pipeline:

```
ViewText/Section{N} structure:
|-- DISTRIBUTE_DOC_DATA record (256 bytes)
|   -> First 4 bytes = LCG seed
|   -> Decrypt remaining 252 bytes with LCG(MSVC) + XOR
|   -> offset = (seed & 0xF) + 4
|   -> AES key = decrypted_data[offset..offset+16]
|-- Encrypted body (AES-128 ECB)
    -> Decrypt with AES key
    -> zlib/deflate decompression
    -> Normal record data
```

- `MsvcLcg` - MSVC-compatible LCG (a=214013, c=2531011, m=2^32)
- `decrypt_distribute_doc_data()` - LCG+XOR 256-byte decryption
- `extract_aes_key()` - Offset calculation then 16-byte AES key extraction
- Pure Rust AES-128 ECB implementation (no external crypto crates, WASM compatible)
  - S-Box, Inverse S-Box, RCON tables
  - KeyExpansion, InvSubBytes, InvShiftRows, InvMixColumns
  - NIST AES-128 test vector verification
- `decrypt_viewtext_section()` - Full ViewText decryption pipeline
- 10 tests

#### doc_info.rs - DocInfo Reference Table Parsing

- `parse_doc_info(data) -> (DocInfo, DocProperties)` - Main entry point
- Record tags handled (9):
  - `DOCUMENT_PROPERTIES` -> Section count, starting page/footnote/endnote numbers
  - `ID_MAPPINGS` -> Count per type (fonts 7 languages, border fills, char shapes, tabs, para shapes, styles, etc.)
  - `BIN_DATA` -> Binary data entries (type, extension, compression method, status)
  - `FACE_NAME` -> Font name + alternate font (distributed across 7 language categories)
  - `BORDER_FILL` -> 4-side border + diagonal + fill (solid/gradient/image)
  - `CHAR_SHAPE` -> Character size, 7-language font IDs, color, underline, bold, italic
  - `TAB_DEF` -> Tab entry list (position, type, leader)
  - `PARA_SHAPE` -> Alignment, indent, line spacing, margins
  - `STYLE` -> Style name + CharShape/ParaShape reference IDs
- FACE_NAME language category distribution logic: Assigned in order of 7 languages based on ID_MAPPINGS font_counts
- 8 tests

### Design Decisions

1. **Pure Rust AES Implementation**: External crypto crates (ring, aes, etc.) may cause C compilation dependencies or compatibility issues during WASM builds, so implemented in pure Rust
2. **Reference Source-Based Implementation**: Cross-verified against official Hancom spec (`distribution_spec.md`) and Python reference implementation (`reader.py`, `crypto.py`) for accuracy
3. **Error-Tolerant Parsing**: Uses default values on partial field read failure (`unwrap_or(default)`) -> Maximum parsing even for incomplete files

## Build Verification

| Item | Result |
|------|--------|
| Native build | Success (0 warnings) |
| All tests | **143 passed** (+33, compared to step 1) |
| WASM build | Success |

### Test Increase Breakdown

| Module | Step 1 | Step 2 | Increase |
|--------|--------|--------|----------|
| parser::byte_reader | - | 13 | +13 |
| parser::crypto | - | 10 | +10 |
| parser::doc_info | - | 8 | +8 |
| parser (existing) | 22 | 24 | +2 (import cleanup) |
| Other (model, renderer, wasm_api) | 88 | 88 | 0 |
| **Total** | **110** | **143** | **+33** |

## Next Step

Step 3: BodyText paragraph parsing (text + style references)

## Status

- Completion date: 2026-02-05
- Status: Approved
