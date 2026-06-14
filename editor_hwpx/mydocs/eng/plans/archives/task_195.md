# Task 195 Execution Plan — Header/Footer Field Insertion and Template Features

## Goal

Implement field insertion (page number, total pages, filename) in header/footer editing mode, rendering with actual values at display time. Implement the core of Hancom's "Header/Footer Template" feature — field insertion and rendering.

## Current Status

| Item | Status |
|------|--------|
| PageNumberPos model | Complete (section-level page number position setting) |
| PageNumberPos rendering | Complete (`build_page_number`) |
| Header text insertion | Complete (plain text only) |
| Header field insertion | **Not implemented** |
| Field rendering | **Not implemented** |
| Header/footer template UI | **Not implemented** |

## Implementation Approach: Marker Characters

Insert Unicode Private Use Area markers in header/footer paragraph text, substitute with actual values during rendering.

| Marker | Meaning | Substitution Value |
|--------|---------|-------------------|
| `\u{0015}` | Current page number | `page_index + 1` (with format) |
| `\u{0016}` | Total pages | `total_pages` |
| `\u{0017}` | File name | Document filename |

## Implementation Steps

### Step 1: Field Marker Insertion + Rendering (Rust + WASM)
- Rust: `insert_field_in_hf_native()` — insert marker character into header paragraph
- Rendering: Substitute markers with actual values in `layout_header_footer_paragraphs`
- WASM: `insertFieldInHf` binding + TS wrapper

### Step 2: Toolbar UI + Template Commands
- Add [Page Number] button to header/footer toolbar
- `page:insert-field-pagenum`, `page:insert-field-totalpage`, `page:insert-field-filename` commands
- Add template list to header/footer creation menu

### Step 3: Verification + Multi-Page Testing
- Multi-page document (samples/p222.hwp) page-by-page number accuracy verification
- Page number formatting (Arabic, Roman numeral, etc.) — use `format_page_number` utility
- Total pages field accuracy verification

## Risk Factors

1. Marker character substitution changes character width → ComposedLine run reconstruction needed (1 char → N chars)
2. Total pages field only finalized after pagination complete → handled at rendering time
3. Filename field — DocumentCore needs filename info (possibly not stored currently)
