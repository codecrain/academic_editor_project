# Task 118 Execution Plan

## Subject
Table Page Overflow Bug Fix

## Background

On page 3 of `samples/hancom-webgian.hwp`, the bottom table renders 27.46px beyond the body clip area (y=1046.89). This is a pre-existing issue that occurred even before line spacing handling (Task 117).

## Root Cause Analysis

### Core Bug: Pagination doesn't account for table paragraph's host spacing

**layout.rs (627-721)** Actual Y added during PageItem::Table processing:
1. `spacing_before` (paragraph before spacing) — line 638
2. `line_spacing` (first line_seg's line spacing) — line 646
3. `layout_table()` return value (table body height) — line 674
4. `spacing_after` (paragraph after spacing) — line 718

**pagination.rs (937)** Tracked height:
```rust
current_height += effective_height;  // Table body only! ①②④ missing
```

→ Pagination determines the table fits, but actual layout consumes spacing_before + line_spacing + spacing_after more space, causing overflow.

### Secondary Bug: layout_partial_table cell height calculation includes last line's line_spacing

**layout.rs (3137-3141)**: Sums `line_height + line_spacing` for all lines
**height_measurer.rs (353-361)**: Excludes `line_spacing` for cell's last line

→ PartialTable's row height is larger than height_measurer's estimate, causing cumulative overflow.

## Implementation Plan (3 Phases)

### Phase 1: Reflect Host Paragraph Spacing in Pagination

**File**: `src/renderer/pagination.rs`

**Modification location**: Full table placement (lines 902-937) and split table path (lines 964-1046)

- When table fits entirely (line 937):
  - `current_height += effective_height` → `current_height += effective_height + host_spacing`
  - `host_spacing = spacing_before + line_spacing_from_first_seg + spacing_after`
  - `spacing_before` applied only when not at column top (matching layout.rs line 637)

- When table exceeds and splits (line 964+):
  - Subtract `spacing_before + line_spacing` from `remaining_on_page` (placed before table)
  - Add `spacing_after` to `current_height` of last part

### Phase 2: Fix layout_partial_table Cell Height Calculation

**File**: `src/renderer/layout.rs`

**Modification location**: lines 3128-3146 (row_span==1), lines 3218-3235 (row_span>1)

Exclude `line_spacing` from last line of last paragraph in cell:
```rust
// Before: line_height + line_spacing for all lines
// After: line_height only if is_cell_last_line
```

### Phase 3: Testing + Visual Verification

1. Docker native build + full tests
2. WASM build
3. SVG export: verify `hancom-webgian.hwp` page 3
4. Visual verification in web viewer
5. Daily task status update

## Key Reference Files

| File | Reference Reason |
|------|-----------------|
| `src/renderer/layout.rs:627-721` | PageItem::Table processing (verify spacing addition) |
| `src/renderer/layout.rs:3128-3146` | layout_partial_table cell height calculation |
| `src/renderer/pagination.rs:895-962` | Table placement decision + height tracking |
| `src/renderer/pagination.rs:964-1050` | Table row split path |
| `src/renderer/height_measurer.rs:353-361` | Accurate cell height calculation (reference) |

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Adding host_spacing may push previously fitting tables to next page | This is correct behavior (previous was overflow) |
| PartialTable cell height change affects row distribution | Ensuring consistency with height_measurer is the correct direction |
