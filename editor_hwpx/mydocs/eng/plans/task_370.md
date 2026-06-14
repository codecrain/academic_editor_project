# Task 370: HWP Table Formula Implementation

## Goal
Implement HWP table formula functionality (block formula/quick formula/formula input).

## Scope

### Supported Features
1. **Cell reference**: A1, B3 (column=A~Z, row=1~N)
2. **Range reference**: A1:B5
3. **Wildcard**: ?1:?3 (all columns), A?:C? (all rows)
4. **Direction specifiers**: left, right, above, below
5. **Arithmetic operators**: +, -, *, /
6. **Parentheses**: Nestable
7. **Sheet functions**: 22 functions

### Sheet Function List

| Category | Function | Description |
|----------|------|------|
| Aggregate | SUM | Sum |
| Aggregate | AVERAGE (AVG) | Average |
| Aggregate | PRODUCT | Product |
| Aggregate | MIN | Minimum |
| Aggregate | MAX | Maximum |
| Aggregate | COUNT | Non-empty cell count |
| Trigonometric | COS, SIN, TAN | Trigonometric functions |
| Trigonometric | ACOS, ASIN, ATAN | Inverse trigonometric functions |
| Math | ABS | Absolute value |
| Math | EXP | e to the power |
| Math | LOG | Natural logarithm |
| Math | LOG10 | Common logarithm |
| Math | SQRT | Square root |
| Conversion | RADIAN | Degrees→Radians |
| Determination | SIGN | Sign (1/0/-1) |
| Rounding | CEILING | Round up |
| Rounding | FLOOR | Round down |
| Rounding | ROUND | Round |
| Rounding | TRUNC | Truncate |
| Logic | MOD | Remainder |
| Conditional | IF | Conditional branch |
| Conversion | INT | Integer conversion |

### Formula Grammar
```
formula     = "=" expr | "@" expr
expr        = term (("+"|"-") term)*
term        = factor (("*"|"/") factor)*
factor      = NUMBER | cell_ref | func_call | "(" expr ")" | "-" factor
cell_ref    = COLUMN ROW          // A1, B3
range_ref   = cell_ref ":" cell_ref  // A1:B5
func_call   = FUNC_NAME "(" arg_list ")"
arg_list    = arg ("," arg)*
arg         = expr | range_ref | direction
direction   = "left" | "right" | "above" | "below"
COLUMN      = [A-Z] | "?"
ROW         = [0-9]+ | "?"
```

## Implementation Steps

| Step | Content | File |
|------|------|------|
| 1 | Formula tokenizer + parser (AST generation) | `src/document_core/table_calc/parser.rs` |
| 2 | Cell reference resolver (A1→row,col conversion, direction specifiers) | `src/document_core/table_calc/resolver.rs` |
| 3 | Evaluator (AST → numeric result) | `src/document_core/table_calc/evaluator.rs` |
| 4 | WASM API + hwpctl integration | `src/wasm_api.rs` + `rhwp-studio/src/hwpctl/` |
| 5 | Block calculation (batch calculation on selected range) | UI integration |

## Architecture

```
Formula string (e.g., "=SUM(A1:A5)+B3*2")
  │
  ▼
[Tokenizer] → Token stream
  │
  ▼
[Parser] → AST (Abstract Syntax Tree)
  │
  ▼
[Cell Reference Resolver] → Cell coordinates + value mapping
  │
  ▼
[Evaluator] → Numeric result
  │
  ▼
Write result to cell
```

## Cell Address Rules
- Column: A=column 1, B=column 2, ... Z=column 26 (max 26 columns)
- Row: 1=row 1, 2=row 2, ... (1-based)
- `?`: Wildcard (current cell's row or column)

## Test Plan
- Unit tests: Tokenizer, parser, evaluator individually
- Integration tests: Execute formulas in actual tables → verify results
- hwpctl-test: UI formula execution test cases
