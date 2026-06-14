# Task 31: Caret Vertical Movement and Edit Area Margin Restriction - Execution Plan

## Background

### 1) Caret Vertical Movement
Currently in editing mode, the caret can only move left/right (ArrowLeft/Right) and to line start/end (Home/End). Adding ArrowUp/ArrowDown functionality to move the caret to the same X position in lines above/below, like regular word processors.

### 2) Edit Area Margin Restriction
During text input, text flow (line wrapping) should be restricted to the content area excluding left/right margins. Hancom's webhwp uses DOM-based CSS `width` to naturally restrict the content area, but since we use Canvas, the `available_width` passed to the compositor's `reflow_line_segs()` must be accurate.

## Solution Direction

### Caret Vertical Movement
Implement using existing text layout data (Y coordinates of runs array, charX array) by grouping into lines → finding the closest X position character in the target line. Maintain original X coordinate (`_savedCaretX`) during consecutive vertical movements to provide the same UX as regular editors.

### Edit Area Margin Restriction
Currently `reflow_paragraph()` calculates width as `col_area.width - margin_left - margin_right`. Verify this path works correctly and fix if issues exist. Particularly check parts where multi-column layout (`ColumnDef`) is hardcoded to default values.

## Changed Files

| File | Task |
|------|------|
| `web/editor.js` | Delegate ArrowUp/ArrowDown to text_selection.js |
| `web/text_selection.js` | Add `_moveCaretUp()`, `_moveCaretDown()` and helper methods |
| `src/wasm_api.rs` | Verify/fix `reflow_paragraph()` margin calculation (if needed) |
| `src/renderer/composer.rs` | Verify/fix `reflow_line_segs()` margin application (if needed) |

## Verification Method

1. Verify ArrowUp/Down line movement in browser
2. Verify snap to line end when moving from long line to short line
3. Verify original X coordinate restoration after consecutive vertical movements
4. Verify Shift+ArrowUp/Down selection range expansion
5. Verify line wrapping within page left/right margins during text input
6. Verify text flow accuracy in HWP documents with various margin settings
