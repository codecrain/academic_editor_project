# Task 181 — Step 3 Completion Report: SVG Layout Engine + Rendering

## Goal
Render equation AST as SVG and integrate into existing layout/pagination/SVG pipeline

## Completed Items

### 1. RenderNodeType::Equation Added
- `EquationNode` struct with `svg_content`, `color`, `font_size`

### 2. Equation Layout Engine (`src/renderer/equation/layout.rs`)
- `LayoutBox` struct for position/size/baseline info
- `EqLayout`: AST → LayoutBox conversion for all equation elements (fractions, sqrt, scripts, big operators, limits, matrices, brackets, decorations)
- Baseline alignment within rows
- 4 unit tests

### 3. Equation SVG Renderer (`src/renderer/equation/svg_render.rs`)
- `render_equation_svg()`: LayoutBox → SVG fragment string
- Recursive rendering per LayoutKind (text, fraction lines, brackets as bezier paths, sqrt symbols, decorations)
- `draw_stretch_bracket()`: 6 bracket types
- `draw_decoration()`: 15 decoration types
- 4 unit tests

### 4. Pipeline Integration
- Pagination: `Control::Equation(_)` → `PageItem::Shape`
- Body/shape/table/partial table layout: Equation control branches added
- Composer: treat_as_char equation inline width collection
- Height measurer: equation height summing
- SVG renderer: Equation node rendering

## Tests
- **656 passed** (existing 648 + new 8)
- eq-01.hwp SVG export: 3 equations rendered with text, symbols, fraction lines, brackets
