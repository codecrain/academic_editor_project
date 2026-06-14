# Task 25 - Stage 1 Completion Report: WASM API — Control/Cell Layout Information

## Changed Files

### 1. `src/renderer/render_tree.rs`
- Added 3 document coordinate fields to `TableNode`: `section_index`, `para_index`, `control_index`
- Added 3 document coordinate fields to `ImageNode`: `section_index`, `para_index`, `control_index`

### 2. `src/renderer/layout.rs`
- `layout_table()` (2 places): Tags TableNode with document coordinates during creation (body table → `Some()`, embedded table → `None`)
- `layout_body_picture()`: Added 3 parameters (`section_index`, `para_index`, `control_index`), passes to ImageNode
- ImageNode creation (2 places): Cell images use `None`, body images use document coordinates

### 3. `src/wasm_api.rs`
- Added `getPageControlLayout` WASM API binding
- `get_page_control_layout_native()` implementation:
  - Recursively traverses render tree collecting Table, Image nodes
  - Table: bounding box + rowCount/colCount + document coordinates + cells array
  - Image: bounding box + document coordinates
  - TableCell: bounding box + row/col/span + cellIdx
- Added 2 tests

## JSON Output Example

```json
{
  "controls": [
    {
      "type": "table",
      "x": 85.3, "y": 100.0, "w": 500.0, "h": 200.0,
      "rowCount": 2, "colCount": 2,
      "secIdx": 0, "paraIdx": 0, "controlIdx": 0,
      "cells": [
        {"x": 85.3, "y": 100.0, "w": 250.0, "h": 100.0, "row": 0, "col": 0, "rowSpan": 1, "colSpan": 1, "cellIdx": 0},
        {"x": 335.3, "y": 100.0, "w": 250.0, "h": 100.0, "row": 0, "col": 1, "rowSpan": 1, "colSpan": 1, "cellIdx": 1}
      ]
    },
    {
      "type": "image",
      "x": 200.0, "y": 400.0, "w": 300.0, "h": 200.0,
      "secIdx": 0, "paraIdx": 3, "controlIdx": 0
    }
  ]
}
```

## Test Results

- Total tests: **346 passed** (344 existing + 2 new)
- Build: Successful
