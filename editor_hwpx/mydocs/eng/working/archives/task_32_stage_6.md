# Task 32 - Stage 6 Completion Report

## Stage: Format Commands (JavaScript)

## Changed Files

| File | Changes |
|------|---------|
| `web/format_toolbar.js` | Full event listener implementation, callback-based format application, px↔pt↔HWPUNIT conversion |
| `web/editor.js` | handleApplyCharFormat/ParaFormat, Ctrl+B/I/U shortcuts, callback connections |

## Format Command Implementation

### Character Formatting (Requires Selection Range)

| Feature | Trigger | props_json |
|---------|---------|------------|
| Bold toggle | B button / Ctrl+B | `{"bold":true/false}` |
| Italic toggle | I button / Ctrl+I | `{"italic":true/false}` |
| Underline toggle | U button / Ctrl+U | `{"underline":true/false}` |
| Strikethrough toggle | S button | `{"strikethrough":true/false}` |
| Font size inc/dec | +/- buttons | `{"fontSize":N}` (HWPUNIT) |
| Font size direct input | Enter key | `{"fontSize":N}` (HWPUNIT) |
| Text color | color picker | `{"textColor":"#rrggbb"}` |
| Highlight color | color picker | `{"shadeColor":"#rrggbb"}` |

### Paragraph Formatting (Caret Position Based)

| Feature | Trigger | props_json |
|---------|---------|------------|
| Alignment (justify/left/center/right) | Alignment buttons | `{"alignment":"justify/left/center/right"}` |
| Line spacing | select change | `{"lineSpacing":N,"lineSpacingType":"Percent"}` |
| Indent | ⇨ button | `{"indent":N}` (HWPUNIT, +283/step) |
| Outdent | ⇦ button | `{"indent":N}` (HWPUNIT, -283/step) |

## Architecture

```
FormatToolbar                           editor.js
─────────────                          ──────────
Button click event                     handleApplyCharFormat(propsJson)
  → _applyChar(propsJson)               → getSelectionDocRange()
    → onApplyCharFormat(propsJson) ────→   → doc.applyCharFormat(...)
                                           → renderCurrentPage()
Alignment button click                     → caret restore
  → _applyPara(propsJson)
    → onApplyParaFormat(propsJson) ────→ handleApplyParaFormat(propsJson)
                                           → getDocumentPos()
Ctrl+B/I/U shortcut                        → doc.applyParaFormat(...)
  → formatToolbar.toggleBold() ────────→   → renderCurrentPage()
```

## Unit Conversion

| Conversion | Formula |
|-----------|---------|
| px → pt | `px * 72 / 96` |
| pt → HWPUNIT | `pt * 100` |
| HWPUNIT → px | `hwpunit * 96 / 7200` |

## Test Results
- WASM build successful
- **399 tests all passed**
