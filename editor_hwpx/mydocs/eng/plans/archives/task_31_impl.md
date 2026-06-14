# Task 31: Caret Vertical Movement and Edit Area Margin Restriction - Implementation Plan

## Phase 1: Caret Vertical Movement Implementation

### File: `web/text_selection.js`

**A. Add `_savedCaretX` state**

```javascript
this._savedCaretX = null;  // Maintain original X coordinate during consecutive vertical movements
```

**B. Add `_getLineGroups()` helper method**

Groups runs array by Y coordinate into line groups. Runs on the same line have Y coordinates within +/-1px.

**C. Add `_findClosestCharInLine()` helper method**

Finds the character position closest to targetX in the target line.

**D. Add `_moveCaretUp()` / `_moveCaretDown()` methods**

Following existing `_moveCaretHome/End()` pattern:
- Get current line index from line groups
- Save preferredX on first vertical movement
- Find closest character position in target line using preferredX

**E. Connect keydown handler**

Add ArrowUp/Down cases following existing ArrowLeft/Right pattern.
- ArrowUp/Down: save `_savedCaretX` on first movement
- ArrowLeft/Right/Home/End and other keys: reset `_savedCaretX = null`

### File: `web/editor.js`

Delegate ArrowUp/ArrowDown to text_selection.js by adding them to the navigation key list.

### Verification
- Verify ArrowUp/Down line movement in browser
- Verify original X coordinate restoration after consecutive vertical movements
- Verify Shift+ArrowUp/Down selection range expansion

---

## Phase 2: Edit Area Margin Restriction Verification/Fix

### File: `src/wasm_api.rs` — `reflow_paragraph()`

Current code:
```rust
let layout = PageLayoutInfo::from_page_def(page_def, &ColumnDef::default(), self.dpi);
let col_area = &layout.column_areas[0];
let available_width = col_area.width - margin_left - margin_right;
```

**Verification items:**
1. Verify `ColumnDef::default()` matches actual section's multi-column settings
2. Verify `col_area.width` is correctly page width minus left/right page margins
3. Verify paragraph margins (`margin_left`, `margin_right`) are correctly applied

**Expected fix:**
- Use actual section's `column_def` instead of `ColumnDef::default()` (multi-column layout support)
- Fix other margin-related bugs if found

### File: `src/renderer/composer.rs` — `reflow_line_segs()`

Verify that `available_width_px` parameter is correctly passed and line breaks work accurately within that width.

### Verification
- Verify text input stays within page left/right margins
- Verify line break position accuracy in HWP documents with various margin settings

---

## Phase 3: Integration Testing and Wrap-Up

### Verification Items
1. `docker compose run --rm test` — All tests pass
2. `docker compose run --rm wasm` — WASM build successful
3. Browser verification:
   - ArrowUp/Down line movement + Shift selection
   - Text input and margin-restricted line wrapping
   - Caret vertical movement inside table cells
4. Update today's task status
5. Write final result report
