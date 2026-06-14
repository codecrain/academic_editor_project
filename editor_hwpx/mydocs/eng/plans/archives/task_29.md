# Task 29 Execution Plan: Converting Read-Only HWP to Saveable HWP

## Background

HWP 5.0 distribution documents are a format designed to restrict editing of the original.
- Body text is AES-128 ECB encrypted and stored in `ViewText/Section*` instead of `BodyText/Section*`
- Bit 2 of the file header properties is set to `1` (distribution document)
- Each ViewText stream is preceded by `HWPTAG_DISTRIBUTE_DOC_DATA` (256 bytes)
- Copy/print restriction flags included

The current parser (`src/parser/crypto.rs`) **fully supports distribution document decryption**.
During parsing, ViewText is decrypted and converted to the same internal model as a regular document.

**Goal**: Convert distribution (read-only) HWP to regular (saveable) HWP for export

## Current Code Analysis

### Parsing Path (Already Implemented)
1. `src/parser/header.rs`: Parse `distribution` flag (bit 2)
2. `src/parser/mod.rs`: Branch to ViewText path when distribution
3. `src/parser/crypto.rs`: AES-128 decryption + zlib decompression
4. Result: Same `HwpDocument` model as regular documents

### Serialization Path (Needs Modification)
1. `src/serializer/header.rs`: Serializes `flags` field as-is (raw_data priority)
2. `src/serializer/cfb_writer.rs`: Distribution not considered during stream generation
3. `src/serializer/body_text.rs`: Section data serialization

### Key Differences

| Item | Distribution Document | Regular Document |
|------|---------------------|-----------------|
| File header bit 2 | 1 | 0 |
| Body stream path | ViewText/Section* | BodyText/Section* |
| Encryption | AES-128 ECB | None |
| DISTRIBUTE_DOC_DATA | Included | None |

## Implementation Plan

### Phase 1: FileHeader Conversion Logic
- Set `distribution` flag to `false` in `FileHeader`
- Remove bit 2 (0x04) from `flags` field
- Set `raw_data` to `None` (to reflect flag changes)

### Phase 2: Apply Distribution→Regular Conversion in Serializer
- `cfb_writer.rs`: Always save as `BodyText/Section*` regardless of distribution state
- Since existing `serialize_body_text` already has decrypted data, no additional encryption needed
- ViewText stream generation code doesn't exist, so naturally saves as regular document

### Phase 3: WASM/CLI API Addition
- `convert_to_editable()` or automatic conversion in existing `exportHwp`
- CLI: Add `rhwp convert input.hwp output.hwp` command

### Phase 4: Testing and Verification
- Conversion test with distribution sample HWP
- Verify converted file opens in Hancom Office
- Round-trip: parse distribution → save as regular → re-parse → compare content

## Changed Files

| File | Task |
|------|------|
| `src/model/document.rs` | Add FileHeader conversion method |
| `src/serializer/header.rs` | Serialization with distribution flag removed |
| `src/serializer/cfb_writer.rs` | Verify BodyText stream forced usage |
| `src/wasm_api.rs` | convertToEditable WASM API |
| `src/main.rs` | CLI convert command |
| `src/serializer/mod.rs` | Header flag adjustment during conversion |

## Verification Method

1. `docker compose run --rm test` — Existing tests + new tests pass
2. Converted distribution HWP file verified editable in Hancom Office
3. Document content identity confirmed before and after conversion
