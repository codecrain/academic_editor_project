# Task 79 Execution Plan: Show Transparent Table Borders

## Background

In HWP, when a table or text box border style is set to "None", the border is invisible during editing/printing. Hancom Office provides a `View - Show/Hide - Transparent Borders` feature that displays these transparent borders as **red dotted lines** to aid editing.

### Current Behavior

- `BorderLineType::None` borders are completely omitted from rendering
  - `merge_edge_slot()` (layout.rs:4637): None type skipped
  - `create_border_line_nodes()` (layout.rs:4796): returns empty vector
- rhwp-studio already has a "Transparent Borders" menu item but it is **not implemented**
  - `view:border-transparent` command: `canExecute: () => false`, `execute() { /* TODO */ }`
  - index.html: `<div class="md-item disabled">Transparent Borders</div>`

### Transparent Border Spec (per HWP Help)

| Item | Detail |
|------|--------|
| Target | Table/text box borders with style "None" (BorderLineType::None) |
| Display | **Red dotted line** (fixed, not user-changeable) |
| Control | View menu toggle (View - Show/Hide - Transparent Borders) |
| Printing | Not printed (editing screen only) |

### Reference Pattern: Paragraph Mark Toggle

| Item | Paragraph Marks | Transparent Borders (planned) |
|------|----------------|-------------------------------|
| WASM flag | `show_paragraph_marks: bool` | `show_transparent_borders: bool` |
| WASM method | `setShowParagraphMarks(enabled)` | `setShowTransparentBorders(enabled)` |
| Renderer pass | `renderer.show_paragraph_marks` | `renderer.show_transparent_borders` |
| Command ID | `view:para-mark` | `view:border-transparent` |

## Goal

1. Implement transparent border toggle feature (View menu → global toggle → rendering)
2. When toggle ON, render all `BorderLineType::None` borders as red dotted lines on all tables in page
3. When toggle OFF, maintain existing behavior (transparent borders hidden)

## Current Architecture (based on paragraph marks)

```
[rhwp-studio] view:para-mark command
    | services.wasm.setShowParagraphMarks(true)
[WASM API] HwpDocument.show_paragraph_marks = true
    | services.eventBus.emit('document-changed')
[Renderer] renderer.show_paragraph_marks = true
    | renderPageToCanvas() call
[Canvas renderer] Add paragraph mark symbol at paragraph end
```

## Implementation Strategy

Implement transparent borders through the same path:

```
[rhwp-studio] view:border-transparent command
    | services.wasm.setShowTransparentBorders(true)
[WASM API] HwpDocument.show_transparent_borders = true
    | services.eventBus.emit('document-changed')
[Layout engine] Changed handling of None type in create_border_line_nodes()
    | When show_transparent_borders = true
    | None borders → red dotted Line node creation (previously: empty vector returned)
[Canvas/SVG renderer] Normal rendering of red dotted Line nodes
```

### Key Point

- **Handled at layout engine level**: `create_border_line_nodes()` checks `show_transparent_borders` flag
- Convert None borders to red (#FF0000) dotted (Dot) 0.4px Line nodes
- `merge_edge_slot()`'s None skip logic also needs conditional handling (None exits edge grid)

## Scope

1. **WASM API**: Add `show_transparent_borders` flag + `setShowTransparentBorders()` method
2. **Layout engine**: Add transparent border → red dotted Line node generation logic
3. **rhwp-studio**: Implement `view:border-transparent` command and activate menu
4. **web/editor.js**: Add transparent border toggle button (same pattern as paragraph mark button)
5. Add regression tests and build verification

## Test Verification Plan

- Verify with sample HWP file containing tables with transparent borders
- Toggle ON: red dotted lines displayed, OFF: hidden confirmed
- Existing table rendering (styled borders) no regression
- All existing tests pass
