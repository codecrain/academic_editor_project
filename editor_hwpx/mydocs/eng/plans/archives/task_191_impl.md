# Task 191 Implementation Plan: Table Settings Dialog UI Enhancement

## Step Overview

| Step | Content | Key Files |
|------|---------|-----------|
| 1 | Dedicated CSS separation + dialog structure overhaul (context-based tab branching) | table-cell-props-dialog.ts, table-cell-props.css |
| 2 | Table/Cell attribute tab enhancement (Table/Cell/Margin-Caption) | table-cell-props-dialog.ts |
| 3 | Table border/background tab enhancement | table-cell-props-dialog.ts |
| 4 | Cell border/background separate dialog creation | cell-border-bg-dialog.ts, context menu |
| 5 | Integration testing + build verification + report | - |

---

## Step 1: Dedicated CSS + Dialog Structure Overhaul

- Create `table-cell-props.css` with `tcp-` prefix
- Add `mode: 'table' | 'cell'` constructor parameter
- Table mode → 6 tabs, Cell mode → 4 tabs (exclude Border/Background)
- Remove cell/table toggle radio from border/background tabs (simplify as table-only)

## Step 2: Table/Cell/Margin-Caption Tab Enhancement

- **Table tab**: Page break mode dropdown 3 types (split/split by cell/no split) + auto boundary settings + "All" batch margin spinner
- **Cell tab**: "All" batch margin + activate single-line input + vertical writing orientation icons
- **Margin/Caption tab**: "All" batch margin + 3x3 caption position icon grid (8 positions) + caption size + "extend width to margin"

## Step 3: Table Border/Background Tab Enhancement

- **Border tab**: Visual line type grid (SVG icons or CSS patterns, 12-16 types) + SVG cross-line preview + direction buttons around preview + "auto boundary settings" + "apply line style immediately"
- **Background tab**: Activate face color + pattern color + pattern type under "Color" radio + connect WASM patternType/patternColor + CSS/SVG pattern preview

## Step 4: Cell Border/Background Separate Dialog + Context Menu

- Create `cell-border-bg-dialog.ts` with 3 tabs: Border / Background / Diagonal
- Border: line grid (reuse Step 3 component) + presets (all/outer/inner) + direction buttons + apply scope (selected/all cells)
- Background: Reuse Step 3 UI + apply scope
- Diagonal: line type/thickness/color + `\` 8 types + `/` 8 types + `+` center 4 types + apply scope
- Context menu: "Cell Border/Background" submenu with "Apply to each cell" / "Apply as single cell"

## Step 5: Integration Testing + Build Verification

- cargo test 657+ pass, npm run build, Docker WASM build
- Manual UI verification across all dialog modes and tab functions
