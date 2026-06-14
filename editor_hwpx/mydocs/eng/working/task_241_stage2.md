# Task 241 - Stage 2 Completion Report: New Bookmark CTRL_DATA ParameterSet Generation

## Completed Items

### bookmark_query.rs

#### New `build_bookmark_ctrl_data(name)` function
- ParameterSet binary generation: `ps_id(0x021B) + count(1) + dummy(0) + item_id(0x4000) + type(String) + name_len + name(UTF-16LE)`
- Generates identical format based on precise analysis of actual HWP file binary structure

#### `add_bookmark_native()` modification
- When inserting new Bookmark control, also inserts CTRL_DATA record into `ctrl_data_records`
- Bookmark name displays correctly when opened in Hancom

#### `delete_bookmark_native()` modification
- Also removes corresponding index from `ctrl_data_records` when deleting control

#### `rename_bookmark_native()` modification
- Regenerates `ctrl_data_records` with new name on rename

## Additional Fixes (Stage 1 Follow-up)

### Recursive collect_bookmarks
- Also collects bookmarks in nested structures (table cells, headers/footers, etc.)
- Nested bookmarks use host top-level paragraph index → navigation functionality

### moveCursorTo Return Value Addition
- `input-handler.ts`: `moveCursorTo()` → `boolean` return (presence of rect)
- Falls back to first position on that page if navigation fails

### Layout Code Marker Fix
- `[Bookmark:name]` → `[Bookmark]` (matching Hancom)
- Color: Red (#FF0000)

## Verification
- Rust tests 716 passed
