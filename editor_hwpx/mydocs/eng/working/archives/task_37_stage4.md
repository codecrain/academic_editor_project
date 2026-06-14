# Task 37 - Step 4 Completion Report: HTML Paste Parsing

## Implementation Details

### 1. WASM Side -- HTML Paste API (2 native + 2 WASM bindings)

| Native Method | WASM Binding | Description |
|---------------|-------------|-------------|
| `paste_html_native()` | `pasteHtml` | Insert HTML at body caret position |
| `paste_html_in_cell_native()` | `pasteHtmlInCell` | Insert HTML at cell-internal caret position |

### 2. HTML Parser (`parse_html_to_paragraphs`)

Minimal HTML parser implemented directly without external crates:

#### Supported Tags

| Tag | Handling |
|-----|----------|
| `<p>` | Creates paragraph, generates ParaShape from `style` attribute |
| `<span>` | Inline style -> CharShape generation, text segment separation |
| `<b>`, `<strong>` | Bold inheritance flag |
| `<i>`, `<em>` | Italic inheritance flag |
| `<u>` | Underline inheritance flag |
| `<br>` | Paragraph separator |
| `<table>` | Row/column parsing -> tab-separated text (1 paragraph per row) |
| `<img>` | base64 data URI -> BinData + Picture Control generation |
| `<div>` | Recursive parsing of inner content |
| `<!--StartFragment-->` / `<!--EndFragment-->` | Clipboard region extraction |

#### Parsing Strategy

```
HTML input
  -> Extract StartFragment/EndFragment region (or body or entire content if absent)
  -> Traverse top-level tags
    -> <p>: Create paragraph + parse inline content
    -> <table>: Extract rows/columns -> text paragraphs
    -> <img>: base64 decode -> BinData + Picture
    -> <div>: Recursive parsing
    -> Remaining text: Split paragraphs by line breaks
  -> Plain text fallback if result is empty
```

### 3. CSS -> HWP Style Mapping

#### CharShape Mapping (`css_to_char_shape_id`)

| CSS Property | HWP CharShape Field | Conversion |
|-------------|---------------------|------------|
| `font-family` | `font_ids[0..7]` | Font name -> ID lookup in DocInfo.font_faces |
| `font-size` | `base_size` | pt -> HWPUNIT (1pt = 100) |
| `font-weight:bold` / `700` | `bold` | boolean |
| `font-style:italic` | `italic` | boolean |
| `color` | `text_color` | CSS hex/rgb -> HWP BGR |
| `text-decoration:underline` | `underline_type` | -> `UnderlineType::Bottom` |
| `text-decoration:line-through` | `strikethrough` | boolean |

- Reuses existing CharShape if identical, creates new one otherwise
- Modifies a clone of the default CharShape (ID 0)

#### ParaShape Mapping (`css_to_para_shape_id`)

| CSS Property | HWP ParaShape Field | Conversion |
|-------------|---------------------|------------|
| `text-align` | `alignment` | left/right/center/justify |
| `line-height` | `line_spacing` + `line_spacing_type` | % -> Percent, px -> Fixed |

### 4. JS Side -- Paste Path Changes

#### handlePaste() Flow (Changed)

```
handlePaste()
  -> Delete selection range (existing)
  -> Check internal clipboard (existing)
  -> Read browser clipboard (changed)
    -> navigator.clipboard.read()
      -> Check text/html format -> pasteFromHtml(html)
      -> If absent, readText() -> handleTextInsert(text)
    -> clipboard.read() not supported fallback to readText()
```

#### New Function

| Function | Description |
|----------|-------------|
| `pasteFromHtml(html)` | HTML -> WASM `pasteHtml()`/`pasteHtmlInCell()` call, re-render + caret restore |

- Auto-detects cell-internal/body (`_hasCellCtx`)
- Plain text fallback on WASM call failure (`html.replace(/<[^>]*>/g, '')`)

### 5. Utility Functions (Rust)

| Function | Description |
|----------|-------------|
| `find_char()` | Character search in char array |
| `find_closing_tag()` | Find closing tag position considering nesting |
| `parse_inline_style()` | Extract style attribute from HTML tag |
| `parse_css_value()` | Extract CSS property value |
| `parse_pt_value()` | Parse pt/px/em values |
| `css_color_to_hwp_bgr()` | CSS hex/rgb/names -> HWP BGR |
| `decode_html_entities()` | HTML entity decoding |
| `html_strip_tags()` | Remove HTML tags |
| `html_to_plain_text()` | HTML -> plain text |
| `parse_html_attr_f64()` | Extract numeric value from HTML attribute |

### 6. Color Conversion Support

| Input Format | Example | Supported |
|-------------|---------|-----------|
| CSS hex (6 digits) | `#ff0000` | O |
| CSS hex (3 digits) | `#f00` | O |
| CSS rgb() | `rgb(255, 0, 0)` | O |
| Color names | `black`, `white`, `red`, `green`, `blue`, `yellow` | O |

## Test Results

- Existing tests: 424 passed
- New HTML paste tests: 5 passed
- **Total 429 tests passed**
- WASM build: Success

### New Test Items

| Test | Verified Content |
|------|-----------------|
| `test_paste_html_plain_text` | `<p>` tag HTML paste, confirms insertion into existing text |
| `test_paste_html_styled_text` | Bold+color styled HTML, confirms CharShape creation |
| `test_paste_html_multi_paragraph` | Multiple `<p>` tags -> multiple paragraph creation confirmed |
| `test_paste_html_table_as_text` | `<table>` HTML -> text conversion insertion confirmed |
| `test_html_utility_functions` | Utility function unit tests (entity decoding, tag removal, CSS parsing, color conversion) |

## Modified Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | 2 WASM bindings, 2 native APIs, HTML parser, CSS->style mapping, 10 utility functions, 5 tests |
| `web/editor.js` | `handlePaste()` HTML-first path, `pasteFromHtml()` function added |
