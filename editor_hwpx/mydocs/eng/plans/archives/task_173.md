# Task 173: Style Editing — Execution Plan

## Goal

Implement Style editing features. Currently style application (applyStyle) is implemented, but WASM APIs and UI for creating, editing, and deleting styles are missing. Implement style list + property preview + editing functionality referencing Hancom's F6 dialog.

## Current Status

| Feature | WASM API | UI |
|---------|:--------:|:--:|
| Style list query | O (getStyleList) | O (dropdown) |
| Style application | O (applyStyle) | O (dropdown change) |
| Style property query (by ID) | X | X |
| Style editing | X | X |
| Style creation | X | X |
| Style deletion | X | X |

## Implementation Scope

1. **WASM API extension**: getStyleDetail + updateStyle + createStyle + deleteStyle + updateStyleShapes
2. **Style dialog**: Style list + property preview + apply (Hancom F6)
3. **Style edit sub-dialog**: Name/English name/next style/paragraph shape/character shape editing
4. **Menu integration**: Format menu + F6 shortcut + command registration

## Modified Target Files

| File | Change Description |
|------|-------------------|
| `src/wasm_api.rs` | Extend getStyleList + 5 new APIs |
| `src/document_core/commands/formatting.rs` | Add build_char_properties_json_by_id |
| `rhwp-studio/src/core/wasm-bridge.ts` | 5 WASM API wrappers |
| `rhwp-studio/src/ui/style-dialog.ts` | Style main dialog (new) |
| `rhwp-studio/src/ui/style-edit-dialog.ts` | Style edit/add sub-dialog (new) |
| `rhwp-studio/src/styles/style-dialog.css` | Dialog CSS (new) |
| `rhwp-studio/index.html` | Menu item addition |
| `rhwp-studio/src/command/commands/format.ts` | Command registration |
