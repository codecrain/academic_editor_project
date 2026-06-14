# Task 51 Execution Plan: Copy/Paste (Clipboard)

## Overview

- **Task**: B-305. Copy/Paste (Clipboard)
- **Branch**: `local/task51`
- **Prerequisite**: Task 50 (Cursor Movement Extension + Cell Navigation) completed

## Goal

Implement text selection (Selection) and clipboard functionality (Ctrl+C/X/V) in the HWP web editor.

## Scope

### Included
- Text selection (Shift+Arrow, Shift+Home/End, Ctrl+Shift+Home/End, Ctrl+A)
- Selection area visualization (blue semi-transparent highlight)
- Copy (Ctrl+C) -- system clipboard + internal clipboard
- Cut (Ctrl+X) -- copy then delete selection
- Paste (Ctrl+V) -- internal/external text insertion
- Selection area editing (Backspace/Delete/character input replaces selection)
- Same behavior inside table cells
- Undo/Redo integration

### Excluded (First Pass)
- Mouse drag selection
- Selection crossing cell/body boundaries
- Cell block selection (table-wide cell range selection)
- Format-inclusive paste (HTML -> format restoration)
- Image/shape copy

## Existing Assets

Rust WASM side already has clipboard APIs implemented:
- `copySelection`, `copySelectionInCell`
- `pasteInternal`, `pasteInternalInCell`
- `pasteHtml`, `pasteHtmlInCell`
- `exportSelectionHtml`, `exportSelectionInCellHtml`
- `hasInternalClipboard`, `getClipboardText`, `clearClipboard`

## Implementation Phases

| Phase | Content | Key Files |
|-------|---------|-----------|
| Phase 1 | Selection model + Shift+Arrow key handling | cursor.ts, input-handler.ts, types.ts |
| Phase 2 | Selection rendering (WASM getSelectionRects + DOM overlay) | wasm_api.rs, selection-renderer.ts, wasm-bridge.ts |
| Phase 3 | Clipboard integration + selection area editing | wasm_api.rs, command.ts, input-handler.ts, wasm-bridge.ts |

## Deliverables

- 7 modified files (Rust 1 + TypeScript 6)
- 1 new file (selection-renderer.ts)
- 4 additional WASM APIs (getSelectionRects, getSelectionRectsInCell, deleteRange, deleteRangeInCell)
