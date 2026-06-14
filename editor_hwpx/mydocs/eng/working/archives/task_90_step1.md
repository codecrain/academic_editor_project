# Task 90 — Stage 1 Completion Report

## Stage Goal
Extract common utility functions + improve header.rs charPr/paraPr parsing

## Completed Items

### 1. utils.rs New File
- `src/parser/hwpx/utils.rs` — Common utility function module
- Functions: `local_name`, `attr_str`, `attr_eq`, `parse_u8`, `parse_i8`, `parse_u16`, `parse_i16`, `parse_u32`, `parse_i32`, `parse_color`, `parse_color_str`, `parse_bool`, `skip_element`
- 3 unit tests included (`test_local_name`, `test_parse_color_str`, `test_parse_color_str_with_alpha`)

### 2. header.rs Duplicate Function Removal + paraPr/charPr Improvements
- Added `use super::utils::*`
- Removed 70 lines of duplicate utility functions (`local_name`, `attr_str`, `parse_u8`~`parse_i32`, `parse_color`)
- Kept header-specific functions: `is_empty_event`, `parse_alignment`, `parse_border_line_type`, `parse_border_width`

**charPr improvements**:
- `<hh:emboss/>` -> `cs.attr |= 1 << 9` (emboss)
- `<hh:engrave/>` -> `cs.attr |= 1 << 10` (engrave)

**paraPr improvements**:
- Added `<hh:breakSetting>` parsing: widowOrphan(bit 5), keepWithNext(bit 6), keepLines(bit 7), pageBreakBefore(bit 8) -> `ps.attr2`
- Added `<hh:autoSpacing>` parsing: eAsianEng(bit 20), eAsianNum(bit 21) -> `ps.attr1`
- `<hh:border>` improvement: offsetLeft/Right/Top/Bottom -> `ps.border_spacing[0..4]`

### 3. section.rs Duplicate Function Removal
- Added `use super::utils::*`
- Removed 50 lines of duplicate utility functions (`local_name`, `attr_str`, `parse_u8`, `parse_i8_`, `parse_u16`, `parse_i16`, `parse_u32`, `skip_element`)
- Unified `parse_i32_val` -> utils `parse_i32`
- Unified `parse_i8_` -> utils `parse_i8`

## Verification Results
- `docker compose run --rm test` — **All 532 tests passed** (existing 529 + 3 new utils tests)

## Modified Files
| File | Changes |
|------|---------|
| `src/parser/hwpx/utils.rs` | New — common utility functions + tests |
| `src/parser/hwpx/mod.rs` | Added `pub mod utils;` |
| `src/parser/hwpx/header.rs` | utils import, duplicate removal, charPr/paraPr improvements |
| `src/parser/hwpx/section.rs` | utils import, duplicate removal, function name unification |
