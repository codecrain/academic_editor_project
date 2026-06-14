# Task 157 Implementation Plan: Text Box Insertion and Basic Editing

## Implementation Steps (4 Steps)

---

## Step 1: WASM API + Rust Backend

### Goal
Implement text box create/delete/property query/change APIs in Rust backend and expose via WASM.

### Changed Files

#### 1-1. `src/wasm_api/commands/object_ops.rs` — Core CRUD Functions

**`create_shape_control_native()`** — Text box creation
- Follows `create_table_native()` (line 280) pattern exactly
- Input: `section_idx, para_idx, char_offset, width, height, horz_offset, vert_offset, wrap_type`
- Creates: Control::Shape(Rectangle) with TextBox containing one empty paragraph
- Default border: black 0.4mm, default margins: 1.8mm/0.5mm (matching Hancom defaults)
- After insertion: `recompose_section()`, `paginate_if_needed()`
- Returns: `{"ok":true,"paraIdx":N,"controlIdx":0}`

**`get_shape_properties_native()`** — Property query (follows get_picture_properties_native pattern)

**`set_shape_properties_native()`** — Property change (follows set_picture_properties_native pattern)

**`delete_shape_control_native()`** — Delete (follows delete_picture_control_native pattern)

#### 1-2. `src/wasm_api.rs` — WASM Bindings (4 methods)

#### 1-3. `src/wasm_api/queries/rendering.rs` — Extend getPageControlLayout
- Add Shape node collection alongside existing Table/Image nodes

### Verification
- All tests pass + WASM build succeeds

---

## Step 2: Text Box Selection/Move/Resize (UI)

### Goal
Extend existing picture selection/move/resize pattern to shapes (text boxes).

### Changed Files
- `input-handler-picture.ts` — Add findShapeAtClick(), findShapeBbox()
- `cursor.ts` — Add shape selection mode (enterShapeObjectSelectionDirect, etc.)
- `input-handler-mouse.ts` — Route clicks: shape hit → selection, double-click → enter TextBox
- `command.ts` — MoveShapeCommand, ResizeShapeCommand (Undo/Redo)
- `input-handler-keyboard.ts` — Delete/Backspace → delete, Enter → enter text box, Shift+Esc → exit

---

## Step 3: Text Box Creation UI (Mouse Drag + Shortcuts)

### Goal
Activate text box mode from menu/toolbar, create text box by mouse drag.

### Changed Files
- `insert.ts` — Replace stub with enterTextboxCreationMode()
- `input-handler-mouse.ts` — Creation drag mode (crosshair cursor, preview rectangle, WASM call)
- `input-handler-keyboard.ts` — Shortcuts: D=treat as char, S=square/para, A=square/page, etc.

---

## Step 4: Object Properties Dialog — Text Box Tab

### Goal
Add text box tab to existing object properties dialog for margin/vertical alignment/single-line settings.

### Changed Files
- `picture-props-dialog.ts` — Add text box tab (margins, vertical align, single-line input)
- CSS — Text box tab styles
- `insert.ts` — Connect shape properties menu to dialog

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Reuse Picture pattern directly | Proven architecture, consistency maintained |
| Separate shape/picture selection modes | Different property APIs, easier future extension |
| Share TableObjectRenderer | Handle rendering is object-type agnostic |
| Add text box tab to existing dialog | No separate dialog needed, basic tab shared |
| Default border: black 0.4mm | Matches Hancom HWP defaults |
| Default margins: 1.8mm/0.5mm | Matches Hancom HWP text box defaults |
