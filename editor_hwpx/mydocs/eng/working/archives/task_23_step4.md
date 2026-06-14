# Task 23 - Stage 4 Completion Report: CFB Assembly + Compression + WASM API + JS Integration

## Completed Items

### 4-1. `src/serializer/cfb_writer.rs` (~290 lines)
Top-level module that serializes Document IR into HWP 5.0 CFB binary.

**Key functions:**
| Function | Role |
|----------|------|
| `serialize_hwp(doc)` | Document → HWP CFB bytes (top-level) |
| `compress_stream(data)` | Raw deflate compression (wbits=-15) |
| `write_hwp_cfb(...)` | In-memory CFB container assembly |
| `write_cfb_stream(cfb, path, data)` | Individual stream writing |
| `find_bin_data_info(...)` | BinDataContent → storage path mapping |

**CFB Stream Structure:**
- `/FileHeader` — 256 bytes, always uncompressed
- `/DocInfo` — Record bytes, conditionally deflate compressed
- `/BodyText/Section{N}` — Record bytes, conditionally deflate compressed
- `/BinData/BIN{XXXX}.{ext}` — Binary data (original preserved)

### 4-2. `src/serializer/mod.rs` Update
- Added `pub mod cfb_writer;`
- `pub use cfb_writer::{serialize_hwp, SerializeError};` re-export

### 4-3. `src/wasm_api.rs` — `exportHwp()` API
- WASM: `#[wasm_bindgen(js_name = exportHwp)] pub fn export_hwp(&self) -> Result<Vec<u8>, JsValue>`
- Native: `pub fn export_hwp_native(&self) -> Result<Vec<u8>, HwpError>`

### 4-4. `web/editor.html` — Save Button
- Added `Save` button to toolbar (`#save-btn`)

### 4-5. `web/editor.js` — Save/Download Handler
- `handleSave()` function: `doc.exportHwp()` → Blob → `<a>` download
- Ctrl+S shortcut binding
- `_saved.hwp` suffix based on original filename
- Loading indicator displayed during save

## Test Results

```
test result: ok. 327 passed; 0 failed; 0 ignored
```

| Category | New Tests | Description |
|----------|-----------|-------------|
| cfb_writer | 6 | Compression round-trip, empty document CFB, stream verification, compression mode, uncompressed full round-trip, compressed full round-trip |
| wasm_api | 1 | exportHwp empty document test |

Existing 319 + 8 new = 327 total all passed.

### WASM Build
```
[INFO]: :-) Done in 21.03s
[INFO]: :-) Your wasm pkg is ready to publish at /app/pkg.
```

## Full Round-Trip Verification

In `test_full_roundtrip_uncompressed` test:
1. Construct Document IR (fonts, char shapes, para shapes, styles, text "안녕하세요")
2. `serialize_hwp()` → HWP CFB bytes
3. `CfbReader::open()` → stream reading
4. `parse_file_header()` → version/flag match verification
5. `parse_doc_info()` → font name/style name match verification
6. `parse_body_text_section()` → text "안녕하세요" match verification

Same verification in `test_full_roundtrip_compressed` (compressed mode).
