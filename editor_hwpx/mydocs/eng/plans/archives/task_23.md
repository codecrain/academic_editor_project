# Task 23: HWP Save (B-401, B-402, B-403)

## Execution Plan

### 1. Overview

With Tasks 17~22 completing WYSIWYG editing features (selection, caret, input, deletion, reflow, paragraph split/merge), document save functionality is now needed. This implements the reverse of the parsing process (serialization), integrating backlogs B-401 (HWP serialization), B-402 (CFB writing), B-403 (stream compression).

### 2. Goals

1. **HWP serialization**: Document IR → HWP record binary conversion
2. **CFB writing**: Compound File Binary container creation
3. **Stream compression**: deflate compression
4. **WASM API**: `exportHwp()` API
5. **Browser integration**: Save/download button

### 3. Implementation Steps

#### Step 1: ByteWriter + RecordWriter (Foundation Layer)
#### Step 2: FileHeader + DocInfo Serialization
#### Step 3: BodyText Serialization (Paragraphs, Text, Controls)
#### Step 4: CFB Assembly + Compression + WASM API + JS Integration

### 5. Impact Scope

| File | Changes |
|------|---------|
| `src/serializer/mod.rs` | New: module root, serialize_hwp() |
| `src/serializer/byte_writer.rs` | New: LE byte write primitives |
| `src/serializer/record_writer.rs` | New: record header encoding |
| `src/serializer/header.rs` | New: FileHeader serialization |
| `src/serializer/doc_info.rs` | New: DocInfo record serialization |
| `src/serializer/body_text.rs` | New: Section/Paragraph serialization |
| `src/serializer/control.rs` | New: Control serialization |
| `src/serializer/cfb_writer.rs` | New: CFB container assembly + compression |
| `src/wasm_api.rs` | Add `exportHwp()` WASM API |
| `web/editor.js` | Save/download handler |
