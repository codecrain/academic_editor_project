# Task 193 — Steps 2-4 Completion Report: Frontend Edit Mode + Toolbar + Text Editing Pipeline

Steps 2-4 combined due to high interdependency.

## Step 2: Cursor State Management and Edit Mode Entry/Exit
- cursor.ts: mode fields (`_headerFooterMode`, `_hfSectionIdx`, `_hfApplyTo`, etc.), enter/exit methods, horizontal movement, updateRect modification
- Entry paths: Menu commands, toolbar buttons, double-click (hitTestHeaderFooter)
- Exit paths: Esc key, body area click, close button

## Step 3: Context Toolbar and Visual Indicators
- Toolbar switching on headerFooterModeChanged event: Show `.tb-headerfooter-group`, hide default groups
- Body dimming: `#scroll-container.hf-editing` CSS

## Step 4: Text Editing Pipeline
- input-handler-text.ts 3-way branch: `isInHeaderFooter()` → wasm.insertTextInHeaderFooter / `isInCell()` → cell / else → Command system
- Keyboard handling: Enter → split, Backspace/Delete → delete or merge, Arrow → move, Esc → exit
- IME Korean: compositionStart anchor, onInput composition tracking, direct WASM calls

## Verification
- **Rust tests**: 664 all passed
- **TypeScript**: No compilation errors
