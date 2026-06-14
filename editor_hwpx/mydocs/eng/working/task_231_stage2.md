# Task 231 Stage 2 Completion Report: Text Input/Deletion Within Fields

## Implementation Results

### Rust Side

**`src/document_core/queries/field_query.rs`**:
- `get_field_info_at(section, para, char_offset)` — queries field range at cursor position in body paragraphs
- `get_field_info_at_in_cell(section, parent_para, ctrl, cell, cell_para, offset, is_textbox)` — queries field range within cells/text boxes
- `field_info_at_in_para()` internal function — searches ClickHere field range in paragraph's field_ranges
- Return JSON: `{inField, fieldId, fieldType, startCharIdx, endCharIdx, isGuide, guideName}`

**`src/wasm_api.rs`**:
- `getFieldInfoAt(section, para, charOffset)` — WASM API
- `getFieldInfoAtInCell(section, ppi, ci, cei, cpi, offset, isTextbox)` — WASM API

### Frontend

**`rhwp-studio/src/core/types.ts`**:
- Added `FieldInfoResult` interface

**`rhwp-studio/src/core/wasm-bridge.ts`**:
- Added `getFieldInfoAt(pos: DocumentPosition)` wrapper — auto-routes between body/cell/text box

**`rhwp-studio/src/engine/input-handler-text.ts`**:
- `handleBackspace`: blocks Backspace at field start position (`charOffset <= startCharIdx`)
- `handleDelete`: blocks Delete at field end position (`charOffset >= endCharIdx`)

### Automatic Behavior (Leveraging Existing Code)

- When typing into empty field (start==end), `insert_text_at()` automatically expands `field_range.end_char_idx` → guide text disappears and user text is displayed
- When deleting text within field, `delete_text_at()` automatically shrinks `field_range`
- When field becomes empty (start==end), guide text automatically reappears (renderer detects empty field)

## Boundary Protection Verification

| Scenario | Behavior |
|----------|----------|
| Backspace at field start | Blocked |
| Delete at field end | Blocked |
| Backspace in empty field | Blocked (start == end == cursor) |
| Delete in empty field | Blocked (start == end == cursor) |
| Backspace inside field | Allowed (text deleted) |
| Delete inside field | Allowed (text deleted) |

## Test Results

- All 703 tests passed
- Rust build successful
- TypeScript type check passed
