# Task 238 Stage 2 Completion Report: Frontend API Integration and Commands/Shortcuts

## Completed Items

### TypeScript Interfaces (types.ts)
- `SearchResult` — Search result (found, sec, para, charOffset, length, cellContext)
- `ReplaceResult` — Single replacement result
- `ReplaceAllResult` — Full replacement result
- `PageOfPositionResult` — Page number query result

### WASM Bridge Wrappers (wasm-bridge.ts)
- `searchText()`, `replaceText()`, `replaceAll()`, `getPageOfPosition()`
- Includes typeof guard code

### Command Implementation (edit.ts)
- `edit:find` — FindDialog singleton, focuses if already open
- `edit:find-replace` — FindDialog replace mode, switches mode if already open
- `edit:find-again` — Searches next if dialog is open, opens new dialog with last query otherwise
- `edit:goto` — Creates GotoDialog

### Shortcuts (shortcut-map.ts)
- Ctrl+F → `edit:find`
- Ctrl+F2 → `edit:find-replace`
- Ctrl+L → `edit:find-again`
- Alt+G / Alt+ㅎ → `edit:goto`

### Menu HTML (index.html)
- Activated 4 items: Find(F), Find & Replace(E), Find Again(X), Go To(G)

### Dialog Stubs
- `find-dialog.ts` — Full implementation in stage 3
- `goto-dialog.ts` — Full implementation in stage 4

## Changed Files

| File | Changes |
|------|---------|
| `rhwp-studio/src/core/types.ts` | Added 4 interfaces |
| `rhwp-studio/src/core/wasm-bridge.ts` | 4 API wrappers |
| `rhwp-studio/src/command/commands/edit.ts` | 4 command implementations |
| `rhwp-studio/src/command/shortcut-map.ts` | 5 shortcuts added |
| `rhwp-studio/index.html` | 4 menu items updated |
| `rhwp-studio/src/ui/find-dialog.ts` | New (stub) |
| `rhwp-studio/src/ui/goto-dialog.ts` | New (stub) |

## Verification
- TypeScript type check: No new errors
- cargo test: 716 passed
