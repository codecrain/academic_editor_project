# Task 164 Final Report: Vertical Writing Column Width/Overflow/Font Metric Improvements

## Overview

Improved text box/table cell vertical writing column width calculation, text box overflow handling, and font metric (advance/char_width) calculation to match Hancom rendering.

## Key Changes

### 1. Column Width Calculation Improvement
- **Before**: `col_width = line_height` (too narrow, narrower than Hancom)
- **After**: `col_width = line_height + line_spacing` (absorbs full pitch into column)
- Last column uses `absorbed_spacing` field for post-processing to remove unnecessary spacing
- `col_spacing` always 0 (spacing absorbed into col_width)

### 2. Text Box Overflow Handling Improvement
- Restructured `layout_textbox_content` to perform overflow detection commonly for horizontal/vertical before branching
- Renamed `layout_vertical_textbox_text` → `layout_vertical_textbox_text_with_paras` to accept `&[Paragraph]` slice for overflow paragraph passing
- Vertical writing also applied to overflow target textboxes

### 3. half_advance: Only Punctuation Calculated at 0.5
- **Before**: Based on `needs_rotation` (different results for Latin-rotated/Latin-upright)
- **After**: Only punctuation/symbols at `font_size x 0.5`, alphanumeric at `font_size` (character height)

### 4. char_width Full-Width Unification
- **Before**: Latin-upright alphanumeric at `font_size x 0.5` (half-width)
- **After**: All vertical writing characters at `char_width = font_size` (full-width, same as Latin-rotated)

### 5. col_bottom Overflow Check Added
- Added `col_bottom` overflow rendering stop logic for text box vertical writing
- `if char_y + advance > col_bottom + 0.5 { break; }`

## Tests
- 608 tests all passed
- SVG export verification completed for textbox-vert.hwp and table-vert-cell.hwp
