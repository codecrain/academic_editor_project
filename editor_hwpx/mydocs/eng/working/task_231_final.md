# Task 231 Final Report: ClickHere Field Editing UI

## Implementation Results

### Stage 1: Field Click Entry + Cursor Placement

**Rust side** (`src/document_core/queries/cursor_rect.rs`):
- `GuideRunInfo` struct — collects guide text TextRun (char_start: None) information
- `collect_runs()` extended — added guide_runs parameter
- Added guide text area detection to hitTest (step 0)
- `find_field_hit_for_guide()` — returns cursor at field start position, JSON includes `isField:true, fieldId, fieldType`

**Frontend**:
- Added `isField?, fieldId?, fieldType?` to `HitTestResult`
- Fires `field-info-changed` event on click
- Added `sb-field` span to status bar

### Stage 2: Text Input/Deletion Within Fields

**Rust side** (`src/document_core/queries/field_query.rs`):
- `get_field_info_at()` — queries field range at cursor position in body paragraphs
- `get_field_info_at_in_cell()` — queries field range within cells/text boxes
- Returns: `{inField, fieldId, fieldType, startCharIdx, endCharIdx, isGuide, guideName}`

**WASM API** (`src/wasm_api.rs`):
- `getFieldInfoAt(section, para, charOffset)`
- `getFieldInfoAtInCell(section, ppi, ci, cei, cpi, offset, isTextbox)`

**Frontend**:
- `FieldInfoResult` interface + `WasmBridge.getFieldInfoAt()` wrapper
- Backspace: blocked at field start (`charOffset <= startCharIdx`)
- Delete: blocked at field end (`charOffset >= endCharIdx`)
- Existing `insert_text_at`/`delete_text_at` automatically expands/shrinks field_range

### Stage 3: F11 Block Selection + Status Bar

**Frontend**:
- F11 key: selects entire text within field as block
- Status bar: displays in `[ClickHere] {guide text}` format

## Changed Files

| File | Changes |
|------|---------|
| `src/document_core/queries/cursor_rect.rs` | GuideRunInfo, guide text hitTest, find_field_hit_for_guide |
| `src/document_core/queries/field_query.rs` | get_field_info_at, get_field_info_at_in_cell, field_info_at_in_para |
| `src/wasm_api.rs` | Added getFieldInfoAt, getFieldInfoAtInCell APIs |
| `rhwp-studio/src/core/types.ts` | HitTestResult extension, FieldInfoResult addition |
| `rhwp-studio/src/core/wasm-bridge.ts` | Added getFieldInfoAt wrapper |
| `rhwp-studio/src/engine/input-handler-mouse.ts` | Field click event + guideName lookup |
| `rhwp-studio/src/engine/input-handler-text.ts` | Backspace/Delete field boundary protection |
| `rhwp-studio/src/engine/input-handler-keyboard.ts` | F11 field block selection |
| `rhwp-studio/src/main.ts` | field-info-changed event listener |
| `rhwp-studio/index.html` | Added sb-field span |

## Test Results

- 704 tests executed, 703 passed (1 ignored)
