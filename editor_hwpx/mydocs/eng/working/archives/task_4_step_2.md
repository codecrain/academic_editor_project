# Task 4 - Step 2 Completion Report: Document Structure Composition

## Implementation Details

### New File

| File | Lines | Role |
|------|-------|------|
| `src/renderer/composer.rs` | 351 | Document composition module |

### Modified Files

| File | Changes | Role |
|------|---------|------|
| `src/model/paragraph.rs` | +3 lines | Added `char_offsets: Vec<u32>` field |
| `src/parser/body_text.rs` | ~50 lines modified | `parse_para_text()` -> `(String, Vec<u32>)` return, position mapping generation |
| `src/renderer/mod.rs` | +1 line | `pub mod composer;` registration |

### Implemented Structs

| Struct | Description |
|--------|-------------|
| `ComposedTextRun` | Same-style text fragment within a line (text + char_style_id) |
| `ComposedLine` | Per-line TextRun list + LineSeg layout information |
| `ComposedParagraph` | Composed paragraph (lines + para_style_id + inline_controls) |
| `InlineControl` | Inline control position information (line_index + control_type) |

### Core Algorithms

**1. UTF-16 Position Mapping** (parse_para_text modification)
```
Original UTF-16: [ctrl 8units][A][B][C]
text = "ABC"
char_offsets = [8, 9, 10]
-> char_offsets[i] = original UTF-16 code unit position of text[i]
```

**2. Per-line Text Splitting** (compose_lines)
```
LineSeg[0].text_start = 0, LineSeg[1].text_start = 5
Convert UTF-16 positions -> text indices using char_offsets
-> line[0] = text[0..5], line[1] = text[5..]
```

**3. CharShapeRef-based Multiple TextRuns** (split_by_char_shapes)
```
Line text "AAABBB", CharShapeRef: [{pos:0, id:1}, {pos:3, id:2}]
-> TextRun("AAA", style=1), TextRun("BBB", style=2)
```

### Bug Fix

**dedup_by_key ordering bug**
- Problem: When multiple CharShapeRefs mapped before line start, `dedup_by_key` kept the first (oldest style)
- Fix: `reverse -> dedup -> reverse` to keep the last (newest style)

## Test Results

| Item | Result |
|------|--------|
| All tests | **202 passed** (177 existing + 14 style_resolver + 11 composer) |
| Build | Succeeded (0 warnings) |

### New Tests (11)

| Test | Verification Content |
|------|---------------------|
| test_compose_single_line_single_style | Single line, single style |
| test_compose_single_line_multi_style | Single line, multi-style splitting |
| test_compose_multi_line | Multi-line text splitting |
| test_compose_multi_line_multi_style | Multi-line + multi-style |
| test_compose_empty_paragraph | Empty paragraph handling |
| test_compose_no_line_segs | Paragraph without LineSeg |
| test_compose_with_ctrl_char_gap | Extended control character position gap |
| test_identify_inline_controls_table | Table control identification |
| test_utf16_range_to_text_range | UTF-16 -> text index conversion |
| test_utf16_range_no_offsets | 1:1 mapping without offsets |
| test_find_active_char_shape | Active CharShapeRef search |

## Status

- Completion date: 2026-02-05
- Status: Approved
