# Task 73 Post-Fix — Final Report

## Overview

Fixed 3 rendering bugs discovered during verification after completion of Task 73 (paragraph mark display feature).

## Fix Details

### 1. Empty Paragraph ↵ Symbol Position Fix

- **Problem**: The ↵ symbol appeared at the right edge for empty paragraphs (paragraphs with no text)
- **Cause**: The TextRun bbox width for empty paragraphs was set to `col_area.width` (full column width), so `bbox.x + bbox.width` pointed to the right edge
- **Fix**: Added `run.text.is_empty()` check — if text is empty, place the symbol at `node.bbox.x` (left start) position
- **Modified files**: `svg.rs`, `web_canvas.rs`, `html.rs` (same pattern in all 3 renderers)
- **Commit**: `80314cb`

### 2. TextBox Inline Image Position Fix

- **Problem**: Two images inside a rectangle at the bottom of page 2 in `samples/20250130-hongbo.hwp` rendered below the rectangle
- **Cause**: `layout_textbox_content()` initialized `inline_y` to `para_y` (position after text layout), causing images to shift down by the default line height of the empty paragraph
- **Fix**: Changed `inline_y` initialization to `inner_area.y` (text area start)
- **Modified file**: `layout.rs`
- **Commit**: `c7d4bc9`

### 3. Shape Border Line Type "None" Handling

- **Problem**: Rectangles with line type set to "none" in HWP still had borders rendered
- **Cause**: `drawing_to_shape_style()` only checked `border.width > 0` without checking `attr` bits 0-5 (line type). For shapes, attr bits 0-5 value of 0 means "none" (unlike table borders where 0 means solid)
- **Fix**: Skip stroke when `border.attr & 0x3F == 0`
- **Modified file**: `layout.rs`
- **Additional**: Added rectangle border debugging info output to `main.rs` info command
- **Commit**: `69d28bc`

## Verification

- 488 Rust tests passed
- WASM build successful
- Verified all 3 fixes in web browser with `20250130-hongbo.hwp`
- Confirmed rectangle border non-rendering via SVG export

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/svg.rs` | Empty paragraph ↵ symbol position fix |
| `src/renderer/web_canvas.rs` | Empty paragraph ↵ symbol position fix |
| `src/renderer/html.rs` | Empty paragraph ↵ symbol position fix |
| `src/renderer/layout.rs` | TextBox inline_y initialization fix + shape border line type check |
| `src/main.rs` | Info command rectangle border info output |
