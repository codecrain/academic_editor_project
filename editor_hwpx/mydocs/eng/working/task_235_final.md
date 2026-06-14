# Task 235 Final Completion Report

## Overview

Fixed space-based horizontal position error for TAC block tables and reduced page overflow caused by vpos base mismatch between pagination/layout.

## Changes

### 1. TAC Block Table Space x-Offset (layout.rs)

- **Problem**: Authors adjust TAC table horizontal position using `·[table]··` pattern, but leading spaces were ignored during block TAC table rendering
- **Fix**: For host paragraphs containing only spaces, added space width before FFFC (table control character) to `effective_margin`
- **Result**: Space-based horizontal position adjustment now reflected in block TAC tables

### 2. Pagination vpos Base Synchronization (engine.rs)

- **Problem**: In `paginate_text_lines`, after page split, `page_vpos_base` was not set when placing FP/PP, causing the main loop to set base from a different paragraph's vpos. Layout uses the actual first item's vpos on that page as base, creating mismatch
- **Fix**: Within `paginate_text_lines`, set `page_vpos_base` from `para.line_segs.first()` for FP placement and `para.line_segs.get(cursor_line)` for PP placement
- **Result**: Pagination and layout vpos bases are now set from the same paragraph reference, synchronizing height calculations

### 3. TAC Table vpos Snap Reference Change (layout.rs)

- Changed from `col_area.y` → `para_y_for_table` (based on paragraph start y-coordinate)
- Since vertical_pos is an offset from paragraph start, line_end is calculated relative to paragraph start

### 4. Conditional ls/2 Application (layout.rs)

- `line_spacing/2` applied only between multiple TAC tables within the same paragraph
- Not added after the last TAC table, matching pagination behavior

## Results

| Item | Before Fix | After Fix |
|------|-----------|-----------|
| LAYOUT_OVERFLOW | 12 cases | 9 cases |
| Max overflow | 28.1px (page 6) | 22.3px (page 35) |
| Resolved pages | - | 6, 7, 9, 74 |
| Page count | 78 | 78 (matches Hancom) |
| cargo test | 716 pass | 716 pass |
| Regressions (KTX, field-02, f11-01) | 0 | 0 |

## Remaining 9 Overflow Cases

Caused by effective_height differences in individual tables (pagination estimate < layout actual render height). Primarily occurs in large tables (800-900px); requires separate task.

## Changed Files

- `src/renderer/layout.rs` — TAC block table space x-offset, vpos snap reference change, conditional ls/2 application
- `src/renderer/pagination/engine.rs` — page_vpos_base setting within paginate_text_lines

## Commit

- `2b39380` TAC block table space x-offset and pagination vpos base synchronization (Task 235)
