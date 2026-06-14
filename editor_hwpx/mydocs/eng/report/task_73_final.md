# Task 73 — Final Report

## Paragraph Mark Display Feature Implementation

### Overview

Implemented the feature to display paragraph end (Enter) and forced line break (Shift+Enter) positions with the ↵ (U+21B5) symbol in the HWP editor. Users can toggle this via menu or toolbar. This is an editing-only display that does not appear in print.

### Implementation Results

| Step | Description | Result |
|------|-------------|--------|
| Step 1 | Backend renderer symbol modification + forced line break support | Complete |
| Step 2 | Frontend toggle functionality (WasmBridge, command, menu/toolbar) | Complete |
| Step 3 | Build verification (test + WASM + Vite + SVG export) | Complete |

### Modified Files

| File | Changes |
|------|---------|
| `src/renderer/composer.rs` | Added `ComposedLine.has_line_break` field, `\n` detection and removal in `compose_lines()` |
| `src/renderer/render_tree.rs` | Added `TextRunNode.is_line_break_end` field |
| `src/renderer/layout.rs` | Propagated `is_line_break_end` at 10 TextRunNode creation sites |
| `src/renderer/svg.rs` | Changed ¶(U+00B6) to ↵(U+21B5), added `is_line_break_end` condition |
| `src/renderer/web_canvas.rs` | Changed ¶(U+00B6) to ↵(U+21B5), added `is_line_break_end` condition |
| `src/renderer/html.rs` | Changed ¶(U+00B6) to ↵(U+21B5), added `is_line_break_end` condition |
| `rhwp-studio/src/core/wasm-bridge.ts` | Added `setShowParagraphMarks(enabled)` method |
| `rhwp-studio/src/command/commands/view.ts` | Implemented `view:para-mark` command (IIFE closure, toggle state, active class) |
| `rhwp-studio/index.html` | Removed menu item `disabled`, added `data-cmd="view:para-mark"` to toolbar button |
| `rhwp-studio/src/main.ts` | Added `.tb-btn[data-cmd]` click -> command dispatch handler |

### Key Technical Details

#### Backend (Rust)

1. **Forced line break detection**: In `composer.rs`, checks if line text ends with `\n` to set the `ComposedLine.has_line_break` flag. The `\n` character is removed from text so it does not affect rendering width.

2. **Render tree propagation**: In `layout.rs`, the `is_line_break_end` flag is set on the last TextRun of each line and passed to the renderer.

3. **Symbol rendering**: All three renderers (SVG/Canvas/HTML) render the ↵ (U+21B5) symbol in blue (#4A90D9) after TextRuns where `is_para_end` or `is_line_break_end` is true.

#### Frontend (TypeScript)

1. **Toggle logic**: IIFE closure encapsulates `showParaMarks` state. On toggle, calls `wasm.setShowParagraphMarks()` then triggers re-rendering via `document-changed` event.

2. **UI integration**: Both menu item and toolbar button unified via `data-cmd="view:para-mark"`. Toggles `active` CSS class when enabled.

### Verification Results

| Item | Result |
|------|--------|
| Rust tests | 488 passed |
| WASM build | Success |
| Vite build | Success (36 modules, 783ms) |
| SVG export | Normal (confirmed no ↵ symbols in default state) |

### Reference: WebGian Analysis

Analyzed and referenced the Hancom WebGian implementation.

| Item | WebGian Implementation |
|------|----------------------|
| Command | `e_para_mark` -> `ViewOptionParaMark` (ID 34576) |
| Flags | `o9` (paragraph marks), `u9` (formatting marks) — independent toggles |
| Toggle logic | When formatting marks are ON, toggling paragraph marks turns off both |
| Active state | Active display if either `o9 | u9` is ON |
