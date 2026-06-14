# Task 3 - Step 5 Completion Report: API Connection + CLI + Build Verification

## Work Performed

### Files Created/Modified

| File | Lines | Description |
|------|-------|-------------|
| `src/parser/mod.rs` | +110 | `parse_hwp()` unified parsing function + `ParseError` error type |
| `src/wasm_api.rs` | Modified | `from_bytes()` connected to actual parser (TODO removed) |
| `src/main.rs` | Modified | `export-svg`, `info` commands connected to actual parsing |
| `src/parser/tags.rs` | Modified | `ctrl_id()` byte order fix (LE->BE) |

### Implementation Details

#### parse_hwp() - Unified Parsing Pipeline

Top-level parsing function added to `src/parser/mod.rs`:

```rust
pub fn parse_hwp(data: &[u8]) -> Result<Document, ParseError>
```

Parsing order:
1. **Open CFB container** -> `CfbReader::open(data)`
2. **Parse FileHeader** -> `parse_file_header()` -> version, compression, distribution flags
3. **Parse DocInfo** -> `parse_doc_info()` -> reference tables (fonts, char shapes, para shapes, styles)
4. **Parse BodyText per section**:
   - Normal documents: `read_body_text_section()` -> `parse_body_text_section()`
   - Distribution documents: `read_body_text_section()` -> `decrypt_viewtext_section()` -> `parse_body_text_section()`
5. **Assemble Document IR** -> Combine all results into `Document` struct

Error handling:
- `ParseError` enum unifies all sub-errors (CFB, Header, DocInfo, BodyText, Crypto)
- Encrypted documents (`encrypted`) return `ParseError::EncryptedDocument`
- Individual section parse failures replaced with empty sections (prevents total document parse abort)

#### ctrl_id() Byte Order Bug Fix

**Root cause**: `ctrl_id()` function in `tags.rs` used little-endian byte order, but HWP files store ctrl_id in big-endian string encoding.

```
Before fix: (s[0] as u32) | ((s[1] as u32) << 8) | ...     -> 0x64636573 ("secd" LE)
After fix:  ((s[0] as u32) << 24) | ((s[1] as u32) << 16) | ... -> 0x73656364 ("secd" BE)
```

This bug caused **all control IDs to mismatch** including 'secd' (SectionDef), 'cold' (ColumnDef), 'tbl ' (table):
- SectionDef not parsed -> PageDef defaults to 0 -> SVG viewBox="0 0 0 0"
- ColumnDef not parsed
- Table delegated to control.rs but ctrl_id mismatch -> Unknown processing

**Impact scope**: 1 line fix in `tags.rs` normalized all control parsing

#### wasm_api.rs - from_bytes() Connection

```
Before: Signature verification + Document::default() (TODO stub)
After:  crate::parser::parse_hwp(data) call -> uses actual parsing result
```

- `parse_hwp()` errors -> converted to `HwpError::InvalidFile`
- On parse success, automatic pagination (`paginate()`)

#### main.rs - CLI Actual Parsing Connection

##### export-svg command
```
Before: fs::read() -> create_empty() (empty document)
After:  fs::read() -> from_bytes(&data) -> actual HWP parsing -> SVG export
```

##### info command
```
Before: metadata() -> create_empty() (dummy info)
After:  fs::read() -> from_bytes(&data) -> actual document info output
```

Output information:
- File path, size
- HWP version (major.minor.build.revision)
- Compression/encryption/distribution status
- Section count, page count
- Font list (by language)
- Style list
- Total paragraph count

## Full Parsing Pipeline

```
HWP bytes
  |
  |-- Open CFB container (cfb_reader)
  |
  |-- Parse FileHeader (header)
  |     |-- Version, compression, distribution, encryption flags
  |
  |-- Parse DocInfo (doc_info)
  |     |-- Fonts, char shapes, para shapes, styles, borders/backgrounds
  |
  |-- Parse BodyText sections (body_text + control)
  |     |-- [Distribution] ViewText decryption (crypto: AES-128 ECB)
  |     |-- Paragraph parsing (text + style references)
  |     |-- Control parsing (tables, shapes, pictures, headers/footers)
  |
  |-- Assemble Document IR
        |
        |-- WASM API (wasm_api.rs)
        |     |-- HwpDocument::new(data) -> parsing + pagination
        |     |-- renderPageSvg() -> SVG rendering
        |     |-- getDocumentInfo() -> JSON document info
        |
        |-- CLI (main.rs)
              |-- rhwp info <file.hwp>
              |-- rhwp export-svg <file.hwp>
```

## Build Verification

| Item | Result |
|------|--------|
| Native build | Success (0 warnings) |
| All tests | **177 passed** (+2, compared to step 4) |
| WASM build | Not verified (native verification complete) |

### Test Increase Breakdown

| Module | Step 4 | Step 5 | Increase |
|--------|--------|--------|----------|
| parser (mod.rs) | - | 2 | +2 |
| Other | 175 | 175 | 0 |
| **Total** | **175** | **177** | **+2** |

### New Test List

| Test | Verified Content |
|------|-----------------|
| test_parse_hwp_too_small | Too small data error |
| test_parse_hwp_invalid_cfb | Invalid CFB error |

## Full Parser Module Summary

| Module | File | Role |
|--------|------|------|
| mod.rs | `src/parser/mod.rs` | Unified parsing pipeline `parse_hwp()` |
| cfb_reader | `src/parser/cfb_reader.rs` | CFB container + decompression |
| header | `src/parser/header.rs` | FileHeader binary parsing |
| record | `src/parser/record.rs` | Record header parsing |
| tags | `src/parser/tags.rs` | HWP tag/control constants (ctrl_id BE encoding) |
| byte_reader | `src/parser/byte_reader.rs` | Binary reading utility |
| crypto | `src/parser/crypto.rs` | Distribution document decryption (AES-128 ECB) |
| doc_info | `src/parser/doc_info.rs` | DocInfo reference table parsing |
| body_text | `src/parser/body_text.rs` | BodyText section/paragraph parsing |
| control | `src/parser/control.rs` | Control parsing (tables/shapes/pictures/headers) |
| bin_data | `src/parser/bin_data.rs` | BinData storage extraction |

## Real HWP File Verification

### Verification Targets

End-to-end verification with real HWP files from the sample folder (`/home/edward/vsworks/shwp/samples/15yers/`).
Compared against reference data (`/home/edward/vsworks/shwp/outputs/15years/`).

### info Command

| File | Version | Sections | Paragraphs | Result |
|------|---------|----------|-----------|--------|
| hwp_table_test.hwp | 5.1.0.1 | 1 | 28 | 5 fonts, 63 styles output correctly |
| 통합재정통계(2014.8월).hwp | 5.0.3.4 | 1 | 17 | 9 fonts, 17 styles output correctly |

### export-svg Command

| File | viewBox | Size | Text | vs Reference |
|------|---------|------|------|-------------|
| hwp_table_test.svg | `0 0 793.69 1122.51` | A4 correct | 11 lines | Correct |
| 통합재정통계(2014.8월).svg | `0 0 793.71 1122.51` | A4 correct | 8 lines | Text matches reference .md |

### SVG Quality (Before/After Comparison)

| Item | Before fix (ctrl_id LE) | After fix (ctrl_id BE) |
|------|------------------------|------------------------|
| viewBox | `0 0 0 0` | `0 0 793.71 1122.51` |
| width x height | 0 x 0 | 793.71 x 1122.51 (A4) |
| Text x-coordinate | 0 (no margins) | 94.49 / 113.39 (left margin applied) |
| Text y-coordinate | Overlapping (all same position) | Distributed within page |
| Text content | Correct | Correct (matches reference data) |

## Next Step

Task 3 complete. Final report to be written.

## Status

- Completion date: 2026-02-05
- Status: Awaiting approval
