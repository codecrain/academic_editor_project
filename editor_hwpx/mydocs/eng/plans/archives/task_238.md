# Task 238 Execution Plan: Implement Search Functionality

## Overview

Implement the four search-related features in the Edit menu.

| Feature | Shortcut | Description |
|---------|----------|-------------|
| Find(F) | Ctrl+F | Text search dialog, next/previous navigation |
| Find & Replace(E) | Ctrl+F2 | Find + replace/replace all |
| Find Again(X) | Ctrl+L | Move to next result using last search term |
| Go To(G) | Alt+G | Navigate to page number |

## Current State

- `edit:find`, `edit:find-replace` commands registered as stubs (`canExecute: () => false`)
- Menu HTML exists (disabled state)
- Shortcuts: Ctrl+F, Ctrl+H registered → need to add Ctrl+F2, Ctrl+L, Alt+G
- No WASM search API — new implementation required

## Implementation Scope

### Rust (WASM API)
1. **`searchText(query, fromSec, fromPara, fromChar, forward, caseSensitive)`** — Document text search
   - Traverse body paragraphs, including nested text in tables/text boxes
   - Case sensitivity option
   - Forward/backward search
   - Result: `{ found, sec, para, charOffset, length, cellContext? }`
2. **`replaceText(sec, para, charOffset, length, newText, cellContext?)`** — Text replacement
3. **`replaceAll(query, newText, caseSensitive)`** — Replace all, return replacement count
4. **`getPageOfPosition(sec, para)`** — Position-to-page number conversion (for highlighting)

### TypeScript (Frontend)
1. **Find/Find & Replace Dialog** — ModalDialog-based
   - Find tab: search term input, case sensitivity, find next/find previous
   - Replace tab: replacement text, replace/replace all
   - Search result highlighting (canvas overlay)
   - Edit area remains interactive while dialog is open (modeless)
2. **Go To Dialog** — Enter page number → scroll to that page
3. **Command/Shortcut Binding**
   - `edit:find` (Ctrl+F), `edit:find-replace` (Ctrl+F2), `edit:find-again` (Ctrl+L), `edit:goto` (Alt+G)
4. **Menu Item Update** — Remove disabled state, add missing items

## Excluded Scope
- Regular expression search
- Format-based search
- Control code search

## Impact Analysis

| File | Changes |
|------|---------|
| `src/document_core/queries/` | New search_query.rs |
| `src/document_core/queries/mod.rs` | Module registration |
| `src/wasm_api.rs` | searchText, replaceText, replaceAll, getPageOfPosition API |
| `rhwp-studio/src/ui/` | New find-dialog.ts, goto-dialog.ts |
| `rhwp-studio/src/command/commands/edit.ts` | Implement 4 commands |
| `rhwp-studio/src/command/shortcut-map.ts` | Add Ctrl+F2, Ctrl+L, Alt+G |
| `rhwp-studio/index.html` | Update menu items (add Find Again, Go To) |
| `rhwp-studio/src/core/wasm-bridge.ts` | API wrapper |
| `rhwp-studio/src/core/types.ts` | Add interfaces |
| `rhwp-studio/src/styles/` | New find-dialog.css |

## Verification Plan
- cargo test passes
- WASM build succeeds
- Browser test: Find → highlight → next/previous, replace, replace all, go to
