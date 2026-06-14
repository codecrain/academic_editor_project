# layout.rs Code Quality Detailed Evaluation Report

> **Target**: `src/renderer/layout.rs` (8,709 lines, 133 items)  
> **Evaluation criteria**: 10-point scale, 12 detailed categories  
> **Date**: 2026-02-22  

---

## Overall Score: 4.5 / 10.0

| Evaluation Category | Score | Weight | Weighted Score |
|---|---|---|---|
| 1. File Size and Structure | 2 / 10 | 15% | 0.30 |
| 2. Single Responsibility (SRP) | 3 / 10 | 15% | 0.45 |
| 3. Code Duplication (DRY) | 3 / 10 | 12% | 0.36 |
| 4. Function Complexity | 2 / 10 | 12% | 0.24 |
| 5. Error Handling | 7 / 10 | 8% | 0.56 |
| 6. Documentation | 7 / 10 | 8% | 0.56 |
| 7. Naming Consistency | 8 / 10 | 5% | 0.40 |
| 8. Type Safety | 6 / 10 | 5% | 0.30 |
| 9. Test Coverage | 4 / 10 | 8% | 0.32 |
| 10. Performance Considerations | 6 / 10 | 5% | 0.30 |
| 11. Extensibility | 3 / 10 | 4% | 0.12 |
| 12. Maintainability | 3 / 10 | 3% | 0.09 |
| **Overall** | | **100%** | **4.00** -> **Scaled: 4.5/10** |

---

## 1. File Size and Structure -- 2/10

### Quantitative Data

| Metric | Value | Assessment |
|---|---|---|
| Total lines | 8,709 | 6~17x the industry recommendation (500~1,500 lines) |
| Total items | 133 | Navigable but excessive |
| Business logic | ~7,950 lines (1~7,952) | Oversized as a single module |
| Test code | ~750 lines (7,953~8,709) | Reasonable ratio |
| Function count | 112 | Concentrated in LayoutEngine |

### Structure

```
layout.rs (8,709 lines)
+-- Constants/imports/utilities (1~200 lines)
+-- WASM measurement cache (60~130 lines) -- platform-specific
+-- Data structures (CellContext, NumberingState, etc.) (130~280 lines)
+-- LayoutEngine impl (280~6,807 lines) -- core 6,527 lines
+-- Standalone utility functions (6,808~7,952 lines)
+-- Tests (7,953~8,709 lines)
```

Smaller than wasm_api.rs (24,586 lines), but the problem is that **6,527 lines** are concentrated in a single `LayoutEngine` impl block.

---

## 2. Single Responsibility (SRP) -- 3/10

Classifying `LayoutEngine`'s responsibilities reveals **at least 7 areas**:

| Role | Representative Methods | Lines |
|---|---|---|
| Page render tree construction | `build_render_tree()` | ~921 |
| Paragraph text layout | `layout_composed_paragraph()`, `layout_raw_paragraph()` | ~600 |
| Table layout | `layout_table()`, `layout_embedded_table()` | ~900 |
| Shape/image layout | `layout_shape()`, `layout_shape_object()`, `layout_picture()` | ~800 |
| Textbox content | `layout_textbox_content()` | ~348 |
| Numbering/footnote processing | `apply_paragraph_numbering()`, `layout_footnote_area()` | ~500 |
| Inline table layout | `layout_inline_table_paragraph()` | ~372 |

These 7 areas are each separable into independent modules.

---

## 3. Code Duplication (DRY) -- 3/10

### 3.1 ShapeObject Pattern Matching -- 61 times, same 8-variant block repeated

To access the `common` field of the `ShapeObject` enum, the same **8-variant pattern** is repeated **61 times**:

```rust
// This exact pattern repeats in at least 6 different locations
let common = match shape {
    ShapeObject::Line(s) => &s.common,
    ShapeObject::Rectangle(s) => &s.common,
    ShapeObject::Ellipse(s) => &s.common,
    ShapeObject::Arc(s) => &s.common,
    ShapeObject::Polygon(s) => &s.common,
    ShapeObject::Curve(s) => &s.common,
    ShapeObject::Group(g) => &g.common,
    ShapeObject::Picture(p) => &p.common,
};
```

**Solution**: Adding a `fn common(&self) -> &ShapeComponentAttr` trait method to `ShapeObject` would reduce 61 lines to 1.

### 3.2 Table Layout Code Duplication

`layout_table()` (lines 2,246~5,023) and `layout_embedded_table()` (lines 6,432~6,655) contain nearly identical cell layout logic:

| Duplicated Logic | layout_table | layout_embedded_table |
|---|---|---|
| Column width calculation | 2,298~2,310 | 6,450~6,458 |
| Row height calculation | 2,312~2,330 | 6,466~6,479 |
| Cumulative position calculation | 2,340~2,350 | 6,482~6,489 |
| Cell background rendering | 2,920~2,950 | 6,559~6,579 |
| Cell border collection | 2,960~2,970 | 6,581~6,588 |
| Cell padding calculation | 2,980~3,010 | 6,590~6,614 |
| Cell paragraph layout | 3,020~3,060 | 6,617~6,638 |

~200 lines of nearly identical code exist twice.

### 3.3 Repeated hwpunit_to_px Calls

`hwpunit_to_px()` call count: **221 times**. Many cases of repeated conversion of the same values:
- Same cell's padding called separately for all 4 directions
- Same shape's width/height recalculated in multiple functions

---

## 4. Function Complexity -- 2/10

### Large Function Inventory

| Function | Lines | Cyclomatic (est.) | Assessment |
|---|---|---|---|
| `build_render_tree()` | **921 lines** (317~1,238) | Extremely high | Decomposition mandatory |
| `layout_table()` | **~500 lines** (2,246~2,746+) | Very high | Decomposition mandatory |
| `layout_composed_paragraph()` | **421 lines** (1,711~2,132) | High | Decomposition recommended |
| `layout_inline_table_paragraph()` | **372 lines** (1,285~1,657) | High | Decomposition recommended |
| `layout_textbox_content()` | **348 lines** (6,081~6,429) | High | Decomposition recommended |
| `layout_shape_object()` | **204 lines** (5,824~6,028) | Medium | Attention needed |

**Industry recommendation**: 50~100 lines per function. The top 5 functions all exceed 200 lines, with `build_render_tree()` at an extreme **921 lines**.

### `build_render_tree()` Internal Structure (921 lines)

This single function contains all of the following:
1. Page layout calculation (margins, columns, header/footer areas)
2. Multi-column layout handling
3. Per-paragraph render node creation
4. Shape/picture position calculation
5. Footnote area placement
6. Page numbers/page borders rendering
7. Master page handling

**A single function builds the entire page**, so despite sub-function calls, the control flow and branching are excessively complex.

### `#[allow(clippy::too_many_arguments)]` Usage

Used 2 times -- `layout_table()` (16 parameters), `layout_composed_paragraph()` (14 parameters). 
Suppressing Clippy warnings does not address the root cause (excessive parameters).

---

## 5. Error Handling -- 7/10

### Positive Examples

- Safe handling of index access using `.get()` + `match` / `if let` patterns
- Graceful handling of out-of-range with empty results or `continue`
- `unwrap()`/`expect()` usage: only **9 times** -- all in test code or logically safe positions

### Deficiencies

- `build_render_tree()` returns an empty tree instead of an error -- makes debugging root cause difficult
- Default value usage for impossible states (e.g., `unwrap_or(0.0)`) -- potential silent failures

---

## 6. Documentation -- 7/10

### Quantitative Data

- `///` doc comments: **175** (excellent relative to 133 items + utility functions)
- Module-level `//!` docs: present (1~5 lines), clearly explains roles
- Korean documentation: consistently used
- `TODO`/`FIXME`: **0** -- no technical debt markers (interpretable either way)

### Positive Examples

- `layout_table()` grid algorithm explanation (4-step comments)
- `MeasureCache` performance rationale documented (`~50us` JS bridge cost)
- Spec references for conversion functions (`HWP spec table 28: mm -> px`)
- `build_render_tree()` depth parameter meaning documented

### Deficiencies

- Lack of algorithm flow explanation within large functions (921-line function has comments but no overview)
- Performance characteristics (O(n^2), etc.) not noted
- No inter-function call relationships / layout pipeline diagrams

---

## 7. Naming Consistency -- 8/10

### Positive Examples

- `layout_*` prefix: consistently applied to all layout functions
- `build_render_tree`: clear top-level entry point
- `_to_*` suffix: consistent for conversion functions (`drawing_to_shape_style`, `border_width_to_px`)
- No Hungarian notation, meaningful variable names

### Deficiencies

- `col_area` vs `col_node` -> `column_area`, `column_node` would be clearer
- Some abbreviation inconsistency: `bf` (border_fill), `bs` (border_style), `hf` (header_footer)
- `_raw_paragraph` -> `_fallback_paragraph` would better convey intent

---

## 8. Type Safety -- 6/10

### Positive Examples

- Dedicated struct usage: `LayoutRect`, `BoundingBox`, `CellContext`, `NumberingState`
- `CellPathEntry` / `CellContext` represent nested table paths as types
- Consistent `#[derive(Debug, Clone)]` usage

### Deficiencies

- `depth: usize` -- newtype `TableDepth(usize)` or enum (`TopLevel`/`Nested(usize)`) would be safer
- `table_meta: Option<(usize, usize)>` -- struct `TableMeta { para_index, control_index }` instead of anonymous tuple
- `text_direction: u8` -- enum `TextDirection { Horizontal, Vertical, ... }` for type safety
- `as i32` casting: `hwpunit_to_px(cell.width as i32, self.dpi)` -- `u32 -> i32` overflow possible

---

## 9. Test Coverage -- 4/10

### Quantitative Data

| Metric | Value |
|---|---|
| `#[test]` function count | **22** |
| Test lines | ~750 lines (8.6%) |
| Business logic/test ratio | ~10.6:1 |

### Test Coverage Classification

| Area | Tests Exist | Assessment |
|---|---|---|
| Empty page render | `test_build_empty_page` | Basic |
| Paragraph layout | `test_build_page_with_paragraph`, `test_layout_with_composed_styles` | Present |
| Character width estimation | `test_estimate_text_width*` (5) | Good |
| Table layout | `test_layout_table_basic`, `test_layout_table_cell_positions` | Minimal |
| Numbering | `test_numbering_*` (4) | Good |
| Shape layout | None | Critical gap |
| Textbox content | None | Critical gap |
| Inline table | None | Critical gap |
| Footnote layout | None | Critical gap |
| Multi-column layout | None | Critical gap |
| Caption layout | None | Critical gap |
| WASM measurement cache | None (cfg restricted) | Gap |

**22 tests for 7,950 lines of business logic** -- major functional areas (shapes, textboxes, footnotes, multi-column) have no tests at all.

---

## 10. Performance Considerations -- 6/10

### Positive Examples

- `MeasureCache`: 256-entry LRU cache minimizing JS bridge calls (cache design well-documented)
- `thread_local!`: manages WASM environment cache via TLS
- Reuses `measured_tables` during table layout
- Proportional distribution algorithm for cell height calculation

### Deficiencies

- Single `build_render_tree()` function call -> cannot isolate hotspots during profiling
- **221 calls** to `hwpunit_to_px()` -- repeated conversion of identical values (likely optimized via inlining but reduces code readability)
- All cell paragraphs reconstructed via `compose_paragraph()` during table cell layout (no caching)
- Frequent `Vec` allocations: `col_widths`, `row_heights`, `col_x`, `row_y`, etc. freshly allocated per table

---

## 11. Extensibility -- 3/10

- Adding a new shape type (`ShapeObject` variant) requires modifying **at least 6 match blocks** (61 pattern matches)
- Adding new layout modes (side-by-side, floating, etc.) requires adding branches directly in the 921-line `build_render_tree()`
- Layout strategy cannot be swapped (no trait/strategy pattern)
- Improving the table layout algorithm requires simultaneous modification of both `layout_table()` and `layout_embedded_table()`

---

## 12. Maintainability -- 3/10

- 921-line, 421-line, 372-line functions -> maximum cognitive load during modifications
- `#[allow(clippy::too_many_arguments)]` 2 times -> acknowledging and suppressing code smells
- Modifying build_render_tree() affects the entire page layout -> difficult to predict side effects
- Likely high frequency of git blame/merge conflicts

---

## Comparison with wasm_api.rs

| Item | wasm_api.rs | layout.rs | Notes |
|---|---|---|---|
| File size | 24,586 lines | 8,709 lines | wasm_api is 2.8x larger |
| Largest function | ~200 lines | **921 lines** | layout is 4.6x larger |
| Test count | 112 | 22 | wasm_api has 5x more |
| Code duplication | JSON parser 13x | ShapeObject matching 61x | Both severe |
| Overall score | **4.8/10** | **4.5/10** | layout scores slightly lower |

> **Key difference**: wasm_api.rs has "a lot of volume but each function is simple", while layout.rs has "less volume but extremely complex functions". The refactoring difficulty is higher for layout.rs.

---

## Improvement Priority (Ordered by Score Impact)

| Priority | Task | Expected Score Improvement |
|---|---|---|
| 1 | **Decompose `build_render_tree()`** (921 lines -> 7~10 sub-functions) | Category 4 +6, Category 12 +4 |
| 2 | **Add `ShapeObject::common()` method** (61x match -> 1 line) | Category 3 +4, Category 11 +3 |
| 3 | **Unify table layout** (`layout_table` + `layout_embedded_table` -> shared module) | Category 3 +2 |
| 4 | **File split** (text/table/shape/footnote) | Category 1 +5, Category 2 +4 |
| 5 | **Introduce parameter structs** (16 args -> `LayoutContext` struct) | Category 8 +2, Category 7 +1 |
| 6 | **Add shape/textbox/footnote tests** | Category 9 +4 |

---

## Conclusion

layout.rs is the **core engine that achieves accurate HWP document layout**, handling complex layout cases including multi-column placement, table cell merging, captions, footnotes, and inline tables all in a single file. Documentation (175 comments) and error safety (9 unwraps) are adequate.

However, **function-level complexity is the most severe in the entire project**: `build_render_tree()` at 921 lines, functions with 16 parameters, and ShapeObject 8-variant matching repeated 61 times. While the file size is smaller than wasm_api.rs, the **cognitive complexity of individual functions** is higher in layout.rs.

**One-line summary**: "Pages are rendered accurately, but a 921-line function decides everything."
