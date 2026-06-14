# Task 73: Paragraph Mark Display Feature — Execution Plan

## Goal

Complete the **paragraph mark display** feature of the HWP editor. Display blue arrow symbols at Enter (paragraph end) and Shift+Enter (forced line break) positions to visually confirm document structure.

## Background

- HWP Help (View → Show/Hide → Paragraph Marks) standard: blue arrow symbol, editing screen only (not printed)
- Backend (Rust): `show_paragraph_marks` flag and pilcrow rendering already implemented, but inconsistent with HWP standard symbol (arrow)
- Frontend (TypeScript): `view:para-mark` command in TODO state, WasmBridge methods not implemented
- Forced line break (Shift+Enter) symbol not supported
- WebGian analysis: `e_para_mark` command, uses independent `o9`/`u9` toggle flags

## Scope

1. **Backend renderer modification**: Change pilcrow to arrow symbol, add forced line break arrow symbol
2. **Frontend toggle implementation**: WasmBridge method, command execution, toolbar/menu connection
3. **Build verification**: Full test + WASM + Vite build + SVG export

## Impact Area

- Rust: `composer.rs`, `render_tree.rs`, `layout.rs`, `svg.rs`, `web_canvas.rs`, `html.rs`
- TypeScript: `wasm-bridge.ts`, `view.ts`
- HTML: `index.html`

## Risks

- Adding `has_line_break` flag to ComposedLine may cause existing test regression → step-by-step verification
- Removing `\n` character may affect text offset calculation → careful char_offset tracking
