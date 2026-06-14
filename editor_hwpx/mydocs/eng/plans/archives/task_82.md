# Task 82 Execution Plan: Context Menu Infrastructure + Table Right-Click Menu

## 1. Goal

Build a right-click context menu system and display a table editing menu when right-clicking inside a table cell.

## 2. Current Status Analysis

### Existing Infrastructure
- **CommandDispatcher**: Command execution/active state query fully implemented (`dispatcher.ts`)
- **CommandRegistry**: Category-based command lookup available (`registry.ts`, `getByCategory()`)
- **table.ts**: 21 `table:*` command stubs registered (`canExecute: () => false`)
- **InputHandler**: Only mousedown events handled, no contextmenu event
- **MenuBar**: Dropdown menu system fully implemented (reference pattern)
- **Styles**: `.md-item`, `.md-sep` and other menu item styles already defined

### Missing Parts
- No context menu class
- No contextmenu event handler
- No browser default context menu suppression
- All table commands have canExecute as false (cannot execute)

## 3. Implementation Scope

### 3-1. ContextMenu Class (`rhwp-studio/src/ui/context-menu.ts`)
- Receive menu item list and generate/display DOM
- Position based on clientX/Y
- Close on ESC key / outside click
- CommandDispatcher integration: canExecute check for disabled item display
- Execute command on menu item click then close menu
- Separator support

### 3-2. InputHandler Extension
- Add `contextmenu` event handler
- `e.preventDefault()` to suppress browser default menu
- Right-click position hitTest → determine inside/outside table cell
- Inside table cell: show table-specific edit menu
- Outside table: show general edit menu (cut/copy/paste)

### 3-3. Activate table Command canExecute
- Add canExecute conditions to activate only inside table cells
- Items without execute implementation: set canExecute only (displayed in menu but no action on click)

### 3-4. CSS Styles
- Reuse existing `.md-item`, `.md-sep` styles
- Add context menu container style (position:fixed, z-index)

## 4. Impact

- **Low**: New feature addition, no changes to existing behavior
- No impact on existing mousedown handler
- Context menu is an independent DOM element

## 5. Test Plan

- Rust tests: no changes, confirm existing tests pass
- WASM build: confirm normal build
- Web verification:
  - Right-click inside table cell → table edit menu displayed
  - Right-click outside table → general edit menu displayed
  - ESC / outside click → menu closes
  - Disabled items shown in gray
  - Browser default menu does not appear

## 6. Branch

- `local/table-edit` → `local/task82`
- Merge to `local/table-edit` after completion
