# Task 25: Control Object Selection and Cell Selection - Implementation Plan

## Current Architecture Analysis

### Data Flow (Current)
```
Rust PageRenderTree → get_page_text_layout_native() → Only TextRun as JSON output
  → JS TextLayoutManager.runs[] → hitTest(x,y) → Only TextRun matching → caret/text editing
```

### Core Gap
- `get_page_text_layout_native()` collects **only TextRun nodes** — Table, TableCell, Image nodes not included
- JS hitTest checks only TextRun bounding boxes — cannot determine control areas
- Only one editing mode exists (text editing) — no object selection/cell selection modes

---

## Phase 1: WASM API — Control/Cell Layout Information

**Goal**: Pass bounding boxes of Table, TableCell, Image, Shape nodes from the render tree to JS

### `src/wasm_api.rs` — Add `getPageControlLayout` API

Recursively traverse the render tree similar to `get_page_text_layout_native()`, but collect control nodes:

```rust
#[wasm_bindgen(js_name = getPageControlLayout)]
pub fn get_page_control_layout(&self, page_num: u32) -> String
```

**Return JSON structure**:
```json
{
  "controls": [
    {
      "type": "table",
      "x": 85.3, "y": 200.0, "w": 500.0, "h": 300.0,
      "secIdx": 0, "paraIdx": 2, "controlIdx": 0,
      "rowCount": 3, "colCount": 4,
      "cells": [
        {
          "x": 85.3, "y": 200.0, "w": 125.0, "h": 100.0,
          "row": 0, "col": 0, "rowSpan": 1, "colSpan": 1,
          "cellIdx": 0
        }
      ]
    },
    {
      "type": "image",
      "x": 300.0, "y": 500.0, "w": 200.0, "h": 150.0,
      "secIdx": 0, "paraIdx": 5, "controlIdx": 0
    }
  ]
}
```

### Implementation Method
- Write a `collect_controls()` helper function similar to `collect_text_runs()`
- During render tree traversal, collect when encountering `RenderNodeType::Table`, `Image`, `Shape`, etc.
- For Table nodes, also collect child TableCell nodes into `cells` array
- Document coordinates (secIdx, paraIdx, controlIdx) need tracking from render tree nodes

### Tests
- `test_get_page_control_layout_with_table` — Verify control layout for document with tables
- `test_get_page_control_layout_with_image` — Verify control layout for document with images

---

## Phase 2: JS Control Layout Manager + Hit Test Extension

**Goal**: Support control/cell area hit testing in JS

### `web/text_selection.js` — Add ControlLayoutManager

### `web/text_selection.js` — SelectionController Hit Test Extension

Extended flow:
```
Click → controlLayout.hitTestControl(x,y)
  ├── Control hit → Table: check if inside cell
  │   ├── Cell text area → existing text editing mode (no change)
  │   └── Cell border/margin → call control selection callback
  ├── Image/shape hit → call control selection callback
  └── No control hit → existing layout.hitTest(x,y) (no change)
```

### Hit Test Priority
1. TextRun hit → text editing mode (existing behavior preserved)
2. Control hit but TextRun miss → object selection
3. Nothing hit → deselect

---

## Phase 3: Editing Mode State Machine + Object/Cell Selection Visualization

**Goal**: Implement editing mode state transitions, selection visualization

### `web/editor.js` — Editing Mode State

```javascript
let editMode = 'none';  // 'none' | 'text' | 'objectSelected' | 'cellSelected'
let selectedControl = null;
let selectedCells = [];
```

### State Transition Rules

| Current Mode | Event | New Mode |
|-------------|-------|---------|
| none/text | Control area click (TextRun miss) | objectSelected |
| none/text | TextRun click | text |
| objectSelected | Esc | none |
| objectSelected | Enter / F5 (for tables) | cellSelected |
| cellSelected | Esc | objectSelected |
| cellSelected | Enter (cell double-click) | text (within that cell) |
| cellSelected | Arrow keys | cellSelected (cell navigation) |
| cellSelected | Shift+Arrow | cellSelected (range expansion) |
| text (in cell) | Esc | cellSelected |

### Visualization — Draw on selection-canvas

**Object selection visualization**:
- Blue dashed border (2px) around selected control
- 4 corners + 4 edge midpoints = 8 resize handles (square, 6x6px) — display only, no action

**Cell selection visualization**:
- Semi-transparent blue background on selected cells (rgba(0, 100, 255, 0.2))
- Blue solid border (2px) on cell edges

---

## Phase 4: Cell Range Selection + Testing and Verification

**Goal**: Multi-cell selection, cell navigation, full testing

### Cell Range Selection
- **Shift+Arrow**: Expand/shrink range from current cell
- **Shift+Click**: Select rectangular range from anchor cell to clicked cell
- **Range model**: `{startRow, startCol, endRow, endCol}` → rectangular area

### Cell Navigation (B-903 Foundation)
- **Tab**: Next cell (left→right, top→bottom)
- **Shift+Tab**: Previous cell
- **Arrow keys**: Move to adjacent cell

### Tests

**Rust tests (wasm_api.rs)**:
- `test_get_page_control_layout_with_table` — Table control layout JSON verification
- `test_control_layout_cell_bounding_boxes` — Cell bounding box accuracy verification
- `test_control_layout_multiple_controls` — Mixed multiple control type verification

**Manual browser tests**:
- Click table border → object selection visualization confirmed
- Enter → cell selection mode entry confirmed
- Arrow/Shift+Arrow → cell movement/range confirmed
- Enter → text editing entry, Esc → mode return confirmed
- Click image → object selection confirmed

---

## Changed Files Summary

| File | Phase | Changes |
|------|-------|---------|
| `src/renderer/render_tree.rs` | 1 | Add document coordinate fields to Table/Image/Shape nodes |
| `src/renderer/layout.rs` | 1 | Tag control nodes with document coordinates during layout |
| `src/wasm_api.rs` | 1 | getPageControlLayout API, collect_controls helper, tests |
| `web/text_selection.js` | 2,3 | ControlLayoutManager class, hitTest extension |
| `web/editor.js` | 3,4 | editMode state machine, visualization, keyboard handlers |

## Verification Method

1. `docker compose run --rm test` — Existing 344 + new tests pass
2. `docker compose run --rm wasm` — WASM build successful
3. Browser testing — Table/image object selection, cell selection, mode switching
