# Table Object Text Wrap and Page Typesetting Rules Within Paragraphs

## Overview

In HWP, tables exist as controls within paragraphs, and the typesetting method is determined by a combination of two properties:
- **text_wrap**: TopAndBottom, Square, InFrontOfText, BehindText
- **treat_as_char**: true/false

## Typesetting Rules by Combination

### 1. TopAndBottom (Space-occupying) + treat_as_char=false

The table is positioned independently from the body text flow, pushing body text above/below.

| Property | Description |
|----------|-------------|
| Position determination | `vert_rel_to`(Paper/Page/Para) + `vert_align`(Top/Center/Bottom) + `vertical_offset` |
| Body text impact | `shape_reserved` pushes the anchor paragraph's y_offset below the table bottom |
| Height occupancy | **Occupies space equal to table height** in the body flow (shape_reserved) |
| outer_margin | Table outer margins (margin.bottom, etc.) are added to shape_reserved |

#### Special Cases

**vert=Paper + table positioned above body_area (renders_above_body)**:
- Table is rendered outside the body-clip (in paper_images)
- `layout_table` return value does **not update** y_offset (shape_reserved already handles it)
- No spacing_after or line_spacing **added** below the table
- Example: exam_kor page 1 top "2025 CSAT Exam Paper" table

**vert=Page/Paper + valign=Bottom/Center (fixed to page bottom)**:
- Independent of body flow — placed as `PageItem::Table` in `process_controls`, then continue
- `paginate_table_control` is not called → no height/row splitting/column changes
- Example: exam_social paragraph 1.61 "Verification Items" table

### 2. TopAndBottom (Space-occupying) + treat_as_char=true

Inline block table. Placed within the paragraph's text flow.

| Property | Description |
|----------|-------------|
| Position determination | Sequentially placed according to the paragraph's text flow |
| Body text impact | Table height is included in LINE_SEG's line_height |
| Height occupancy | Calculated as `table_total_height` in `paginate_table_control` |
| pagination | `st.current_height += table_total_height` |

#### Special Cases

**TAC block table (inline table occupying column width)**:
- When `is_tac_table_inline()` returns false
- `paginate_table_control` → `place_table_fits` places pre-text, table, post-text in order
- Empty-only PartialParagraph of table host paragraph: skipped without adding height
  (Table PageItem already reflects table height)

**TAC inline table (horizontally placed with text)**:
- When `is_tac_table_inline()` returns true
- Skipped in `process_controls` (LINE_SEG already includes the height)
- Rendering: horizontal placement based on tac_controls in `layout_composed_paragraph`

**LINE_SEG lh double-counting (when text precedes the table)**:
- Pattern where first SEG's th << lh and equals the last SEG's lh
- Corrected with vpos-based height in `measure_paragraph`
- Example: exam_social question 10 table

### 3. Square (Wrap-around) + treat_as_char=false

Text flows alongside the table.

| Property | Description |
|----------|-------------|
| Position determination | Absolute position based on `vert_rel_to` + `horz_rel_to` |
| Body text impact | Text placed in the area beside the table (area defined by LINE_SEG cs/sw) |
| Height occupancy | Table height (within the wrap-around region) |
| Rendering | Handled in `layout_wrap_around_paras` |

### 4. InFrontOfText (In Front of Text) + treat_as_char=false

Table floats above the body text. No impact on body text flow.

| Property | Description |
|----------|-------------|
| Position determination | Absolute position based on `vert_rel_to` + `horz_rel_to` |
| Body text impact | **None** — does not occupy height |
| pagination | Placed as `PageItem::Shape` in `process_controls`, continue |
| Height within cell | **Excluded** from `measure_non_inline_controls_height` |

### 5. BehindText (Behind Text) + treat_as_char=false

Table is rendered behind the body text. No impact on body text flow.

| Property | Description |
|----------|-------------|
| Position determination | Absolute position based on `vert_rel_to` + `horz_rel_to` |
| Body text impact | **None** — does not occupy height |
| pagination | Placed as `PageItem::Shape` in `process_controls`, continue |

## Coordinate System

| Reference | Description | Usage |
|-----------|-------------|-------|
| Paper | Top-left of the paper (0,0) | `vert_rel_to=Paper` tables, background pages |
| Page | Top-left of body_area | `vert_rel_to=Page` tables, `horz_rel_to=Page` |
| Column | Current column region | `horz_rel_to=Column` |
| Para | Anchor paragraph position | `vert_rel_to=Para` |

### Coordinate System Notes

- In `compute_table_x_position`, when `HorzRelTo::Paper`, paper width is needed but only
  `col_area` (column region) is passed → estimated as `col_area.x * 2 + col_area.width`
- In 2-column layouts, col_area.width is the column width, so additional estimation logic based on table width is added
- **Backlog B-001**: Explicitly pass paper_area/body_area to eliminate estimation

## shape_reserved Mechanism

Mechanism by which TopAndBottom objects push the body text start position.

1. `calculate_shape_reserved_heights`: Search for TopAndBottom objects in each column's PageItems
2. `calc_shape_bottom_y`: Calculate the object's bottom y-coordinate (including margin.bottom)
3. `calculate_body_wide_shape_reserved`: Objects spanning the entire body_area → applied to all columns
4. In `build_single_column`, y_offset is initialized to the shape_reserved bottom

### Limitations

- `common.height` may be smaller than the actual rendered height (cell content expansion)
- InFrontOfText/BehindText must be excluded from `measure_non_inline_controls_height`
- pagination's `current_height` accumulation exceeds vpos → **Backlog B-002**

## Related Code Files

| File | Role |
|------|------|
| `pagination/engine.rs` | Page/column splitting, table placement decisions |
| `layout.rs` | Render tree generation, shape_reserved, renders_above_body |
| `layout/table_layout.rs` | Table position/size calculation, cell layout |
| `layout/shape_layout.rs` | shape_reserved calculation, object positioning |
| `height_measurer.rs` | Pre-measurement of table/paragraph heights |
| `layout/paragraph_layout.rs` | Paragraph rendering, paragraph borders/backgrounds |
