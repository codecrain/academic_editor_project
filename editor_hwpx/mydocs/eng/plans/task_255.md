# Task 255 Plan: Footnote Content Editing

## Current State

- Footnote insertion (`insertFootnote`) WASM API implemented
- Footnote number inline rendering implemented
- Footnote area bottom display implemented
- **Not implemented**: Footnote content text input/delete/paragraph split/merge

## Reference Pattern

Apply the same pattern as header/footer editing API (`header_footer_ops.rs`):
- Text editing on `paragraphs: Vec<Paragraph>` inside footnote control
- Reflow + raw_stream invalidation + re-pagination after editing

## Implementation Plan

### Step 1: Footnote Editing Rust API (document_core)

New file `src/document_core/commands/footnote_ops.rs`:

| API | Description |
|-----|------|
| `find_footnote_control()` | Locate footnote control by (para_idx, control_idx) within section |
| `get_footnote_paragraph_mut()` | Mutable reference to footnote internal paragraph |
| `get_footnote_info_native()` | Query footnote paragraph count/text length |
| `insert_text_in_footnote_native()` | Insert text in footnote |
| `delete_text_in_footnote_native()` | Delete text in footnote |
| `split_paragraph_in_footnote_native()` | Split paragraph in footnote (Enter) |
| `merge_paragraph_in_footnote_native()` | Merge paragraphs in footnote (Backspace) |
| `reflow_footnote_paragraph()` | Reflow footnote paragraph |

### Step 2: WASM Bindings

Add `#[wasm_bindgen]` bindings for each API in `src/wasm_api.rs`:
- `getFootnoteInfo(sec, paraIdx, controlIdx)`
- `insertTextInFootnote(sec, paraIdx, controlIdx, fnParaIdx, charOffset, text)`
- `deleteTextInFootnote(sec, paraIdx, controlIdx, fnParaIdx, charOffset, count)`
- `splitParagraphInFootnote(sec, paraIdx, controlIdx, fnParaIdx, charOffset)`
- `mergeParagraphInFootnote(sec, paraIdx, controlIdx, fnParaIdx)`

### Step 3: rhwp-studio UI Integration

- Add footnote editing methods to `wasm-bridge.ts`
- Footnote area click → enter footnote edit mode
- Handle text input/delete/Enter/Backspace within footnote

### Reference Files

- Header/footer pattern: `src/document_core/commands/header_footer_ops.rs`
- Footnote insertion: `src/document_core/commands/object_ops.rs` (insert_footnote_native)
- Footnote model: `src/model/footnote.rs`
- WASM: `src/wasm_api.rs`
