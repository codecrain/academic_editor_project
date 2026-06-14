# Task 71 Final Completion Report

## New Number Start (NewNumber) + Auto-Numbering System Completion

### Work Summary

Implemented "Start with New Number" (`nwno`) control processing for HWP documents, and fixed auto-number (`atno`) system's bit offset bugs, missing field parsing, and number format non-application issues.

### Modified Files

| File | Changes | Scale |
|------|---------|-------|
| `src/model/control.rs` | Added number/user_symbol/prefix_char/suffix_char fields to AutoNumber, added user_symbol/prefix_char/suffix_char/dash_char fields to PageNumberPos | +12 lines |
| `src/parser/control.rs` | Fixed AutoNumber bit offsets (format 8-bit, superscript bit 12) + decoration character parsing, PageNumberPos decoration character parsing | +10 lines |
| `src/serializer/control.rs` | Fixed AutoNumber/PageNumberPos serialization bit offsets + decoration character output | +15 lines |
| `src/parser/mod.rs` | Added NewNumber counter reset + DocProperties start number initialization to assign_auto_numbers() | +12 lines |
| `src/renderer/pagination.rs` | Added page_number field to PageContent + NewNumber(Page) collection/reflection | +25 lines |
| `src/renderer/layout.rs` | Applied format/decoration characters to apply_auto_numbers, refactored format_page_number() (removed duplicate functions), used page_number for page numbering | -20 lines, +10 lines |

### Implementation Details

#### 1. AutoNumber Bit Offset Bug Fix

Fixed bit field parsing errors with the same pattern as Task 70:

| Field | Before | After | Spec (Table 145) |
|-------|--------|-------|-------------------|
| format | `(attr >> 4) & 0x0F` (4-bit) | `(attr >> 4) & 0xFF` (8-bit) | bit 4~11 |
| superscript | `attr & 0x100` (bit 8) | `attr & 0x1000` (bit 12) | bit 12 |

Serialization also fixed identically.

#### 2. Missing Field Parsing (Spec Tables 144, 149)

- AutoNumber: UINT16 number + WCHAR user_symbol/prefix/suffix (full 12 bytes)
- PageNumberPos: WCHAR user_symbol/prefix/suffix/dash (full 12 bytes)

#### 3. NewNumber -> Auto-Number Integration

- Added `Control::NewNumber` handler to `assign_auto_numbers_in_controls()`
- `counters[idx] = nn.number - 1` -> next AutoNumber starts from the specified number
- Initialized counters with DocProperties start numbers (6 types including page_start_num)

#### 4. NewNumber(Page) -> Page Number Integration

- Added `page_number: u32` field to `PageContent`
- Collected NewNumber(Page) controls in pagination.rs -> assigned actual page numbers per page
- Used `page_number` instead of `page_index + 1` in layout.rs

#### 5. AutoNumber Format and Decoration Character Application

- `apply_auto_numbers_to_composed()`: `NumFmt::Digit` -> `NumFmt::from_hwp_format(an.format)`
- Applied prefix_char/suffix_char decoration characters
- `format_page_number()`: Removed duplicate functions (to_roman_upper/lower, to_circle_number) -> reused `format_number()` from `mod.rs`

### Verification Results

| Item | Result |
|------|--------|
| Rust tests | All 488 passed |
| WASM build | Succeeded |
| Vite build | Succeeded |
| k-water-rfp.hwp SVG export | 29 pages normal |
| hwp-multi-001.hwp SVG export | 11 pages normal |
| Existing document regression | None |

### Work Branch

`local/task71`
