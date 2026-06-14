# Task 25 — Final Report: Control Object Selection and Cell Selection (B-901, B-902)

## Goals

- B-901: Table/image/shape control object selection (dashed border + handle visualization)
- B-902: Table cell-level selection (arrow keys, Shift range, Tab navigation)

## Implementation

### Stage 1: WASM API — Control/Cell Layout Information

| Change | Details |
|--------|---------|
| `render_tree.rs` | Added document coordinate fields (section_index, para_index, control_index) to TableNode, ImageNode |
| `layout.rs` | Tags control nodes with document coordinates during layout |
| `wasm_api.rs` | `getPageControlLayout()` API — provides table/image bounding box + cell array JSON |

### Stage 2: JS Hit Testing Extension

| Change | Details |
|--------|---------|
| `text_selection.js` | `ControlLayoutManager` class — `hitTestControl()`, `hitTestCell()` |
| `text_selection.js` | `SelectionController` extension — controlLayout, onControlSelect, onControlDeselect callbacks |
| `editor.js` | ControlLayoutManager creation/integration, loaded in renderCurrentPage |

### Stage 3: Edit Mode State Machine + Visualization

| Change | Details |
|--------|---------|
| `text_selection.js` | `drawObjectSelection()` — dashed border + 8 handles |
| `text_selection.js` | `drawCellSelection()` — translucent background + solid border |
| `editor.js` | editMode state machine (none/text/objectSelected/cellSelected) |
| `editor.js` | Keyboard handler extension, enterCellTextEdit, findControlForCell helpers |

### Stage 4: Cell Range Selection + Testing

| Change | Details |
|--------|---------|
| `text_selection.js` | `onTextClick(x, y, shiftKey)` — return value cancels caret setting |
| `editor.js` | cellAnchor state, getCellRange rectangular range, Shift+arrow/click range extension |
| `editor.js` | handleTabNavigation — Tab/Shift+Tab circular navigation |

### Additional: Empty Cell Text Input Support

| Change | Details |
|--------|---------|
| `layout.rs` | Empty paragraph fallback creates empty TextRun node — provides caret position |

## State Transition Rules

```
none <-> text <-> objectSelected <-> cellSelected
         ^                            |
         <--- Enter (cell edit) ------+
```

| Current Mode | Event | New Mode |
|-------------|-------|----------|
| none/text | Control click | objectSelected |
| none/text | TextRun click | text |
| objectSelected | Esc | none |
| objectSelected | Enter/F5 (table) | cellSelected |
| cellSelected | Esc | objectSelected |
| cellSelected | Enter | text (in cell) |
| cellSelected | Arrow keys | cellSelected (move) |
| cellSelected | Shift+arrow keys | cellSelected (range extension) |
| cellSelected | Tab/Shift+Tab | cellSelected (circular navigation) |
| text (cell) | Esc | cellSelected |
| text (body) | Esc | none |

## Changed Files Summary

| File | Change Type |
|------|------------|
| `src/renderer/render_tree.rs` | Struct field additions |
| `src/renderer/layout.rs` | Document coordinate tagging, empty paragraph TextRun creation |
| `src/wasm_api.rs` | getPageControlLayout API + 2 tests |
| `web/text_selection.js` | ControlLayoutManager, visualization, callback extensions |
| `web/editor.js` | State machine, keyboard handlers, cell navigation/range selection |

## Verification Results

- `docker compose run --rm test` — **346 tests passed**
- `docker compose run --rm wasm` — **WASM build successful**
- Browser testing — **12 items confirmed working** (verified by task supervisor)
- Empty cell text input — Empty paragraph TextRun creation provides caret position
