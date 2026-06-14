# Task 240 - Stage 1 Completion Report: Rust WASM API — Bookmark CRUD + F11 Support

## Completed Items

### bookmark_query.rs (new)
- `get_bookmarks_native()` — Traverses entire document and returns bookmark list as JSON
- `add_bookmark_native()` — Inserts Bookmark control at cursor position (rejects duplicate names)
- `delete_bookmark_native()` — Removes bookmark by sec/para/ctrl_idx
- `rename_bookmark_native()` — Renames bookmark (with duplicate check)
- `collect_bookmarks()` — Internal helper, traverses all paragraphs

### wasm_api.rs
- `getBookmarks()`, `addBookmark()`, `deleteBookmark()`, `renameBookmark()` — 4 WASM bindings

### text_editing.rs
- Added `Control::Bookmark` → `"bookmark"` in `classify_control()`
- F11 now recognizes bookmark controls as selection targets

### queries/mod.rs
- Registered `mod bookmark_query`

## Verification
- `cargo build` successful
- 716 tests passed (0 failures)
