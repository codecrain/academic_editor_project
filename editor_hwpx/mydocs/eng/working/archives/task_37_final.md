# Task 37 Final Report: Clipboard Copy and Paste Functionality Implementation

## Overview

Implemented clipboard copy (Ctrl+C), cut (Ctrl+X), and paste (Ctrl+V) functionality for the HWP web editor. Supports internal format-preserving copy/paste, external app integration via browser Clipboard API, and HTML format-based rich text exchange.

## Implementation Stage Summary

### Stage 1: Internal Clipboard Infrastructure (WASM)

| Item | Details |
|------|---------|
| IR struct Clone support | Added `Clone` derive to 19 structs across 7 model files |
| ClipboardData struct | `paragraphs: Vec<Paragraph>`, `plain_text: String` |
| Native API (8) | has/get/clear_clipboard, copy_selection, copy_selection_in_cell, copy_control, paste_internal, paste_internal_in_cell |
| WASM bindings (8) | Corresponding JS bindings for each native API |
| Copy strategy | Single paragraph partial selection (split_at), multi-paragraph, control object copy |
| Paste strategy | Single paragraph text insertion (format-preserving), multi-paragraph/control split-merge |
| Tests | 5 new, 421 total passed |

### Stage 2: Plain Text Paste (JS)

| Item | Details |
|------|---------|
| Ctrl+C/V/X key bindings | editor.js keydown handler |
| handleCopyToInternal() | Object/body/cell selection → internal WASM clipboard |
| handlePaste() | Internal clipboard first → browser clipboard fallback |
| handleCut() | Copy + delete + re-render |
| Multi-paragraph selection support | Extended getSelectionDocRange() in text_selection.js |
| Tests | 421 passed, WASM build successful |

### Stage 3: Rich Text Copy — HTML Generation

| Item | Details |
|------|---------|
| Native API (3) | export_selection_html, export_selection_in_cell_html, export_control_html |
| WASM bindings (3) | Corresponding JS bindings for each native API |
| HTML generation helpers (7) | char_style_to_css, para_style_to_css, paragraph_to_html, get_char_style_ranges, table_to_html, picture_to_html, apply_border_fill_css |
| Utility functions (4) | utf16_pos_to_char_idx, clipboard_color_to_css, clipboard_escape_html, detect_clipboard_image_mime |
| ClipboardItem API | Simultaneous text/html + text/plain registration |
| Supported formats | Rich text (`<p><span>`), tables (`<table>`), images (`<img data:base64>`) |
| Tests | 3 new, 424 total passed |

### Stage 4: HTML Paste Parsing

| Item | Details |
|------|---------|
| Native API (2) | paste_html, paste_html_in_cell |
| WASM bindings (2) | pasteHtml, pasteHtmlInCell |
| HTML parser | Custom implementation without external crates, StartFragment/EndFragment support |
| Supported tags | `<p>`, `<span>`, `<b>/<strong>`, `<i>/<em>`, `<u>`, `<br>`, `<table>`, `<img>`, `<div>` |
| CSS → CharShape | font-family, font-size(pt→HWPUNIT), bold, italic, color(CSS→BGR), underline, strikethrough |
| CSS → ParaShape | text-align, line-height |
| Utility functions (10) | find_char, find_closing_tag, parse_inline_style, parse_css_value, parse_pt_value, css_color_to_hwp_bgr, decode_html_entities, html_strip_tags, html_to_plain_text, parse_html_attr_f64 |
| JS side | HTML-first path in handlePaste(), pasteFromHtml() added |
| Tests | 5 new, 429 total passed |

## Modified Files Summary

| File | Stage | Changes |
|------|-------|---------|
| `src/model/paragraph.rs` | 1 | Added Clone derive |
| `src/model/control.rs` | 1 | Added Clone derive |
| `src/model/table.rs` | 1 | Added Clone derive |
| `src/model/image.rs` | 1 | Added Clone derive |
| `src/model/shape.rs` | 1 | Added Clone derive |
| `src/model/header_footer.rs` | 1 | Added Clone derive |
| `src/model/footnote.rs` | 1 | Added Clone derive |
| `src/wasm_api.rs` | 1-4 | Clipboard buffer, 13 native APIs, 13 WASM bindings, HTML generation/parsing, style mapping, 14 utility functions, 13 tests |
| `web/editor.js` | 2-4 | Ctrl+C/V/X handlers, internal/external clipboard processing, HTML copy/paste |
| `web/text_selection.js` | 2-3 | Multi-paragraph selection, onCopy callback support |

## Clipboard Data Flow

### Copy (Ctrl+C)

```
Text selection:
  → handleCopyToInternal()     → WASM internal clipboard (format-preserving)
  → handleCopyToClipboard()    → ClipboardItem(text/html + text/plain) → browser clipboard

Control selection:
  → handleCopyToInternal()     → WASM internal clipboard
  → writeControlHtmlToClipboard() → ClipboardItem(text/html + text/plain) → browser clipboard
```

### Paste (Ctrl+V)

```
handlePaste()
  1. Delete selection range (if any)
  2. Check internal clipboard → pasteFromInternal() (perfect format preservation)
  3. Browser clipboard.read()
     → text/html present → pasteFromHtml() (CSS→HWP style conversion)
     → text/html absent → readText() → handleTextInsert() (plain text)
  4. clipboard.read() unsupported → readText() fallback
```

### Cut (Ctrl+X)

```
handleCut()
  → Copy (internal + HTML clipboard)
  → Delete selection range
  → Re-render
```

## Test Results

| Category | Test Count |
|----------|-----------|
| Existing tests | 416 |
| Stage 1 new | 5 |
| Stage 3 new | 3 |
| Stage 4 new | 5 |
| **Total** | **429 passed** |
| WASM build | Success |

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Custom HTML parser without external crates | no_std WASM environment compatibility, minimal dependencies |
| ClipboardItem API usage | Enables simultaneous text/html + text/plain registration, writeText fallback for unsupported browsers |
| CSS color → HWP BGR conversion | HWP internal format uses BGR byte order |
| CharShape/ParaShape reuse | Search for existing identical style first, create new only when absent, prevents DocInfo bloat |
| StartFragment/EndFragment support | Windows clipboard HTML format standard compliance |
| Internal clipboard priority policy | Perfect format/structure preservation for same-editor copy/paste |

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| navigator.clipboard.writeText() | O | O | O | O |
| navigator.clipboard.readText() | O | O | O | O |
| navigator.clipboard.write() (ClipboardItem) | O | 127+ | 13.1+ | O |
| navigator.clipboard.read() | O | 127+ | 13.1+ | O |

- HTTPS or localhost environment required (Secure Context)
- Unsupported browsers: writeText/readText fallback (plain text only)
