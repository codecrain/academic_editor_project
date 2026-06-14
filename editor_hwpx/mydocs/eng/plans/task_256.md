# Task 256 Plan: Footnote Editing UI Integration

## Current State

- Rust API (`footnote_ops.rs`): Text insert/delete/paragraph split/merge complete
- WASM bindings + wasm-bridge.ts methods complete
- **Not implemented**: Footnote area click detection, edit mode entry/exit, key input routing

## Reference Pattern: Header/Footer Edit Mode

- `cursor.ts`: `_headerFooterMode`, `enterHeaderFooterMode()`, `exitHeaderFooterMode()`
- `input-handler-mouse.ts`: `hitTestHeaderFooter()` → mode entry/switch
- `input-handler-keyboard.ts`: Escape to exit, Enter for paragraph split, arrow key movement

## Implementation Plan

### Step 1: Rust Hit-Test + Cursor Rect API

Add footnote area hit-test/cursor position APIs on the Rust side:

| API | Description |
|-----|------|
| `hitTestFootnote(pageNum, x, y)` | Returns whether click is in footnote area + (paraIdx, controlIdx) |
| `hitTestInFootnote(pageNum, paraIdx, controlIdx, x, y)` | Returns exact (fnParaIdx, charOffset) within footnote |
| `getCursorRectInFootnote(sec, paraIdx, controlIdx, fnParaIdx, charOffset)` | Returns cursor rect within footnote |

### Step 2: cursor.ts Footnote Mode State

- Add `_footnoteMode: boolean` property
- `_fnParaIdx`, `_fnControlIdx`, `_fnInnerParaIdx`, `_fnCharOffset` states
- `enterFootnoteMode()`, `exitFootnoteMode()`, `setFnCursorPosition()` methods
- Add footnote mode branch in `updateRect()`

### Step 3: input-handler Footnote Edit Routing

- **mouse**: Footnote area click → enter edit mode, body click → exit
- **keyboard**: Escape exit, Enter paragraph split, Backspace paragraph merge, arrow movement, text input

### Reference Files

- cursor.ts: `rhwp-studio/src/engine/cursor.ts`
- input-handler-mouse.ts: `rhwp-studio/src/engine/input-handler-mouse.ts`
- input-handler-keyboard.ts: `rhwp-studio/src/engine/input-handler-keyboard.ts`
- wasm-bridge.ts: `rhwp-studio/src/core/wasm-bridge.ts`
