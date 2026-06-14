# Task 193 Implementation Plan — Header/Footer Creation and Basic Editing

## Step Overview

| Step | Content | Key Deliverables |
|------|---------|-----------------|
| 1 | WASM API and Rust editing functions | Header/footer CRUD API, text insert/delete API |
| 2 | Frontend editing mode state management | CursorState extension, entry/exit logic |
| 3 | Context toolbar and visual display | Dedicated toolbar, body dimming, area labels |
| 4 | Text editing pipeline integration and menu commands | Input/delete/IME, menu connection, page number insertion |

---

## Step 1: WASM API and Rust Editing Functions

- New module `header_footer_ops.rs`: get/create/insertText/deleteText functions for header/footer
- WASM bindings: 5 methods exposed to JS
- Cursor coordinate calculation for header/footer area

## Step 2: Frontend Editing Mode State Management

- CursorState extension with headerFooterMode, position fields, enter/exit methods
- Entry triggers: menu commands, double-click on header/footer area
- Exit triggers: Shift+Esc, close button, body area click
- EventBus: `headerFooterModeChanged` event

## Step 3: Context Toolbar and Visual Display

- Header/footer dedicated toolbar HTML (reuse `.tb-rotate-group` pattern)
- Toolbar switch logic on mode change
- Body dimming CSS overlay
- Area label display (dashed border + descriptive text)

## Step 4: Text Editing Pipeline Integration and Menu Commands

- Extend insertTextAtRaw/deleteTextAt with headerFooter mode branching
- IME composition handling extension
- Activate page:header-create, page:footer-create, page:headerfooter-close commands
- Page number field insertion
- Character/paragraph formatting in header/footer mode
- Keyboard shortcuts: Shift+Esc for exit
