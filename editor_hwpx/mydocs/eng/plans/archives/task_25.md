# Task 25: Control Object Selection and Cell Selection — Execution Plan

## Goal

Implement the mechanism for selecting control objects such as tables/images/shapes, and the ability to select table cells as units. This feature is a prerequisite for future table structure editing (B-904~B-906).

## Current State Analysis

### Editing Mode Status
- **Text editing mode**: Caret + text input/deletion works in body/cell contents (completed)
- **Object selection mode**: Not implemented — clicking tables/images/shapes only enters text editing
- **Cell selection mode**: Not implemented — cannot select individual cells or cell ranges

### Current Architecture
```
Mouse click → hitTest(x,y) → TextRun matching → set caret → text editing
```

### Target Architecture
```
Mouse click → hitTest(x,y) extended
  ├── Inside TextRun → text editing mode (existing)
  ├── Table border/margin area → table object selection mode (new)
  ├── Image/shape area → object selection mode (new)
  └── Cell selection mode entry (F5 or Esc) → cell range selection (new)
```

## Implementation Scope

### B-901: Control Object Selection
1. **Provide control area info from render tree** — Pass bounding boxes of tables/images/shapes to JS
2. **Extended hit-testing** — Return object selection when click coordinates fall within a control area
3. **Selection visualization** — Display border + resize handles around the selected object
4. **Keyboard integration** — Esc to deselect, Delete to remove object (except tables)

### B-902: Cell Selection Mode
1. **Provide cell area info** — Pass bounding box of each cell to JS
2. **Cell selection entry** — Enter cell selection mode with Enter or F5 from table object selection state
3. **Cell range selection** — Select cell range with click+drag or Shift+arrow keys
4. **Cell selection visualization** — Background highlight on selected cells
5. **Mode switching** — Enter to go into cell text editing, Esc to return to table object selection

## Editing Mode State Transitions

```
[Text Editing] ←Enter→ [Cell Selection] ←Enter/Esc→ [Table Object Selection] ←Esc→ [No Selection]
      ↑                                                      ↑
      └── Click inside cell                         Click table border
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | getPageControlLayout API (control/cell bounding boxes) |
| `web/text_selection.js` | Hit-test extension, mode state management |
| `web/editor.js` | Object selection/cell selection keyboard handlers, visualization |

## Excluded Scope
- Object resizing (drag to change size)
- Object moving (drag to change position)
- Cell merge/split, add/delete rows/columns (B-904, B-905)
- Table/cell properties dialog (B-906)
