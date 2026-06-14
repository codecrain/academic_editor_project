# Task 86 — Final Report

## Row/Column Add and Delete

### Goal
Implement adding rows/columns (above/below, left/right) and deleting them from tables

### Modified Files Summary

| File | Changes |
|------|---------|
| `src/model/table.rs` | Added `delete_row()`, `delete_column()` methods + 14 tests |
| `src/wasm_api.rs` | `deleteTableRow`, `deleteTableColumn` WASM bindings + native implementation |
| `src/serializer/cfb_writer.rs` | Added 1 table structure change round-trip test |
| `rhwp-studio/src/core/wasm-bridge.ts` | Added `insertTableRow`, `insertTableColumn`, `deleteTableRow`, `deleteTableColumn` bridge methods |
| `rhwp-studio/src/command/commands/table.ts` | 6 command stubs -> actual implementation (insert-row-above/below, insert-col-left/right, delete-row, delete-col) |
| `rhwp-studio/src/command/shortcut-map.ts` | Registered `Alt+Insert` -> `table:insert-col-left`, `Alt+Delete` -> `table:delete-col` shortcuts |
| `rhwp-studio/src/engine/input-handler.ts` | Added Alt combination shortcut handling block (priority routing before switch entry) |

### Implementation Stages

| Stage | Content | Result |
|-------|---------|--------|
| Stage 1 | Rust model delete_row/delete_column + 14 tests | 510 tests passed |
| Stage 2 | WASM API + bridge + shortcut registration | WASM/Vite build succeeded |
| Stage 3 | 6 command execute implementations | Vite build succeeded |
| Stage 4 | Build verification + web test + Alt key bug fix | 511 tests passed, web verification complete |

### Verification Results
- Rust tests: All 511 passed (existing 496 + delete 14 + round-trip 1)
- WASM build: Succeeded
- Vite build: Succeeded
- Context menu row/column add/delete: Normal operation
- Alt+Insert (add column), Alt+Delete (delete column): Normal operation

### Issue Found/Fixed in Stage 4
- Alt+Insert/Delete keys were intercepted by `case 'Insert'`/`case 'Delete'` in switch(e.key), preventing shortcut activation
  - Fix: Added block to route Alt combinations to matchShortcut with priority

### Known Issues
- File corruption error in HWP program when saving after table structure changes
  - Not specific to this task, an existing serialization issue
  - Troubleshooting document: `mydocs/troubleshootings/table_paste_file_corruption.md`
  - Registered as backlog for separate task
