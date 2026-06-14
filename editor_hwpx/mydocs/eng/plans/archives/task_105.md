# Task 105: Page Border/Background Feature Implementation

## Goal

Render page borders/backgrounds (PAGE_BORDER_FILL) of HWP documents.
Sample: `samples/basic/Worldcup_FIFA2010_32.hwp`

## Current Status

- **Parsing**: Complete (PageBorderFill → SectionDef.page_border_fill)
- **Model**: Complete (PageBorderFill, BorderFill, Fill, BorderLine, etc.)
- **Rendering**: Not implemented (only hardcoded white background exists)

## PageBorderFill Attributes (Spec Table 138)

| Bit | Description | Value |
|-----|-------------|-------|
| bit 0 | Position reference | 0=body, 1=paper |
| bit 1 | Include header | 0=exclude, 1=include |
| bit 2 | Include footer | 0=exclude, 1=include |
| bit 3-4 | Fill area | 0=paper, 1=page, 2=border |

- `border_fill_id`: DocInfo.border_fills index (1-indexed)
- `spacing_left/right/top/bottom`: Border/background position spacing

## Implementation Plan

### Phase 1: Background Fill Rendering

**layout.rs** - Modify `render_page()`:
- Look up `BorderFill` using `page_border_fill.border_fill_id`
- Create PageBackgroundNode based on `BorderFill.fill` information
  - Solid fill (SolidFill): apply background_color
  - Gradient fill (GradientFill): pass gradient info
- Determine background area based on `attr` bit 0 (position reference) and bit 3-4 (fill area)
  - Paper (0): entire paper
  - Page (1): body area
  - Border (2): spacing-applied area

### Phase 2: Border Line Rendering

**layout.rs** - Modify `render_page()`:
- Render `BorderFill.borders[4]` (left, right, top, bottom) border lines
- Determine border reference area based on `attr` bit 0 (body/paper)
- Apply spacing values as border position offsets
- Reuse existing `create_border_line_nodes()`, `border_width_to_px()`

### Phase 3: SVG/WebCanvas Renderer Extension

**svg.rs** / **web_canvas.rs**:
- Add gradient/image fill support for PageBackgroundNode
- Border line rendering (can leverage existing code by treating as Line nodes)

### Phase 4: Verification and Testing

- Verify Worldcup_FIFA2010_32.hwp SVG export
- Regression test with k-water-rfp.hwp and other existing files
- Confirm all tests pass

## Files to Modify

| File | Changes |
|------|---------|
| `src/renderer/layout.rs` | Look up BorderFill in render_page() + generate background/border nodes |
| `src/renderer/render_tree.rs` | Extend PageBackgroundNode (gradient, border support) |
| `src/renderer/svg.rs` | Extend PageBackground rendering |
| `src/renderer/web_canvas.rs` | Extend PageBackground rendering |

## Branch

`local/task105`
