# Task 181 — Step 2 Completion Report: Tokenizer + Symbol Mapping + AST Parser

## Goal
Tokenize equation script strings and convert to AST (Abstract Syntax Tree)

## Completed Items

### 1. Tokenizer (`src/renderer/equation/tokenizer.rs`)
- `TokenType` enum: Command, Number, Symbol, Text, 6 bracket types, Subscript/Superscript, Whitespace, Quoted, Eof
- Multi-character symbols: `<=`, `>=`, `!=`, `==`, `<<`, `>>`, `<<<`, `>>>`, `->`
- Quoted string handling, non-ASCII continuous character (Hangul) integration
- 12 unit tests

### 2. Symbol Mapping (`src/renderer/equation/symbols.rs`)
- Direct Unicode mapping (for SVG rendering instead of LaTeX)
- Mapping tables: GREEK_LOWER(29), GREEK_UPPER(25), SPECIAL_SYMBOLS(30+), OPERATORS(60+), BIG_OPERATORS(35+), ARROWS(20+), BRACKETS(6), FUNCTIONS(25+)
- `DecoKind`(15 types), `FontStyleKind`(3 types) enums
- 7 unit tests

### 3. AST Node Definition (`src/renderer/equation/ast.rs`)
- `EqNode` enum: 21 variants (Row, Text, Number, Symbol, Fraction, Sqrt, Superscript, Subscript, BigOp, Matrix, Cases, Paren, Decoration, etc.)
- `simplify()` method: Row nesting removal

### 4. Recursive Descent Parser (`src/renderer/equation/parser.rs`)
- Case-insensitive command comparison (`cmd_eq()`) per spec
- Top-level OVER fraction detection
- Major parsing: fractions, sqrt, big operators, limits, matrices, cases, piles, auto-sizing brackets, color, decorations
- 14 unit tests

## Tests
- **648 passed** (existing 615 + new 33)
