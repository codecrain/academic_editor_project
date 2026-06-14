# Task 88 Final Report: Fix HWP File Corruption After Table Structure Changes

## Summary

Resolved Backlog B6 (HWP file corruption when saving after table structure changes).

## Root Cause

When table structure changes (row/column addition, cell splitting), `Cell::new_from_template()` copied `has_para_text=true` from the template cell, causing unnecessary PARA_TEXT records ([0x000D]) to be generated for empty cells. HWP program detects a record structure mismatch when a paragraph with `cc=1` has PARA_TEXT, resulting in a file corruption error.

## Changes

| File | Fix |
|------|-----|
| `src/model/table.rs` | `new_from_template()`: `has_para_text: false`, `char_count: 1` |
| `src/model/paragraph.rs` | `new_empty()`: `char_count: 1`, added default `LineSeg` |
| `src/model/table.rs` | Fixed `test_cell_new_empty` expected value (cc=0 -> cc=1) |
| `src/wasm_api.rs` | Added `test_table_modification_empty_cell_serialization` test |

## Verification

- 515 Rust tests passed (1 new added)
- Verification test: 80 empty paragraphs inspected, 0 violations
- WASM build succeeded
- Vite build succeeded

## Branch

- Work branch: `local/task88`
- Merged to main: `ce85bb4`
