# Task 215 -- Step 3 Completion Report

## Completed Work

### 1. Footnote Handling Implementation

#### Pre-calculation of Footnote Height in Table Cells (format_table)
- Summed all footnote heights within the table in the `FormattedTable.table_footnote_height` field
- Implemented `estimate_footnote_height()` helper (same logic as HeightMeasurer)
- Same pattern as Paginator engine.rs:565-581

#### Available Height Calculation Reflecting Footnotes (typeset_block_table)
- Pre-deducted `table_footnote_height` to calculate `table_available_height`
- Conditionally added separator overhead (`footnote_separator_overhead`)
- Applied safety margin (`footnote_safety_margin`)
- Same pattern as Paginator engine.rs:583-586

#### Footnote Collection
- Footnotes in table cells: Created `FootnoteRef::TableCell` in `typeset_table_paragraph()`
- Body footnotes: Created `FootnoteRef::Body` in the main loop
- Called `st.add_footnote_height()` to dynamically track available height
- Same pattern as Paginator engine.rs:679-701, 515-525

### 2. Inline Control Handling (Non-table Paragraphs)

- Non-table paragraph `Control::Shape/Picture/Equation` -> `PageItem::Shape` generation
- Non-table paragraph `Control::Footnote` -> `FootnoteRef::Body` + height tracking
- Same pattern as Paginator engine.rs:509-525

### 3. Last Fragment Height Accumulation Bug Fix (Key Fix)

**Root cause found**: Mismatch between Paginator and TypesetEngine last fragment height accumulation rules

| Category | Paginator (correct) | TypesetEngine (before fix) |
|----------|---------------------|---------------------------|
| Full placement | `partial_height + host_spacing` | `partial_height + host_spacing_total` |
| Last fragment | `partial_height + **sa**` | `partial_height + **host_spacing.after**` |
| Middle fragment | advance only | advance only |

- `host_spacing.after = sa + outer_bottom + host_line_spacing`
- Paginator applies only `sa` to the last fragment (host_line_spacing not included)
- TypesetEngine applied the entire `host_spacing.after`, causing height overestimation
- This difference accumulated, causing 1 extra page in k-water-rfp

**Fix**: Added `HostSpacing.spacing_after_only` field, used in last fragment

### 4. TYPESET_DETAIL Diagnostic Tool Added

- `TYPESET_DETAIL=1` environment variable: Outputs detailed per-page item comparison
- `TYPESET_ALL_PAGES=1` environment variable: Outputs pages even without differences
- Item format: `F{para}` (full paragraph), `P{para}(start-end)` (partial paragraph), `T{para}` (table), `PT{para}(rstart-end)` (partial table), `S{para}` (shape)

## Verification Results

### TYPESET_VERIFY Comparison

| Document | Step 2 | Step 3 | Paginator |
|----------|--------|--------|-----------|
| k-water-rfp sec1 | 25->26 | **Match** | 25 |
| kps-ai sec0 | Match | Match | 79 |
| hwpp-001 sec3 | Match | Match | 57 |
| p222 sec2 | Match | Match | 44 |
| hongbo | Match | Match | - |
| biz_plan | Match | Match | - |
| hwp-multi-001 sec0 | 9->8 | 9->8 | 9 |
| synam-001 sec0 | 41->40 | 41->40 | 41 |

### Improvements

- **k-water-rfp**: 26->25 (Full match with Paginator!) -- Effect of last fragment height fix
- **15yers full documents**: All match

### Remaining Difference Causes

#### hwp-multi-001 (9->8, -1 page)
- Pre-table/post-table text not generated for TAC table paragraphs
- Paginator generates `P14(0-1),T14` (text+table), TypesetEngine generates only `T14`
- Under-estimation due to vertical_offset-based pre-table text height not reflected
- TAC table pre/post text handling to be added in step 4

#### synam-001 (41->40, -1 page)
- Minor differences in paragraph height calculation (Phase 1 area)
- General paragraph height accumulation differences unrelated to table splitting

### Overflow Status

The 14.2px overflow on page 17 (para 195) of k-water-rfp is a **Paginator result**, and will be resolved when TypesetEngine is used for actual rendering (transition in Phase 3).

### Tests

- 694 PASS, 0 FAIL
- Build succeeded
