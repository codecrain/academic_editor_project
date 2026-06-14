# Task 252 Plan: Footnote Editing Feature

## Hancom Behavior (Per Help Documentation)

### Footnote Insertion (Ctrl+N,N)
1. Footnote number is automatically assigned at the cursor position in the body
2. Cursor moves to the footnote area at the bottom of the page
3. Enter footnote content
4. Shift+Esc to return to body

### Footnote Editing
- Double-click footnote number in body → move to footnote area
- Click directly in footnote area to edit
- Shift+Esc to return to body

### Footnote Deletion
- Delete footnote number in body with Delete/Backspace → footnote content is also deleted
- Remaining footnote numbers are automatically renumbered

## Implementation Plan

### Step 1: Footnote Insertion WASM API
- Rust: `insert_footnote_native(sec, para, char_offset)` → Create Footnote control
- Contains 1 empty paragraph, auto-numbered
- WASM: `insertFootnote` binding
- Pagination + render tree regeneration

### Step 2: Footnote Area Edit Mode
- Footnote area click → enter footnote edit mode (similar to header/footer)
- Cursor movement + text input/delete within footnote
- Shift+Esc → return to body
- Double-click footnote number in body → edit that footnote

### Step 3: Footnote Deletion + Renumbering
- Remove Footnote control when footnote number control is deleted from body
- Automatically renumber remaining footnotes

### References
- Hancom Help: insert/annotations/footnotes.htm
- Model: src/model/footnote.rs (Footnote, FootnoteShape)
- Layout: src/renderer/layout/picture_footnote.rs
- Parser: src/parser/control.rs (parse_footnote_control)
