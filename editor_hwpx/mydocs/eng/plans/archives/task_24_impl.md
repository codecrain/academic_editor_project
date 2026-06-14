# Task 24: Text Input Inside Tables - Implementation Plan

## Current Problems

1. **TextRunNode**: Only has `section_index`, `para_index` → cannot identify cell-internal paragraphs
2. **layout_table()**: Hardcodes `section_index=0, para_index=0` when rendering cell paragraphs (layout.rs:1131)
3. **insert_text/delete_text API**: Only supports `(section_idx, para_idx, char_offset)` → cannot access cell paragraphs
4. **reflow_paragraph()**: Based on page column width → no support for cell-width-based reflow
5. **editor.js**: Dispatches only to body paragraphs without cell context awareness

## Implementation Phases (4 Phases)

---

### Phase 1: TextRunNode Extension and Cell Layout Coordinate Passing

**Goal**: Extend render tree TextRun to carry cell position information

**Changed Files**:
- `src/renderer/render_tree.rs` — Add cell identification fields to TextRunNode
- `src/renderer/layout.rs` — Add cell identification parameters to `layout_composed_paragraph()`, modify `layout_table()` call sites

**Details**:
- Add fields to TextRunNode:
  - `parent_para_index: Option<usize>` — Parent paragraph index that owns the table control
  - `control_index: Option<usize>` — Control index within parent paragraph
  - `cell_index: Option<usize>` — Cell index within table
  - `cell_para_index: Option<usize>` — Paragraph index within cell
- Add optional cell info parameters to `layout_composed_paragraph()` signature
- Pass actual indices when rendering cell paragraphs in `layout_table()`

---

### Phase 2: WASM API Extension (Cell Text Insert/Delete/Reflow)

**Goal**: Provide text editing APIs for cell-internal paragraphs

**Changed Files**:
- `src/wasm_api.rs` — Add cell-targeted insert/delete APIs, implement cell reflow

**Details**:
- Add `insert_text_in_cell(section_idx, parent_para_idx, control_idx, cell_idx, cell_para_idx, char_offset, text)`
- Add `delete_text_in_cell(...)` following same pattern
- Add `reflow_cell_paragraph()` — Cell-width-based reflow function
- `getPageTextLayout()` — Include cell identification info in JSON from collect_text_runs

---

### Phase 3: Editor JS Integration (Hit Test, Caret, Input Dispatch)

**Goal**: Cell click → caret display → key input forwarded with cell context

**Changed Files**:
- `web/text_selection.js` — `getDocumentPos()` returns cell info, `setCaretByDocPos()` supports cells
- `web/editor.js` — Branch `handleTextInsert()`/`handleTextDelete()` to call cell APIs

**Details**:
- Cell info included in TextRun JSON → automatically reflected in hitTest results
- Add `parentParaIdx`, `controlIdx`, `cellIdx`, `cellParaIdx` to `getDocumentPos()` return value
- `handleTextInsert()`: If docPos has cell info, call `insertTextInCell()`, otherwise call existing `insertText()`
- `handleTextDelete()`: Same branching
- Include cell info when restoring caret with `setCaretByDocPos()`

---

### Phase 4: Testing and Verification

**Goal**: Confirm that text editing within cells works correctly

**Contents**:
- Verify all existing tests pass
- Click cell in HWP file with tables → verify caret display
- Verify Korean/English input within cells
- Verify Backspace/Delete behavior within cells
- Verify save → reload round-trip after editing within cells
- Verify SVG export
