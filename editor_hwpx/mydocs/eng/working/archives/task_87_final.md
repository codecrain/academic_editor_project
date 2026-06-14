# Task 87 — Final Report

## Table Object Selection + Visual Feedback

### Implementation Summary

Implemented selecting a table as a single object, displaying a border + resize handles on selection, Delete key to delete the table, and cursor change on handle hover. Also added auto-activation of transparent borders on cell entry.

### Stage-by-Stage Implementation

#### Stage 1: WASM API + Rust Model
- `getTableBBox(sec, ppi, ci)` — Finds Table node in render tree and returns `{pageIndex, x, y, width, height}`
- `deleteTableControl(sec, ppi, ci)` — Finds control position via char_offsets gap in UTF-16 stream and deletes control + adjusts subsequent offsets
- `remove_control(index)` — Removes control from paragraph.rs controls array
- 2 Rust tests added (`test_get_table_bbox`, `test_delete_table_control`)

#### Stage 2: CursorState Table Object Selection + Esc Key + Auto Transparent Borders
- Added `_tableObjectSelected`, `selectedTableRef` state to CursorState
- Esc key state machine:
  - Cell editing -> Esc -> Table object selection
  - F5 cell selection -> Esc -> Table object selection
  - Table object selection -> Esc -> Move outside table
  - Table object selection -> Enter -> Return to cell editing
  - Table object selection -> Delete -> Delete table
- Auto transparent borders: ON on cell entry, OFF on exit (coexists with manual toggle)
- Registered `table:delete` command + context menu "Delete Table" item

#### Stage 3: TableObjectRenderer Visual Feedback
- Created `table-object-renderer.ts`
- Blue 2px solid border + 8 resize handles (8x8px, zoom-independent)
- `getHandleAtPoint()` — Determines handle direction from mouse coordinates
- CSS: `.table-object-border`, `.table-object-handle`

#### Stage 4: Build Verification + Resize Cursor
- `onMouseMove` handler — Per-handle cursor: NW/SE=nwse-resize, NE/SW=nesw-resize, N/S=ns-resize, E/W=ew-resize
- Rust tests 514 passed, WASM build succeeded, Vite build succeeded

### Modified File List

| File | Change Type | Description |
|------|------------|-------------|
| `src/wasm_api.rs` | Modified | getTableBBox, deleteTableControl WASM bindings + native implementation + tests |
| `src/model/paragraph.rs` | Modified | Added remove_control(index) method |
| `src/serializer/cfb_writer.rs` | Modified | Added delete_table_control_roundtrip test |
| `rhwp-studio/src/core/wasm-bridge.ts` | Modified | getTableBBox, deleteTableControl bridge methods |
| `rhwp-studio/src/engine/cursor.ts` | Modified | Table object selection state + 5 methods |
| `rhwp-studio/src/engine/input-handler.ts` | Modified | Esc state machine + auto transparent borders + onMouseMove + renderer integration |
| `rhwp-studio/src/engine/table-object-renderer.ts` | **New** | Table object selection overlay renderer |
| `rhwp-studio/src/command/types.ts` | Modified | Added inTableObjectSelection to EditorContext |
| `rhwp-studio/src/command/commands/view.ts` | Modified | Emits transparent-borders-changed event |
| `rhwp-studio/src/command/commands/table.ts` | Modified | Registered table:delete command |
| `rhwp-studio/src/main.ts` | Modified | Extended getContext() + TableObjectRenderer injection |
| `rhwp-studio/src/style.css` | Modified | Added table object selection CSS |

### Test Results
- Rust tests: **514 passed**, 0 failed
- WASM build: Succeeded
- Vite build: Succeeded (40 modules)

### Out of Scope (Subsequent Tasks)
- Drag resize (adjusting table size by dragging handles): Only cursor change implemented, actual drag adjustment needs WASM API `resizeTable`
- Table drag movement: HWP tables are inline objects within paragraphs, so free movement is not possible
