# Task 4 - Step 4 Completion Report: Table Rendering + Footnote Rendering + Integration Verification

## Implementation Details

### Modified Files

| File | Changes | Role |
|------|---------|------|
| `src/renderer/layout.rs` | ~200 lines added | Footnote area rendering, superscript reference numbers, indent clamping |
| `src/renderer/pagination.rs` | ~60 lines added | FootnoteRef/FootnoteSource structs, footnote collection logic |
| `src/renderer/page_layout.rs` | ~15 lines added | update_footnote_area() dynamic footnote area calculation |
| `src/parser/control.rs` | ~10 lines modified | find_list_header_paragraphs level bug fix |
| `src/parser/body_text.rs` | ~5 lines modified | FootnoteShape 28-byte parsing fix |
| `src/wasm_api.rs` | ~15 lines modified | FootnoteShape pass-through path addition |

### Key Changes

**1. Paragraph Indent/Outdent (layout.rs)**

- Applied indent to per-line x coordinate calculation in `layout_composed_paragraph()`
- Indent applied only to the first line (both indent and outdent)
- Negative x coordinate prevention: `(margin_left + line_indent).max(0.0)` clamping

**2. Footnote Collection Infrastructure (pagination.rs)**

- `FootnoteRef` struct: Tracks footnote number + source (body/table cell)
- `FootnoteSource` enum: `Body { para_index, control_index }`, `TableCell { ... }`
- `PageContent.footnotes`: Per-page footnote list
- Detects `Control::Footnote` in body paragraphs and table cells -> collects to current page

**3. Footnote Area Rendering (layout.rs)**

- `layout_footnote_area()`: Separator line + footnote paragraph layout
- `layout_footnote_paragraph_with_number()`: Footnote number (1)~5)) + paragraph text
- `estimate_footnote_area_height()`: Pre-calculate footnote area height
- `get_footnote_paragraphs()`: FootnoteRef -> actual Footnote.paragraphs reference

**4. Footnote Superscript Reference Numbers (layout.rs)**

- `add_footnote_superscripts()`: Footnote control in paragraph -> superscript rendering
- 60% of body font size, raised 35% upward
- Inherits body font family (e.g., HumanMyeongjo)
- Called from both body FullParagraph + table cell

### Parser Bug Fixes

**1. find_list_header_paragraphs level bug (control.rs)**

- Problem: `level > base_level` filter returned empty results when LIST_HEADER and PARA_HEADER are at the same level
- Cause: In footnotes within table cells, child records are placed at the same level
- Fix: Pass all records after LIST_HEADER to `parse_paragraph_list()`

**2. FootnoteShape byte alignment (body_text.rs)**

- Problem: Separator line color was #010100 (should be black -> #000000)
- Cause: Spec says 26 bytes but actual record is 28 bytes (undocumented 2 bytes exist)
- Fix: Added `_unknown = r.read_u16()` between `note_spacing` and `separator_line_type`
- Additional: Parsed number_format, numbering, placement from attr field

## SVG Verification Results

Compared with reference image `2014-08-hwp.png`:

| Item | Result |
|------|--------|
| Superscripts 1)~5) in table cells | Rendered (HumanMyeongjo 10.4px, position accurate) |
| Footnote separator line | #000000, 0.5px, ~28% of body width |
| Footnote text 1)~5) | All rendered (Batang 14.4px + HumanMyeongjo 16px) |
| Negative x coordinates | None (clamping applied) |
| Indentation | Applied |

## Test Results

| Item | Result |
|------|--------|
| All tests | **213 passed** |
| Build | Succeeded (0 warnings) |

## Status

- Completion date: 2026-02-06
- Status: Pending approval
