# Task 238 Final Report: Search Feature Implementation

## Overview

Implemented 4 search-related features in the Edit menu.

| Feature | Shortcut | Description |
|---------|----------|-------------|
| Find(F) | Ctrl+F | Modeless search dialog, next/previous navigation |
| Find & Replace(E) | Ctrl+F2 | Find + replace/replace all |
| Find Again(X) | Ctrl+L | Moves to next result with last search term (no dialog) |
| Go To(G) | Alt+G | Enter page number → navigate to that page |

## Completed Items

### WASM Search Engine (Rust)
- `searchText(query, fromSec, fromPara, fromChar, forward, caseSensitive)` — Full document text search
  - Includes body paragraphs, table cells, text box contents
  - Forward/reverse + wrap-around
  - Case sensitivity option
- `replaceText(sec, para, charOffset, length, newText)` — Single replacement
- `replaceAll(query, newText, caseSensitive)` — Full replacement (reverse order processing, batch recompose for affected sections)
- `getPageOfPosition(sectionIdx, paraIdx)` — Position → page number
- `getPositionOfPage(globalPage)` — Page number → position (for Go To)

### Frontend
- **FindDialog**: Modeless dialog (editing area remains interactive)
  - Find/replace mode switching
  - Search result selection highlighting
  - Keyboard: Enter=next, Shift+Enter=previous, Escape=close
  - Drag to move, singleton management
- **GotoDialog**: ModalDialog-based, page number input → navigation
- **Find Again**: Direct WASM search without dialog
- **Commands/Shortcuts**: Ctrl+F, Ctrl+F2, Ctrl+L, Alt+G
- **Menu**: 4 items activated

## Changed Files

| File | Changes |
|------|---------|
| `src/document_core/queries/search_query.rs` | New: search/replace engine + page↔position conversion |
| `src/document_core/queries/mod.rs` | Registered search_query module |
| `src/wasm_api.rs` | Added 5 WASM APIs |
| `rhwp-studio/src/core/types.ts` | SearchResult, ReplaceResult, etc. interfaces |
| `rhwp-studio/src/core/wasm-bridge.ts` | 5 API wrappers |
| `rhwp-studio/src/ui/find-dialog.ts` | New: find/replace modeless dialog |
| `rhwp-studio/src/ui/goto-dialog.ts` | New: go-to dialog |
| `rhwp-studio/src/styles/find-dialog.css` | New: dialog styles |
| `rhwp-studio/src/style.css` | Added import |
| `rhwp-studio/src/command/commands/edit.ts` | 4 command implementations |
| `rhwp-studio/src/command/shortcut-map.ts` | 5 shortcuts added |
| `rhwp-studio/index.html` | 4 menu items updated |
| `mydocs/orders/20260316.md` | Task 238 registration |

## Verification Results
- cargo test: 716 passed, 0 failed
- WASM build: Successful
- TypeScript type check: No new errors
