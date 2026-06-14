# Task 133 — Final Report: Blank Document Creation + Save

## Overview

Implemented the complete flow of blank document creation, editing, and saving, while fixing serialization bugs discovered in the process.

## Implementation

### 1. Prerequisite Bug Fixes (Enter Key + Serialization)

| Problem | Fix | File |
|---------|-----|------|
| `split_at()` char_count excluded controls | Include control characters in char_count | `src/model/paragraph.rs` |
| `split_at()` raw_header_extra lost | Copy original raw_header_extra to split paragraph | `src/model/paragraph.rs` |
| Empty paragraph has_para_text mismatch -> file corruption | Skip PARA_TEXT when cc <= 1 and no content | `src/serializer/body_text.rs` |
| Orphaned control_mask -> file corruption | Recompute control_mask from controls array during serialization | `src/serializer/body_text.rs` |

### 2. Blank Document Creation

- Built-in template (`blank2010.hwp`) based `createBlankDocument()` WASM API
- Activated `file:new-doc` command (with confirmation dialog)
- `WasmBridge.createNewDocument()` + `_fileName = 'New Document.hwp'`

### 3. File Save Feature

Save flow:
1. **showSaveFilePicker** (Chrome/Edge, Secure Context) -> OS native save dialog (folder + filename selection)
2. **Fallback** (Firefox/Safari/insecure context) -> Custom filename dialog for new documents -> Blob download

| Component | File |
|-----------|------|
| SaveAsDialog (custom filename input dialog) | `rhwp-studio/src/ui/save-as-dialog.ts` (new) |
| File System Access API + fallback logic | `rhwp-studio/src/command/commands/file.ts` |
| isNewDocument, set fileName | `rhwp-studio/src/core/wasm-bridge.ts` |

### 4. Cell Split Feature (Task 135)

- `Table::split_cell_into()` — NxM split algorithm
- `splitTableCellInto` WASM API + TypeScript bridge
- Cell split dialog UI (row count/column count + options)
- `table:cell-split` command integration

### 5. Cell Split Save Corruption Fix

- **Root cause**: Orphaned paragraph's `control_mask=0x800` (TABLE bit) mismatched with actual `controls=[]` + PARA_TEXT written for empty paragraphs
- **Fix**: `compute_control_mask()` function for recomputation during serialization + `has_para_text` correction
- Troubleshooting document: `mydocs/troubleshootings/cell_split_save_corruption.md`

## Changed Files

| File | Changes |
|------|---------|
| `src/model/paragraph.rs` | split_at() char_count/raw_header_extra fix |
| `src/model/table.rs` | split_cell_into() + unit tests |
| `src/serializer/body_text.rs` | compute_control_mask() + has_para_text correction |
| `src/wasm_api.rs` | splitTableCellInto WASM API + diagnostic tests |
| `rhwp-studio/src/command/commands/file.ts` | showSaveFilePicker + fallback save |
| `rhwp-studio/src/command/commands/table.ts` | Cell split command integration |
| `rhwp-studio/src/core/types.ts` | Cell split related type additions |
| `rhwp-studio/src/core/wasm-bridge.ts` | splitTableCellInto, isNewDocument, set fileName |
| `rhwp-studio/src/engine/input-handler.ts` | Cell split keyboard shortcut |
| `rhwp-studio/src/ui/cell-split-dialog.ts` | Cell split dialog (new) |
| `rhwp-studio/src/ui/save-as-dialog.ts` | Filename input dialog (new) |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | Cell properties dialog improvement |

## Verification

- 582 tests all passed
- WASM build successful
- TypeScript compilation successful
- Saved file opens normally in Hancom Office
- showSaveFilePicker native dialog works correctly on localhost
- Fallback (custom dialog + Blob download) works correctly in HTTP environment
