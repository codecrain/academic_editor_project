# Task 202: IME Composition Black Box Caret

## Goal

Implement Hancom/MS Word style black box caret during IME composition.
- During composition: blinking black rectangle (black box) the size of the character + white composition character inside
- Composition end: return to normal caret (thin vertical bar)

## Current State

### Completed Infrastructure
- `CaretRenderer`: DOM div-based blinking caret (2px vertical bar)
- `isComposing` / `compositionAnchor` / `compositionLength`: IME composition state tracking
- `getCursorRect`: WASM API to query cursor coordinates (x, y, height, pageIndex) at any position
- Real-time text insertion/deletion during IME composition fully functional

### Unimplemented Items
- No black box display during composition (only normal caret shown)
- No white character overlay during composition

## Behavior Specification

| State | Caret Shape | Blinking | Note |
|-------|-------------|----------|------|
| Non-composing (normal) | 2px vertical bar | 500ms | Currently implemented |
| During IME composition | Character-sized black box | 500ms | White composition character inside black box |

### Black Box Size Calculation
- **Height**: cursor rect height (line height)
- **Width**: difference between anchor position rect.x → current position rect.x (composition character width)
- **Position**: (x, y) of anchor position — page coordinates

### Blinking Behavior
- Entire black box blinks (ON: black background + white text, OFF: transparent = canvas's black text visible)
- Period: 500ms (same as existing caret)

## Implementation Approach

### CaretRenderer Extension
- Add composition overlay div (black background, white text)
- Add `showComposition(startRect, text, charWidth, zoom)` method
- Add `hideComposition()` method
- During composition, hide existing caret and show composition overlay

### InputHandler.updateCaret() Extension
- When `isComposing && compositionAnchor`:
  1. Call getCursorRect for anchor position → startRect
  2. getCursorRect for current position → endRect (existing logic)
  3. Width = endRect.x - startRect.x
  4. Composition text = textarea.value or getTextAt()
  5. Call `caret.showComposition(startRect, text, width, zoom)`
- When not composing: call `caret.hideComposition()`

## Impact Scope

| File | Modification |
|------|-------------|
| `rhwp-studio/src/engine/caret-renderer.ts` | Composition overlay element + showComposition/hideComposition |
| `rhwp-studio/src/engine/input-handler.ts` | Composition mode branching in updateCaret() |

## Out of Scope

- No WASM/Rust side changes (purely frontend UI)
- Overwrite mode caret → follow-up task
- Vertical writing IME composition → follow-up task
