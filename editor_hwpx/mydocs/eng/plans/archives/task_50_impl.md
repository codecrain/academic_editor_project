# Task 50 Implementation Plan

## Task: Cursor Movement Extension + Cell Navigation

**Phase structure**: 5 phases

---

## Phase 1: WASM API Addition (Rust)

### Goal
Implement 5 WASM APIs needed for cursor movement in Rust.

### Implementation

#### (1) `getLineInfo(sec, para, charOffset)` -> JSON
Returns line information within a paragraph. Converts LineSeg's `text_start` (UTF-16) to char index via `char_offsets[]` to calculate each line's start/end char offset.

```rust
// Return JSON:
{ "lineIndex": 0, "lineCount": 3, "charStart": 0, "charEnd": 15 }
```

**Implementation logic**:
1. Iterate `para.line_segs` array
2. Convert each LineSeg's `text_start` (UTF-16) to char index using `utf16_pos_to_char_idx()`
3. Determine the line index containing the input `charOffset`
4. Return charStart, charEnd of that line (next line's charStart or paragraph end)

#### (2) `getLineInfoInCell(sec, ppi, ci, cei, cpi, charOffset)` -> JSON
Line info for paragraphs inside cells. Get paragraph reference via `get_cell_paragraph_ref()` and apply same logic as (1).

#### (3) `getCaretPosition()` -> JSON
Returns the caret position stored in the document, converted to char index.

```rust
// Return JSON:
{ "sectionIndex": 0, "paragraphIndex": 2, "charOffset": 5 }
```

#### (4) `getTableDimensions(sec, ppi, ci)` -> JSON
Returns row/column/cell counts of a table.

#### (5) `getCellInfo(sec, ppi, ci, cellIdx)` -> JSON
Returns row/column info for a specific cell.

### Verification
- `cargo test` passes
- `wasm-pack build` succeeds

---

## Phase 2: TypeScript Wrappers + Type Definitions

### Goal
Add TypeScript wrappers for new WASM APIs to `wasm-bridge.ts` and define return types in `types.ts`.

### Implementation
- `types.ts`: LineInfo, TableDimensions, CellInfo interfaces
- `wasm-bridge.ts`: 5 wrapper methods (getLineInfo, getLineInfoInCell, getCaretPosition, getTableDimensions, getCellInfo)

### Verification
- `tsc --noEmit` passes

---

## Phase 3: CursorState Movement Method Extension

### Goal
Add vertical movement, Home/End, document start/end, and cell navigation methods to `cursor.ts`.

### Implementation
- **preferredX field**: stores X coordinate during vertical movement, reset on horizontal movement/click/edit
- **moveVertical(delta)**: getLineInfo -> find target line -> hitTest with preferredX
- **moveToLineStart() / moveToLineEnd()**: getLineInfo -> move to charStart/charEnd
- **moveToDocumentStart() / moveToDocumentEnd()**: move to (0,0,0) or last paragraph end
- **moveToCellNext() / moveToCellPrev()**: getTableDimensions + getCellInfo -> calculate next/prev cell

### Verification
- `tsc --noEmit` passes

---

## Phase 4: InputHandler Key Handling + Document Load Caret Placement

### Goal
Connect keyboard events to new movement methods and implement auto caret placement on document load.

### Implementation
- ArrowUp/Down -> cursor.moveVertical
- Home/End -> cursor.moveToLineStart/End
- Ctrl+Home/End -> cursor.moveToDocumentStart/End
- Tab/Shift+Tab in cell -> cursor.moveToCellNext/Prev
- preferredX reset on horizontal movement/click/edit
- `activateWithCaretPosition()`: reads stored caret position on document load

### Verification
- `tsc --noEmit` + `vite build` passes

---

## Phase 5: Build Verification + Runtime Testing

### Build Verification
| Item | Command |
|------|---------|
| Rust tests | `docker compose run --rm test` |
| WASM build | `docker compose run --rm wasm` |
| TypeScript compile | `tsc --noEmit` |
| Vite bundle | `vite build` |

### Browser Runtime Tests (12 items)

| # | Test | Verification |
|---|------|-------------|
| 1 | ArrowDown line move | Move down line in multi-line paragraph |
| 2 | ArrowUp line move | Move up line, cross paragraph boundary |
| 3 | preferredX retention | Long line -> short line -> long line preserves original X |
| 4 | Home key | Move to line start |
| 5 | End key | Move to line end |
| 6 | Ctrl+Home | Move to document start (0, 0, 0) |
| 7 | Ctrl+End | Move to last paragraph end |
| 8 | Tab cell move | Tab to next cell inside table |
| 9 | Shift+Tab cell move | Shift+Tab to previous cell |
| 10 | Cell ArrowUp/Down | Vertical movement in multi-line cells |
| 11 | Document load caret | Caret at stored position on file open |
| 12 | Cursor after Undo | ArrowUp/Down works after Ctrl+Z |

### Final Deliverables
- Per-phase completion reports (`mydocs/working/task_50_step{1-5}.md`)
- Final report (`mydocs/working/task_50_final.md`)
- Update task 50 status in daily task doc
