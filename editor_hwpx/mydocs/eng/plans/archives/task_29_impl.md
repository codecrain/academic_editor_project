# Task 29 Implementation Plan: Converting Read-Only HWP to Saveable HWP

## Analysis Results

Analyzing the current code's parsing-serialization pipeline reveals that **90% of distribution document conversion is already implemented**.

### Already Working Parts
1. `parser/crypto.rs`: ViewText decryption (AES-128 ECB + zlib)
2. `parser/mod.rs`: Branches to ViewText path when distribution, converts to regular model after decryption
3. `serializer/cfb_writer.rs`: Always saves as `BodyText/Section*` (ViewText not generated)
4. `parser/mod.rs:collect_extra_streams()`: ViewText streams already excluded

### Parts Needing Modification
1. **FileHeader**: Returns original (distribution=true) as-is when `raw_data` exists → need to remove distribution bit
2. **DocInfo**: `raw_stream` may contain `HWPTAG_DISTRIBUTE_DOC_DATA` records → need to remove
3. **API**: Expose conversion functionality for CLI/WASM use

---

## Implementation Phases (3 Phases)

### Phase 1: Document Conversion Logic (model + serializer)

**File**: `src/model/document.rs`

Add `Document::convert_to_editable()` method:
```rust
impl Document {
    /// Convert distribution (read-only) document to editable regular document
    pub fn convert_to_editable(&mut self) {
        if !self.header.distribution { return; }

        // 1. FileHeader: remove distribution flag
        self.header.distribution = false;
        self.header.flags &= !0x04;  // remove bit 2
        self.header.raw_data = None;  // force regeneration

        // 2. DocInfo: remove DISTRIBUTE_DOC_DATA record
        self.doc_info.raw_stream = None;  // force re-serialization
        self.doc_info.extra_records.retain(|r| r.tag_id != HWPTAG_DISTRIBUTE_DOC_DATA);

        // 3. BodyText: no additional processing needed as already decrypted
    }
}
```

**File**: `src/serializer/header.rs`

No changes needed — when `raw_data = None`, regenerated from `flags` field, so distribution bit is automatically removed.

**Tests**:
- `test_convert_to_editable_clears_distribution`: Verify flag conversion
- `test_convert_to_editable_noop_for_normal`: No change on regular documents

### Phase 2: CLI/WASM API Addition

**File**: `src/main.rs`

Add `convert` subcommand:
```
rhwp convert input.hwp output.hwp
```
- Parse input file
- Call `convert_to_editable()`
- Save with `serialize_hwp()`

**File**: `src/wasm_api.rs`

Add `convertToEditable()` WASM API:
```rust
#[wasm_bindgen(js_name = convertToEditable)]
pub fn convert_to_editable(&mut self) -> String
```
- Call `convert_to_editable()` on internal Document
- Return JSON: `{"ok":true,"wasDistribution":true}`

### Phase 3: Testing and Verification

**Distribution sample verification**:
- Check for distribution=true files in `samples/` directory
- If none, test with programmatic distribution document simulation

**Test cases**:
1. Parse distribution document → convert → serialize → re-parse: verify content identical
2. Verify bit 2 is 0 in FileHeader flags after conversion
3. Verify saved as BodyText stream after conversion (no ViewText)
4. Verify no change when calling convert_to_editable on regular document
5. Existing 384 tests pass

---

## Changed Files Summary

| File | Changes |
|------|---------|
| `src/model/document.rs` | Add `convert_to_editable()` method |
| `src/main.rs` | `convert` CLI subcommand |
| `src/wasm_api.rs` | `convertToEditable` WASM API |
| `src/parser/tags.rs` | Verify/add HWPTAG_DISTRIBUTE_DOC_DATA constant |

## Risk Factors

- If DocInfo `raw_stream` contains DISTRIBUTE_DOC_DATA, setting `raw_stream = None` for re-serialization manages it via `extra_records` → need to also remove from `extra_records`
- Need to verify differences in additional streams like `\005HwpSummaryInformation` in distribution documents
