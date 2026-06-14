# Task 200: Paragraph Marks — Space (∨) and Tab (→) Display

## Goal

Display paragraph mark symbols at space and tab character positions when paragraph marks display is enabled.

## Current State

### Completed Infrastructure
- `show_paragraph_marks` flag (HwpDocument, WASM API, 3 renderers)
- Hard return / forced line break symbol display (Task 199)
- Color #4A90D9 (blue)

### Unimplemented Items
- No ∨ symbol displayed at space character positions
- No → symbol displayed at tab character positions

## Hancom Standard

| Item | Symbol | Color | Display Condition |
|------|--------|-------|-------------------|
| Space | ∨ (downward chevron) | Blue #4A90D9 | Paragraph marks ON |
| Tab | → (right arrow) | Blue #4A90D9 | Paragraph marks ON |

## Implementation Approach

Space and tab symbols are handled at the **renderer stage**.
Scan for space/tab characters within TextRunNode text and overlay symbols at those positions.

### Rendering Position Calculation
- Space: x coordinate of each space character = run.bbox.x + (text width up to the space)
  - Symbol size approximately 40~50% of font size
  - Place ∨ at the center bottom of the space area
- Tab: Display → at the tab character start position

### Impact Scope

| File | Modification |
|------|-------------|
| `src/renderer/svg.rs` | Space/tab symbol SVG output |
| `src/renderer/html.rs` | Space/tab symbol HTML output |
| `src/renderer/web_canvas.rs` | Space/tab symbol Canvas output |

## Out of Scope

- Object marks ([Table], [Image], etc.) → Task 201
- Independent toggle for formatting marks/paragraph marks → follow-up task
- Tab leader (fill character) visualization → follow-up task

## References

- Hancom Help: `mydocs/manual/hwp/Help/extracted/view/control_code.htm`
- Space symbol image: `mydocs/manual/hwp/Help/extracted/images/3v_code(space).gif`
- Screenshot: `mydocs/manual/hwp/Help/extracted/images/3v_control_code_01.gif`
