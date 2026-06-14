# Task 170: Character Shape Advanced Properties — Implementation Plan

## Implementation Steps (3 Steps)

### Step 1: Rust Model + Parser + Serializer

**`src/model/style.rs`** — Add 4 fields to CharShape:
- `emphasis_dot: u8` (0~6, emphasis dot type)
- `underline_shape: u8` (0~10, Table 27 line types)
- `strike_shape: u8` (0~10, Table 27 line types)
- `kerning: bool`

Add same 4 Option fields to CharShapeMods + apply_to() implementation.
Add 4-field comparison to PartialEq.

**`src/parser/doc_info.rs`** — Bit extraction in parse_char_shape:
```rust
let underline_shape = ((attr >> 4) & 0x0F) as u8;    // bits 4-7
let emphasis_dot = ((attr >> 21) & 0x0F) as u8;      // bits 21-24
let strike_shape = ((attr >> 26) & 0x0F) as u8;      // bits 26-29
let kerning = (attr & (1 << 30)) != 0;                // bit 30
```

**`src/serializer/doc_info.rs`** — Reverse bit recording in serialize_char_shape.

### Step 2: JSON Integration + Frontend Connection

**`src/document_core/commands/formatting.rs`** — build_char_properties_json:
- Add `emphasisDot`, `underlineShape`, `strikeShape`, `kerning` 4 fields

**`src/document_core/helpers.rs`** — parse_char_shape_mods:
- Parse `emphasisDot` (u8), `underlineShape` (u8), `strikeShape` (u8), `kerning` (bool) from JSON

**`rhwp-studio/src/core/types.ts`** — Add 4 fields to CharProperties interface

**`rhwp-studio/src/ui/char-shape-dialog.ts`**:
- Emphasis dot select: string values → numeric values (0~6), 6 options
- Underline shape select: string values → numeric values (0~10), 11 options
- Strikethrough shape select: string values → numeric values (0~10), 11 options
- Kerning checkbox: private field reference + show()/collectMods() connection
- show(): Initialize from backend values (remove TODOs)
- collectMods(): Include changed values in mods

### Step 3: Rendering

**ResolvedCharStyle** (`style_resolver.rs`): Add 4 fields
**TextStyle** (`mod.rs`): Add 5 fields (emphasis_dot, underline_shape, strike_shape, underline_color, strike_color)
**resolved_to_text_style** (`text_measurement.rs`): Map new fields

**SVG renderer** (`svg.rs`):
- `draw_line_shape()` helper: SVG output per line shape
  - 0=solid (no stroke-dasharray), 1=long dash ("8 4"), 2=dot ("2 2"), 3=dash-dot ("8 4 2 4")
  - 4=dash-dot-dot ("8 4 2 4 2 4"), 5=long wave ("12 4"), 6=round dot ("1 3" + round linecap)
  - 7=double line (2 lines), 8=thin+thick (2 lines), 9=thick+thin (2 lines), 10=triple line (3 lines)
- Underline: underline_color priority, call draw_line_shape
- Strikethrough: strike_color priority, call draw_line_shape
- Emphasis dots: place type-specific unicode character above character center (30% size)

**Canvas renderer** (`web_canvas.rs`):
- `draw_line_shape_canvas()` + `draw_single_canvas_line()`: Same implementation with Canvas API
- Express dash patterns with set_line_dash()
- Emphasis dots: place characters with fill_text()

**HTML renderer** (`html.rs`):
- Basic CSS text-decoration-style mapping (solid/dashed/dotted/double/wavy)

## Verification

| Scenario | Expected Result |
|----------|----------------|
| SVG export of HWP file with emphasis dots | Show filled/open circles etc. above characters |
| Set emphasis dot in char shape dialog | emphasisDot value saved, rendering reflected |
| Set underline shape to "dotted" | Dotted pattern underline rendered |
| Set strikethrough shape to "double" | Double strikethrough rendered |
| Move cursor to emphasis dot text | Dialog shows emphasis dot type |
| Save HWP and open in Hancom | Emphasis dot/underline shape/strikethrough shape display correctly |
