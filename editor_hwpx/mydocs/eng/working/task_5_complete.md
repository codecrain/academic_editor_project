# Task #5 -- Completion Report

## cellzoneList Cell Area Background Support

### Modified Files

- `src/parser/hwpx/section.rs` -- HWPX cellzoneList > cellzone parsing
- `src/parser/hwpx/header.rs` -- imgBrush mode="TOTAL" -> FitToSize mapping added
- `src/parser/control.rs` -- HWP binary table record zones parsing
- `src/renderer/layout/table_layout.rs` -- cellzone background (image/solid/gradient) rendering
- `src/main.rs` -- Added zone/border_fill detail output to dump

### Changes

1. **HWPX parser**: Parsed `cellzoneList > cellzone` XML elements into `Table.zones`
2. **HWP binary parser**: Parsed zones data after border_fill_id in HWPTAG_TABLE record (field order: start_row, start_col, end_row, end_col, bf_id)
3. **imgBrush mode**: Added `"TOTAL"` -> `FitToSize` mapping (previously missing)
4. **Renderer**: After table background rendering, before cell layout, renders cellzone full-area background once

### Verification Results

- `tac-img-02.hwpx` page 15: cellzone image background rendered correctly (SVG + web canvas)
- `tac-img-02.hwp` page 15: Rendered identically from HWP binary
- `cargo test`: 777 passed, 0 failed
- 67-page (HWPX) / 66-page (HWP) full export normal
