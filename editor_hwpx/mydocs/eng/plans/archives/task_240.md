# Task 240 Execution Plan: Implement Bookmark Functionality

## Goal

Implement the ability to insert named position markers (bookmarks) in the document body, and perform list view, navigation, deletion, and renaming through a dialog.

## Feature Definition Based on Hancom Help

### Bookmark Dialog (Ctrl+K,B)
- **Bookmark Name** — Input field (suggests text near cursor position as default)
- **Bookmark List** — Display bookmarks registered in the current document
- **Sort Criteria** — By name / by position
- **Insert** — Insert new bookmark at cursor position (duplicate names not allowed)
- **Go To** — Move cursor to selected bookmark position
- **Delete** — Remove selected bookmark from document
- **Rename** — Change selected bookmark name

### Behavior Rules
- Duplicate bookmark names are not allowed
- Bookmarks are inserted as control codes (invisible on screen, no effect on printing/sorting)
- Bookmark markers can be seen in control code display mode

## Current Code State

### Already Implemented (Rust)
- `Bookmark` model (`src/model/control.rs`) — `name: String`
- HWP binary parser (`src/parser/control.rs`) — `parse_bookmark()`
- HWPX XML parser (`src/parser/hwpx/section.rs`)
- Serializer (`src/serializer/control.rs`) — `serialize_bookmark()`

### Not Yet Implemented
- WASM API — Bookmark list query, add, delete, rename, position lookup
- Control code display — Render `[Bookmark: name]` marker in control code mode
- TypeScript dialog UI
- Command/menu/shortcut binding

## Impact Scope

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | Add bookmark CRUD WASM API |
| `src/document_core/queries/` | Bookmark query/manipulation query module |
| `src/renderer/layout/paragraph_layout.rs` | Render bookmark marker in control code mode |
| `rhwp-studio/src/core/wasm-bridge.ts` | WASM API wrapper |
| `rhwp-studio/src/core/types.ts` | BookmarkInfo type |
| `rhwp-studio/src/ui/bookmark-dialog.ts` | Bookmark dialog |
| `rhwp-studio/src/styles/bookmark-dialog.css` | Dialog styles |
| `rhwp-studio/src/command/commands/insert.ts` | `insert:bookmark` command |
| `rhwp-studio/index.html` | Activate menu items |
| `rhwp-studio/src/command/shortcut-map.ts` | Ctrl+K,B shortcut |

## Excluded Items
- Block bookmarks (selection-based bookmarks)
- Quick bookmarks (Ctrl+K,1~0 / Ctrl+Q,1~0)
- Hyperlink integration
- Cross-reference functionality
