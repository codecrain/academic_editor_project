# Task 88 Execution Plan: Fix HWP File Corruption When Saving After Table Structure Changes

## Background

Backlog B6: When opening an HWP file saved after cell merge/row-column add-delete in Hancom Office, a "File is corrupted" error occurs.

## Goal

Fix serialization bugs so that HWP files saved after table structure changes (row/column add, cell split) open normally in Hancom Office.

## Scope

- Rust model code (`table.rs`, `paragraph.rs`) modifications
- Verification test additions (`wasm_api.rs`)
- No frontend changes

## Root Cause

1. `Cell::new_from_template()` copies template's `has_para_text` value as-is, generating unnecessary PARA_TEXT records for empty cells
2. `Paragraph::new_empty()` creates with `char_count=0`, violating HWP spec (minimum cc=1)
3. `Paragraph::new_empty()` has no LineSeg, causing missing PARA_LINE_SEG records

## Impact

- Low (Rust model code 2 files modified, no frontend changes)
- No impact on existing behavior (only empty cell creation logic modified)

## Timeline

- Expected completion within a single session
