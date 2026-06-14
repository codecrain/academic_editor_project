# Task 4 - Step 3 Completion Report: Layout Pipeline + Text Rendering

## Implementation Details

### Modified Files

| File | Changes | Role |
|------|---------|------|
| `src/renderer/layout.rs` | Full rewrite (~410 lines) | LayoutEngine extension: ComposedParagraph + ResolvedStyleSet-based layout |
| `src/renderer/composer.rs` | +5 lines modified | `char_count=0` edge case handling (text length-based estimation) |
| `src/renderer/pagination.rs` | +15 lines added | Inline control (table/shape) detection -> PageItem::Table/Shape generation |
| `src/wasm_api.rs` | ~30 lines modified | Pipeline connection: styles/composed fields added, full flow integration |
| `src/renderer/svg.rs` | +3 lines added | letter-spacing SVG attribute output |

### Key Changes

**1. LayoutEngine Extension (layout.rs)**

Signature change:
```rust
// Before
build_render_tree(&self, page_content, paragraphs) -> PageRenderTree

// After
build_render_tree(&self, page_content, paragraphs, composed, styles) -> PageRenderTree
```

New functions:
- `layout_composed_paragraph()` - ComposedParagraph-based layout (main path)
- `layout_raw_paragraph()` - Raw Paragraph-based layout (fallback)
- `resolved_to_text_style()` - ResolvedCharStyle -> TextStyle conversion
- `estimate_text_width()` - Text width estimation based on character type without font metrics
- `is_cjk_char()` - CJK/Korean character detection

Layout logic:
```
ComposedParagraph.lines iteration
  +-- Apply margin_left/margin_right from paragraph style
  +-- For each ComposedLine:
  |   +-- Create TextLine node (line_height, baseline)
  |   +-- For each ComposedTextRun:
  |       +-- ResolvedCharStyle -> TextStyle conversion
  |       +-- Text width estimation (CJK: font_size, Latin: font_size*0.5)
  |       +-- Create TextRun node (sequential x positioning)
  +-- Accumulate y coordinate
```

**2. Pipeline Integration (wasm_api.rs)**

Fields added to HwpDocument:
- `styles: ResolvedStyleSet` - Resolved style set
- `composed: Vec<Vec<ComposedParagraph>>` - Per-section composed paragraphs

Data flow:
```
from_bytes() / set_document()
  +-- resolve_styles(doc_info, dpi) -> styles
  +-- compose_section(section) -> composed (per section)
  +-- paginate() -> pagination

build_page_tree(page_num)
  +-- find_page() -> (page_content, paragraphs, composed)
  +-- build_render_tree(page_content, paragraphs, composed, &styles)
      +-- SvgRenderer.render_tree() -> SVG String
```

**3. Inline Control Detection (pagination.rs)**

Detects Table/Shape from `controls` array during paragraph traversal:
- `Control::Table` -> `PageItem::Table` generation
- `Control::Shape`/`Control::Picture` -> `PageItem::Shape` generation

**4. SVG letter-spacing (svg.rs)**

Adds `letter-spacing` attribute to `<text>` elements when TextStyle.letter_spacing is non-zero.

### Bug Fix

**composer.rs char_count=0 issue**
- Problem: Creating `Paragraph { text: "text", ..Default::default() }` in tests has `char_count=0`
- Cause: `compose_lines` computes last line's utf16_end as `para.char_count` -> 0 produces empty line
- Fix: When `char_count=0`, estimate as `text.chars().count() + 1`

## Test Results

| Item | Result |
|------|--------|
| All tests | **207 passed** (202 existing + 5 new) |
| Build | Succeeded (0 warnings) |

### New Tests (5)

| Test | Verification Content |
|------|---------------------|
| test_layout_with_composed_styles | Multi-TextRun generation with ComposedParagraph + ResolvedStyleSet and style verification (font name/size/bold/italic/color) |
| test_layout_multi_run_x_position | TextRun sequential x positioning verification (Latin + CJK mixed) |
| test_resolved_to_text_style | ResolvedCharStyle -> TextStyle conversion accuracy (font/size/bold/underline/letter spacing) |
| test_resolved_to_text_style_missing_id | Default value return for non-existent style_id |
| test_estimate_text_width | Text width estimation (Latin/CJK/mixed) |

### Existing Test Compatibility

| Test | Changes |
|------|---------|
| test_build_empty_page | Added `&[], &ResolvedStyleSet::default()` parameters to `build_render_tree()` call |
| test_build_page_with_paragraph | Added `compose_paragraph()` call, passed composed data |

## Status

- Completion date: 2026-02-06
- Status: Approved
