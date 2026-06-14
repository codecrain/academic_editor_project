# Task 37 - Stage 1 Completion Report: Internal Clipboard Infrastructure (WASM)

## Implementation

### 1. Clone Derive Addition (19 Types)

Added Clone derive to IR structs to enable clipboard copying.

| File | Types |
|------|-------|
| `src/model/paragraph.rs` | `Paragraph` |
| `src/model/control.rs` | `Control`, `HiddenComment` |
| `src/model/table.rs` | `Table`, `Cell` |
| `src/model/image.rs` | `Picture` |
| `src/model/shape.rs` | `ShapeObject`, `DrawingObjAttr`, `TextBox`, `LineShape`, `RectangleShape`, `EllipseShape`, `ArcShape`, `PolygonShape`, `CurveShape`, `GroupShape`, `Caption` |
| `src/model/header_footer.rs` | `Header`, `Footer` |
| `src/model/footnote.rs` | `Footnote`, `Endnote` |

### 2. ClipboardData Struct

```rust
struct ClipboardData {
    paragraphs: Vec<Paragraph>,  // paragraphs with format information
    plain_text: String,          // plain text
}
```

Added `clipboard: Option<ClipboardData>` field to `HwpDocument` struct.

### 3. Native API (8 Methods)

| Method | Description |
|--------|-------------|
| `has_internal_clipboard_native()` | Check clipboard data presence |
| `get_clipboard_text_native()` | Return plain text |
| `clear_clipboard_native()` | Clear clipboard |
| `copy_selection_native()` | Copy selection range (single/multi paragraph) |
| `copy_selection_in_cell_native()` | Copy selection range within cell |
| `copy_control_native()` | Copy control object (table/image/shape) |
| `paste_internal_native()` | Paste from internal clipboard (body) |
| `paste_internal_in_cell_native()` | Paste from internal clipboard (within cell) |

### 4. WASM Bindings (8 JS APIs)

| JS Method | WASM Binding |
|-----------|-------------|
| `hasInternalClipboard()` | `has_internal_clipboard` |
| `getClipboardText()` | `get_clipboard_text` |
| `clearClipboard()` | `clear_clipboard` |
| `copySelection(secIdx, startPara, startOffset, endPara, endOffset)` | `copy_selection` |
| `copySelectionInCell(secIdx, parentPara, ctrlIdx, cellIdx, startCellPara, startOffset, endCellPara, endOffset)` | `copy_selection_in_cell` |
| `copyControl(secIdx, paraIdx, ctrlIdx)` | `copy_control` |
| `pasteInternal(secIdx, paraIdx, charOffset)` | `paste_internal` |
| `pasteInternalInCell(secIdx, parentPara, ctrlIdx, cellIdx, cellParaIdx, charOffset)` | `paste_internal_in_cell` |

### 5. Core Logic

#### Copy Strategy
- **Single paragraph partial selection**: Paragraph clone → `split_at()` to trim both sides
- **Multi-paragraph selection**: Trim first paragraph, full copy of middle paragraphs, trim last paragraph
- **Control copy**: Create single paragraph containing the control

#### Paste Strategy
- **Single paragraph text (no controls)**: `insert_text_at()` + `apply_clipboard_char_shapes()` for format preservation
- **Multi-paragraph/controls**: `split_at()` → merge first paragraph → insert middle → merge last

#### Format Preservation
- Applies clipboard paragraph's `char_shapes` (character style references) to paste target
- Accurate range mapping through UTF-16 position → char index conversion
- Same-document copy/paste, so CharShape ID remapping not required

## Test Results

- Existing tests: 416 passed
- New clipboard tests: 5 passed
- **Total 421 tests passed**

### New Test Items

| Test | Verification |
|------|-------------|
| `test_clipboard_copy_paste_single_paragraph` | Single paragraph partial copy → paste |
| `test_clipboard_copy_paste_multi_paragraph` | Multi-paragraph selection copy → paste |
| `test_clipboard_copy_control` | Table control copy |
| `test_clipboard_clear` | Clipboard clear |
| `test_clipboard_paste_empty` | Empty clipboard paste handling |

## Modified Files

| File | Changes |
|------|---------|
| `src/model/paragraph.rs` | Added Clone derive |
| `src/model/control.rs` | Added Clone derive (Control, HiddenComment) |
| `src/model/table.rs` | Added Clone derive (Table, Cell) |
| `src/model/image.rs` | Added Clone derive (Picture) |
| `src/model/shape.rs` | Added Clone derive (11 types) |
| `src/model/header_footer.rs` | Added Clone derive (Header, Footer) |
| `src/model/footnote.rs` | Added Clone derive (Footnote, Endnote) |
| `src/wasm_api.rs` | ClipboardData, clipboard field, 8 APIs + WASM bindings, 5 tests |
