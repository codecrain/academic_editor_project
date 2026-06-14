# Task 212 Implementation Plan

## Core Cause

**Forced placement when intra-row split fails for the last row taller than the page**

kps-ai.hwp p67 table structure:
- 3 rows, rows 0~1 are split-placed on page 66
- Row 2 (last row): height 946.33px > page available 918.37px (difference ~28px)
- `approx_end=2 <= cursor_row=2` → intra-row split attempt
- When split conditions are not met, `end_row = cursor_row + 1 = 3 = row_count` → enters "all remaining fits" branch
- `partial_h=946.33` exceeds `avail=918.37` but is placed without validation → **overflow occurs**

## Step 1: Relax Intra-row Split Conditions

**File**: `src/renderer/pagination/engine.rs`

### Fix location: approx_end <= cursor_row branch (L918-938)

Currently when `approx_end <= cursor_row` and `is_row_splittable(r) == false`, unconditionally forces `end_row = r + 1`.

Fix: Even when `is_row_splittable(r) == false`, if row height exceeds page available height, clip the row content to fit available height (forced intra-row split).

### Fix location: "all remaining fits" branch (L1014)

Currently when `end_row >= row_count && split_end_limit == 0.0`, unconditionally places.

Fix: When `partial_height > page_avail` → apply intra-row split to the last row to prevent overflow.

## Step 2: Verify is_row_splittable Conditions

**File**: `src/renderer/height_measurer.rs`

Verify conditions under which `is_row_splittable()` returns false, and supplement to return true when row height exceeds the page.

## Step 3: Test and Verification

- `cargo test` — 684 existing tests PASS confirmation
- SVG export: kps-ai.hwp p67 overflow resolution confirmation
- Regression testing with hwpp-001.hwp and other documents
- WASM build + E2E test
