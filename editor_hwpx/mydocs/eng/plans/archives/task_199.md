# Task 199: Paragraph Marks Correction to Hancom Level + Forced Line Break (Shift+Enter) Implementation

## Goal

1. Implement forced line break (Shift+Enter) editing feature
2. Correct paragraph mark symbols to match Hancom Hangul exactly (distinguish hard return / forced line break)

## Current State

### Completed Infrastructure
- File parsing: 0x000A → `\n` conversion (body_text.rs)
- Serialization: `\n` → 0x000A reverse conversion (serializer/body_text.rs)
- `ComposedLine.has_line_break` flag setting (composer.rs)
- `TextRunNode.is_line_break_end` field definition (render_tree.rs)

### Unimplemented Items
- Keyboard Shift+Enter detection — no distinction from Enter
- WASM API `insertLineBreak()` missing
- No line break insertion command
- `is_line_break_end` always false (not set in layout.rs)
- Renderer symbols: both hard return and forced line break use the same symbol

## Hancom Standard

| Item | Symbol | Color | Description |
|------|--------|-------|-------------|
| Hard Return (Enter) | Bent arrow shape | Blue | Paragraph separator |
| Forced Line Break (Shift+Enter) | Vertical line shape (separate symbol) | Blue | Maintains paragraph, breaks line only |

## Scope

### A. Forced Line Break Editing Feature
1. Create `InsertLineBreakCommand` command class (TypeScript + Rust)
2. Add `insertLineBreak()` function to WASM API
3. Keyboard handler calls `insertLineBreak()` on Shift+Enter
4. Regular Enter → existing `splitParagraph()` maintained

### B. Renderer Symbol Correction
1. Correctly set `is_line_break_end` in `layout.rs` based on `has_line_break`
2. Hard return symbol: correct to appropriate Unicode character
3. Forced line break symbol: separate symbol distinct from hard return
4. Apply to all SVG/HTML/Canvas renderers

## Impact Scope

### Rust
- `src/wasm_api.rs` — add insertLineBreak API
- `src/document_core/commands/text_editing.rs` — line break insertion logic
- `src/renderer/layout.rs` — is_line_break_end setting (currently always false)
- `src/renderer/svg.rs` — symbol correction
- `src/renderer/html.rs` — symbol correction
- `src/renderer/web_canvas.rs` — symbol correction

### TypeScript (rhwp-studio)
- `src/engine/input-handler-keyboard.ts` — Shift+Enter detection
- `src/engine/command.ts` — InsertLineBreakCommand addition
- `src/core/wasm-bridge.ts` — WASM bridge extension

## Out of Scope (Follow-up Tasks)
- Space/tab visualization → Task 200
- Object marks ([Table], [Image], etc.) → Task 201

## References
- Hancom Help: `mydocs/manual/hwp/Help/extracted/view/displaying_hard_return.htm`
- Symbol image: `mydocs/manual/hwp/Help/extracted/images/3v02_001.gif` (hard return)
- Symbol image: `mydocs/manual/hwp/Help/extracted/images/3v_code(shift+enter).gif` (forced line break)
