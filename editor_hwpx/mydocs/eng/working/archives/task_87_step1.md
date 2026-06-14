# Task 87 — Stage 1 Completion Report

## WASM API (getTableBBox, deleteTableControl) + Rust Model

### Changes

**`src/wasm_api.rs`**:
- `getTableBBox(sec, ppi, ci)` WASM binding + native implementation
  - Finds Table node in render tree and returns `{pageIndex, x, y, width, height}` JSON
- `deleteTableControl(sec, ppi, ci)` WASM binding + native implementation
  - Removes from controls array + removes ctrl_data_records
  - char_offsets gap adjustment (identifies control position with same logic as serialization -> decreases subsequent offset by 8)
  - Decreases char_count by 8
  - raw_stream=None -> compose -> paginate
- Added 2 tests: `test_get_table_bbox`, `test_delete_table_control`

**`rhwp-studio/src/core/wasm-bridge.ts`**:
- Added `getTableBBox()` bridge method
- Added `deleteTableControl()` bridge method

**`src/serializer/cfb_writer.rs`**:
- Added `test_delete_table_control_roundtrip` round-trip test

### Verification
- Rust tests: All 514 passed (existing 511 + bbox 1 + delete 1 + roundtrip 1)
- WASM build: Succeeded
- Vite build: Succeeded
