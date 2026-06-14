# Task 102 — Step 5 Completion Report

## Step Name
Incremental Reflow (Relayout Boundary + Selective Recomposition + Incremental Paragraph Measurement)

## Work Period
2026-02-17

## Change Details

### Sub-step 5-1: Cell Edit Relayout Boundary (`src/wasm_api.rs`)
- Added `mark_section_dirty()` method: Only marks section as dirty (skips retypesetting)
- Replaced `recompose_section()` → `mark_section_dirty()` in 7 Category A cell editing functions:
  - `insert_text_in_cell_native`, `delete_text_in_cell_native`, `delete_range_native` (cell branch), `paste_internal_in_cell_native` (single/multi), `paste_html_in_cell_native` (single/multi)
- Added missing `table.dirty = true` marking at 5 locations (paste, delete_range cell edits)
- **Effect**: Completely skips full section compose_section() O(N) during cell text editing

### Sub-step 5-2: Selective Paragraph Recomposition (`src/wasm_api.rs`)
- `recompose_paragraph(section_idx, para_idx)`: Retypesets only a single paragraph
- `insert_composed_paragraph(section_idx, para_idx)`: Inserts new item into composed vector
- `remove_composed_paragraph(section_idx, para_idx)`: Removes item from composed vector
- Replaced `recompose_section()` → selective recomposition in 10 Category B body editing functions:
  - Single paragraph edit (4 locations): single `recompose_paragraph()` call
  - Paragraph split: `recompose_paragraph()` + `insert_composed_paragraph()`
  - Paragraph merge: `remove_composed_paragraph()` + `recompose_paragraph()`
  - Range delete: reverse `remove_composed_paragraph()` for middle paragraphs + `recompose_paragraph()` after merge
  - Multi-paragraph paste: `insert_composed_paragraph()` for inserted paragraphs + `recompose_paragraph()` for original
- 1 location (`rebuild_section()`) retains existing `recompose_section()` (full style change)
- **Effect**: O(N) → O(1) per paragraph compose for body text editing

### Sub-step 5-3: Incremental Paragraph Measurement (`src/wasm_api.rs`, `src/renderer/height_measurer.rs`)
- Added `dirty_paragraphs: Vec<Option<Vec<bool>>>` field
  - None = all dirty (initial load, after recompose_section)
  - Some(vec) = per-paragraph dirty bitmap
- `mark_paragraph_dirty()` method: Sets individual paragraph dirty bit
- Added `measure_section_selective()` method (height_measurer.rs):
  - dirty_paras == None → `measure_section_incremental()` fallback (table-level caching)
  - dirty_paras == Some(bits) → reuses non-dirty paragraph measurement cache + always checks table dirty
- `paginate()` integration:
  - Uses `measure_section_selective()` when previous measurement exists
  - Initializes `dirty_paragraphs[idx] = Some(vec![false; para_count])` after pagination completes
- Syncs dirty bitmap insert/remove with insert/remove_composed_paragraph
- **Effect**: O(1) cache reuse for unchanged paragraph measurement, skips entire section paragraph measurement during cell edits

## Test Results
- 564 tests passed
- WASM build success
- Vite build success

## Modified Files
| File | Changes |
|------|---------|
| `src/wasm_api.rs` | `mark_section_dirty()`, `recompose_paragraph()`, `insert/remove_composed_paragraph()`, `mark_paragraph_dirty()`, `dirty_paragraphs` field, Category A 7 locations + Category B 10 locations replaced, `paginate()` selective measurement integration |
| `src/renderer/height_measurer.rs` | `measure_section_selective()` method added (~75 lines) |

## Performance Improvement Effects

| Edit Type | Before | After |
|-----------|--------|-------|
| Cell text edit | O(N) compose + O(N) measure | compose skipped + O(table) measure |
| Body text edit | O(N) compose + O(N) measure | O(1) compose + O(1) measure |
| Table structure change | O(N) compose + O(N) measure | O(N) compose + O(dirty) measure |

## Step 5 Refactoring Final Results

| Step | Core Algorithm | Effect |
|------|---------------|--------|
| 1 | Dense Grid O(1) cell access | Cell search O(n)→O(1), eliminated double row height calculation |
| 2 | Unified table layout (depth recursion) | ~288 line net reduction, nested table logic unified |
| 3 | DocumentPath + recursive height measurement | Arbitrary-depth nested table access/measurement |
| 4 | Section dirty + Prefix Sum + table dirty | O(log R) split, only dirty sections/tables reprocessed |
| 5 | Relayout Boundary + selective recomposition + incremental measurement | Cell/body edit O(N)→O(1) |
