# Task 201: Formatting Marks — Object Markers [Table]/[Image]/[TextBox] Display

## Goal

Display red bracketed labels at object positions (tables, images, text boxes, equations, etc.) when formatting marks display is enabled.

## Hancom Standard

| Object | Formatting Mark | Color | Position |
|--------|----------------|-------|----------|
| Table | [Table] | Red | Top-left of object |
| Image | [Image] | Red | Top-left of object |
| TextBox | [TextBox] | Red | Top-left of object |
| Equation | [Equation] | Red | Top-left of object |
| Header | [Header] | Red | Header area |
| Footer | [Footer] | Red | Footer area |
| Footnote | [Footnote] | Red | Footnote area |

- Red: same size as body text character style
- Displayed when formatting marks ON, hidden when OFF

## Implementation Approach

### Flag
- Use existing `show_paragraph_marks` (Hancom: formatting marks ON → includes paragraph marks)
- Can be separated into a dedicated `show_control_codes` in the future

### Renderer Modifications (SVG/HTML/Canvas)
Overlay red label at top-left of each object RenderNodeType during rendering:
- `RenderNodeType::Table` → [Table]
- `RenderNodeType::Image` → [Image]
- `RenderNodeType::Shape` (TextBox) → [TextBox]
- `RenderNodeType::Shape` (other) → [Drawing]
- `RenderNodeType::Equation` → [Equation]

### Impact Scope

| File | Modification |
|------|-------------|
| `src/renderer/svg.rs` | Object formatting mark SVG output |
| `src/renderer/html.rs` | Object formatting mark HTML output |
| `src/renderer/web_canvas.rs` | Object formatting mark Canvas output |

## References
- Hancom Help: `mydocs/manual/hwp/Help/extracted/view/control_code.htm`
- Screenshot: `mydocs/manual/hwp/Help/extracted/images/3v_control_code_01.gif`
