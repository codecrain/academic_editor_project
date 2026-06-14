# Task 383: Mixed Positioned+TAC Table Pagination Height Calculation Fix (v2)

## Problem

When a TAC table and a positioned (vert_offset) table coexist in the same paragraph:
1. **pagination**: Heights of both tables summed individually + host_spacing double-applied → current_height excessive
2. **layout**: When TAC→positioned order, `deferred_table_bottom` not applied → y_offset excessive

### Reproduction Files
| File | Order | Problem |
|------|------|------|
| bodo-01.hwp | positioned→TAC | layout: Order reversal (resolved by Task 382), pagination: Normal |
| bodo-02.hwp | TAC→positioned | pagination: pi=21 split pushes pi=22 to page 3, layout: Excessive gap |

### Root Cause

**pagination**:
```
ci=0 (TAC): current_height += TAC_height + host_spacing_1
ci=1 (positioned): current_height += positioned_height + host_spacing_2
Sum: TAC_height + positioned_height + host_spacing_1 + host_spacing_2
```

**Actual occupied space**:
```
max(TAC_bottom, vert_offset + positioned_height) + host_spacing (only once)
```

Sum > actual → subsequent paragraphs pushed further down, causing page overflow.

**layout** (bodo-02 specific):
- `has_following_tac` condition only handles "positioned followed by TAC"
- Not activated for TAC→positioned order, so deferred is not enabled

## Solution: Post-Correction Approach

### Step 1: pagination Post-Correction

Measure height before and after `process_controls` call, and correct to integrated height for mixed paragraphs.

**Location**: Inside `paginate_text_lines`, after `process_controls` call (around line 260)

```rust
// Before process_controls call
let height_before = st.current_height;

self.process_controls(st, para_idx, para, measured, measurer, ...);

// Post-correction when same paragraph has TAC + positioned(vert_offset>0) coexisting
if has_mixed_tac_and_positioned_table(para) {
    let added = st.current_height - height_before;
    let integrated = compute_integrated_table_height(para, measured, measurer);
    if integrated < added {
        st.current_height = height_before + integrated;
    }
}
```

**`compute_integrated_table_height`**:
```
tac_max_bottom = 0
positioned_max_bottom = 0

for each table control in para:
    effective_h = measured_table.total_height (or cell height sum)
    if TAC:
        tac_max_bottom = max(tac_max_bottom, effective_h)
    else if positioned && vert_offset > 0:
        positioned_max_bottom = max(positioned_max_bottom, vert_offset_px + effective_h)

integrated = max(tac_max_bottom, positioned_max_bottom) + host_spacing (once)
```

### Step 2: layout deferred Extension (TAC→positioned order)

**Location**: Inside `layout_table_item`, extending `has_following_tac` condition

Current:
```rust
let has_following_tac = vert_offset > 0 && !tac && TopAndBottom
    && has TAC after current;
```

Extension:
```rust
// When positioned(vert_offset>0) table exists in same paragraph and current table is TAC
let has_positioned_sibling = tac && para.controls.iter()
    .any(|c| matches!(c, Control::Table(t)
        if !t.common.treat_as_char
        && t.common.vertical_offset > 0
        && matches!(t.common.text_wrap, TopAndBottom)));
```

When processing TAC with `has_positioned_sibling=true`, maintain y_offset and update to max(y_offset, positioned bottom) after positioned table processing.

## Edge Case Handling

| Case | Treatment |
|--------|------|
| 1 TAC + 1 positioned (either order) | integrated = max(TAC_bottom, vert+positioned_height) |
| 2 TAC + 1 positioned | tac_max_bottom = max(TAC_1, TAC_2), integrated = max(tac_max, positioned) |
| 2 positioned (no TAC) | positioned_max = max(vert_1+h_1, vert_2+h_2), tac_max=0, integrated=positioned_max |
| vert_offset=0 non-TAC + TAC | positioned condition not met → correction not applied → existing behavior maintained |
| Single-table paragraph | has_mixed condition not met → correction not applied → existing behavior maintained |
| Positioned table page split | split handled in process_controls → post-correction only applied when fully fits |

## Implementation Steps

| Step | Content | File |
|------|------|------|
| 1 | `has_mixed_tac_and_positioned_table` helper | pagination/engine.rs |
| 2 | `compute_integrated_table_height` helper | pagination/engine.rs |
| 3 | Insert process_controls post-correction | pagination/engine.rs |
| 4 | Add layout `has_positioned_sibling` condition | layout.rs |
| 5 | Verify bodo-01, bodo-02, existing tests | — |

## Test Plan
- bodo-01.hwp: Positioned→TAC order works normally
- bodo-02.hwp: TAC→positioned order, pi=22 placed on page 2
- kps-ai.hwp: Existing TAC table spacing maintained
- Existing 755 unit tests passing
