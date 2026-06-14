# Task 24: Text Input Handling Inside Tables — Execution Plan

## 1. Overview

Currently, text input (B-303) only works in body paragraphs. Hit-testing, caret placement, and text input/deletion are not supported for paragraphs inside table cells. This task enables the same editing functionality inside table cells as in the body.

## 2. Current State Analysis

### Working Features
- Body paragraph text input/deletion (`insert_text`, `delete_text`)
- Body paragraph hit-testing and caret positioning
- Table rendering (cell backgrounds, borders, text display within cells)
- Paragraph reflow and split/merge

### Unsupported Features (Scope of This Task)
- Hit-testing on table cell click → identify paragraph/character position within cell
- Caret display and navigation within cells
- Text input/deletion within cells
- Tab key navigation between cells

## 3. Key Challenges

### 3.1 Text Layout Data Extension
- `getPageTextLayout()` currently returns runs for body paragraphs only
- Needs extension to include runs for paragraphs inside table cells
- Add cell identification info to each run (tableIdx, cellIdx, or controlIndex)

### 3.2 WASM API Extension
- Extend `insert_text`, `delete_text`, etc. to operate on paragraphs inside cells
- Paragraph path: section → paragraph (table control owner) → control (Table) → cell → cell paragraph

### 3.3 Editor JS Integration
- Include cell information in hit-test results
- Manage caret position using cell-internal coordinates
- Dispatch keyboard events (input/deletion/arrow keys) with cell context

## 4. Impact Scope

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | Add or extend insert/delete API for cell-internal paragraphs |
| `src/renderer/layout.rs` | Generate text layout run data within cells |
| `web/editor.js` | Dispatch keyboard events with cell context |
| `web/text_selection.js` | Cell support for hit-testing, caret, and selection area |

## 5. Excluded Scope

- Paragraph split/merge within cells (creating new paragraphs with Enter key)
- Automatic cell size adjustment (cell height change with text growth)
- Table structure editing (add/delete rows/columns)
