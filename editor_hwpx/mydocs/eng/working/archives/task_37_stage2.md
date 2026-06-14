# Task 37 - Step 2 Completion Report: Plain Text Paste (JS)

## Implementation Details

### 1. Ctrl+C/V/X Key Bindings (editor.js)

| Key | Condition | Action |
|-----|-----------|--------|
| Ctrl+C | Caret/selection/control selection active | Calls `handleCopyToInternal()`, no `preventDefault` (text_selection.js handles browser clipboard) |
| Ctrl+V | Caret or selection active | Calls `handlePaste()`, `preventDefault` |
| Ctrl+X | Caret or selection active | Calls `handleCut()`, `preventDefault` |

### 2. handleCopyToInternal()

Copies selection content to internal WASM clipboard.

- **Control selection state** (`editMode === 'objectSelected'`): Calls `doc.copyControl()`
- **Text selection (body)**: `doc.copySelection(secIdx, startPara, startOffset, endPara, endOffset)`
- **Text selection (inside cell)**: `doc.copySelectionInCell(secIdx, parentPara, ctrlIdx, cellIdx, startCellPara, startOffset, endCellPara, endOffset)`
- Operates in parallel with existing text_selection.js Ctrl+C handler (copies to both internal + browser clipboard)

### 3. handlePaste() (async)

Uses internal clipboard first; if unavailable, reads plain text from browser clipboard and inserts it.

#### Operation Flow

1. Delete selection range if present
2. Determine paste position (selection start or caret position)
3. **Check internal clipboard** (`doc.hasInternalClipboard()`)
   - Body: `doc.pasteInternal(secIdx, paraIdx, charOffset)` -> format-preserving paste
   - Cell: `doc.pasteInternalInCell(secIdx, parentPara, ctrlIdx, cellIdx, cellParaIdx, charOffset)`
   - Restore caret from returned JSON using `paraIdx`/`cellParaIdx` + `charOffset`
4. **No internal clipboard** -> `navigator.clipboard.readText()` -> `handleTextInsert(text)` (reuses existing text insertion logic)

### 4. handleCut()

Cut: Performs copy + delete sequentially.

1. Not supported in control object selection state (warn)
2. Calls `handleCopyToInternal()` (copy to internal clipboard)
3. `textLayout.getSelectedText()` -> `navigator.clipboard.writeText()` (also copies to browser clipboard)
4. Calls `_doDeleteText()` (delete selection)
5. Re-render + caret restoration

### 5. getSelectionDocRange() Extension (text_selection.js)

Completed in previous step. Extended to support multi-paragraph selection.

- `startParaIdx` / `endParaIdx`: Actual paragraph indices
- `startCellParaIdx` / `endCellParaIdx`: Cell-internal paragraph indices
- Cross-section, cross-cell selection not supported

## Event Flow

### Ctrl+C (Copy)
```
editor.js keydown -> handleCopyToInternal() -> doc.copySelection() [internal clipboard]
text_selection.js keydown -> navigator.clipboard.writeText() [browser clipboard]
```
-> Saves to both internal/browser clipboard simultaneously

### Ctrl+V (Paste)
```
editor.js keydown -> handlePaste()
  -> doc.hasInternalClipboard() ?
      |-> Y: doc.pasteInternal() [format preserved]
      |-> N: navigator.clipboard.readText() -> handleTextInsert() [plain text]
```

### Ctrl+X (Cut)
```
editor.js keydown -> handleCut()
  |-> handleCopyToInternal() [internal clipboard]
  |-> navigator.clipboard.writeText() [browser clipboard]
  |-> _doDeleteText() [delete selection]
```

## Test Results

- Existing tests: 421 passed (including 5 clipboard tests)
- WASM build: Success
- JS code: No syntax errors (verified during WASM build)

## Modified Files

| File | Changes |
|------|---------|
| `web/editor.js` | Ctrl+C/V/X key bindings, handleCopyToInternal(), handlePaste(), handleCut() implementation |
| `web/text_selection.js` | getSelectionDocRange() multi-paragraph selection support (completed in step 1) |
