# Task 84 Completion Report: Table/Cell Properties Dialog

## Summary

Implemented a table/cell properties dialog with the HWP standard 6-tab structure (Basic, Margins/Caption, Border, Background, Table, Cell). The Table tab (page break, repeat header row, cell padding) and Cell tab (size, padding, vertical alignment, vertical text, header cell) support actual query/modify via WASM API, while the remaining tabs (Basic, Margins/Caption, Border, Background) have pre-built UI for future feature integration.

## Changed Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/wasm_api.rs` | Modified | Added 4 APIs: `getCellProperties`, `setCellProperties`, `getTableProperties`, `setTableProperties` |
| `rhwp-studio/src/core/types.ts` | Modified | Added `CellProperties`, `TableProperties` interfaces |
| `rhwp-studio/src/core/wasm-bridge.ts` | Modified | Added 4 bridge methods |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | New | 6-tab table/cell properties dialog class |
| `rhwp-studio/src/command/commands/table.ts` | Modified | Connected dialog display logic to `table:cell-props` command |
| `rhwp-studio/src/engine/input-handler.ts` | Modified | Added `getCursorPosition()` public method |
| `rhwp-studio/src/style.css` | Modified | Added tab UI styles (.dialog-tabs, .dialog-tab, .dialog-tab-panel, .dialog-btn-group, .dialog-checkbox, etc.) |

## Implementation Details

### 1. WASM API (Rust)

- **getCellProperties**: Returns cell width, height, padding (4 directions), verticalAlign, textDirection, isHeader in HWPUNIT
- **setCellProperties**: Updates cell properties from JSON -> re-render
- **getTableProperties**: Returns table cellSpacing, padding (4 directions), pageBreak, repeatHeader
- **setTableProperties**: Updates table properties from JSON -> re-render

### 2. Dialog 6-Tab Layout

| Tab | Status | Active Fields |
|-----|--------|--------------|
| Basic | disabled | Size, position, placement, object protection (for future integration) |
| Margins/Caption | disabled | Outer margins, caption position/size/spacing (for future integration) |
| Border | Partially active | Cell spacing (active), line type/weight/color/preview (disabled) |
| Background | disabled | Fill, gradient, image (for future integration) |
| Table | **Active** | Page boundary break (radio), auto-repeat header row, all cell padding (4 directions) |
| Cell | **Active** | Width/height, padding (4 directions), vertical alignment (3 buttons), vertical text (2 buttons), header cell |

### 3. Command Connection

- `table:cell-props` command: Extracts table/cell context from current cursor position -> displays TableCellPropsDialog
- Opens dialog when clicking "Table/Cell Properties" in context menu
- OK button: Calls setCellProperties + setTableProperties -> document-changed event

## Verification Results

- Rust tests: 496 passed
- WASM build: Succeeded
- Vite build: Succeeded (39 modules)

## Branch

- `local/table-edit` -> `local/task84`
