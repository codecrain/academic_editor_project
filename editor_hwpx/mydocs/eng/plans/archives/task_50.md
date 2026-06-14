# Task 50 Execution Plan

## Task: Cursor Movement Extension + Cell Navigation

**Backlog**: B-309 (MovePos 28+ movement types) + B-903 (Cell navigation) + B-308 (Auto caret placement on document load)

## 1. Current State Analysis

### Currently Implemented

**CursorState** (`engine/cursor.ts`) supports only:
- `moveTo(pos)` -- Move by hitTest result
- `moveHorizontal(delta)` -- ArrowLeft/Right (body + cell interior)
- `updateRect()` -- WASM getCursorRect / getCursorRectInCell

### Needed Movement Types (Design Document Section 6.4)

| Key | Movement Type | Priority |
|-----|--------------|----------|
| **ArrowUp** | Move to line above (maintain X) | High |
| **ArrowDown** | Move to line below (maintain X) | High |
| **Home** | Line start | High |
| **End** | Line end | High |
| **Ctrl+Home** | Document start | High |
| **Ctrl+End** | Document end | High |
| **Tab** (in cell) | Next cell | High |
| **Shift+Tab** (in cell) | Previous cell | High |
| **Ctrl+Left** | Previous word boundary | Medium |
| **Ctrl+Right** | Next word boundary | Medium |

## 2. New WASM APIs Needed

1. `getLineInfo(sec, para, charOffset)` -- Line info query
2. `getLineInfoInCell(...)` -- Cell line info
3. `getCaretPosition()` -- Saved caret position from document
4. `getCellIndex(sec, ppi, ci, row, col)` -- Cell coordinate to index
5. `getTableDimensions(sec, ppi, ci)` -- Table row/col count

## 3. Changed Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | 5 new WASM APIs |
| `rhwp-studio/src/core/wasm-bridge.ts` | 5 TypeScript wrappers |
| `rhwp-studio/src/core/types.ts` | LineInfo, TableDimensions, CaretPosition interfaces |
| `rhwp-studio/src/engine/cursor.ts` | moveVertical, moveToLineStart/End, moveToDocStart/End, moveToCellNext/Prev, preferredX |
| `rhwp-studio/src/engine/input-handler.ts` | ArrowUp/Down, Home/End, Ctrl+Home/End, Tab/Shift+Tab key handling |
| `rhwp-studio/src/app.ts` | Auto caret placement on document load |
