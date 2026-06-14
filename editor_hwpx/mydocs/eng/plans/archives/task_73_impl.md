# Task 73: Paragraph Mark Display Feature — Implementation Plan

## Implementation Steps (3 steps)

### Step 1: Renderer Symbol Modification + Forced Line Break Support (Backend)

**Modified files**: `composer.rs`, `render_tree.rs`, `layout.rs`, `svg.rs`, `web_canvas.rs`, `html.rs`

| Action | Description |
|--------|-------------|
| ComposedLine.has_line_break | Check if line text ends with `\n`, remove `\n` |
| TextRunNode.is_line_break_end | Mark for last TextRun of forced line break lines |
| layout.rs flag passing | `comp_line.has_line_break && last_run` → `is_line_break_end` |
| Renderer symbol change | Pilcrow (U+00B6) → Return arrow (U+21B5), forced line break also uses arrow |

**Verification**: `docker compose --env-file /dev/null run --rm test`

---

### Step 2: Frontend Toggle Feature Implementation

**Modified files**: `wasm-bridge.ts`, `view.ts`, `index.html`

| Action | Description |
|--------|-------------|
| WasmBridge.setShowParagraphMarks() | WASM API call wrapper |
| view:para-mark command | Toggle state management + `document-changed` event |
| index.html button connection | Toolbar `data-cmd`, remove menu `disabled` |
| active class toggle | Visual toggle state display |

**Verification**: Load document in browser → click menu/toolbar → confirm paragraph mark toggle

---

### Step 3: Build Verification + SVG Export Confirmation

1. `docker compose --env-file /dev/null run --rm test` — all tests pass
2. `docker compose --env-file /dev/null run --rm wasm` — WASM build
3. `cd rhwp-studio && npx vite build` — Vite build
4. SVG export: confirm arrow symbol rendering

---

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/renderer/composer.rs` | Add `has_line_break` to ComposedLine, remove `\n` | ~10 lines |
| `src/renderer/render_tree.rs` | Add `is_line_break_end` to TextRunNode | ~3 lines |
| `src/renderer/layout.rs` | Pass `is_line_break_end` flag | ~10 lines |
| `src/renderer/svg.rs` | Change pilcrow to arrow, add line break arrow | ~10 lines |
| `src/renderer/web_canvas.rs` | Change pilcrow to arrow, add line break arrow | ~10 lines |
| `src/renderer/html.rs` | Change pilcrow to arrow, add line break arrow | ~10 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | Add `setShowParagraphMarks()` | ~4 lines |
| `rhwp-studio/src/command/commands/view.ts` | Implement `view:para-mark` command | ~15 lines |
| `rhwp-studio/index.html` | Button `data-cmd` + remove menu disabled | ~2 lines |
