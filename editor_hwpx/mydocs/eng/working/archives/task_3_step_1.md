# Task 3 - Step 1 Completion Report: CFB Container + Record-Based Structure

## Work Performed

### Files Created/Modified

| File | Description |
|------|-------------|
| `src/parser/tags.rs` | HWP 5.0 tag constants (DocInfo 17, BodyText 30, inline codes 9, control IDs 18) |
| `src/parser/record.rs` | Record header parsing (tag ID, level, size, extended size) |
| `src/parser/cfb_reader.rs` | CFB container reading, stream extraction, decompression |
| `src/parser/header.rs` | FileHeader binary parsing (signature, version, flags) |
| `src/parser/mod.rs` | Parser module structure redesign |

### Implementation Details

#### tags.rs - HWP Tag Constants

- Offset definitions based on `HWPTAG_BEGIN` (0x010)
- DocInfo tags: DOCUMENT_PROPERTIES ~ TRACKCHANGE (17)
- BodyText tags: PARA_HEADER ~ CHART_DATA (30)
- Inline control codes: CHAR_SECTION_COLUMN_DEF ~ CHAR_FIXED_WIDTH_SPACE (9)
- Control IDs: CTRL_SECTION_DEF ~ CTRL_HIDDEN_COMMENT (18)
- `tag_name()`, `ctrl_name()` debugging helper functions
- `ctrl_id()` compile-time 4-byte ASCII -> u32 conversion

#### record.rs - Record Parsing

- Record header structure: bits 0~9 (tag), 10~19 (level), 20~31 (size)
- Extended size: If size field == 0xFFF, next 4 bytes are the actual size
- `Record::read_all()`: Byte stream -> record list parsing
- `RecordError`: IoError, UnexpectedEof error types

#### cfb_reader.rs - CFB Container

- Open OLE/CFB container using `cfb` crate
- Stream extraction: FileHeader, DocInfo, BodyText/Section{N}, ViewText/Section{N}
- Distribution documents: ViewText stream detection (returns encrypted raw data)
- Decompression using `flate2` crate (raw deflate -> zlib fallback)
- BinData stream listing/reading
- Automatic section count calculation

#### header.rs - FileHeader Binary Parsing

- Full 256-byte FileHeader parsing
- Signature verification (NULL padding handling)
- Version parsing (revision, build, minor, major LE)
- 11 property flag bit field parsing
- Distribution document flag (bit 2) detection

### Distribution Document Handling Design

Analyzed decryption flow from reference source (`/home/edward/vsworks/shwp/hwp_semantic/crypto.py`):

```
DocInfo -> HWPTAG_DISTRIBUTE_DOC_DATA (256 bytes)
  -> LCG(MSVC) + XOR decryption -> plaintext data
  -> AES-128 key extraction (SHA-1 hash based)
  -> ViewText/Section{N} -> AES-128 ECB decryption
  -> zlib decompression -> record data
```

Step 1 implements ViewText stream detection and raw data extraction.
Actual decryption to be implemented in step 2 (after DocInfo DISTRIBUTE_DOC_DATA parsing).

### Build Verification

| Target | Result |
|--------|--------|
| Native (cargo build) | Success |
| Tests (cargo test) | **110 passed** (88 -> 110, +22) |
| WASM (wasm-pack build) | Success |

### Added Tests (22)

| Module | Test | Verified Content |
|--------|------|-----------------|
| tags | test_tag_values | Tag ID value verification |
| | test_ctrl_id | Control ID byte conversion |
| | test_tag_name | Tag name conversion |
| | test_ctrl_name | Control name conversion |
| record | test_read_single_record | Single record parsing |
| | test_read_multiple_records | Multiple record parsing |
| | test_extended_size_record | Extended size record |
| | test_record_display | Display format |
| | test_empty_data | Empty data |
| | test_zero_size_record | Zero-size record |
| | test_truncated_data_error | Insufficient data error |
| cfb_reader | test_decompress_empty | Empty deflate decompression |
| | test_decompress_invalid_data | Invalid data error |
| | test_decompress_real_data | Actual compression/decompression verification |
| header | test_hwp_signature | Signature constant |
| | test_parse_valid_header | Valid header parsing |
| | test_parse_distribution_document | Distribution document flag |
| | test_parse_encrypted_document | Encrypted document flag |
| | test_parse_all_flags | All flags verification |
| | test_too_short_data | Insufficient size error |
| | test_invalid_signature | Signature mismatch error |
| | test_version_display | Version string format |

## Status

- Completion date: 2026-02-05
- Status: Approved
