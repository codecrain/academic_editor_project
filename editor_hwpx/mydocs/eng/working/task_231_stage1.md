# Task 231 Stage 1 Completion Report: Field Click Entry + Cursor Placement

## Implementation Results

### Rust Side

**`src/document_core/queries/cursor_rect.rs`**:
- Added `GuideRunInfo` struct — for collecting guide text TextRun (char_start: None) information
- `collect_runs()` extended — added guide_runs parameter, collects guide text TextRuns separately
- Added guide text area detection to hitTest (step 0, executes before existing hitTest)
  - Click within guide text bbox → calls `find_field_hit_for_guide()`
- Added `find_field_hit_for_guide()` method:
  - Traverses cell_context path (text box/table cell) to access the relevant paragraph
  - Searches ClickHere field range → returns cursor at field start position
  - JSON includes `isField:true, fieldId, fieldType`

### Frontend

**`rhwp-studio/src/core/types.ts`**:
- Added `isField?, fieldId?, fieldType?` properties to HitTestResult

**`rhwp-studio/src/engine/input-handler-mouse.ts`**:
- On click, checks hitTest result for `isField` and fires `field-info-changed` event
- Fires null event to reset field info when click is not on a field

**`rhwp-studio/src/main.ts`**:
- Added `field-info-changed` event listener — displays `[ClickHere] #fieldId` in status bar

**`rhwp-studio/index.html`**:
- Added `sb-field` span to status bar (hidden by default)

## Test Results

- 704 tests executed, 703 passed (1 ignored)
- Rust build successful
- TypeScript type check passed (only pre-existing import.meta.env errors)
