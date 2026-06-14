# Task 32: Format Toolbar Implementation - Execution Plan

## 1. Goal

Add a format toolbar identical to webhwp to rhwp editing mode.

### Feature Requirements

| Feature | Description |
|---------|-------------|
| Font name | Display font at current caret position, change via dropdown |
| Font size | Display in pt, change via dropdown/increment buttons |
| Bold/Italic/Underline/Strikethrough | Toggle buttons, reflect current state |
| Text color | Color indicator + palette popup |
| Highlight | Background color indicator + palette popup |
| Paragraph alignment | Left/Center/Right/Justify/Distribute (5 types) |
| Line spacing | Display current value + popup |
| Bullets/Numbering | Toggle buttons |
| Indent/Outdent | Buttons |
| Undo/Redo | Inactive display (separate task) |

### Attribute Reflection Requirements

- Real-time reflection of character/paragraph attributes at caret position in toolbar
- When text is selected, reflect common attributes of selection range (indeterminate when mixed)
- Same behavior inside table cells

## 2. Current State

### Already Implemented
- Text layout JSON includes fontFamily, fontSize, bold, italic
- Caret/selection system (text_selection.js)
- WASM text editing API (insertText, deleteText, etc.)

### Needs Implementation
- Add underline, strikethrough, textColor, alignment to text layout JSON
- CharShape/ParaShape modification Rust logic
- WASM format application API
- Format toolbar UI (HTML/CSS/JS)

## 3. Implementation Scope

### Included
- Full format toolbar UI
- Attribute query and real-time reflection
- Character format application (bold, italic, underline, strikethrough, font, size, color)
- Paragraph format application (alignment, line spacing, indent)

### Excluded (Separate Tasks)
- Undo/Redo system
- Bullets/numbering (UI shown only, functionality not implemented)
- Ruler

## 4. Technical Risks

| Risk | Mitigation |
|------|-----------|
| CharShapeRef splitting complexity | Verify edge cases with unit tests |
| Performance after format application reflow | Optimize to reflow only changed sections |
| New CharShape serialization when saving HWP | Existing serializer supports full doc_info rebuild |

## 5. Schedule

6-phase implementation, completion report and approval request after each phase
