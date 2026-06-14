# Task 70 Implementation Plan

## Verification Target: `samples/hwp-multi-001.hwp` (contains Footer control)

## Step 1: Pagination — Header/Footer Collection and Page Assignment

**Modified file**: `src/renderer/pagination.rs`

### Changes

Change `PageContent`'s `header_paragraphs`/`footer_paragraphs` types from index vectors to actual Header/Footer reference info:

```rust
/// Content to be placed on a page
pub struct PageContent {
    // ... existing fields preserved
    /// Header to apply to this page (None = no header)
    pub active_header: Option<HeaderFooterRef>,
    /// Footer to apply to this page (None = no footer)
    pub active_footer: Option<HeaderFooterRef>,
}

/// Header/footer reference
pub struct HeaderFooterRef {
    pub para_index: usize,        // Paragraph index containing Header/Footer control
    pub control_index: usize,     // Control index within that paragraph
}
```

At the start of `paginate_with_measured()`:
1. Collect `Control::Header` / `Control::Footer` / `Control::PageNumberPos` / `Control::PageHide` from all paragraphs
2. Determine active header/footer for each page creation (Both/Even/Odd + page number)
3. Assign `active_header`/`active_footer` when creating `PageContent`

### Active Header/Footer Determination Logic
- Iterate paragraphs in order, updating "active header/footer" when encountering Header/Footer controls
- For each page creation: determine if page number (1-based) is odd/even
- `apply_to == Both` → always applied
- `apply_to == Odd` → odd pages only
- `apply_to == Even` → even pages only
- PageHide.hide_header/hide_footer → deactivate on that page

## Step 2: Layout — Place Paragraph Content in Header/Footer Nodes

**Modified file**: `src/renderer/layout.rs`

### Changes

In `build_render_tree()`:

```rust
// Before: empty Header node
let header_node = RenderNode::new(header_id, RenderNodeType::Header, ...);

// After: layout paragraphs if active_header exists
let mut header_node = RenderNode::new(header_id, RenderNodeType::Header, ...);
if let Some(hf_ref) = &page_content.active_header {
    if let Some(Control::Header(header)) = paragraphs[hf_ref.para_index]
        .controls.get(hf_ref.control_index)
    {
        self.layout_header_footer_paragraphs(
            &mut tree, &mut header_node,
            &header.paragraphs, styles, &layout.header_area,
            page_content.page_index,
        );
    }
}
```

Same pattern for footer. `layout_header_footer_paragraphs()` reuses existing `layout_paragraph()` but places within header_area/footer_area regions.

### Page Number Text Generation

When header/footer paragraph text contains `\x0012` (field start) character, replace that position with current page number text.

Based on PageNumberPos control's position value:
- Positions 1-3: header_area (top left/center/right)
- Positions 4-6: footer_area (bottom left/center/right)
- format: 0=Arabic, 1=Roman uppercase, 2=Roman lowercase, etc.

## Step 3: Testing and Verification

- `docker compose --env-file /dev/null run --rm test` — full tests pass
- `hwp-multi-001.hwp` SVG export — confirm footer/page number rendering
- WASM + Vite build success confirmation
- No regression in existing document rendering

## Modified Files Summary

| File | Changes | Scale |
|------|---------|-------|
| `src/renderer/pagination.rs` | active_header/footer assignment logic for PageContent | ~50 lines |
| `src/renderer/layout.rs` | Paragraph placement in Header/Footer nodes + page numbers | ~80 lines |
