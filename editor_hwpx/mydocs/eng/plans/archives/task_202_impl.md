# Task 202 Implementation Plan: IME Composition Black Box Caret

## Step 1: CaretRenderer Composition Overlay Addition

Add composition display DOM element and methods to `caret-renderer.ts`.

- Create composition overlay div (position:absolute, background:#000, color:#fff, pointer-events:none)
- `showComposition(rect, width, zoom, text)`: display black box + white text, hide caret
- `hideComposition()`: hide black box and restore caret
- Blinking: same 500ms period as existing caret, entire black box ON/OFF

## Step 2: InputHandler Composition Mode Integration

Detect composition state in `input-handler.ts`'s `updateCaret()` and relay to CaretRenderer.

- When `isComposing && compositionAnchor`:
  - Call getCursorRect for anchor position → startRect (black box start coordinates)
  - Current cursor rect → endRect (black box end coordinates)
  - Width = endRect.x - startRect.x (minimum height * 0.7 guaranteed)
  - Composition text = `this.textarea.value`
  - Call `caret.showComposition(startRect, width, zoom, text)`
- When not composing: confirm `caret.hideComposition()` call

## Step 3: Testing and Verification

- Korean input test (ㄱ→가→간 composition process, etc.)
- IME composition test within table cells
- Verify black box → caret transition when confirming with arrow keys/Enter during composition
- Verify black box size/position accuracy on zoom changes
