# Task 240 - Stage 2 Completion Report: Layout Code Mode Bookmark Marker Rendering

## Completed Items

### paragraph_layout.rs
- Renders `[Bookmark:name]` marker at bookmark control positions in layout code mode (`show_control_codes`)
- Calculates control text position via `find_control_text_positions()`
- Only shows markers for bookmarks within current line range (`line_char_start ~ line_char_end`)
- Same pattern as existing `[ClickHere start/end]` markers (55% reduced font, BGR 0xCC6600 blue)
- Collected via `MarkerInsert` then integrated into existing shift logic

## Verification
- `cargo build` successful
- 716 tests passed
