# Task 32 - Stage 5 Completion Report

## Stage: Property Reflection (JavaScript)

## Changed Files

| File | Changes |
|------|---------|
| `web/format_toolbar.js` | New file: FormatToolbar class (DOM cache, WASM property query, UI update) |
| `web/text_selection.js` | Added `onCaretChange` callback field to SelectionController + fired at 3 locations |
| `web/editor.js` | FormatToolbar import + global instance + show on document load + caret change integration |

## FormatToolbar Class Design

| Method | Description |
|--------|-------------|
| `constructor(toolbarEl)` | DOM element cache (font, size, B/I/U/S, colors, align, spacing) |
| `show()` / `hide()` | Format toolbar show/hide |
| `update(doc, docPos)` | WASM API call → query character/paragraph properties → UI update |
| `_queryCharProps(doc, docPos)` | Body/cell branching → getCharPropertiesAt / getCellCharPropertiesAt |
| `_queryParaProps(doc, docPos)` | Body/cell branching → getParaPropertiesAt / getCellParaPropertiesAt |
| `_updateCharUI(props)` | Reflect font/size/B/I/U/S/colors |
| `_updateParaUI(props)` | Reflect alignment/line spacing |

## onCaretChange Callback Fire Locations

| Location | Trigger |
|----------|---------|
| `_setCaretPos(pos)` | Caret movement (Arrow, Home, End, document coordinate restore) |
| `_onMouseDown` (TextRun hit) | Caret placement via mouse click |

## Data Flow

```
Caret move/click
  → SelectionController.onCaretChange()
    → selectionController.getDocumentPos()
      → {secIdx, paraIdx, charOffset, [cellCtx]}
    → formatToolbar.update(doc, docPos)
      → doc.getCharPropertiesAt(sec, para, offset)
      → doc.getParaPropertiesAt(sec, para)
      → UI update (font, size, bold, italic, alignment, ...)
```

## Test Results
- WASM build successful
- **399 tests all passed**
