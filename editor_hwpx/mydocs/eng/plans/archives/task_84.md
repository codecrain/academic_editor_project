# Task 84 Execution Plan: Table/Cell Properties Dialog

## Goal

Implement the HWP table/cell properties dialog. Build all 6 standard HWP tabs (Basic, Margins/Caption, Borders, Background, Table, Cell) UI, support query/modify for currently implementable properties via WASM API, and include unimplemented properties in the UI for future feature connection.

## Reference

- HWP Help: `mydocs/manual/hwp/Help/extracted/table/tableattribute/`
- Hancom WebGian: `webgian/hancomgian_files/hwpctrlmain.html`
- Existing dialog pattern: `rhwp-studio/src/ui/dialog.ts`, `page-setup-dialog.ts`

## Current Status

### Already Available
- Core property fields exist in Table/Cell structs (`src/model/table.rs`)
  - Table: `cell_spacing`, `padding`, `page_break`, `repeat_header`, `border_fill_id`
  - Cell: `width`, `height`, `padding`, `vertical_align`, `text_direction`, `is_header`, `border_fill_id`
- Tab-less ModalDialog pattern established (`dialog.ts`, `page-setup-dialog.ts`)
- `table:cell-props` command stub registered (`table.ts`)
- getCellInfo, getTableDimensions, getTableCellBboxes query APIs
- Context menu "Table/Cell Properties" item awaiting connection

### Needs Implementation
- WASM API: Cell properties query (`getCellProperties`), cell properties modification (`setCellProperties`)
- WASM API: Table properties query (`getTableProperties`), table properties modification (`setTableProperties`)
- TypeScript bridge methods
- `TableCellPropsDialog` dialog class (with tab UI)
- `table:cell-props` command dialog display

## Dialog Tab Configuration (6 HWP Standard Tabs)

### Tab 1: Basic
| Item | Type | Model Field | Status |
|------|------|-------------|--------|
| Width | Number (mm) | Table: ctrl_data width | Future |
| Height | Number (mm) | Table: ctrl_data height | Future |
| Position (like char/horiz/vert) | Dropdown | Table: ctrl_data attr | Future |
| Layout with body | Radio group | Table: ctrl_data attr | Future |
| Object protection | Checkbox | Table: attr | Future |

### Tab 2: Margins/Caption
| Item | Type | Model Field | Status |
|------|------|-------------|--------|
| Outer margins (top/bottom/left/right) | Number (mm) | Table: ctrl_data margin | Future |
| Caption position | Dropdown | Table: caption | Future |
| Caption size | Number (mm) | Table: caption | Future |
| Caption spacing | Number (mm) | Table: caption | Future |

### Tab 3: Borders
| Item | Type | Model Field | Status |
|------|------|-------------|--------|
| Line type | Dropdown | BorderFill | Future |
| Line thickness | Dropdown | BorderFill | Future |
| Line color | Color picker | BorderFill | Future |
| Preview (top/bottom/left/right/all) | Button group | BorderFill | Future |
| Cell spacing | Number (mm) | Table: cell_spacing | **Implemented** |

### Tab 4: Background
| Item | Type | Model Field | Status |
|------|------|-------------|--------|
| No fill | Radio | BorderFill | Future |
| Face color | Color picker | BorderFill | Future |
| Pattern color/shape | Dropdown | BorderFill | Future |
| Gradation | Composite control | BorderFill | Future |
| Image | File picker | BorderFill | Future |

### Tab 5: Table
| Item | Type | Model Field | Status |
|------|------|-------------|--------|
| Page boundary split | Radio (split/cell-unit/no-split) | Table: page_break | **Implemented** |
| Auto-repeat header row | Checkbox | Table: repeat_header | **Implemented** |
| All cell inner margins (top/bottom/left/right) | Number (mm) | Table: padding | **Implemented** |

### Tab 6: Cell
| Item | Type | Model Field | Status |
|------|------|-------------|--------|
| Apply cell size | Checkbox | — | UI only |
| Width | Number (mm) | Cell: width | **Implemented** |
| Height | Number (mm) | Cell: height | **Implemented** |
| Custom inner margins | Checkbox + Number (top/bottom/left/right) | Cell: padding | **Implemented** |
| Vertical alignment | Button group (top/center/bottom) | Cell: vertical_align | **Implemented** |
| Vertical text | Button group (English sideways/upright) | Cell: text_direction | **Implemented** |
| Single line input | Checkbox | — | Future |
| Cell protection | Checkbox | — | Future |
| Header cell | Checkbox | Cell: is_header | **Implemented** |
| Field name | Text input | — | Future |
| Editable in form mode | Checkbox | — | Future |

## Design Principles

1. **Build complete UI first**: Implement UI for all 6 tabs. Disabled controls for unimplemented features are shown, with field references preserved for future WASM API activation.
2. **Implementable properties first**: Table tab (page_break, repeat_header, padding) and Cell tab (width, height, padding, vertical_align, text_direction, is_header) support actual query/modify via WASM API.
3. **Tab switching UI**: Extend ModalDialog to support tab header + tab panel structure.

## Change Scope

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | Add `getCellProperties`, `setCellProperties`, `getTableProperties`, `setTableProperties` APIs |
| `rhwp-studio/src/core/types.ts` | Add `CellProperties`, `TableProperties` interfaces |
| `rhwp-studio/src/core/wasm-bridge.ts` | Add 4 bridge methods |
| `rhwp-studio/src/ui/table-cell-props-dialog.ts` | New — 6-tab dialog class |
| `rhwp-studio/src/command/commands/table.ts` | Implement `table:cell-props` execute |
| `rhwp-studio/src/style.css` | Add tab UI styles + dialog control styles |

## Impact

- Medium (4 WASM APIs added, 1 new frontend dialog)
- No changes to existing behavior (new feature)

## Branch

- `local/table-edit` → `local/task84`
