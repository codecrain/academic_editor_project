# Task #5: cellzoneList Cell Zone Background Not Supported — Plan

## Goal

Parse and render cell zone backgrounds (image/gradient/solid) defined in table's `cellzoneList`.

## Symptoms

- `samples/tac-img-02.hwpx` page 15, `s0:pi=169` (1x2 table)
- cellzone (row 0, col 0~1) defines borderFillIDRef=18 (image background)
- Currently parser/renderer does not support cellzoneList
- White text in cell[0] invisible without background

## HWPX Structure

```xml
<cellzoneList>
  <cellzone startRowAddr="0" startColAddr="0"
            endRowAddr="0" endColAddr="1"
            borderFillIDRef="18" />
</cellzoneList>
```

borderFill id=18: imgBrush (image1)

## Implementation Steps

### Step 1: Model + Parser

- Add `cell_zones: Vec<CellZone>` field to `Table` model
- Define `CellZone` struct: start_row, start_col, end_row, end_col, border_fill_id
- Parse `cellzoneList > cellzone` in HWPX parser (`section.rs`)
- Add corresponding parsing in HWP binary parser (if applicable)

### Step 2: Renderer

- In `table_layout.rs`, check if cell belongs to a cellzone during cell rendering
- Render cellzone's border_fill background before (or instead of) cell background
- Verify image fill (image_fill) rendering support

### Step 3: Verification

- Check `tac-img-02.hwpx` page 15 SVG
- `cargo test` all passing
- No regression in full 67-page export

## Impact Scope

- `src/model/table.rs` — CellZone model
- `src/parser/hwpx/section.rs` — cellzoneList parsing
- `src/renderer/layout/table_layout.rs` — cellzone background rendering

## Verification Criteria

- pi=169 cell zone renders with image background
- `cargo test` all passing
