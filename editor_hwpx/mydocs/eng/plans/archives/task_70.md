# Task 70 Execution Plan: Header/Footer Rendering and Page Number Processing

## Background

HWP documents include Header and Footer controls, and most official documents/reports display page numbers in the footer area.

Current implementation status:
- **Parsing/Model**: Header, Footer, PageNumberPos structs and parsing complete
- **Page areas**: header_area, footer_area area calculation complete (Task 69)
- **Render nodes**: Header/Footer nodes created but **no child content**
- **Not implemented**: Header/footer assignment during pagination, layout placement, page number text generation

## Problems

1. `PageContent.header_paragraphs / footer_paragraphs` is always `Vec::new()`
2. `RenderNodeType::Header / Footer` nodes have no children (text render nodes)
3. No actual page number text is generated at `PageNumberPos` control positions

### HWP Header/Footer Structure (Hancom Help)

- Header: Fixed repeating content at page top (header_area region)
- Footer: Fixed repeating content at page bottom (footer_area region)
- Apply scope: Both / Even / Odd
- Page numbers: 10 positions, various number formats (Arabic/Roman/Korean etc.)
- Hide: PageHide control can hide on specific pages

## Modification Scope

| File | Action |
|------|--------|
| `src/renderer/pagination.rs` | Header/footer control collection and per-page assignment |
| `src/renderer/layout.rs` | Place paragraph content in Header/Footer nodes |
| `src/renderer/layout.rs` | Generate page number text render nodes from PageNumberPos |

## Verification

1. 488 Rust tests pass
2. Confirm header/footer text rendering via SVG export
3. Confirm page numbers displayed in correct position with correct format
4. No regression in existing document rendering
