# Task 157 Execution Plan: Text Box Insertion and Basic Editing

## 1. Overview

### Goal
Enable users to create, select, move, resize, edit text, and change properties of text boxes in rhwp-studio editor.

### Background
Currently rhwp supports parsing, rendering, and text editing of existing text boxes in HWP files, but lacks the ability to create new text boxes or select/move/resize them as objects. Text boxes are essential objects in HWP documents for placing text independently from the body — used for multi-column titles, boxed summaries, formatted layouts, etc.

### Scope

| Included | Excluded (Tasks 158, 159) |
|----------|--------------------------|
| Mouse drag text box creation | Border line type/thickness/color changes |
| Shortcut insertion (D/S/A/V/C/X/Z) | Fill (solid/gradient/picture) |
| Text box selection/move/resize | Vertical writing/English rotation |
| Text editing inside text box | Rotation (90-degree increments) |
| Object properties dialog text box tab | Shape→text box conversion |
| WASM API (create/delete/properties) | Text box linking (overflow continuation) |
| Undo/Redo | Hyperlinks/grouping/ungrouping |

## 2. Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| HWP parsing | Complete | Rectangle/Ellipse/Polygon/Curve + TextBox parsing |
| Data model | Complete | TextBox struct (margins, vertical align, paragraph list) |
| Rendering | Complete | Text layout, vertical alignment, overflow linking |
| Cursor entry/editing | Complete | isTextBox flag, enterTextBox/exitTextBox |
| Text box creation | Not implemented | Only stub in insert.ts |
| Object selection/move/resize | Pictures only | input-handler-picture.ts pattern reusable |
| Properties dialog | Pictures only | picture-props-dialog.ts pattern reusable |
| WASM properties API | Pictures only | getShape/setShape API needed |

## 3. Technical Design

### 3.1 Text Box Data Structure (Existing)

```
Control::Shape
  └── CommonObjAttr (position, size, layout mode)
  └── ShapeObject::Rectangle
       └── DrawingObjAttr
            ├── ShapeComponentAttr (transformation)
            ├── ShapeBorderLine (border)
            ├── Fill (fill)
            └── TextBox (Optional)
                 ├── vertical_align (Top/Center/Bottom)
                 ├── margin_left/right/top/bottom
                 ├── max_width
                 └── paragraphs: Vec<Paragraph>
```

### 3.2 Creation Flow

```
[Menu: Insert-Object-Text Box] or [Toolbar text box button]
    → Mouse cursor changes to crosshair(+)
    → Mouse drag (start point~end point)
    → WASM: createShapeControl(secIdx, paraIdx, charOffset, width, height, wrapType)
    → Rust: Create Control::Shape + Rectangle + TextBox(empty paragraph)
    → Insert into document model → Recalculate layout → Render
    → Cursor enters inside text box → Awaiting text input
```

### 3.3 Selection/Move/Resize Pattern

Extend existing `input-handler-picture.ts` picture selection pattern:
- Add shape type to `getPageControlLayout()`
- Check shape bbox in hit-test
- Render 8-directional handles on selection
- Move via drag (change horzOffset/vertOffset)
- Resize via handle drag (change width/height)

### 3.4 WASM API Design

| API | Purpose |
|-----|---------|
| `createShapeControl(json)` | Create text box (position, size, layout mode) |
| `getShapeProperties(sec, ppi, ci)` | Property query (JSON) |
| `setShapeProperties(sec, ppi, ci, json)` | Property change |
| `deleteShapeControl(sec, ppi, ci)` | Delete |

## 4. Implementation Steps

| Step | Content | Key Files |
|------|---------|-----------|
| Step 1 | WASM API + Rust backend | wasm_api.rs, shape_ops.rs, shape.rs |
| Step 2 | Selection/move/resize UI | input-handler-picture.ts, command.ts |
| Step 3 | Creation UI (drag + shortcuts) | insert.ts, input-handler-mouse.ts |
| Step 4 | Properties dialog text box tab | picture-props-dialog.ts or new |

## 5. Verification Plan

- All tests pass (docker test)
- WASM build succeeds (docker wasm)
- UI manual testing:
  - Create text box → enter text → save → reopen
  - Select/move/resize → Undo/Redo
  - Double-click → text editing → Shift+Esc escape
  - Existing text box HWP file rendering has no regression
  - Margin/alignment changes reflect in properties dialog

## 6. Schedule

4 steps with implementation-report cycle per step
