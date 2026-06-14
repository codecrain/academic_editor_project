# Task 240 - Stage 3 Completion Report: TypeScript Dialog UI

## Completed Items

### types.ts
- Added `BookmarkInfo` interface (name, sec, para, ctrlIdx, charPos)

### wasm-bridge.ts
- `getBookmarks()` — Retrieve bookmark list
- `addBookmark()` — Add bookmark
- `deleteBookmark()` — Delete bookmark
- `renameBookmark()` — Rename bookmark

### bookmark-dialog.ts (new)
- Hancom UI reference: Name input field + list (name/type) + Insert/Cancel/Go buttons
- Rename (pencil icon) / Delete (X) icon buttons
- Sort criteria: Name(A) / Position(P) radio buttons
- Duplicate name rejection + error message display
- Confirmation dialog on deletion
- Double-click to navigate
- Default name suggestion (BookmarkN)

### bookmark-dialog.css (new)
- 360px width dialog, 160px height list

### style.css
- Added CSS import

## Verification
- No TypeScript compilation errors
