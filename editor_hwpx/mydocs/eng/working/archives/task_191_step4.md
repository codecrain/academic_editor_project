# Task 191 Step 4 Completion Report: Separate Cell Border/Background Dialog + Context Menu

## Completed Items

### 1. `cell-border-bg-dialog.ts` — New
- `ModalDialog` subclass, 3 tabs: **Border** / **Background** / **Diagonal**
- `applyMode: 'each' | 'asOne'` parameter for apply mode branching
- Border tab: SVG line type grid + width/color + presets + direction buttons + apply scope radio
- Background tab: None/Color radio + face/pattern color/type + CSS preview + apply scope
- Diagonal tab: Line type/width/color + `\` `/` `+` toggle buttons + apply scope

### 2. Command Connection (`table.ts`)
- `table:border-each` stub → `CellBorderBgDialog(applyMode='each')` connected
- `table:border-one` stub → `CellBorderBgDialog(applyMode='asOne')` connected

### 3. Context Menu (`input-handler.ts`)
- Added to table cell context menu:
  - "Cell Border/Background - Apply to each cell(E)..."
  - "Cell Border/Background - Apply as one cell(Z)..."

## Verification
- TypeScript compilation: No errors
