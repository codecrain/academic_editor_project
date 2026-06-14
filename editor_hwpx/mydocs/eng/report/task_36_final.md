# Task 36: Advanced Table Border Handling — Final Report

## Overview

Resolved two key issues in table rendering:
1. Gradient backgrounds rendering as transparent
2. Adjacent cell borders rendering as doubled lines

Additionally fixed a bug where some cells were missing during header row repetition.

## Work Performed

### Step 1: Gradient Fill Rendering

**Problem**: Header/footer decorative cell backgrounds in k-water-rfp.hwp page 1 rendered as transparent

**Root cause**: All 4 rendering pipeline layers did not support gradients, and the HWP parser's gradient field size was incorrect due to a spec document error, causing OOM

**Solution**:
- Defined `GradientFillInfo` struct and extended render tree nodes
- Added `FillType::Gradient` resolution logic in Style Resolver
- SVG: `<defs>` section management, `<linearGradient>/<radialGradient>` generation
- Canvas: `createLinearGradient()/createRadialGradient()` API usage
- HWP parser: Corrected gradient field size (spec document error, based on reference implementation)

### Step 2: Adjacent Cell Border Deduplication

**Problem**: Each cell independently drew 4-directional borders, causing doubled borders at adjacent cell boundaries

**Solution**: Switched to edge-based collection/merging/rendering
- `h_edges[row_boundary][col]`, `v_edges[col_boundary][row]` grid structure
- `merge_border()`: Selects the higher-priority border (thickness > type)
- `collect_cell_borders()`: Collects cell's 4-directional borders into the grid (merged cell support)
- `render_edge_borders()`: Merges consecutive same-style segments into a single Line for rendering
- Applied to all 4 table layout functions (`layout_table`, `layout_partial_table`, `layout_nested_table`, `layout_embedded_table`)

### Additional Fix: Header Row Repetition Bug

**Problem**: `layout_partial_table()` skipped individual cells without the `is_header` attribute when repeating header rows, causing some cells to be missing

**Root cause**: The HWP editor repeats **all cells** in row 0 if at least one `is_header` cell exists in that row, but the code checked each cell's individual `is_header` flag

**Fix**: Removed the `if is_repeated_header_cell && !cell.is_header { continue; }` condition

## Changed Files

| File | Changes |
|------|---------|
| `src/parser/doc_info.rs` | Corrected gradient parsing field size (spec error workaround) |
| `src/parser/control.rs` | Related fixes |
| `src/renderer/mod.rs` | `GradientFillInfo` struct definition |
| `src/renderer/style_resolver.rs` | `ResolvedBorderStyle` extension, gradient resolution logic |
| `src/renderer/layout.rs` | Edge-based border 4 helper functions, 4 layout function modifications, header row repetition bug fix |
| `src/renderer/svg.rs` | SVG gradient rendering (`<defs>`, `<linearGradient>`, `<radialGradient>`) |
| `src/renderer/web_canvas.rs` | Canvas gradient rendering |

## Verification Results

- **Unit tests**: 416 all passed
- **k-water-rfp.hwp**: 30-page full SVG export successful
  - Page 1: Decorative rows with `<radialGradient>` rendered correctly
  - Page 6: All 4 header row cells repeated
- **All samples**: 20 HWP files all exported successfully
- **WASM build**: Completed successfully

## Items Not Performed

Steps 3 (corner handling and page-split boundaries) and 4 (diagonal borders) from the implementation plan were not performed in this task. They can be addressed in follow-up tasks if needed.
