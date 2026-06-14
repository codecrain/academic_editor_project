# Task 181: Hancom Equation Rendering Implementation — Implementation Plan

## Step 1: Model + Binary/HWPX Parser

### Goal
Extract equation script strings from HWP/HWPX and store in `Control::Equation`

### Changed Files

| File | Change Description |
|------|-------------------|
| `src/model/control.rs` | Define `Equation` struct, add `Control::Equation(Box<Equation>)` variant |
| `src/parser/control.rs` | Add `CTRL_EQUATION` branch → `parse_equation_control()` |
| `src/parser/hwpx/section.rs` | Modify `parse_equation()`: extract script from `<hp:script>` element |
| `src/serializer/control.rs` | Add `Control::Equation` serialization (round-trip) |

### Model Definition

```rust
pub struct Equation {
    pub common: CommonObjAttr,
    pub script: String,           // Equation script ("1 over 2", etc.)
    pub font_size: u32,           // Font size (HWPUNIT)
    pub color: u32,               // Font color (0x00BBGGRR)
    pub baseline: i16,            // Baseline offset
    pub font_name: String,        // Equation font name
    pub raw_ctrl_data: Vec<u8>,   // Original data for round-trip
}
```

---

## Step 2: Equation Tokenizer + Symbol Mapping + AST Parser

### Goal
Tokenize equation script strings and convert to AST

### Changed Files

| File | Change Description |
|------|-------------------|
| `src/renderer/equation/mod.rs` | Module declarations |
| `src/renderer/equation/tokenizer.rs` | Tokenizer (ported from Python tokenizer.py) |
| `src/renderer/equation/symbols.rs` | Command → Unicode mapping (ported from Python symbols.py) |
| `src/renderer/equation/ast.rs` | EqNode enum + EqRow definition |
| `src/renderer/equation/parser.rs` | Recursive descent parser (referenced from Python latex.py) |

### AST Nodes (Core)

Includes: Row, Text, Number, Symbol, MathSymbol, Fraction, Sqrt, Superscript, Subscript, SubSup, BigOp, Limit, Matrix, Cases, Paren, Decoration, FontStyle, Space, Newline, Group

### Verification
- Unit tests: tokenizer (10+ cases), parser (10+ cases)

---

## Step 3: SVG Layout Engine + Rendering

### Goal
Convert AST to sized/positioned layout box tree and output as SVG elements

### Changed Files

| File | Change Description |
|------|-------------------|
| `src/renderer/equation/layout.rs` | Layout engine (AST → LayoutBox) |
| `src/renderer/equation/svg_render.rs` | SVG element generation (LayoutBox → SVG string) |
| `src/renderer/render_tree.rs` | Add `RenderNodeType::Equation` variant |
| `src/renderer/layout.rs` | `Control::Equation` layout processing |
| `src/renderer/layout/shape_layout.rs` | Equation control layout branch |
| `src/renderer/svg.rs` | `RenderNodeType::Equation` SVG output |
| `src/renderer/height_measurer.rs` | Equation height measurement |
| `src/renderer/pagination/engine.rs` | Equation pagination processing |

### Key Layout Rules

| Structure | Rule |
|-----------|------|
| **Fraction** | `width = max(numer.w, denom.w) + margin`, fraction line y = center - offset, numerator/denominator centered |
| **Superscript** | `font_size *= 0.7`, y = base.y - base.height * 0.5 |
| **Subscript** | `font_size *= 0.7`, y = base.y + base.height * 0.3 |
| **Root** | path + horizontal top line, body placed to the right |
| **Big operator** | Symbol enlarged (1.5x), sub/superscripts vertically centered |
| **Matrix** | Column width = max per column, row height = max per row, cells centered |
| **Brackets** | Scale proportional to content height |

---

## Step 4: Integration Testing + Edge Cases + WASM Build

### Goal
Verify rendering quality with real equation-containing HWP files, confirm WASM build

### Content
- SVG export verification with equation-containing sample HWP files
- HWPX file equation rendering verification
- Inline (treat_as_char) equation layout verification
- Page split equation handling verification
- WASM Docker build
- 615+ existing tests + new equation tests all pass
