# Task: Implement Paragraph Mark Display Feature

## Context

Complete the **paragraph mark display** feature of the HWP editor. This feature displays blue symbols at positions where the user pressed Enter (paragraph end) or Shift+Enter (forced line break), allowing visual confirmation of the document structure. These are editing-only markers that do not appear in print.

### Current State

| Item | Status | Location |
|------|--------|----------|
| `show_paragraph_marks` flag | Implemented | `wasm_api.rs:101` |
| `setShowParagraphMarks()` WASM API | Implemented | `wasm_api.rs:132-134` |
| `is_para_end` flag (TextRunNode) | Implemented | `render_tree.rs:217` |
| Paragraph symbol rendering (SVG/Canvas/HTML) | Implemented | `svg.rs:75-81`, `web_canvas.rs:107-114`, `html.rs:119-125` |
| WasmBridge TS method | Not implemented | `wasm-bridge.ts` |
| `view:para-mark` command execution | Not implemented | `view.ts:80-85` (TODO) |
| Toolbar button command binding | Not implemented | `index.html:232` |
| Menu item check state | Not implemented | `index.html:70` |
| Forced line break symbol | Not implemented | All renderers |

### Key Findings

1. **Symbol mismatch**: Currently using pilcrow (U+00B6), but HWP standard uses the return symbol (U+21B5)
2. **Missing forced line break support**: No symbol at line ends split by `\n` (0x000A)
3. **ComposedLine data**: When forced line break occurs, line text ends with `\n` (composer.rs:150)

### WebGian Analysis

| Item | WebGian Implementation |
|------|----------------------|
| Command | `e_para_mark` -> Action `ViewOptionParaMark` (ID 34576) |
| Flags | `o9` (paragraph marks), `u9` (typesetting marks) -- independent toggles |
| Toggle logic | When typesetting marks ON, toggling paragraph marks turns both OFF |
| Active detection | Active display when either `o9 \| u9` is ON |
| Shortcut | Alt+G+T (corresponds to desktop Ctrl+G+T) |
| Icon | Sprite `.e_para_mark.btn_icon_inner` (-320px -280px) |

---

## Implementation Plan (3 Stages)

### Stage 1: Renderer Symbol Fix + Forced Line Break Support (Backend)

**Modified files**: `render_tree.rs`, `composer.rs`, `layout.rs`, `svg.rs`, `web_canvas.rs`, `html.rs`

#### 1-1. Add Forced Line Break Flag to ComposedLine

`composer.rs` -- Add field to `ComposedLine` struct:
```rust
pub struct ComposedLine {
    // ... existing fields
    /// Whether this line ends with a forced line break (\n)
    pub has_line_break: bool,
}
```

In the `compose_lines()` function, check if line text ends with `\n`:
```rust
let has_line_break = line_text.ends_with('\n');
// Remove \n character from text runs (prevent width impact)
let line_text = if has_line_break {
    line_text.trim_end_matches('\n').to_string()
} else {
    line_text
};
```

#### 1-2. Add Forced Line Break Flag to TextRunNode

`render_tree.rs` -- Add field to `TextRunNode`:
```rust
/// Whether this is the last TextRun after a forced line break (Shift+Enter)
pub is_line_break_end: bool,
```

#### 1-3. Pass Flag in layout.rs

In `layout_composed_paragraph()`, set `is_line_break_end` on each line's last TextRun:
```rust
let is_line_break_end = comp_line.has_line_break
    && run_idx == comp_line.runs.len() - 1;
```

#### 1-4. Change Renderer Symbols

In all three renderers:
- Paragraph end (is_para_end): Change pilcrow (U+00B6) to return symbol (U+21B5) -- conforming to HWP standard
- Forced line break (is_line_break_end): Use the same return symbol (U+21B5) (per HWP help documentation)
- Color: Keep existing `#4A90D9` (blue)

**Verification**: `docker compose --env-file /dev/null run --rm test`

---

### Stage 2: Frontend Toggle Feature Implementation

**Modified files**: `wasm-bridge.ts`, `view.ts`, `index.html`

#### 2-1. Add Method to WasmBridge

`wasm-bridge.ts`:
```typescript
setShowParagraphMarks(enabled: boolean): void {
    if (!this.doc) throw new Error('No document loaded');
    this.doc.setShowParagraphMarks(enabled);
}
```

#### 2-2. Implement view:para-mark Command

`view.ts` -- Toggle state management:
```typescript
let showParaMarks = false;

{
    id: 'view:para-mark',
    label: 'Paragraph Marks',
    icon: 'icon-para-mark',
    canExecute: (ctx) => ctx.hasDocument,
    execute(services) {
        showParaMarks = !showParaMarks;
        services.wasm.setShowParagraphMarks(showParaMarks);
        services.eventBus.emit('document-changed');
    },
},
```

The `document-changed` event triggers `CanvasView.refreshPages()` to re-render all visible pages (canvas-view.ts:40).

#### 2-3. Toolbar Button Command Binding

`index.html:232` -- Add `data-cmd` to paragraph mark button:
```html
<button class="tb-btn" data-cmd="view:para-mark" title="Paragraph Marks">
```

#### 2-4. Menu Item Check State

`index.html:70` -- Remove `disabled` class from menu item (canExecute handles this):
```html
<div class="md-item" data-cmd="view:para-mark">
```

For active state visual indicator, toggle `active` class on menu item and toolbar button when `view:para-mark` command executes:
```typescript
execute(services) {
    showParaMarks = !showParaMarks;
    services.wasm.setShowParagraphMarks(showParaMarks);
    // Update toggle visual state
    document.querySelectorAll('[data-cmd="view:para-mark"]').forEach(el => {
        el.classList.toggle('active', showParaMarks);
    });
    services.eventBus.emit('document-changed');
},
```

**Verification**: In the browser, load a document and toggle paragraph marks via menu/toolbar click

---

### Stage 3: Build Verification + SVG Export Confirmation

1. `docker compose --env-file /dev/null run --rm test` -- All tests pass
2. `docker compose --env-file /dev/null run --rm wasm` -- WASM build
3. `cd rhwp-studio && npx vite build` -- Vite build
4. SVG export verification: With `show_paragraph_marks=true`,
   - `samples/sample.hwp` -- Confirm return symbol at each paragraph end
   - Document with forced line breaks -- Confirm return symbol at line break positions

---

## Modified Files Summary

| File | Change | Scope |
|------|--------|-------|
| `src/renderer/composer.rs` | Add `has_line_break` to ComposedLine, remove `\n` | ~10 lines |
| `src/renderer/render_tree.rs` | Add `is_line_break_end` to TextRunNode | ~3 lines |
| `src/renderer/layout.rs` | Pass `is_line_break_end` flag | ~10 lines |
| `src/renderer/svg.rs` | Change pilcrow to return symbol, add line break return symbol | ~10 lines |
| `src/renderer/web_canvas.rs` | Change pilcrow to return symbol, add line break return symbol | ~10 lines |
| `src/renderer/html.rs` | Change pilcrow to return symbol, add line break return symbol | ~10 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | Add `setShowParagraphMarks()` method | ~4 lines |
| `rhwp-studio/src/command/commands/view.ts` | Implement `view:para-mark` command | ~15 lines |
| `rhwp-studio/index.html` | Button `data-cmd` + menu disabled removal | ~2 lines |
