# Task 110 Execution Plan

- **Subject**: KTX.hwp 2-Column Layout Right Column Rendering (B-005)
- **Branch**: `local/task110` (based on devel `2d0c804`)
- **Created**: 2026-02-18

## 1. Problem Analysis

### Symptoms
- KTX.hwp is a 2-column (multi-column) layout document
- Right column text is not properly rendered in current code

### Root Causes (2 issues)

#### A. Table Outer Margin Not Implemented
- `Table` struct lacks an outer margin (`margin`) field
- Shapes handle outer margins via `CommonObjAttr.margin`, but tables don't support this
- Table outer margins are ignored, causing inaccurate table positioning in multi-column layouts
- Cell internal padding (cell padding) works correctly

#### B. Missing Multi-Column Line Filtering
- In HWP internal structure, paragraphs in multi-column documents contain **line information for all columns**
- Each line's `segment_width` (LineSeg) must be used to determine which column it belongs to
- `layout_composed_paragraph()` lacks filtering logic to select only lines belonging to the current column

### Previous Attempt (130b1df) Failure Cause
- Applied segment_width filter to all documents without detecting multi-column
- Caused regression in single-column documents (k-water-rfp)

## 2. Solution

### Core Strategy
1. **Implement table outer margin** — reflect margin in table position calculation
2. **Multi-column line filtering** — apply filter only when `column_areas.len() > 1`
3. **Regression prevention** — skip filtering for single-column documents

### Files to Modify
- `src/model/table.rs` — Add margin field to Table struct
- `src/parser/control.rs` — Extract outer margin during table parsing
- `src/renderer/layout.rs` — Apply margin to table position calculation + multi-column line filtering

## 3. Implementation Plan (4 Phases)

### Phase 1: Table Outer Margin Parsing and Rendering
- Add `margin: Padding` field to `Table` struct (or read margin from raw_ctrl_data)
- Confirm margin field position in CTRL_HEADER's CommonObjAttr structure
- Reflect margin in table position calculation (table_x, table_y) in `layout.rs`

### Phase 2: Multi-Column Line Filtering Implementation
- Add `is_multi_column: bool` parameter to `layout_composed_paragraph()`
- In multi-column documents, compare `ComposedLine.segment_width` with current column width
- For mismatched lines, advance `char_offset` only and skip rendering
- Pass `is_multi_column` to call sites

### Phase 3: Regression Tests and SVG Verification
- Confirm all 565 tests pass
- KTX.hwp SVG export → verify right column text renders correctly
- Confirm no regression in single-column documents like k-water-rfp

### Phase 4: WASM Build and Final Verification
- Confirm WASM build succeeds

## 4. Verification Method
- `docker compose --env-file .env.docker run --rm test` → 565 tests pass
- `export-svg samples/basic/KTX.hwp` → right column renders correctly
- WASM build succeeds
