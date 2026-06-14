# Layout Engine Design Research: MS Word, LibreOffice, Chromium LayoutNG, Typst

## 1. Research Background

### 1.1 Current Problem

A **measurement-placement mismatch** bug occurs in rhwp's existing 3-stage pipeline:

```
height_measurer.measure()  →  paginator.paginate()  →  layout.render()
     (measure)                   (distribute)             (place)
```

- **pagination** uses measured heights to determine "does this paragraph fit on the current page?"
- **layout** applies actual spacing_before/after, host_spacing, line_spacing, etc. during placement
- When the two stages compute slightly differently, **paragraphs get cropped across page boundaries**

Actual case (k-water-rfp.hwp):
- On page 14, pagination determines para 195 fits (current_h + para_h - trailing_ls <= available)
- During actual layout placement, y_offset exceeds col_bottom by 14.2px
- Cause: host_spacing from table paragraphs (para 192, 194) was inaccurately reflected in pagination height

### 1.2 Root Cause

**Separating measurement from placement inevitably produces mismatches.**

This is an inherent limitation of TeX's "measure first, place later" model, and is a problem that MS Word, LibreOffice, Chromium, and all major word processors/layout engines have experienced and solved.

---

## 2. Predecessor Engine Analysis

### 2.1 Chromium LayoutNG — Break Token Pattern

**The most systematic and well-documented approach.**

#### Core Architecture: Input/Output Tuple

```
Layout(BlockNode, ConstraintSpace) → (PhysicalFragment, Option<BreakToken>)
```

| Element | Role |
|---------|------|
| BlockNode | Typesetting target (style + child list) |
| ConstraintSpace | Available space, fragmentainer height, current block offset |
| PhysicalFragment | Placement result (coordinates, child fragments) |
| BreakToken | Information for resuming in the next fragmentainer |

#### Break Token System

- `NGBlockBreakToken` stores all information needed to resume layout
- Break tokens form a tree structure mirroring the layout tree
- Two split scenarios:
  - **Internal split**: Returns fragment + break token
  - **Break before**: No fragment; parent generates a "break-before" token

#### Break Opportunity Scoring

4-level evaluation based on CSS Fragmentation Level 3:

1. All break properties permit the break
2. No common ancestor has break-inside: avoid
3. Orphan/widow constraints satisfied
4. All ancestors have break-inside: auto

When space is exhausted at a non-optimal split point, **2-pass optimization**: 1st pass searches for the optimal split point, 2nd pass layouts exactly up to that point.

#### Table Splitting (Implemented in Chrome 106)

- Uses the same Break Token mechanism as block splitting
- Recursive splitting in order: row → cell → blocks within cell

**Reference**: https://developer.chrome.com/docs/chromium/renderingng-fragmentation

---

### 2.2 LibreOffice Writer — Master/Follow Chain

#### Frame Hierarchy

```
SwFrame (base)
├── SwLayoutFrame (contains children)
│   ├── SwPageFrame (page)
│   ├── SwTabFrame (table) ← SwFlowFrame mixin
│   ├── SwRowFrame (row)
│   └── SwCellFrame (cell)
└── SwContentFrame (content)
    └── SwTextFrame (text) ← SwFlowFrame mixin
```

#### SwFlowFrame — Split/Move Management Mixin

Core interface applied to both tables and paragraphs:

| Method | Role |
|--------|------|
| `MoveFwd()` | Move to next page |
| `MoveBwd()` | Move to previous page |
| `IsKeep()` | Check keep-together constraint |
| `CheckKeep()` | Enforce paragraph/row cohesion |
| `MoveSubTree()` | Relocate frame subtree |

#### Master/Follow Chain

- When a table spans pages, a **Follow** frame is created
- Bidirectional link between Master and Follow (`m_pFollow`, `m_pPrecede`)
- Header row repetition: When Follow is created, Master's header rows are cloned and inserted
- **FollowFlowLine**: Manages boundary rows between Master and Follow tables

#### MakeAll() Loop

```
SwTabFrame::MakeAll() {
    loop {
        Format();          // Calculate height
        if fits_on_page() { break; }
        split_or_move();   // Split or move to next page
        nUnSplitted--;     // Oscillation prevention (max 5 iterations)
    }
}
```

- **Oscillation prevention**: Prevents infinite loops of split → rearrange → split again
- Limited by `nUnSplitted = 5` counter

**Reference**: https://wiki.openoffice.org/wiki/Writer/Core_And_Layout

---

### 2.3 MS Word / OOXML — Row-level Control

#### Key Properties

| Property | Effect |
|----------|--------|
| `cantSplit` | Prohibit row splitting → move entire row to next page |
| `tblHeader` | Repeat header rows (only on automatic page breaks) |
| `trHeight` + `hRule` | Row height control (exact/atLeast/auto) |

#### Row Splitting Rules

1. **cantSplit = false** (default): Cell contents can be split at the line level
2. **cantSplit = true**: Entire row must fit on one page. If not, move to the next page
3. If cell content exceeds one page: cantSplit is ignored and forced split occurs (to prevent monolithic overflow)

#### Header Row Repetition

- Rows with `tblHeader` set are automatically repeated at the top of each page
- Only the first n consecutive rows can be header rows (rows in the middle cannot)
- Not repeated on manual page breaks (splits the table into two)

---

### 2.4 Typst — Place-First Model

#### Core Concept: Regions

```
fn layout(content, regions) → Vec<Fragment>
```

- **Region**: The shape of space where an element can be placed
- Content is first realized, then regions are dynamically adjusted during placement
- **Critical difference from TeX**: TeX completes the table first, then decides page breaks → cannot split cells internally

#### TeX vs Typst Comparison

| Aspect | TeX (Measure First) | Typst (Place First) |
|--------|---------------------|---------------------|
| Table cell page splitting | Not possible | Possible |
| Orphan/widow control | Excellent | Currently limited |
| Layout optimization | Global optimization possible | Local (greedy) optimization |

**Reference**: https://laurmaedje.github.io/posts/layout-models/

---

## 3. Common Design Principles

### 3.1 Single-Pass Typesetting (Format While Placing)

The core principle all modern engines have converged on:

> **Do not separate measurement from placement. Measure while placing.**

```
// Bad pattern (current rhwp)
let height = measure(paragraph);
let fits = height <= available;
place(paragraph, y);  // Actual height may differ from measured height

// Good pattern (MS Word, LibreOffice, Chromium)
let (fragment, break_token) = format_and_place(paragraph, available_space);
// fragment.height exactly matches the actually placed height
```

### 3.2 Constraint Space → Fragment + BreakToken

```
layout(node, constraint_space) → (fragment, Option<break_token>)
```

- **constraint_space**: Available height, width, current offset
- **fragment**: Actual placement result
- **break_token**: Information for resuming on the next page (absent means fully placed)

### 3.3 Information Preservation During Splitting

Information that must be included in the BreakToken:

| Target | Preserved Information |
|--------|----------------------|
| Paragraph | Start line number, whether spacing_before is suppressed |
| Table | Start row number, whether header rows repeat |
| Row (intra-row) | Start line number for each cell |
| Nested table | Recursive break token tree |

### 3.4 Spacing Interaction Rules

1. **Suppress spacing_before at page top**: spacing_before of the first element on a page/fragmentainer is 0
2. **Trailing line_spacing**: trailing line_spacing of the last paragraph on a page is ignored
3. **Table host_spacing**: spacing_before/after of the paragraph owning the table applies before/after the table
4. **Spacing within cells**: Starts after cell padding, ends at cell boundary

---

## 4. rhwp TypesetEngine Phase 2 Application Plan

### 4.1 Introducing Break Tokens

```rust
/// Typesetting split point — information for resuming on the next page
enum TypesetBreakToken {
    /// Paragraph line split
    Paragraph {
        para_index: usize,
        start_line: usize,
        suppress_spacing_before: bool,
    },
    /// Table row split
    Table {
        para_index: usize,
        control_index: usize,
        start_row: usize,
        header_rows: Vec<usize>,    // Header row indices to repeat
        cell_breaks: Option<Vec<CellBreakToken>>,  // For intra-row splits
    },
}

/// Cell internal split information
struct CellBreakToken {
    cell_index: usize,
    start_line: usize,  // Start line within the cell's paragraph
}
```

### 4.2 Table Typesetting Flow

```rust
fn typeset_table(
    &self,
    table: &Table,
    constraint: ConstraintSpace,
    break_token: Option<&TypesetBreakToken>,
) -> (TableFragment, Option<TypesetBreakToken>) {
    // 1. Place header rows (refer to header_rows from break_token)
    // 2. Determine start row (break_token.start_row or 0)
    // 3. For each row:
    //    a. Calculate row height (format cell contents)
    //    b. Does it fit in available space?
    //       - YES: Place row, advance cursor
    //       - NO + splittable: Intra-row split, return BreakToken
    //       - NO + not splittable: Move entire row to next page, return BreakToken
    //       - NO + nothing placed: Monolithic overflow (force placement)
    // 4. All rows placed: return (fragment, None)
}
```

### 4.3 Compatibility with Existing Paginator

Upon Phase 2 completion:
- TypesetEngine accurately handles sections containing tables
- Goal: 0 differences in TYPESET_VERIFY for table sections
- Phase 3: Remove Paginator table logic, TypesetEngine becomes the sole path

---

## 5. References

| Source | URL |
|--------|-----|
| Chromium LayoutNG Block Fragmentation | https://developer.chrome.com/docs/chromium/renderingng-fragmentation |
| CSS Fragmentation Level 3 | https://www.w3.org/TR/css-break-3/ |
| LibreOffice Writer Core And Layout | https://wiki.openoffice.org/wiki/Writer/Core_And_Layout |
| LibreOffice New Table Model | https://wiki.openoffice.org/wiki/Writer/New_Table_Model |
| OOXML Table Row Properties | http://officeopenxml.com/WPtableRowProperties.php |
| Typst Layout Models | https://laurmaedje.github.io/posts/layout-models/ |
| Univer Typesetting Design | https://docs.univer.ai/blog/doc-typesetting-design |
