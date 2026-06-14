# Task 239 Implementation Plan: Implement Character Map Input

## Phased Implementation Plan

### Phase 1: Character Map Dialog UI Implementation

- Create new `symbols-dialog.ts`
  - Unicode block definitions (constant array)
  - Left panel block list
  - 16-column character grid
  - Unicode code display + enlarged preview
  - Insert/Close buttons
  - Recently used characters area (localStorage)
- Create new `symbols-dialog.css`
- Add import to `style.css`

### Phase 2: Command Binding and Character Insertion

- `insert:symbols` stub → actual implementation (invoke SymbolsDialog)
- Insert character at cursor position via `InsertTextCommand` (undo/redo supported)
- `index.html` remove menu disabled state + bind toolbar button data-cmd
- Add `vite-env.d.ts` (fix existing tsc errors)

### Phase 3: Testing and Final Cleanup

- Verify operation: select block → click character → insert → inserted in body
- Verify double-click instant insertion
- Verify recently used character save/display
- Verify entry points: toolbar, menu, shortcut (Alt+F10)
- Update daily task status
