# Task 37 - Step 3 Completion Report: Rich Text Copy -- HTML Generation

## Implementation Details

### 1. WASM Side -- HTML Generation API (3 native + 3 WASM bindings)

| Native Method | WASM Binding | Description |
|---------------|-------------|-------------|
| `export_selection_html_native()` | `exportSelectionHtml` | Body selection -> HTML |
| `export_selection_in_cell_html_native()` | `exportSelectionInCellHtml` | Cell-internal selection -> HTML |
| `export_control_html_native()` | `exportControlHtml` | Control object (table/image) -> HTML |

### 2. HTML Generation Structure

Generated HTML format:

```html
<html><body>
<!--StartFragment-->
<p style="margin:0;text-align:justify;line-height:160%;">
<span style="font-family:'HCR Dotum','Arial';font-size:10.0pt;color:#000000;">text</span>
<span style="font-family:'HCR Dotum','Arial';font-size:10.0pt;font-weight:bold;color:#ff0000;">bold text</span>
</p>
<!--EndFragment-->
</body></html>
```

### 3. Style Conversion Helper Methods

| Method | Action |
|--------|--------|
| `char_style_to_css()` | `ResolvedCharStyle` -> CSS (font-family, font-size(pt), bold, italic, color, underline, strikethrough, letter-spacing) |
| `para_style_to_css()` | `ResolvedParaStyle` -> CSS (text-align, margin-left/right, text-indent, line-height) |
| `paragraph_to_html()` | Paragraph -> `<p><span>...</span></p>`, `<span>` split at CharShapeRef boundaries |
| `get_char_style_ranges()` | Converts CharShapeRef UTF-16 positions to char indices, returns range list |
| `table_to_html()` | Table -> `<table>` structure (rows/columns/merging/cell background/border/internal paragraphs) |
| `picture_to_html()` | Picture -> `<img src="data:...;base64,...">` (base64 encoded image) |
| `apply_border_fill_css()` | BorderFill -> CSS border/background-color |

### 4. JS Side -- Clipboard Event Flow Changes

#### Ctrl+C Flow (Changed)

```
[Text selection]
editor.js keydown -> handleCopyToInternal() [internal clipboard]
text_selection.js keydown -> onCopy callback -> handleCopyToClipboard()
  -> doc.exportSelectionHtml() -> ClipboardItem(text/html + text/plain)

[Control object selection]
editor.js keydown -> handleCopyToInternal() + writeControlHtmlToClipboard()
  -> doc.exportControlHtml() -> ClipboardItem(text/html + text/plain)
```

#### text_selection.js Changes

- `_onKeyDown()` Ctrl+C: Delegates to `onCopy` callback when set (editor.js handles HTML+text)
- Maintains existing behavior when callback not set (plain text only)

#### editor.js New Functions

| Function | Description |
|----------|-------------|
| `handleCopyToClipboard(e)` | Registers HTML+text simultaneously for text selection (ClipboardItem API) |
| `writeControlHtmlToClipboard()` | Registers control object HTML to clipboard |

#### handleCut() Changes

- Before: `navigator.clipboard.writeText(text)` (plain text only)
- After: `doc.exportSelectionHtml()` -> `ClipboardItem(text/html + text/plain)` (HTML+text)

### 5. ClipboardItem API Usage

```javascript
const item = new ClipboardItem({
    'text/html': new Blob([htmlStr], { type: 'text/html' }),
    'text/plain': new Blob([plainText], { type: 'text/plain' }),
});
await navigator.clipboard.write([item]);
```

- Browsers without `ClipboardItem` support: `navigator.clipboard.writeText()` fallback
- HTTPS environment required (Clipboard API security requirement)

### 6. Utility Functions (wasm_api.rs)

| Function | Description |
|----------|-------------|
| `utf16_pos_to_char_idx()` | UTF-16 code unit position -> char index conversion |
| `clipboard_color_to_css()` | COLORREF (BGR) -> CSS `#rrggbb` |
| `clipboard_escape_html()` | HTML special character escaping |
| `detect_clipboard_image_mime()` | Image binary -> MIME type detection |

## Test Results

- Existing tests: 421 passed
- New HTML generation tests: 3 passed
- **Total 424 tests passed**
- WASM build: Success

### New Test Items

| Test | Verified Content |
|------|-----------------|
| `test_export_selection_html_basic` | Single paragraph HTML generation, paragraph style CSS (text-align:center), basic structure (StartFragment/EndFragment) |
| `test_export_selection_html_partial` | Partial selection HTML generation, confirms only selected range included |
| `test_export_control_html_table` | Table control HTML generation (`<table>`, `<tr>`, `<td>` structure) |

## Modified Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | 3 HTML generation native APIs, 3 WASM bindings, 7 helper methods, 4 utility functions, 3 tests |
| `web/editor.js` | Added `handleCopyToClipboard()`, `writeControlHtmlToClipboard()`, `handleCut()` HTML support, `onCopy` callback setup |
| `web/text_selection.js` | Added Ctrl+C `onCopy` callback support |
