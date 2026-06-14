# Task 384: Systematic Discrepancy Between pagination current_height and layout y_offset (B-002)

## Status: Analysis in Progress

## Reproduction File
- `samples/bodo-02.hwp` — pi=21: pagination current_h=850.8 vs layout sum ~635px (215px excessive)

## Analysis Results

### 1. Per-Paragraph Height Difference Tracking

Debug insertion in pagination to track each item's `para_height` / `table_total_height`:

```
| pi | type | pagination | layout overlay | diff |
|----|------|-----------|----------------|------|
| 0  | table | 54.5     | 47.0           | +7.5 |
| 1  | para  | 1.9      | 1.3            | +0.6 |
| 2  | para  | 1.9      | 1.3            | +0.6 |
| 3 ci=0 | TAC table | 28.4 | 20.9      | +7.5 |
| 3 ci=1 | positioned table | 85.3 | 82.1 | +3.2 |
| 4  | para  | 11.2     | 8.0            | +3.2 |
| 5  | para  | 26.1     | 18.7           | +7.4 |
| 6  | para  | 26.1     | 18.7           | +7.4 |
| 7  | para  | 84.0     | 56.0           | +28.0|
| 10 | table | 74.3     | 68.3           | +6.0 |
| 11 | para  | 84.0     | 56.0           | +28.0|
| 14 | table | 96.9     | 83.4           | +13.5|
| 16 | para  | 112.0    | 74.7           | +37.3|
```

### 2. Normal Paragraph Difference Cause: `corrected_line_height`

**Attempt**: Changed `corrected_line_height` condition to `raw_lh < 1.0` → Correction not applied for HWP files with LINE_SEG
**Result**: Normal paragraph differences disappeared
**However**: 5 existing tests failed (page split results changed)

**Further investigation**: layout also doesn't use `corrected_line_height` and uses LINE_SEG lh directly
**Conclusion**: `corrected_line_height` correction is only applied in pagination, causing discrepancy with layout

**Attempt 2**: Skip correction when `raw_lh > 0.0` → **All 755 tests passed**
**However**: bodo-02 pi=21 split still occurs — normal paragraph differences resolved but table height differences remain

### 3. Table Height Difference Cause: `host_spacing`

In non-TAC table's `table_total_height = effective_height + host_spacing`:
- `host_spacing = before + sa + outer_bottom + host_line_spacing`
- `host_line_spacing = LINE_SEG.last().line_spacing`

Layout's "below-table spacing":
- `spacing_after` + `line_spacing` (or `line_height` if ls=0)

Two calculations generally match, but `effective_height` itself may differ:
- pagination: `MeasuredTable.total_height` (Task 381 added cell content height comparison)
- layout: Actual rendering height based on `compute_table_y_position`

### 4. dump-pages `h` vs Actual layout `y_advance`

dump-pages `h` value only **sums lh** (excludes ls) — reference value only
Actual layout `y_advance` sums `lh + ls` (including last line)
pagination `para_height` also sums `lh + ls`

→ **Comparison with dump-pages h is inaccurate**, direct pagination vs layout comparison needed

### 5. Last Line ls Exclusion Attempt

**Attempt**: Exclude last line ls from pagination `lines_total`
**Result**: 3~5 tests failed (Enter-repeat page overflow tests)
**Cause**: Layout also includes last line ls, so excluding it creates mismatch
**Conclusion**: Excluding last line ls is incorrect

## Unresolved Items

1. **`corrected_line_height` removal**: Skipping correction when `raw_lh > 0.0` is safe (755 tests pass)
   However, this alone doesn't resolve bodo-02 pi=21 split

2. **Table `effective_height` difference**: Cause of MeasuredTable.total_height vs actual rendering height difference unconfirmed

3. **`host_spacing` accuracy**: Whether non-TAC table host_spacing calculation exactly matches layout unverified

## Additional Analysis (Round 2)

### 6. effective_height vs common.height Difference

Debug results (`[EFF-H]`):
```
pi=14: effective=92.9 common=83.4 diff=+9.6
pi=21: effective=81.6 common=68.3 diff=+13.3
pi=28: effective=59.3 common=41.7 diff=+17.6
pi=37: effective=120.3 common=78.7 diff=+41.6
```

Cause: Task 381 added cell content height comparison to `resolve_row_heights` MeasuredTable path.
When cell content exceeds cell.height, row height expands → MeasuredTable.total_height increases.

**However, layout also uses the same `resolve_row_heights` so it renders with expanded height.**
→ Limiting effective_height to common.height would create layout mismatch + test failures

### 7. layout y_offset Also Excessive

In overlay, pi=21 y=1034.0 > body_area bottom (1028.1) → **layout also exceeds body area!**
Both pagination and layout have excessive height — the gap below table is excessively added.

layout line 1935-1938:
```rust
let gap = if seg.line_spacing > 0 { seg.line_spacing } else { seg.line_height };
y_offset += hwpunit_to_px(gap, self.dpi);
```
Gap added after every non-TAC table. Double-counted if overlapping with next paragraph's spacing_before.

### 8. host_spacing Composition Comparison

pagination: `host_spacing = before + sa + outer_bottom + host_line_spacing`
layout: `spacing_after + gap(ls or lh)`

Two calculations generally match, but pagination includes `before(sb)` while
layout handles spacing_before separately for **above** the table.
→ If sb is included in host_spacing in pagination, it may be double-counted

## Divide and Conquer Plan

| Step | Target | Content | Status |
|------|------|------|------|
| A | corrected_line_height | Skip correction when raw_lh>0 | Done |
| B | Below-table gap doubling | Investigate layout gap + next paragraph spacing overlap | Not started |
| C | host_spacing sb doubling | Investigate if pagination's before(sb) is doubled | Not started |
| D | effective_height consistency | Verify Task 381 expansion matches pagination/layout | Investigation done (match confirmed) |
| E | Integrated verification | bodo-01, bodo-02, kps-ai, existing tests | Not started |
