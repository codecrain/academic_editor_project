# Task 52 Execution Plan: Format Changes (Font/Size/Bold/Italic)

## Overview

- **Task**: B-307. Format Changes (Font/Size/Bold/Italic)
- **Branch**: `local/task52`
- **Prerequisite**: Task 51 (Copy/Paste) completed

## Goal

Build an editing toolbar (style_bar) with the same interface as Hancom WebGian, and implement applying character formats (font/size/bold/italic/underline/strikethrough/text color) to selected ranges.

## Scope

### Included
- Style bar UI (`#style-bar`) -- layout similar to Hancom WebGian style_bar
  - Font selection dropdown
  - Font size input + increment/decrement buttons
  - Bold(B)/Italic(I)/Underline(U)/Strikethrough(S) toggle buttons
  - Text color selection (color picker)
  - Paragraph alignment buttons (left/center/right/justify)
  - Vertical separators for group division
- Shortcuts: Ctrl+B (bold), Ctrl+I (italic), Ctrl+U (underline)
- CharShape application to selected range (body + cell interior)
- Auto-query format state at cursor position -> toolbar state sync
- ApplyCharFormatCommand + Undo/Redo integration

### Excluded
- Detailed paragraph formatting (line spacing, indent, etc.)
- Bullets/numbering
- Styles (paragraph styles) feature
- Drawing shape formatting

## Existing Assets

Rust WASM side has CharShape API fully implemented:
- `getCharPropertiesAt(sec, para, offset)` -> JSON
- `getCellCharPropertiesAt(...)` -- same for cells
- `applyCharFormat(sec, para, start, end, propsJson)` -- apply format to range
- `applyCharFormatInCell(...)` -- same for cells
- `findOrCreateFontId(name)` -- font ID lookup/creation

## Implementation Phases

| Phase | Content | Key Files |
|-------|---------|-----------|
| Phase 1 | Toolbar UI construction (HTML + CSS) | index.html, style.css |
| Phase 2 | Toolbar TypeScript module + EventBus integration | ui/toolbar.ts (new), main.ts |
| Phase 3 | WasmBridge wrappers + ApplyCharFormatCommand | wasm-bridge.ts, types.ts, command.ts |
| Phase 4 | InputHandler integration (shortcuts + format state query) | input-handler.ts |
| Phase 5 | Font list + color picker + alignment | toolbar.ts, wasm-bridge.ts |
