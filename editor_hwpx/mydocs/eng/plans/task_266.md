# Task 266 Plan: Page Hide Editing + Control Code Display Extension

## Scope

### A. Page Hide Editing (Ctrl+N,S)
- Insert/remove PageHide control on the current page at cursor position
- Dialog: Select content to hide (header, footer, page number, page border, background, master page)
- Hancom behavior: Control code is inserted at the beginning of the current paragraph

### B. Control Code Display Extension
- Add to existing control codes (section break, page break, etc.):
  - `[Page Hide]` — PageHide control
  - `[Page Number Position]` — PageNumberPos control
  - `[Header (Both)]` / `[Footer (Both)]` — Header/Footer controls

## Implementation Plan

### Step 1: Rust API — Page Hide Insert/Remove
- `insert_page_hide_native(sec, para, hide_flags)` — Insert PageHide control
- `remove_page_hide_native(sec, para)` — Remove PageHide control
- `get_page_hide_native(sec, para)` — Query PageHide of current paragraph

### Step 2: WASM Binding + Dialog
- WASM: insertPageHide, removePageHide, getPageHide
- Dialog: 6 checkboxes (header, footer, page number, border, background, master page)
- Shortcut: Ctrl+N,S (chord shortcut chordMapN)

### Step 3: Control Code Rendering
- Display control marker text in control code display mode
- `[Page Hide]`, `[Page Number Position]`, `[Header (Both)]`, etc.

## References
- Hancom Help: format/hide.htm
- Shortcut: Ctrl+N,S
- HWP Spec: Table 147 (Page Hide), Table 149 (Page Number Position)
