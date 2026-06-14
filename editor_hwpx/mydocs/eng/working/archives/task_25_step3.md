# Task 25 — Stage 3 Completion Report: Edit Mode State Machine + Visualization

## Completed Items

### 3-1. SelectionRenderer Visualization Methods Added (`web/text_selection.js`)

| Method | Function |
|--------|----------|
| `drawObjectSelection(ctrl)` | Blue dashed border (2px) + 8 resize handles (6x6px white squares) |
| `drawCellSelection(cells)` | Translucent blue background (rgba 0,100,255,0.2) + blue solid border (2px) |

### 3-2. SelectionController Text Click Callback (`web/text_selection.js`)

- Added `onTextClick` callback: Called on TextRun hit → editor.js switches to editMode='text'

### 3-3. Edit Mode State Machine (`web/editor.js`)

**State variables**:
```javascript
let editMode = 'none';      // 'none' | 'text' | 'objectSelected' | 'cellSelected'
let selectedControl = null;  // Selected control info
let selectedCells = [];      // Selected cells array
```

**State transition rules**:

| Current Mode | Event | New Mode | Visualization |
|-------------|-------|----------|---------------|
| none/text | TextRun click | text | Caret |
| none/text | Control click | objectSelected | Dashed border + handles |
| objectSelected | Esc | none | Cleared |
| objectSelected | Enter/F5 (table) | cellSelected | Cell highlight |
| cellSelected | Esc | objectSelected | Dashed border + handles |
| cellSelected | Enter | text (in cell) | Caret |
| cellSelected | Arrow keys | cellSelected (move) | Cell highlight |
| text (in cell) | Esc | cellSelected | Cell highlight |
| text (body) | Esc | none | Cleared |

### 3-4. Keyboard Handler Extension (`web/editor.js`)

Added editMode-specific branching before existing keyboard handler:

- **objectSelected**: Esc → clear, Enter/F5 → cell select (table), only Ctrl combos pass through
- **cellSelected**: Esc → object select, Enter → cell edit, arrow keys → cell move, Tab → blocked
- **text + Esc**: In cell → cellSelected, body → none

### 3-5. Cell Text Edit/Navigation Helpers

| Function | Description |
|----------|-------------|
| `enterCellTextEdit(cell)` | Set caret to first paragraph in cell, IME focus |
| `findControlForCell(docPos)` | Search for parent table control by document coordinates |
| `handleCellNavigation(key, isShift)` | Arrow key cell movement, Shift+arrow range extension (basic) |

### 3-6. editMode Reset

- On file upload (`handleFileUpload`): editMode = 'none'
- On page navigation (`prevPage`/`nextPage`): editMode = 'none'

## Changed Files

| File | Changes |
|------|---------|
| `web/text_selection.js` | Added drawObjectSelection/drawCellSelection to SelectionRenderer, onTextClick callback |
| `web/editor.js` | editMode state machine, keyboard handler extension, helper functions, reset logic |

## Verification Results

- `docker compose run --rm test` — 346 tests passed
- `docker compose run --rm wasm` — WASM build successful
- JS code syntax verification complete
