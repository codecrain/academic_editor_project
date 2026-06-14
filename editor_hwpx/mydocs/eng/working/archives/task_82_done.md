# Task 82 Completion Report: Context Menu Infrastructure + Table Right-Click Menu

## Summary

Built a right-click context menu system, and implemented showing a table editing menu when right-clicking inside a table cell.

## Changed Files

| File | Change Type | Description |
|------|------------|-------------|
| `rhwp-studio/src/ui/context-menu.ts` | New | ContextMenu class — menu show/close, ESC/outside-click close, CommandDispatcher integration |
| `rhwp-studio/src/engine/input-handler.ts` | Modified | Added contextmenu event handler, table cell inside/outside detection, menu item list definition |
| `rhwp-studio/src/command/commands/table.ts` | Modified | Changed canExecute to `ctx.inTable` condition (active only inside table cells) |
| `rhwp-studio/src/style.css` | Modified | Added `.context-menu` styles |
| `rhwp-studio/src/main.ts` | Modified | Created ContextMenu instance and injected into InputHandler |

## Implementation Details

### 1. ContextMenu Class (`context-menu.ts`)
- `show(x, y, items)`: Creates menu DOM at clientX/Y, viewport boundary correction
- `hide()`: Removes DOM, releases event listeners
- ESC key / outside click (mousedown) -> auto-close
- Reuses existing `.md-item`, `.md-sep`, `.md-shortcut` CSS classes
- Grays out disabled items using `CommandDispatcher.isEnabled()`

### 2. InputHandler Extension
- `contextmenu` event -> `e.preventDefault()` (suppresses browser default menu)
- hitTest determines if inside table cell (`parentParaIndex !== undefined && !isTextBox`)
- Inside table cell: cut/copy/paste + cell properties + row/column add/delete + merge/split
- Outside table: cut/copy/paste

### 3. Table Command Activation
- Changed `canExecute: () => false` to `canExecute: (ctx) => ctx.inTable`
- Only `table:create` has `ctx.hasDocument` condition
- Execute body to be implemented in subsequent tasks

## Verification Results

- Rust tests: 496 passed
- WASM build: Succeeded
- Vite build: Succeeded

## Branch

- `main` -> `local/table-edit` -> `local/task82`
