# Task 48 Execution Plan

## Task: rhwp-studio Basic Cursor + Text Input

## Goal

Implement basic cursor placement (click), text input, and Backspace deletion in rhwp-studio. Follows Design Document Section 6 (Cursor Model) and Section 7 (Input System) basic structure.

## Current State Analysis

### Available WASM APIs (Existing)
- `insertText(sec, para, charOffset, text)` -- Text insertion
- `deleteText(sec, para, charOffset, count)` -- Text deletion
- `splitParagraph(sec, para, charOffset)` -- Paragraph split (Enter)
- `mergeParagraph(sec, para)` -- Paragraph merge (Backspace at start)
- `getParagraphCount(sec)` / `getParagraphLength(sec, para)` -- Paragraph info
- `renderPageToCanvas(pageNum, canvas)` -- Page rendering

### Additional WASM APIs Needed
- `getCursorRect(sec, para, charOffset)` -- Caret pixel coordinates (for caret rendering)
- `hitTest(page, x, y)` -- Coordinate -> document position conversion (for click cursor placement)

## Execution Phases

### Phase 1: WASM API Addition -- getCursorRect, hitTest (Rust)

Add 2 APIs to `wasm_api.rs`:

**getCursorRect(sec, para, charOffset) -> JSON**
- Build render tree via `build_page_tree()`
- Traverse TextRunNodes to find node containing charOffset
- Calculate exact X coordinate via character width interpolation
- Return: `{pageIndex, x, y, height}`

**hitTest(page, x, y) -> JSON**
- Build render tree via `build_page_tree()`
- Find TextRunNode containing (x, y)
- Calculate charOffset via character width interpolation
- Return: `{sectionIndex, paragraphIndex, charOffset}`

### Phase 2: TypeScript Cursor Model + Caret Rendering

**New files:**
- `engine/cursor.ts` -- DocumentPosition type, CursorState management
- `engine/caret-renderer.ts` -- Canvas overlay caret (500ms blink)

### Phase 3: Click Cursor Placement + Keyboard Input

**New file:**
- `engine/input-handler.ts` -- Hidden textarea, keydown handling

**Features:**
- Click -> hitTest -> cursor move -> caret render
- Text input -> insertText -> page re-render -> caret update
- Backspace -> deleteText/mergeParagraph -> re-render -> caret update
- Enter -> splitParagraph -> re-render -> caret update
- Left/Right arrows -> cursor move -> caret update

### Phase 4: Build Verification + Runtime Testing
