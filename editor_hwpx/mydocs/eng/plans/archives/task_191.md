# Task 191: Table Settings Dialog UI Enhancement

## Current Status Analysis

Current `table-cell-props-dialog.ts` (1095 lines) has 6 tabs (Basic/Margin-Caption/Border/Background/Table/Cell) implemented. Comparison with 7 Hancom screenshots reveals the following gaps.

### Key Structural Difference

Hancom's dialog composition varies by **context**:

| Selection State | Dialog | Tab Configuration |
|----------------|--------|-------------------|
| Table selected (object selection) | Table/Cell Properties | Basic / Margin-Caption / **Border** / **Background** / Table / Cell (6 tabs) |
| Cell selected (cursor in cell/cell block) | Table/Cell Properties | Basic / Margin-Caption / Table / Cell (**4 tabs**, no Border/Background) |
| Cell block → right-click "Cell Border/Background" | **Cell Border/Background** (separate dialog) | Border / Background / Diagonal (3 tabs) |

Current implementation always shows 6 tabs with radio toggle inside border/background tabs — structurally different from Hancom.

## Goals

Enhance table/cell properties dialog to Hancom's level focusing on **high priority items**:

1. **Dialog structure overhaul** — context-based tab branching (table select=6 tabs, cell select=4 tabs)
2. **Cell border/background separate dialog** (new, 3 tabs)
3. **Border tab enhancement** — visual line type grid + cross-line preview + auto boundary settings
4. **Background tab enhancement** — pattern fill (face color + pattern color + pattern type) activation
5. **Table tab enhancement** — 3 page break modes + auto boundary settings + "All" batch margin
6. **Margin/Caption tab enhancement** — caption position icon grid (8 types) + "All" batch adjustment
7. **Cell tab enhancement** — "All" batch margin + single-line input + vertical writing options
8. **Dedicated CSS separation** + visual quality improvement
9. **Context menu integration** — "Cell Border/Background" submenu

## Scope Limitation

- Gradient editing, picture background editing remain **read-only** (separate task)
- Basic tab size reference (% mode), object description, table box settings excluded
- UI connection primarily for attributes already in WASM API (minimize new Rust parser work)
