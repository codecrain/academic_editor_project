# Task 65: GSO TextBox Cursor Support — Implementation Plan

## Step 1: Rust Render Tree — Propagate CellContext to TextBox (~30 lines)

### src/renderer/layout.rs

1. `layout_shape()` (line 3359): Add `section_index` parameter
   - Already has `para_index`, `control_index`
   - Pass all 3 parameters to `layout_shape_object()`

2. `layout_shape_object()` (line 3447): Add `section_index, para_index, control_index` parameters
   - Pass to `layout_textbox_content()` call for each ShapeObject variant (Rectangle, Ellipse, Polygon, Curve)
   - Group variant: pass `0, 0, 0` for recursive calls (group internal text boxes have no top-level context)

3. `layout_textbox_content()` (line 3606): Add `section_index, para_index, control_index` parameters
   - Create CellContext in inner loop:
     ```rust
     let cell_ctx = CellContext {
         parent_para_index: para_index,
         control_index,
         cell_index: 0,
         cell_para_index: tb_para_idx,
     };
     ```
   - Pass `Some(cell_ctx)` to `layout_composed_paragraph()`

4. Call site modifications:
   - line 413: pass `page_content.section_index`
   - line 2663 (shape inside table cell): pass `0, 0, 0`
   - line 3769 (shape inside text box): pass `0, 0, 0`

### Build Verification
- `docker compose --env-file /dev/null run --rm test` — 485 tests pass

---

## Step 2: Rust WASM API — Extend get_cell_paragraph_ref + hitTest isTextBox (~60 lines)

### src/wasm_api.rs

1. Add `get_textbox_from_shape()` helper function
   - Extract `drawing.text_box` per ShapeObject variant
   - Support only Rectangle, Ellipse, Polygon, Curve; return None for others

2. Extend `get_cell_paragraph_ref()`
   - Add `Control::Shape` match arm
   - Return `None` if `cell_idx != 0` (text box has only 1 cell)
   - `get_textbox_from_shape()` → `text_box.paragraphs.get(cell_para_idx)`

3. Extend `get_cell_paragraph_count_native()`
   - Add `Control::Shape` match arm
   - `get_textbox_from_shape()` → `text_box.paragraphs.len()`

4. Modify `hit_test_native()`
   - Add `is_textbox: bool` field to `RunInfo` struct
   - After `collect_runs()`, check document-based control type for each run
   - If `parent_para_index` exists and `cell_index == 0`, check if control is `Control::Shape`
   - In `format_hit()`, add `,"isTextBox":true` if `is_textbox == true`

5. Modify `handle_cell_boundary()`
   - If control is Shape, escape directly to body without cell movement
   - Call `exit_table_vertical()` for body movement

6. Add `isTextBox` field to `move_vertical_native()` JSON output

### Build Verification
- `docker compose --env-file /dev/null run --rm test` — 485 tests pass

---

## Step 3: TypeScript — TextBox Cursor Entry/Movement/Escape (~60 lines)

### src/core/types.ts

1. Add `isTextBox?: boolean` to `HitTestResult` (hitTest result)
2. Add `isTextBox?: boolean` to `DocumentPosition` (cursor position preservation)
3. Add `isTextBox?: boolean` to `MoveVerticalResult` (vertical movement result)

### src/engine/cursor.ts

1. Add `isInTextBox()` public method
   - Return `this.position.isTextBox === true`

2. Modify `moveHorizontal()` branching
   - `isInTextBox()` → `moveHorizontalInTextBox()`
   - `isInCell()` → `moveHorizontalInCell()` (existing)
   - Otherwise → `moveHorizontalInBody()` (existing)

3. Add `moveHorizontalInTextBox(delta)` private method
   - Inter-paragraph movement within text box (reusing cell API)
   - Call `exitTextBox(delta)` on boundary (no cell movement)

4. Add `exitTextBox(delta)` private method
   - Release cell context → move to body paragraph
   - delta > 0: start of parentParaIndex + 1 paragraph
   - delta < 0: end of parentParaIndex - 1 paragraph

5. Modify `moveVertical()`
   - Include `isTextBox: result.isTextBox` when updating position

### src/engine/input-handler.ts

1. Modify Tab key handling
   - Add `if (inCell && !this.cursor.isInTextBox())` condition
   - Do not move cells with Tab inside text box

### Build Verification
- `npx tsc --noEmit` — TypeScript type check pass
- `npx vite build` — build success

---

## Step 4: Integration Testing and Verification

1. `docker compose --env-file /dev/null run --rm test` — all 485 Rust tests pass
2. `cd rhwp-studio && npx tsc --noEmit` — TypeScript type check
3. `cd rhwp-studio && npx vite build` — production build success
4. Manual verification with `samples/img-start-001.hwp`:
   - Click text box → caret displayed
   - Arrow left/right movement
   - Arrow up/down movement
   - Text box boundary escape
   - Tab key ignored confirmation
5. Existing table cursor behavior regression test

---

## Modified/New Files List

| File | Action | Scale |
|------|--------|-------|
| `src/renderer/layout.rs` | Modify — propagate CellContext to textbox | ~30 lines |
| `src/wasm_api.rs` | Modify — Shape support in get_cell_paragraph_ref, hitTest isTextBox | ~60 lines |
| `rhwp-studio/src/core/types.ts` | Modify — add isTextBox field | ~6 lines |
| `rhwp-studio/src/engine/cursor.ts` | Modify — moveHorizontalInTextBox, exitTextBox | ~55 lines |
| `rhwp-studio/src/engine/input-handler.ts` | Modify — Tab text box handling | ~2 lines |
| **Total** | | **~153 lines** |
