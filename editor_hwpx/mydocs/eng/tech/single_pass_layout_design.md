# Single-Pass Layout Engine Design Document

## Project Turning Point

**Vector Drawing Viewer → Word Processor Layout Engine**

rhwp started as a vector drawing approach that outputs HWP files as SVG/HTML.
This approach focused on "drawing the appearance of a document," using a 3-stage pipeline
that pre-measures all element heights, distributes them to pages, and calculates coordinates.

However, this approach hit fundamental limits:
- Recurring overflow, blank page, and cropping issues due to discrepancies between pre-measurements and actual placement
- A vicious cycle where case-specific patches broke other cases (7+ days)
- Unsolvable for complex structures like table > cell > nested table

Now we transition to the **word processor approach** used by MS Word / LibreOffice Writer.
The paradigm shifts from "drawing the appearance of a document" to **"typesetting a document."**

## Current Architecture vs. Target Architecture

### Current: Vector Drawing Approach (3-Stage Separation)

```
height_measurer → pagination engine → layout engine → SVG/HTML
  (pre-measure)     (page distribution)   (coordinate placement)  (output)
```

- Each stage operates independently
- Each stage must trust the results of the previous stage
- No feedback loop → error accumulation

### Target: Word Processor Approach (Single Pass)

```
layout engine (typesetting) → render tree → SVG/HTML
  ├─ element format (size calculation)        (output)
  ├─ does it fit on the page? (decision)
  ├─ commit placement or move to next page
  └─ reset height for next page
```

- Measurement, decision, and placement in a single flow
- Decisions are based on actual sizes, so no discrepancies
- Overflow is impossible — if it doesn't fit, move to the next page immediately

## Core Algorithm

### Principles

1. **Decide while placing** — No pre-measurement; know the size at format() time and decide immediately
2. **If it doesn't fit, move on** — Instead of overflow, move to the next page
3. **Reset the next page** — Errors from the previous page don't propagate
4. **Same rules for all elements** — Paragraphs, tables, nested tables, images all follow the same pattern

### Basic Flow

```
for each paragraph in section:
    frame = create_frame(paragraph)
    height = frame.format()  // Calculate actual size (text lines, table height, etc.)

    if page.remaining >= height:
        page.place(frame, height)
    else if frame.is_splittable():
        (master, follow) = frame.split(page.remaining)
        page.place(master)
        page = new_page()  // Reset height
        // Continue processing follow on the next page
        // If follow doesn't fit again, split again → recursive processing
    else:
        page = new_page()  // Reset height
        page.place(frame, height)
```

### Table Splitting

```
table_frame.format():
    for each row in table:
        row_height = row.format()  // Actual height including cell contents

        if page.remaining >= row_height:
            page.place(row)
        else if row.is_splittable():
            // Cell contents have multiple lines → intra-row split
            (master_row, follow_row) = row.split(page.remaining)
            page.place(master_row)
            page = new_page()
            // Continue with follow_row + remaining rows
        else:
            page = new_page()
            page.place(row)
```

### Nested Tables

```
cell.format():
    total = 0
    for each content in cell.contents:
        if content is Table:
            h = content.format()  // Recursive — same algorithm
        else:
            h = content.format()  // Paragraph height
        total += h
    return total
```

Same rules regardless of nesting depth. No pre-measurement needed.

## Relationship with Current Code Structure

### Role Reassignment

| Current Module | Current Role | After Transition |
|----------------|-------------|------------------|
| `height_measurer.rs` | Pre-measure heights | **Remove** — replaced by format() |
| `pagination/engine.rs` | Page distribution decisions | **Remove** — layout decides directly |
| `pagination/state.rs` | Page state management | **Evolve** → PageState |
| `layout.rs` | Coordinate placement + render tree | **Expand** — center of the typesetting engine |
| `composer.rs` | TextRun composition | **Keep** — called from format() |
| `style_resolver.rs` | Style resolution | **Keep** |
| `render_tree.rs` | Render tree structure | **Keep** |
| `svg.rs` / `html.rs` | Output | **Keep** |

### Interface Changes

Current:
```rust
// Stage 1: Measure
let measured = height_measurer.measure_section(&paragraphs);
// Stage 2: Distribute
let pagination = engine.paginate_with_measured(&paragraphs, &measured, ...);
// Stage 3: Place (per page)
let tree = layout_engine.build_page_tree(page_num);
```

After transition:
```rust
// Single call: Typeset (all pages at once)
let result = layout_engine.typeset_section(&paragraphs, &page_def, &styles);
// result contains render trees for each page
let tree = result.page_tree(page_num);
```

## Implementation Strategy

### Gradual Transition (Preserving Existing Tests)

Transition incrementally while protecting the existing 684 tests.

**Phase 1: Paragraph Typesetting**
- Implement format() + fits() + place() for non-table paragraphs
- Verify identical results with existing pagination's paragraph processing
- Replace height_measurer's paragraph measurement

**Phase 2: Table Typesetting**
- Implement table format() + row-level fits() + split()
- Replace existing split_table_rows, find_break_row
- Recursive format() for nested tables

**Phase 3: Integration and Cleanup**
- Remove existing height_measurer and pagination engine
- Transition build_page_tree to generate from new typesetting results
- Achieve 0 self-verification (LayoutOverflow) occurrences

### Verification Criteria for Each Phase

1. 684 existing tests PASS
2. 0 self-verification (LayoutOverflow) occurrences
3. Visual accuracy maintained for key documents (kps-ai.hwp, hwpp-001.hwp, etc.)
4. WASM build succeeds

## Expected Benefits

1. **Fundamentally resolves height calculation mismatches** — measurement and placement occur at the same point
2. **Eliminates overflow at the source** — items that don't fit are moved, so overflow never occurs
3. **Resolves blank page issues** — pages are composed based on actual content
4. **Code simplification** — 3-stage pipeline → single typesetting engine
5. **Foundation for future editing features** — possessing a word processor-grade layout engine
