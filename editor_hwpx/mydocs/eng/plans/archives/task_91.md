# Task 91: Multi-Column Layout Processing — Execution Plan

## Goal
Correctly render HWP documents containing multi-column layouts.
Example: `samples/basic/treatise sample.hwp` (2 columns)

## Current Analysis

### Already Implemented
| Area | Status | Description |
|------|--------|-------------|
| Model (ColumnDef) | Complete | column_type, column_count, spacing, widths, separator etc. |
| HWP binary parser | Complete | `parse_column_def_ctrl()` — stored as Control::ColumnDef |
| Layout area calculation | Complete | `calculate_column_areas()` — multi-column area division |
| Pagination | Partial | Column index/movement code exists but always called with 1 column |
| Render tree | Complete | `RenderNodeType::Column(index)` node support |

### Core Issues

**1. `paginate()` function always passes `ColumnDef::default()` (1 column)**
- `src/wasm_api.rs:1706` — ignores section's actual ColumnDef and uses default
- Result: all content placed in 1 column

**2. Column break (ColumnBreakType::Column) not handled**
- `pagination.rs:251` — only Page/Section breaks handled, Column break ignored
- Result: forced column breaks don't work in 2-column documents

**3. Multi-column break (ColumnBreakType::MultiColumn) not handled**
- No handling when column count changes mid-document
- Example: title in 1 column → body in 2 columns

**4. No multi-column parsing in HWPX parser**
- `src/parser/hwpx/section.rs` — no column-related XML element parsing
- HWPX file column information lost

## ColumnDef Flow Analysis

In HWP, ColumnDef is stored as a paragraph control:
```
Section → Paragraph[0] → controls[0] = Control::SectionDef(...)
Section → Paragraph[0] → controls[1] = Control::ColumnDef(...)  <- initial column definition
...
Section → Paragraph[N] → column_type = MultiColumn  <- column change
Section → Paragraph[N] → controls[0] = Control::ColumnDef(...)  <- new column definition
```

## Scope

### In Scope
1. Extract section's ColumnDef and pass to pagination
2. Multi-column layout area division (equal width + variable width)
3. Column break (ColumnBreakType::Column) handling
4. Multi-column break (ColumnBreakType::MultiColumn) — mid-document column count change
5. Column separator rendering (separator_type, separator_width, separator_color)
6. HWPX multi-column parsing

### Out of Scope
- Column balancing (equalizing left/right column heights on last page)
- Multi-column editing (caret/input related)
- Multi-column direction RTL (RightToLeft)

## Expected Modified Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | `paginate()`: extract ColumnDef from section and pass |
| `src/renderer/pagination.rs` | Column break handling, MultiColumn break handling |
| `src/renderer/layout.rs` | Column separator rendering |
| `src/renderer/svg.rs` | Column separator SVG output |
| `src/parser/hwpx/section.rs` | HWPX multi-column XML parsing |

## Verification
- `samples/basic/treatise sample.hwp` SVG export — confirm 2-column layout
- Rust tests pass
- WASM/Vite build success
- 2-column rendering confirmed in web viewer
