# Task 215 -- Step 4 Completion Report

## Completed Work

### 1. multi-TAC trailing_ls Bug Fix (Key Fix)

**Problem**: hwp-multi-001 passed (when trailing_ls restored) but kps-ai failed (79->80, regression)

**Root cause**: `has_post_text` determination in `place_table_with_text()` did not match Paginator

| Category | Paginator (correct) | TypesetEngine (before fix) |
|----------|---------------------|---------------------------|
| post-text placement condition | `tac_table_count <= 1` | `tac_table_count <= 1` |
| trailing_ls restoration has_post_text | `!text.is_empty() && lines > start` | includes `tac_table_count <= 1` |

- Paginator checks only text line existence regardless of `tac_table_count` for trailing_ls restoration
- For multi-TAC tables (tac_count > 1): if text lines exist, `has_post_text=true` -> trailing_ls not restored
- TypesetEngine included `tac_table_count <= 1` condition in `has_post_text`, causing incorrect restoration for multi-TAC

**Fix**: Separated `should_add_post_text` (for post-text placement) and `has_post_text` (for trailing_ls determination)

```rust
// post-text placement: includes tac_table_count <= 1 condition
let should_add_post_text = is_last_table && tac_table_count <= 1 && ...;

// trailing_ls restoration: independent of tac_table_count, checks text line existence only
let has_post_text = !para.text.is_empty() && total_lines > post_table_start;
if is_tac && fmt.total_height > fmt.height_for_fit && !has_post_text { ... }
```

### 2. TYPESET_VERIFY / TYPESET_DETAIL Verification Completed

Page count comparison + per-page item (PageItem) level comparison tool confirmed working.

### 3. Code Cleanup Confirmed

- Phase 1 stubs (`process_table_controls`, `split_table_into_pages`): Already removed
- TODO/FIXME/HACK comments: None
- Debug output: Only `eprintln!` in test utilities (intentional)
- Commented-out code: None
- Unused functions: None

### 4. Tests

- 694 PASS, 0 FAIL, 1 IGNORED
- Build succeeded

## Final Verification Results

### TYPESET_VERIFY Comparison (All Documents Match)

| Document | Paginator | TypesetEngine | Result |
|----------|-----------|---------------|--------|
| k-water-rfp sec1 | 25 | 25 | Match |
| kps-ai sec0 | 79 | 79 | Match |
| hwpp-001 sec3 | 57 | 57 | Match |
| p222 sec2 | 44 | 44 | Match |
| hongbo | - | - | Match |
| biz_plan | - | - | Match |
| hwp-multi-001 sec0 | 9 | 9 | Match |
| synam-001 sec0 | 41 | 41 | Match |

### Improvement Over Previous Steps

| Document | Step 1 | Step 2 | Step 3 | Step 4 |
|----------|--------|--------|--------|--------|
| k-water-rfp | 25->27 | 25->26 | Match | Match |
| kps-ai | 79->75 | Match | Match | Match |
| hwpp-001 | 57->55 | Match | Match | Match |
| hwp-multi-001 | 9->8 | 9->8 | Match | Match |
| synam-001 | 41->40 | 41->40 | Match | Match |

### LAYOUT_OVERFLOW Status

6 overflow occurrences in k-water-rfp still remain, but these are due to **Paginator's pagination results** and will be resolved when switching to TypesetEngine rendering (Phase 3).

## Task 215 Overall Completion Summary

### Features Implemented in Phase 2

1. **Break Token Pattern**: Explicit table split state transfer via `TypesetBreakToken::Table`
2. **format_table()**: Single-pass table height calculation (unified measurement-placement)
3. **typeset_block_table()**: fits/split branching, row-level splitting
4. **typeset_tac_table()**: TAC table-specific typesetting (LINE_SEG-based)
5. **place_table_with_text()**: pre/post text + trailing_ls restoration
6. **Footnote pre-calculation**: Footnote height in table cells -> deducted from available height
7. **HostSpacing.spacing_after_only**: Precise last fragment height calculation
8. **TYPESET_DETAIL diagnostics**: Per-page item comparison tool

### Bugs Fixed

| Bug | Cause | Fix |
|-----|-------|-----|
| k-water-rfp 26->25 | host_line_spacing over-applied to last fragment | spacing_after_only field |
| hwp-multi-001 8->9 | pre/post text not generated | place_table_with_text() |
| synam-001 40->41 | TAC height correction (tac_seg_total) not applied | Ported same logic from paginator |
| kps-ai 80->79 | multi-TAC trailing_ls incorrectly restored | Separated has_post_text |
