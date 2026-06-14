# Task 62: Page Setup Dialog UI -- Completion Report

## Implementation Results

Implemented an edit page setup modal dialog identical to Hancom WebGian. This is the project's first dialog UI component and can be reused as a base for other dialogs (character properties, paragraph properties, etc.).

## Modified/New Files

| File | Work | Change Size |
|------|------|-------------|
| `src/wasm_api.rs` | Modified -- getPageDef/setPageDef WASM API added | +75 lines |
| `rhwp-studio/src/style.css` | Modified -- modal/dialog CSS added | +85 lines |
| `rhwp-studio/src/ui/dialog.ts` | New -- modal dialog base class | 85 lines |
| `rhwp-studio/src/ui/page-setup-dialog.ts` | New -- page setup dialog | 285 lines |
| `rhwp-studio/src/core/types.ts` | Modified -- PageDef interface added | +14 lines |
| `rhwp-studio/src/core/wasm-bridge.ts` | Modified -- getPageDef/setPageDef methods | +12 lines |
| `rhwp-studio/src/command/commands/file.ts` | Modified -- file:page-setup activation | +5 lines |
| `rhwp-studio/src/command/commands/page.ts` | Modified -- page:setup activation | +10 lines |
| `rhwp-studio/src/command/shortcut-map.ts` | Modified -- F7 binding added | +3 lines |
| `rhwp-studio/src/engine/input-handler.ts` | Modified -- Function key shortcut handling | +8 lines |

## Key Features

### WASM API (Rust)
- `getPageDef(sectionIdx)` -- Returns PageDef with HWPUNIT raw values (width, height, 9 margin types, landscape, binding)
- `setPageDef(sectionIdx, json)` -- Changes PageDef then re-composes and re-paginates, returns updated pageCount

### Modal Dialog Base (dialog.ts)
- Based on WebGian `dialog_wrap` pattern
- Semi-transparent overlay, title bar + X close, OK/Cancel buttons
- Escape key close, overlay click close
- Subclasses override `createBody()`/`onConfirm()`

### Page Setup Dialog (page-setup-dialog.ts)
- **Paper type**: A4, A3, B4, B5, Letter, Legal, Custom dropdown
- **Paper size**: Width/height in mm (auto-filled on preset selection, editable for custom)
- **Paper orientation**: Portrait/landscape radio (swaps width/height on toggle)
- **Binding**: Single-sided/facing/top-bound radio
- **Paper margins**: Top/bottom/left/right/header/footer/binding -- 7 fields (mm, 1 decimal)
- **Apply scope**: Entire document
- On confirm: mm -> HWPUNIT conversion then setPageDef call, canvas auto re-render

### Command + Shortcut
- Menu: File > Page Setup, Page > Page Setup (active when document loaded)
- F7 shortcut (standalone without Ctrl)
- Added Function key shortcut handling to input-handler (default case)

## Verification

- Native build: Succeeded
- Rust tests: All 481 passed
- WASM build: Succeeded
- TypeScript type check: No errors
- Vite production build: Succeeded (34 modules)
