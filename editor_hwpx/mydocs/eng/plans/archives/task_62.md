# Task 62: Page Setup Dialog UI — Execution Plan

## Background

Currently in rhwp-studio, menu items (File > Page Setup, Page > Page Setup) and the F7 shortcut are defined, but there is no actual dialog UI component, so they are disabled with `canExecute: () => false`. We will implement a page setup dialog identical to Hancom WebGian to allow viewing and modifying paper type, orientation, margins, etc.

## Current Status

| Item | Status |
|------|--------|
| Command definition | `file:page-setup`, `page:setup` stubs exist (canExecute: false) |
| F7 shortcut | Only shortcutLabel displayed, no actual binding |
| WASM API | `getPageInfo()` (px unit query only), `getPageDef`/`setPageDef` do not exist |
| Dialog UI | No dialog/modal component in the entire project |
| WebGian reference | `webgian/hancomgian_files/hcwo.css` has dialog_wrap pattern |

## Target UI (identical to Hancom WebGian)

```
+-- Page Setup ------------------------- [X] --+
|                                               |
|  +-- Paper Type -------------------------+   |
|  | [A4         v]  Width [210.0] mm      |   |
|  |                  Height [297.0] mm    |   |
|  +---------------------------------------+   |
|                                               |
|  +-- Orientation --+ +-- Binding --------+   |
|  | (*)Portrait     | |(*)Single  (o)Both |   |
|  |  (o)Landscape   | |(o)Top             |   |
|  +-----------------+ +-------------------+   |
|                                               |
|  +-- Page Margins ------------------------+  |
|  | Top    [19.4] mm  Bottom [14.8] mm     |  |
|  | Left   [21.2] mm  Right  [19.5] mm    |  |
|  | Header [10.6] mm  Footer [10.0] mm    |  |
|  | Gutter [0.0] mm                        |  |
|  +----------------------------------------+  |
|                                               |
|  Apply to: [Entire document v]               |
|                                               |
|              [OK]    [Cancel]                 |
+-----------------------------------------------+
```

## Modification Scope

### Rust (WASM API)
| File | Changes |
|------|---------|
| `src/wasm_api.rs` | `getPageDef(sectionIdx)` — return HWPUNIT raw values, `setPageDef(sectionIdx, json)` — apply values + re-paginate |

### TypeScript (rhwp-studio)
| File | Changes |
|------|---------|
| `src/ui/dialog.ts` | New — modal dialog base (WebGian pattern) |
| `src/ui/page-setup-dialog.ts` | New — page setup dialog UI |
| `src/core/types.ts` | Add `PageDef` interface (HWPUNIT raw values) |
| `src/core/wasm-bridge.ts` | Add `getPageDef()`, `setPageDef()` methods |
| `src/command/commands/file.ts` | Activate `file:page-setup`, implement execute |
| `src/command/commands/page.ts` | Activate `page:setup`, implement execute |
| `src/command/shortcut-map.ts` | Add F7 shortcut binding |
| `src/style.css` | Add modal/dialog CSS |
| `src/main.ts` | Dialog instance initialization (if needed) |

## Key Technical Details

### HWPUNIT to mm Conversion
- 1 inch = 7200 HWPUNIT = 25.4mm
- `mm = hwpunit * 25.4 / 7200`
- `hwpunit = mm * 7200 / 25.4`

### Paper Type Presets (HWPUNIT)
| Name | Width | Height |
|------|-------|--------|
| A4 | 59528 | 84188 |
| A3 | 84188 | 119055 |
| B4 | 72850 | 103040 |
| B5 | 51502 | 72850 |
| Letter | 62208 | 80496 |
| Legal | 62208 | 102816 |
| Custom | Free input | |

### getPageDef Return Format (JSON)
```json
{
  "width": 59528, "height": 84188,
  "marginLeft": 8504, "marginRight": 8504,
  "marginTop": 5669, "marginBottom": 4252,
  "marginHeader": 4252, "marginFooter": 4252,
  "marginGutter": 0,
  "landscape": false, "binding": 0
}
```

### setPageDef Input Format
Same JSON structure. After application, WASM side re-runs `convertToEditable()` for full re-pagination.
