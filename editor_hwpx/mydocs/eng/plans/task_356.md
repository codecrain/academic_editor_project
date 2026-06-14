# Task 356: hwpctl Compatibility Layer Design

## Goal

Design a wrapper layer compatible with Hancom Web Editor's `hwpctl` JavaScript API.
Enable web developers to switch to rhwp **without modifying** their existing hwpctl code.

## hwpctl 3-Axis Structure

```
┌─────────────────────────────────────────────────────┐
│  HwpCtrl API (Methods ~30)                          │
│  Open, Save, CreateAction, InsertCtrl, Run, ...     │
├─────────────────────────────────────────────────────┤
│  Action (312 total)                                  │
│  ├─ Core Actions (43) — Use ParameterSet             │
│  │   TableCreate, CharShape, ParaShape, ...         │
│  └─ Simple Actions (269) — No ParameterSet           │
│      MoveLeft, Copy, Paste, CharShapeBold, ...      │
├─────────────────────────────────────────────────────┤
│  ParameterSet (40 sets, 530 items)                   │
│  TableCreation, CharShape, ParaShape, ShapeObject,  │
│  BorderFill, Cell, PageDef, HeaderFooter, ...       │
└─────────────────────────────────────────────────────┘
```

## Architecture

```
Web Developer JavaScript (existing hwpctl code)
    │
    ▼
┌─────────────────────────────────────┐
│  hwpctl Compatibility Wrapper (TS)   │
│  rhwp-studio/src/hwpctl/            │
│                                     │
│  HwpCtrl                            │
│  ├─ CreateAction(id) → Action       │
│  │     ├─ CreateSet() → ParamSet    │
│  │     ├─ GetDefault(set)           │
│  │     ├─ Execute(set)              │
│  │     └─ Run()                     │
│  ├─ InsertCtrl(type, set)           │
│  ├─ Run(actionId)                   │
│  └─ ...                            │
│                                     │
│  Action → rhwp API Conversion Engine │
│  ParameterSet → JSON Conversion      │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  rhwp WASM API (228 methods)        │
│  HwpDocument                        │
└─────────────────────────────────────┘
```

## Core Execution Patterns

```javascript
// Pattern 1: Action + ParameterSet
var act = HwpCtrl.CreateAction("TableCreate");
var set = act.CreateSet();
act.GetDefault(set);
set.SetItem("Rows", 5);
set.SetItem("Cols", 3);
act.Execute(set);

// Pattern 2: Simple Run
HwpCtrl.Run("CharShapeBold");

// Pattern 3: InsertCtrl
var set = HwpCtrl.CreateSet("TableCreation");
set.SetItem("Rows", 5);
HwpCtrl.InsertCtrl("tbl", set);
```

## Divide-and-Conquer Implementation Plan

Tackle all 312 Actions in groups of 5 per wave.

### Wave 1: Framework + Table Creation (Task 357)

**Framework**: HwpCtrl, Action, ParameterSet base classes
**5 Actions**:

| # | Action | ParameterSet | rhwp API | Description |
|---|--------|-------------|----------|------|
| 1 | TableCreate | TableCreation | `create_table()` | Create table |
| 2 | InsertText | InsertText | `insert_text()` | Insert text |
| 3 | BreakPara | — | `split_paragraph()` | Paragraph break |
| 4 | BreakPage | — | Page break | |
| 5 | BreakColumn | — | Column break | |

### Wave 2: Formatting (Task 358)

| # | Action | ParameterSet | rhwp API | Description |
|---|--------|-------------|----------|------|
| 6 | CharShape | CharShape | `apply_char_format()` | Character format |
| 7 | ParagraphShape | ParaShape | `apply_para_format()` | Paragraph format |
| 8 | CharShapeBold | — | bold toggle | Bold |
| 9 | CharShapeItalic | — | italic toggle | Italic |
| 10 | CharShapeUnderline | — | underline toggle | Underline |

### Wave 3: Table Editing (Task 359)

| # | Action | ParameterSet | rhwp API | Description |
|---|--------|-------------|----------|------|
| 11 | TableInsertRowColumn | TableInsertLine | `insert_table_row/column()` | Insert row/column |
| 12 | TableDeleteRowColumn | TableDeleteLine | `delete_table_row/column()` | Delete row/column |
| 13 | TableSplitCell | TableSplitCell | `split_table_cell()` | Split cell |
| 14 | CellBorderFill | CellBorderFill | `apply_cell_style()` | Cell border/fill |
| 15 | TablePropertyDialog | ShapeObject | Table properties | Table dialog |

### Wave 4: Navigation/Selection (Task 360)

| # | Action | ParameterSet | rhwp API | Description |
|---|--------|-------------|----------|------|
| 16 | MoveLeft | — | Cursor left | |
| 17 | MoveRight | — | Cursor right | |
| 18 | MoveUp | — | Cursor up | |
| 19 | MoveDown | — | Cursor down | |
| 20 | SelectAll | — | Select all | |

### Wave 5: Clipboard + Undo (Task 361)

| # | Action | ParameterSet | rhwp API | Description |
|---|--------|-------------|----------|------|
| 21 | Copy | — | `copy_selection()` | Copy |
| 22 | Cut | — | Cut | |
| 23 | Paste | — | `paste_internal()` | Paste |
| 24 | Undo | — | Not supported (stub) | Undo |
| 25 | Redo | — | Not supported (stub) | Redo |

### Wave 6: Page/Section/Header (Task 362)

| # | Action | ParameterSet | rhwp API | Description |
|---|--------|-------------|----------|------|
| 26 | PageSetup | SecDef | `set_page_def()` | Page setup |
| 27 | HeaderFooter | HeaderFooter | `insert_header/footer()` | Header/footer |
| 28 | BreakSection | — | Section break | |
| 29 | BreakColDef | — | Column definition insert | |
| 30 | PageNumPos | PageNumPos | Page number | |

### Wave 7: Find/Replace (Task 363)

| # | Action | ParameterSet | rhwp API | Description |
|---|--------|-------------|----------|------|
| 31 | FindDlg | FindReplace | Not supported | Find |
| 32 | ReplaceDlg | FindReplace | Not supported | Replace |
| 33 | ForwardFind | FindReplace* | Not supported | Find forward |
| 34 | AllReplace | FindReplace* | Not supported | Replace all |
| 35 | Hyperlink | HyperLink | Not supported | Hyperlink |

### Wave 8: Cell Formatting (Task 364)

| # | Action | ParameterSet | rhwp API | Description |
|---|--------|-------------|----------|------|
| 36 | CellBorder | CellBorderFill | `apply_cell_style()` | Cell border |
| 37 | CellFill | CellBorderFill | `apply_cell_style()` | Cell background |
| 38 | CellZoneBorder | CellBorderFill | Zone border | |
| 39 | CellZoneBorderFill | CellBorderFill | Zone border/fill | |
| 40 | CellZoneFill | CellBorderFill | Zone fill | |

### Wave 9: Character Format Shortcuts (Task 365)

| # | Action | Description |
|---|--------|------|
| 41~45 | CharShapeHeight/Increase/Decrease, CharShapeSpacing/Increase | Size/spacing |

### Wave 10: Character Format Shortcuts 2 (Task 366)

| # | Action | Description |
|---|--------|------|
| 46~50 | CharShapeSuperscript/Subscript/Normal/Outline/Shadow | Superscript/outline/shadow |

### Wave 11+: Remaining Simple Actions (Task 367+)

| Wave | Actions | Main Content |
|------|----------|----------|
| 11 | 5 | Navigation (Home/End/PageUp/PageDown/DocStart) |
| 12 | 5 | Navigation (DocEnd/WordLeft/WordRight/ParaUp/ParaDown) |
| 13 | 5 | Selection navigation (SelectLeft/Right/Up/Down/All) |
| 14 | 5 | Deletion (Delete/Backspace/DeleteWord/DeleteLine/DeleteBack) |
| ... | 5 | ... |
| ~60+ | Remainder | Others |

> Waves 1~6 (30 Actions) cover 90% of core functionality.
> Waves 7~10 (20 Actions) complete formatting features.
> Waves 11+ (260 Actions) are simple keyboard/navigation operations — added incrementally.

## File Structure

```
rhwp-studio/src/hwpctl/
├── index.ts              # HwpCtrl class + createHwpCtrl()
├── action.ts             # Action class
├── parameter-set.ts      # ParameterSet class
├── action-registry.ts    # 312 Action registration table
├── actions/
│   ├── table.ts          # TableCreate, TableInsert/Delete, TableSplit
│   ├── text.ts           # InsertText, BreakPara/Page/Column
│   ├── format.ts         # CharShape, ParaShape, CharShapeBold...
│   ├── navigate.ts       # Move*, Select*
│   ├── clipboard.ts      # Copy, Cut, Paste, Undo, Redo
│   ├── page.ts           # PageSetup, HeaderFooter, PageNumPos
│   └── cell.ts           # CellBorder/Fill/Zone*
├── mappings/
│   ├── table-creation.ts # TableCreation Set → create_table conversion
│   ├── char-shape.ts     # CharShape Set → apply_char_format conversion
│   ├── para-shape.ts     # ParaShape Set → apply_para_format conversion
│   ├── shape-object.ts   # ShapeObject Set → CommonObjAttr conversion
│   ├── page-def.ts       # SecDef Set → set_page_def conversion
│   └── border-fill.ts    # BorderFill Set → conversion
└── types.ts              # PIT_UI1, PIT_I4, etc. hwpctl types
```

## Implementation Progress Tracker

### Progress Summary

| Category | Total | Implemented | Percentage |
|------|------|------|------|
| **Waves 1~6 (Core)** | 30 | 30 | 100% |
| **Waves 7~10 (Formatting)** | 20 | 0 | 0% |
| **Waves 11+ (Simple)** | 262 | 0 | 0% |
| HwpCtrl API Methods | 30 | 6 | 20% |
| ParameterSet | 40 | 2 | 5% |
| **Total Actions** | **312** | **30** | **10%** |

### Per-Wave Status

| Wave | Task | Actions | Status | Notes |
|------|------|----------|------|------|
| 1 | 358 | 5 | Complete | TableCreate/InsertText/BreakPara/Page/Column |
| 2 | 359 | 5 | Complete | CharShape/ParaShape/Bold/Italic/Underline |
| 3 | 360 | 5 | Complete | TableInsert/Delete/Split/CellBorderFill/TableProperty |
| 4 | 361 | 5 | Complete | MoveLeft/Right/Up/Down/SelectAll |
| 5 | 362 | 5 | Complete | Copy/Cut/Paste/Undo(stub)/Redo(stub) |
| 6 | 363 | 5 | Complete | PageSetup/HeaderFooter/BreakSection(stub)/ColDef(stub)/PageNum(stub) |
| 7 | 363 | 5 | Not started | Find/Replace |
| 8 | 364 | 5 | Not started | Cell formatting |
| 9 | 365 | 5 | Not started | Character shortcuts 1 |
| 10 | 366 | 5 | Not started | Character shortcuts 2 |
| 11+ | 367+ | 262 | Not started | Simple Actions |

> This table is updated after each Wave completion.

## Constraints

1. **No ActiveX**: `Open(path)` → `Open(blob)` (Blob/ArrayBuffer input)
2. **Async initialization**: `createHwpCtrl()` → then synchronous usage
3. **Graceful unsupported**: Unsupported Action calls → `console.warn` + ignore
4. **Events**: `addEventListener(eventType, callback)` — CustomEvent mapping
5. **Server API**: `GetTextFile`, `SaveAs`, etc. server integration via callback-based approach


## Usage Example

```javascript
import { createHwpCtrl } from '@rhwp/hwpctl';

// Initialization (once)
const HwpCtrl = await createHwpCtrl({
    wasmUrl: '/pkg/rhwp_bg.wasm',
    container: document.getElementById('editor'),
});

// Use existing hwpctl code as-is
var act = HwpCtrl.CreateAction("TableCreate");
var set = act.CreateSet();
act.GetDefault(set);
set.SetItem("Rows", 5);
set.SetItem("Cols", 3);
act.Execute(set);
```
