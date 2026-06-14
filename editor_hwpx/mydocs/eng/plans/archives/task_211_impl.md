# Task 211 Implementation Plan

## Core Cause

**Non-inline image height reflection mismatch between height_measurer and table_layout**

| Module | Non-inline Image Height | Result |
|--------|------------------------|--------|
| `height_measurer.rs` (L443) | **Not reflected** — `content_height = text_height` | Row height (row_height) calculated too small |
| `table_layout.rs` (L1000-1009) | **Reflected** — `text_height += pic_h` | total_content_height is accurate, but cell clip area is too small causing image clipping |

Cell height (cell_h) is determined from row_height computed by height_measurer, so if height_measurer omits non-inline image height, the cell is sized too small and the image is pushed outside the clip boundary.

## Step 1: Reflect Non-inline Image Height in height_measurer

**File**: `src/renderer/height_measurer.rs`

### Fix 1: measure_table_impl cell height calculation (around L443)

Current:
```rust
// Since LINE_SEG line_height already reflects nested table heights within cells,
// adding controls_height separately would double-count
let content_height = text_height;
```

After fix:
```rust
// Since LINE_SEG line_height already reflects nested table heights within cells,
// adding controls_height separately would double-count
// However, non-inline images/shapes are NOT included in LINE_SEG, so add separately
let non_inline_height = self.measure_non_inline_controls_height(paragraphs);
let content_height = text_height + non_inline_height;
```

### Fix 2: Add non-inline control height measurement function

```rust
/// Total height of non-inline (non-treat_as_char) images/shapes within paragraphs
fn measure_non_inline_controls_height(&self, paragraphs: &[Paragraph]) -> f64 {
    let mut total = 0.0;
    for para in paragraphs {
        for ctrl in &para.controls {
            match ctrl {
                Control::Picture(pic) if !pic.common.treat_as_char => {
                    total += hwpunit_to_px(pic.common.height as i32, self.dpi);
                }
                Control::Shape(shape) if !shape.common().treat_as_char => {
                    total += hwpunit_to_px(shape.common().height as i32, self.dpi);
                }
                _ => {}
            }
        }
    }
    total
}
```

## Step 2: Test and SVG Verification

- `cargo test` — confirm existing tests PASS
- SVG export for kps-ai.hwp p61 visual confirmation (image visibility)
- Regression testing with other documents (hwpp-001.hwp etc.)

## Step 3: WASM Build and E2E Verification

- Docker WASM build
- E2E test for web rendering confirmation
- Update daily task status
