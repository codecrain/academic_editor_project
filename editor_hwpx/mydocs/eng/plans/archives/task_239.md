# Task 239 Execution Plan: Implement Character Map Input

## Goal

Display a Unicode character map dialog when the toolbar or menu character map button is clicked, and insert the selected character at the cursor position in the document body.

## Scope

- **Limited to the Unicode character map** (excludes User character map, Hangul (HNC) character map, and Wansung (KS) character map)
- Implementation references the Hancom Office character map input UI

## Key Features

1. **Unicode Block List** — Display Unicode block categories in the left panel (Basic Latin, Greek, Arrows, Math Operators, Shapes, CJK, etc.)
2. **Character Grid** — Display characters of the selected block in a 16-column grid
3. **Character Selection and Preview** — Highlight on click + display Unicode code + enlarged preview
4. **Character Insertion** — Insert character at cursor position via "Insert" button or double-click
5. **Recently Used Characters** — Track and display recently inserted characters via localStorage
6. **Entry Point Binding** — Toolbar button, Menu > Insert > Character Map, shortcut (Alt+F10)

## Impact Scope

| File | Changes |
|------|---------|
| `rhwp-studio/src/ui/symbols-dialog.ts` | New — Character map dialog class |
| `rhwp-studio/src/styles/symbols-dialog.css` | New — Character map dialog styles |
| `rhwp-studio/src/style.css` | Add CSS import |
| `rhwp-studio/src/command/commands/insert.ts` | `insert:symbols` stub → actual implementation |
| `rhwp-studio/index.html` | Remove menu disabled state, bind toolbar button data-cmd |

## Technical Notes

- No Rust/WASM changes — character insertion uses existing `insertText` API
- Undo/redo supported via `InsertTextCommand`
- Modal dialog based on `ModalDialog`
- Unicode block definitions managed as TypeScript constant arrays

## Excluded Items

- User character map, Hangul (HNC) character map, Wansung (KS) character map tabs
- Input Character(G) field (continuous input buffer)
- Register(R) functionality (user character map registration)
- Enlarge Selected Character(M) checkbox
