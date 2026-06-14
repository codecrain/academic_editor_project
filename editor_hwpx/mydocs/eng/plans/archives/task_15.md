# Task 15: Character Width Ratio (Ratio) Rendering

## Goal

Reflect the HWP document's character width ratio (ratio) attribute in SVG, Canvas, and HTML renderers.
The ratio is an attribute that shrinks/expands the horizontal width of characters, with 100% as default and a range of 50~200%.

## Current Status

| Item | Status | Notes |
|------|--------|-------|
| Parsing | Complete | `CharShape.ratios[7]` → `ResolvedCharStyle.ratio` (0.5~2.0) |
| TextStyle transfer | Not implemented | ratio missing in `resolved_to_text_style()` |
| SVG rendering | Not implemented | ratio not used in `draw_text()` |
| Canvas rendering | Not implemented | ratio not used in `draw_text()` |
| Width estimation | Not implemented | ratio not reflected in `estimate_text_width()` |

## Affected Files

| File | Change Description |
|------|-------------------|
| `src/renderer/mod.rs` | Add `ratio` field to `TextStyle` |
| `src/renderer/layout.rs` | Pass ratio in `resolved_to_text_style()`, reflect ratio in `estimate_text_width()` |
| `src/renderer/svg.rs` | Apply `transform="scale(ratio,1)"` in `draw_text()` |
| `src/renderer/web_canvas.rs` | Apply Canvas `scale(ratio, 1)` in `draw_text()` |
| `src/renderer/html.rs` | Apply CSS `transform: scaleX(ratio)` in `draw_text()` |

## Implementation Method

### Character Width Ratio Principle

The ratio scales only the horizontal direction of characters:
- `ratio = 1.0` (100%): No transformation
- `ratio = 0.8` (80%): Shrink to 80% width
- `ratio = 1.5` (150%): Expand to 150% width

### SVG Implementation
```xml
<!-- When ratio != 1.0 -->
<text transform="translate(x,y) scale(ratio,1)" x="0" y="0" ...>text</text>
```
Apply horizontal scaling after x-coordinate translation via `transform` attribute. Since scaling is relative to origin, translate is applied first.

### Canvas Implementation
```javascript
ctx.save();
ctx.translate(x, y);
ctx.scale(ratio, 1);
ctx.fillText(text, 0, 0);
ctx.restore();
```

### HTML Implementation
```html
<span style="transform: scaleX(ratio); transform-origin: left;">text</span>
```

### Width Estimation Reflection
```rust
// In estimate_text_width
let base_width = ... ;  // existing logic
base_width * ratio      // apply ratio
```

## Verification Methods

1. Pass all existing 229 tests
2. Compare 80% ratio document rendering (SVG vs Canvas)
3. Confirm identical results to existing output for 100% ratio documents
