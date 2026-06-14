# HWP Equation Parser Support Status

Written: 2026-03-23

## Overview

Support status for the HWP equation script parsing -> layout -> SVG/Canvas rendering pipeline.
Spec document: `mydocs/tech/hwp_spec_equation.md`

Current implementation level: **approximately 85-90% complete**

## Code Location

| File | Role |
|------|------|
| `src/renderer/equation/tokenizer.rs` | Equation script tokenization |
| `src/renderer/equation/parser.rs` | AST parsing (1068 lines) |
| `src/renderer/equation/ast.rs` | AST node definitions |
| `src/renderer/equation/symbols.rs` | Symbol and command maps |
| `src/renderer/equation/layout.rs` | Layout engine |
| `src/renderer/equation/svg_render.rs` | SVG renderer |
| `src/renderer/equation/canvas_render.rs` | Canvas renderer |

## Implemented Items

### Basic Syntax

| Command | Description | Example |
|---------|------|------|
| OVER | Fraction | `a OVER b` |
| ATOP | Fraction (no line) | `a ATOP b` |
| SQRT | Square root | `SQRT{x}` |
| ROOT | Nth root | `ROOT{n}{x}` |
| ^ | Superscript | `x^{2}` |
| _ | Subscript | `x_{n}` |
| LEFT-RIGHT | Auto-sizing brackets | `LEFT( x RIGHT)` |
| CHOOSE, BINOM | Combination | `CHOOSE{n}{r}` |
| COLOR | Color | `COLOR{255,0,0}{text}` |

### Matrix/Array

| Command | Description |
|---------|------|
| MATRIX | Matrix without brackets |
| PMATRIX | Parenthesized matrix |
| BMATRIX | Bracketed matrix |
| DMATRIX | Vertical bar matrix |
| CASES | Conditional expression (left brace) |
| PILE | Vertical stack (center-aligned) |
| LPILE | Vertical stack (left-aligned) |
| RPILE | Vertical stack (right-aligned) |

### Large Operators

| Command | Symbol | Description |
|---------|------|------|
| INT | integral | Integral |
| OINT | contour integral | Line integral |
| SUM | Sigma | Summation |
| PROD | Pi | Product |
| UNION | union | Union |
| INTER | intersection | Intersection |
| COPROD | coproduct | Coproduct |
| BIGUNION | big union | Big union |
| BIGINTER | big intersection | Big intersection |
| BIGSQUNION | big square union | Big disjoint union |

### Limits

| Command | Description |
|---------|------|
| lim | Limit (lowercase) |
| Lim | Limit (uppercase) |

### Decorations

| Command | Description | Rendering |
|---------|------|--------|
| hat | Circumflex (^) | Supported |
| check | Caron (v) | Supported |
| tilde | Tilde (~) | Supported |
| acute | Acute accent | Supported |
| grave | Grave accent | Supported |
| dot | Dot above | Supported |
| ddot | Diaeresis | Supported |
| bar | Overbar | Supported |
| vec | Vector arrow | Supported |
| dyad | Bidirectional arrow | Supported |
| under | Underbar | Supported |
| arch | Arch | Supported |
| UNDERLINE | Underline | Supported |
| OVERLINE | Overline | Supported |
| NOT | Strikethrough | Supported |

### Font Styles

| Command | Description |
|---------|------|
| rm | Roman (upright) |
| it | Italic |
| bold | Bold |

### Symbols

| Category | Implemented Items |
|------|----------|
| Greek lowercase | alpha~omega (24 types) + variants (vartheta, varpi, etc.) |
| Greek uppercase | Alpha~Omega (24 types) |
| Relational | =, NEQ, LEQ, GEQ, APPROX, CONG, EQUIV, PREC, SUCC, etc. |
| Operators | TIMES, DIV, PLUSMINUS, MINUSPLUS, CDOT, BULLET, etc. |
| Set theory | SUBSET, SUPERSET, IN, OWNS, SUBSETEQ, SUPSETEQ, etc. |
| Arrows | larrow, rarrow, LARROW, RARROW, uparrow, downarrow, mapsto, etc. |
| Dots | CDOTS, LDOTS, VDOTS, DDOTS |
| Miscellaneous | INF, EMPTYSET, ANGLE, TRIANGLE, NABLA, PARTIAL, FORALL, EXISTS, etc. |

### Functions (Auto-Roman)

Trigonometric: sin, cos, tan, cot, sec, csc, arcsin, arccos, arctan, sinh, cosh, tanh, coth
Log/Exp: log, ln, lg, exp
Others: det, dim, ker, hom, arg, deg, gcd, lcm, max, min, mod, asin, acos, atan

### Spacing and Control

| Symbol | Description |
|------|------|
| ~ | Normal space |
| ` | Quarter space |
| # | Line break |
| & | Vertical alignment (tab) |
| "" | 9+ character single-word grouping |

### Left Subscripts/Superscripts

| Command | Description |
|---------|------|
| LSUB | Left subscript |
| LSUP | Left superscript |

## Unimplemented Items

### High Priority

| Command | Description | Found In | Notes |
|---------|------|-----------|------|
| **EQALIGN** | Tab-aligned layout (vertical position alignment by & marker) | exam_math.hwp Question 4 | Registered as B-003 backlog. Similar to PILE but requires column alignment by & marker |

### Medium Priority

| Command | Description | Notes |
|---------|------|------|
| **REL** | Relation -- inserts conditions above/below an arrow | `a REL{->}{condition} b` |
| **BUILDREL** | REL variant -- omits below-arrow | `a BUILDREL{->}{above} b` |
| **LONGDIV** | Long division notation | Used in elementary math documents |
| **DINT** | Double integral | Not registered in symbol map |
| **TINT** | Triple integral | Not registered in symbol map |
| **ODINT** | Double contour integral | Not registered in symbol map |
| **OTINT** | Triple contour integral | Not registered in symbol map |

### Low Priority

| Command | Description | Notes |
|---------|------|------|
| **LADDER** | LCM/GCD ladder diagram | Elementary math specific |
| **SLADDER** | Base conversion ladder (decimal->binary) | Elementary math specific |
| **BIGG** | Element size enlargement | Currently parsing only (size enlargement ignored) |
| **BENZENE** | Benzene molecular structure | Chemistry specific |

### Partially Implemented

| Command | Current Status | Required Work |
|---------|-----------|-----------|
| **BIGG** | Parsing returns inner elements only (size enlargement ignored) | Apply size scaling |
| **&** (tab) | Tokenized but alignment only handled inside PILE | Utilize column alignment in EQALIGN |

## exam_math.hwp Equation Analysis

Equation commands used in samples/exam_math.hwp:

| Command | Frequency | Implemented |
|---------|-----------|-----------|
| OVER (fraction) | Very high | Yes |
| SQRT (square root) | High | Yes |
| ^, _ (subscript/superscript) | Very high | Yes |
| LEFT-RIGHT | High | Yes |
| lim | Medium | Yes |
| INT | Medium | Yes |
| SUM | Medium | Yes |
| CASES | Medium | Yes |
| **EQALIGN** | Medium | No (B-003) |
| MATRIX | Low | Yes |

## Next Steps

1. **Implement EQALIGN** -- Directly impacts exam_math.hwp rendering. Column alignment by & marker, similar structure to PILE
2. **Add integral variant symbols** -- Add Unicode mappings for DINT, TINT, etc. to symbols.rs
3. **Implement REL/BUILDREL** -- Place conditional expressions above/below arrows
4. **BIGG size enlargement** -- Apply the currently ignored size scaling
