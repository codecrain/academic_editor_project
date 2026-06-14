# Task 191 Final Report: Table Settings Dialog UI Enhancement

## Overview

Comprehensively enhanced `TableCellPropsDialog` UI referencing Hancom's table/cell properties dialog. Created separate cell border/background dialog. Additionally implemented full-direction caption rendering, Korean IME cursor movement during composition, and Top caption table position correction.

## Completed Steps

### Step 1: Dedicated CSS + Dialog Structure Overhaul
- `table-cell-props.css` with `tcp-` prefix
- Context-based tab branching: Table selection → 6 tabs, Cell selection → 4 tabs

### Step 2: Table/Cell/Margins-Caption Tab Enhancement
- Table tab: Page break 3-type dropdown, auto border settings, "All(A)" batch margin spinner
- Cell tab: "All(A)" batch margin, single-line input enabled, vertical writing rotation/upright options
- Margins/Caption tab: "All(A)" outer margin, 8-position SVG icon grid for caption placement

### Step 3: Table Border/Background Tab Enhancement
- Border tab: SVG icon-based line type visual grid (8 types), SVG crosshair preview, 3x3 direction button grid
- Background tab: face color/pattern color/pattern type fields, CSS gradient-based pattern preview (7 types)

### Step 4: Separate Cell Border/Background Dialog + Context Menu
- `CellBorderBgDialog` with 3 tabs (Border/Background/Diagonal)
- `applyMode: 'each' | 'asOne'` branching
- Context menu items for cell border/background added

### Step 5: Caption Rendering + IME Fix + Integration
- Full-direction caption rendering (Top/Bottom/Left/Right)
- Top caption table position correction in `compute_table_y_position`
- Korean IME cursor movement: `e.code`-based navigation key detection + `_pendingNavAfterIME` pattern

## Key Bug Fixes

### Top Caption Table Not Moving
- **Cause**: Missing Top caption offset in `compute_table_y_position` first branch (absolute position calculation)
- **Fix**: Added `caption_top_offset` to first branch return value

### Korean IME Arrow Navigation During Composition
- **Cause**: `e.key` reports `'Process'` when `e.isComposing=true`, preventing navigation key detection
- **Fix**: `e.code`-based detection + pending nav pattern

## Verification
- Rust tests: 657 all passed
- WASM build: Success
