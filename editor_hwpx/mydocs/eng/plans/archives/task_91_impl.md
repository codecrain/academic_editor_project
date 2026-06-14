# Task 91: Multi-Column Layout Processing — Implementation Plan

## Implementation Steps (3 steps)

### Step 1: ColumnDef Extraction + Pagination Connection

**Goal**: Pass the section's actual ColumnDef to pagination to activate multi-column layout.

**Modified file**: `src/wasm_api.rs`

**Work**:
1. Write helper function to iterate section's paragraphs and extract first `Control::ColumnDef`
   ```rust
   fn find_initial_column_def(paragraphs: &[Paragraph]) -> ColumnDef {
       for para in paragraphs {
           for ctrl in &para.controls {
               if let Control::ColumnDef(cd) = ctrl {
                   return cd.clone();
               }
           }
           // ColumnDef is usually in first paragraph, so search only a few paragraphs
           if para.column_type != ColumnBreakType::None {
               break;
           }
       }
       ColumnDef::default()
   }
   ```
2. Replace `&ColumnDef::default()` → `&find_initial_column_def(&section.paragraphs)` in `paginate()` (2 locations)

**Verification**: `docker compose run --rm test` — Rust tests pass, SVG export confirms 2-column layout

---

### Step 2: Column Break + MultiColumn Break Handling

**Goal**: Handle column break (ColumnBreakType::Column) and multi-column break (ColumnBreakType::MultiColumn) in pagination.

**Modified file**: `src/renderer/pagination.rs`

**Work**:
1. **Column break handling** (ColumnBreakType::Column):
   - Flush current items to current column
   - If `current_column + 1 < col_count`, move to next column
   - If last column, move to new page (current_column = 0)

2. **MultiColumn break handling** (ColumnBreakType::MultiColumn):
   - Flush current items to current column/page
   - Find Control::ColumnDef in the paragraph and update column_def
   - Recalculate layout.column_areas for new column count
   - Reset col_count, current_column

3. Pagination function signature: change `column_def` parameter from `&ColumnDef` to `ColumnDef` to support mid-section changes (or use internal mut variable)

**Verification**: `docker compose run --rm test` — tests pass

---

### Step 3: Column Separator Rendering + HWPX Parsing + Build/Verification

**Goal**: Render separator lines between columns, add HWPX multi-column parsing.

**Modified files**: `src/renderer/layout.rs`, `src/parser/hwpx/section.rs`

**Work**:

**A. Column separator rendering** (`src/renderer/layout.rs`):
1. Determine how to pass column_def reference or separator info to `PageContent`
2. When multi-column (column_count >= 2), generate vertical line RenderNode between adjacent columns
   - Draw separator if separator_type > 0
   - Coordinate: midpoint between first column's right edge and second column's left edge
   - Style: apply separator_width, separator_color

**B. HWPX multi-column parsing** (`src/parser/hwpx/section.rs`):
1. Parse `<hp:colPr>` or `<hp:multiColumn>` XML elements
2. Map column_count, spacing, widths, separator attributes
3. Create `Control::ColumnDef(ColumnDef { ... })`

**C. Build + verification**:
1. `docker compose run --rm test` — Rust tests pass
2. `docker compose run --rm wasm && npm run build` — WASM/Vite build
3. SVG export — `treatise sample.hwp` 2-column rendering confirmed
4. Web viewer — 2-column rendering confirmed

## Modified Files Summary

| File | Step | Changes |
|------|------|---------|
| `src/wasm_api.rs` | 1 | ColumnDef extraction + passing |
| `src/renderer/pagination.rs` | 2 | Column/MultiColumn break handling |
| `src/renderer/layout.rs` | 3 | Column separator rendering |
| `src/parser/hwpx/section.rs` | 3 | HWPX multi-column parsing |
