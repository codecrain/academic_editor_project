# Task 66 Final Report: Fix Text+Table Mixed Paragraph Rendering

## Completion Date
February 14, 2026

## Problem Summary

In `img-start-001.hwp` page 1, para[1] contains both text (80 characters: "[Main Department] Digital Transformation Promotion Team...") and a Table control simultaneously. The existing code skipped text rendering for paragraphs containing Tables, so the text was not displayed.

### Paragraph Structure
```
para[1]: [Table control(8 UTF-16)] [zero-width space] [text 80 chars] [paragraph end control]
- line_seg[0]: text_start=0, line_height=4100 (table height, table spans full page width)
- line_seg[1]: text_start=8, line_height=1150 (text line, positioned below table)
- char_offsets: [8, 9, 10, ...] (starts after table control)
```

## Changes

### Key Design Decision

The rendering order of text+table mixed paragraphs was the core issue:
- **Incorrect approach**: FullParagraph(line[0]+line[1]) -> Table -> table renders below text
- **Correct approach**: Table -> PartialParagraph(line[1] only) -> text renders below table

### 1. layout.rs — Maintain Table Paragraph FullParagraph Skip

```rust
// Paragraphs with table controls are skipped in FullParagraph
// (tables are handled as PageItem::Table, mixed paragraph text as PartialParagraph)
if has_table { ... continue; }
```

- Maintained existing `if has_table { continue; }` logic
- Table paragraph text is handled as PartialParagraph, not FullParagraph

### 2. pagination.rs — Place PartialParagraph After Table

```rust
// Entire table fits on current page
current_items.push(PageItem::Table { ... });
current_height += effective_height;

// Text+table mixed paragraph: place text lines after table
if !para.text.is_empty() {
    if let Some(mp) = measured.get_measured_paragraph(para_idx) {
        let total_lines = mp.line_heights.len();
        if total_lines > 1 {
            current_items.push(PageItem::PartialParagraph {
                para_index: para_idx,
                start_line: 1,      // skip line[0] (table placeholder)
                end_line: total_lines,
            });
            current_height += text_height;
        }
    }
}
```

- Placed PartialParagraph(start_line=1) after Table item
- Skipped line[0] (table placeholder) and rendered only line[1]+ (text)
- Reflected text height in height calculation

### 3. height_measurer.rs — No Changes Needed

- Already measures heights of all paragraphs

### 4. Verification Test Added (wasm_api.rs)

`test_task66_table_text_mixed_paragraph_rendering` test:
- Verified pagination order: Table is placed before PartialParagraph
- PartialParagraph starts from line 1
- In render tree, table y-coordinate < text y-coordinate (correct position)
- Confirmed individual characters are output in SVG

## Verification Results

| Item | Result |
|------|--------|
| Rust full test | 487 passed (existing 486 + 1 new test) |
| SVG export (img-start-001.hwp) | table_y=75.8, text_y=122.9 — text renders below table |
| SVG export (hwp-multi-001.hwp) | 9 pages (same as main branch, no regression) |
| Render tree | TextRun generated for para[1], correct position below table |
| Existing Table layout | Pure table paragraphs without text behave the same as before |

## Modified File List

| File | Changes | Scale |
|------|---------|-------|
| `src/renderer/layout.rs` | Updated table paragraph skip comment | ~2 lines |
| `src/renderer/pagination.rs` | Placed PartialParagraph after Table | ~15 lines |
| `src/wasm_api.rs` | Added verification test | ~60 lines |
| `mydocs/plans/task_66.md` | Execution plan | Document |
| `mydocs/working/task_66_final.md` | Final report | Document |
