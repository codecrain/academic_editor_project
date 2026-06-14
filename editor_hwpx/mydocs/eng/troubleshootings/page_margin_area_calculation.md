# Page Margin Area Calculation Error

## Symptoms

On page 13 of k-water-rfp.hwp, the body content started approximately 10.6mm (40px) lower than in the HWP program. The second of two tables that should fit on one page was pushed to the next page.

- Before fix: 29 pages
- After fix: 27 pages (correct)

## Cause

`PageAreas::from_page_def()` (src/model/page.rs) incorrectly calculated the body start/end positions.

### HWP Page Margin Structure (Based on the Page Setup Dialog)

```
Top of paper (y=0)
  | margin_header (header, e.g., 10.6mm) -> Header area starts
  | margin_top (top, e.g., 19.4mm)       -> Body area starts
  ...body content...
  | page_height - margin_bottom (bottom, e.g., 14.8mm) -> Body area ends
  | page_height - margin_footer (footer, e.g., 10.0mm) -> Footer area ends
Bottom of paper (y=page_height)
```

Key point: **margin_top is the distance from the top of the paper to the body**, and margin_header is the distance from the top of the paper to the header. These two values are independent and must not be summed.

### Incorrect Code

```rust
// Body start = margin_top + margin_header (wrong!)
let content_top = page_def.margin_top + page_def.margin_header;
// Body end = page_height - margin_bottom - margin_footer (wrong!)
let content_bottom = page_height - page_def.margin_bottom - page_def.margin_footer;

// Header area (wrong position)
let header_area = Rect {
    top: page_def.margin_top,      // Should be margin_header
    bottom: content_top,            // Should be margin_top
};

// Footer area (wrong position)
let footer_area = Rect {
    top: content_bottom,
    bottom: content_bottom + margin_footer,
};
```

### Correct Code

```rust
// Body start = margin_top (distance from paper top to body)
let content_top = page_def.margin_top;
// Body end = page_height - margin_bottom
let content_bottom = page_height - page_def.margin_bottom;

// Header area: margin_header to margin_top
let header_area = Rect {
    top: page_def.margin_header,
    bottom: page_def.margin_top,
};

// Footer area: (page_height - margin_bottom) to (page_height - margin_footer)
let footer_area = Rect {
    top: page_height - page_def.margin_bottom,
    bottom: page_height - page_def.margin_footer,
};
```

## k-water-rfp.hwp Page Setup Values

| Property | Value | HWPUNIT (approx.) |
|----------|-------|-------------------|
| Paper size | A4 (210 x 297 mm) | 59528 x 84188 |
| Top (margin_top) | 19.4 mm | 5499 |
| Header (margin_header) | 10.6 mm | 3005 |
| Left (margin_left) | 21.2 mm | 6009 |
| Right (margin_right) | 19.5 mm | 5527 |
| Bottom (margin_bottom) | 14.8 mm | 4195 |
| Footer (margin_footer) | 10.0 mm | 2835 |
| Gutter (margin_gutter) | 0.0 mm | 0 |

## Impact of the Error

| Property | Before Fix | After Fix |
|----------|-----------|-----------|
| Body start (content_top) | margin_top + margin_header = 30.0mm | margin_top = 19.4mm |
| Body end (content_bottom) | page_height - 24.8mm | page_height - 14.8mm |
| Page 13 first text y | 133.3px | 93.3px |
| Total pages | 29 | 27 |
| Page 13 two tables | Second table pushed to next page | Correctly included |

## Note: measure_paragraph() for Independent Paragraphs

`measure_paragraph()` (height_measurer.rs) was already correctly measuring height as `spacing_before + lines_total + spacing_after`. This issue was purely about page area calculation, separate from cell height/paragraph height measurement.

## Modified Files

| File | Changes |
|------|---------|
| `src/model/page.rs` | Fixed content_top/bottom, header_area, footer_area calculation in `PageAreas::from_page_def()` |
