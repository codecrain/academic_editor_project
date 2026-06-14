# Task 12: Auto Numbering (CTRL_AUTO_NUMBER)

## Overview

Implement rendering of HWP document auto numbering controls (`atno`) so that numbers are displayed in captions, footnotes, endnotes, etc.

---

## Current Status

### Parsing (Complete)
- `src/model/control.rs`: `AutoNumber`, `AutoNumberType` structs defined
- `src/parser/control.rs`: Parsing complete with `parse_auto_number()` function

### Rendering (Not Implemented)
- Currently `AutoNumber` controls are not rendered
- Captions show "Figure ", "Table " instead of "Figure 1", "Table 2"

---

## Implementation Scope

### Auto Number Types (AutoNumberType)
| Type | Description | Example |
|------|-------------|---------|
| Picture | Figure number | Figure 1, Figure 2 |
| Table | Table number | Table 1, Table 2 |
| Equation | Equation number | (1), (2) |
| Footnote | Footnote number | 1), 2) |
| Endnote | Endnote number | i, ii |
| Page | Page number | 1, 2, 3 |

---

## Implementation Approach

### 1. Number Counter Management
- Maintain counter per `AutoNumberType`
- Initialize counters at document rendering start
- Increment counter and return number when `AutoNumber` control found

### 2. Inline Rendering
- `AutoNumber` is an inline control within paragraphs (`ControlChar::Inline`)
- Insert number string at the corresponding position during text rendering

### 3. Number Format Support
- Arabic numerals (1, 2, 3)
- Roman numerals (i, ii, iii)
- English upper/lowercase (a, b, c / A, B, C)
- Korean/Chinese characters

---

## Key Files

| File | Role |
|------|------|
| `src/renderer/mod.rs` | Add AutoNumberCounter struct |
| `src/renderer/layout.rs` | Insert numbers during inline control rendering |
| `src/renderer/composer.rs` | Handle AutoNumber during paragraph composition |

---

## Expected Results

- Captions: "Figure 1 Web Hangul Gian Server Configuration", "Table 2 Supported Environments"
- Footnotes: superscript 1 in body, 1) in footnote area
- Equations: (1), (2), (3)

---

*Created: 2026-02-06*
