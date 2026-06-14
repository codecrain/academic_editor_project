# Task 38 Final Report: HTML Table Paste -> HWP Table Control Conversion

## Overview

When pasting clipboard content containing HTML `<table>` tags, implemented conversion to HWP native Table Control (`Control::Table`) instead of the previous tab-separated text conversion.

## Implementation Details

### Steps 1-2 Combined: HTML Table Parsing + Table Control Generation

Completely reimplemented `parse_table_html()` with a 6-stage processing pipeline:

| Stage | Content |
|-------|---------|
| 1 | HTML parsing: `<tr>/<td>/<th>` structure, colspan/rowspan, CSS style extraction |
| 2 | Grid normalization: Occupied grid generation from rowspan, actual col index calculation |
| 3 | Cell size calculation: CSS pt/px/cm -> HWPUNIT conversion, equal division for unspecified columns |
| 4 | BorderFill generation: CSS border -> BorderLine, background-color -> SolidFill, reuse of identical entries |
| 5 | Table struct assembly: Cell, row_sizes, raw_ctrl_data (CommonObjAttr), repeat_header setup |
| 6 | Table Control Paragraph generation: `\u{0002}` control character, `Control::Table` attachment |

### Step 3: Integration and Compatibility

| Item | Content |
|------|---------|
| `paste_html_native` extension | Added direct insertion path when control-containing paragraphs detected (merge_from does not propagate controls) |
| `paste_html_in_cell_native` protection | Table nesting inside cells not allowed -> auto-converts control paragraphs to text |
| CSS parsing | border shorthand/individual, padding shorthand/individual, width/height (pt/px/cm/mm/in) |
| BorderFill deduplication | Search for identical BorderFill then reuse, border_fill_id 1-based |

## New Functions Summary

### wasm_api.rs Methods (HwpDocument impl)

| Function | Description |
|----------|-------------|
| `parse_table_html()` | HTML `<table>` -> Table Control parsing/generation (complete reimplementation) |
| `create_border_fill_from_css()` | CSS border/background -> BorderFill creation and DocInfo registration |

### Utility Functions (module-level)

| Function | Description |
|----------|-------------|
| `parse_html_attr_u16()` | Extract u16 value from HTML attribute (colspan, rowspan) |
| `parse_css_dimension_pt()` | CSS dimension -> pt conversion (pt/px/cm/mm/in supported) |
| `parse_css_padding_pt()` | CSS padding shorthand/individual -> [left, right, top, bottom] pt |
| `parse_single_dimension_pt()` | Single CSS dimension -> pt conversion |
| `parse_css_border_shorthand()` | CSS border shorthand -> (width, color, style) |
| `css_border_width_to_hwp()` | CSS border width (pt) -> HWP width index (0~7) |
| `border_fills_equal()` | Compare two BorderFill for equality |

## Modified Files Summary

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | `parse_table_html()` reimplementation (~230 lines), `create_border_fill_from_css()` added, `paste_html_native()` control insertion path, `paste_html_in_cell_native()` nesting prevention, 7 utility functions, 5 tests |

## Data Flow

```
HTML clipboard (<table> included)
  | parse_html_to_paragraphs()
  |   |-- <table> detected -> parse_table_html()
  |       |-- HTML parsing (tr/td/th, colspan, rowspan, CSS)
  |       |-- Grid normalization (occupied grid)
  |       |-- Cell size calculation (CSS -> HWPUNIT)
  |       |-- BorderFill creation/reuse
  |       |-- Cell creation (content via recursive parse_html_to_paragraphs call)
  |       |-- Table struct assembly
  |       |-- Paragraph { text: "\u{0002}", controls: [Table] }
  |
  paste_html_native()
  | has_controls == true -> direct insertion path
  |   |-- split_at(cursor)
  |   |-- If left half is empty, replace with Table paragraph
  |   |-- If right half is not empty, add as new paragraph
  |   |-- reflow + compose + paginate
  |
  Table Control inserted into document
```

## Test Results

| Category | Test Count |
|----------|-----------|
| Existing tests | 428 (existing 429 - 1 text->control transition) |
| New: 2x2 basic table insertion | 1 |
| New: colspan/rowspan merged table | 1 |
| New: CSS styles (size/border/padding/background) | 1 |
| New: th header row table | 1 |
| New: Utility function tests | 1 |
| **Total** | **433 passed** |
| WASM build | Success |

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Combined steps 1-2 implementation | Intermediate struct used only within function, separation unnecessary |
| Direct insertion instead of merge_from | Paragraph.merge_from() does not propagate controls, preventing Table Control loss |
| Table nesting prevention inside cells | HWP spec does not support Table Control inside cells, text fallback |
| Occupied grid-based grid normalization | Prevents cell position misalignment caused by rowspan |
| BorderFill equality check then reuse | Prevents DocInfo bloat, border_fill_id 1-based |
| Equal division for unspecified cell sizes | A4 default width (42520 HWPUNIT) / col_count |

## CSS -> HWP Unit Conversion Reference

| CSS | HWP | Conversion |
|-----|-----|------------|
| 1pt | 100 HWPUNIT | x 100 |
| 1px | 75 HWPUNIT | x 75 (96dpi basis) |
| 1cm | 2834.65 HWPUNIT | x 2834.65 |
| 1mm | 283.465 HWPUNIT | x 283.465 |
| 1in | 7200 HWPUNIT | x 7200 |
| border width (pt -> mm) | width index 0~7 | 0.1mm~0.5mm range mapping |
