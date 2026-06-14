# Task 240 Implementation Plan: Implement Bookmark Functionality

## Phased Implementation Plan

### Phase 1: Rust WASM API — Bookmark CRUD + F11 Support

- New `src/document_core/queries/bookmark_query.rs`
  - Traverse entire document to return bookmark list (name, position: sec/para/ctrl_idx)
  - Add bookmark (insert Bookmark into paragraph controls at cursor position + recompose)
  - Delete bookmark (remove control by sec/para/ctrl_idx + recompose)
  - Rename bookmark
- Add WASM bindings to `src/wasm_api.rs`
  - `getBookmarks() → JSON [{name, sec, para, ctrlIdx}]`
  - `addBookmark(sec, para, charOffset, name) → JSON {ok, error?}`
  - `deleteBookmark(sec, para, ctrlIdx) → JSON {ok}`
  - `renameBookmark(sec, para, ctrlIdx, newName) → JSON {ok, error?}`
- `src/document_core/commands/text_editing.rs` — Add `Control::Bookmark` to `classify_control()`
  - Allow F11 to recognize bookmark controls as selection targets
- Verify `cargo test` passes

### Phase 2: Bookmark Marker Rendering in Control Code Mode

- Modify `src/renderer/layout/paragraph_layout.rs`
  - Detect Bookmark in paragraph control list
  - Insert `[Bookmark: name]` text marker when `show_control_codes` mode is active
  - Same approach as existing `[Field Start/End]` pattern (reduced font, color differentiation)
- WASM rebuild + verify bookmark display in control code mode for existing HWP files

### Phase 3: TypeScript Dialog UI

- `rhwp-studio/src/core/types.ts` — Add `BookmarkInfo` type
- `rhwp-studio/src/core/wasm-bridge.ts` — 4 WASM API wrappers
- `rhwp-studio/src/ui/bookmark-dialog.ts` — Bookmark dialog
  - Bookmark name input field
  - Bookmark list (sort by name/position)
  - Insert/Go To/Delete/Rename/Close buttons
  - Duplicate name validation + error message
- `rhwp-studio/src/styles/bookmark-dialog.css` — Styles
- `rhwp-studio/src/style.css` — CSS import

### Phase 4: Command/Menu/Shortcut Binding and Testing

- `insert.ts` — Implement `insert:bookmark` command
- `index.html` — Add/activate Menu > Insert > Bookmark item
- `shortcut-map.ts` — Ctrl+K,B shortcut
- Add TypeScript handling for F11 bookmark selection (bookmark type branch in handleF11)
- Add bookmark tab to Go To dialog (extend GotoDialog)
- Functional testing
  - Menu > Insert > Bookmark → open dialog → insert
  - Verify `[Bookmark: name]` marker in control code mode
  - Select bookmark with F11 → modify/delete
  - Go To > navigate to bookmark
- Update daily task status
