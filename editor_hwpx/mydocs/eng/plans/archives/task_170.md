# Task 170: Character Shape Advanced Properties — Execution Plan

## Goal

Connect emphasis dots, underline shape, strikethrough shape, and kerning attributes from the character shape dialog (Alt+L) extended tab to the HWP backend for parsing, editing, and rendering.

## Current Status

| Feature | Model | Parser | JSON | UI | SVG Render | Status |
|---------|:-----:|:------:|:----:|:--:|:----------:|--------|
| 6 emphasis dot types | X | X | X | Present (unconnected) | X | Not implemented |
| Underline position (Bottom/Top) | O | O | O | O | O | Complete |
| Underline shape (11 types) | X | X | X | Present (unconnected) | X | Not implemented |
| Strikethrough (on/off) | O | O | O | O | O | Complete |
| Strikethrough shape (11 types) | X | X | X | Present (unconnected) | X | Not implemented |
| Kerning | X | X | X | Present (unconnected) | X | Not implemented |

## HWP Spec Reference (CharShape attr bits)

- bits 4-7: Underline shape (Table 27 line types)
- bits 21-24: Emphasis dot type (0=none, 1=filled circle, 2=open circle, 3=caron, 4=tilde, 5=dot, 6=colon)
- bits 26-29: Strikethrough shape (Table 27 line types)
- bit 30: Kerning

## Implementation Scope

1. **Rust model**: Add 4 fields to CharShape/CharShapeMods
2. **Parser/serializer**: Extract/record attr bits
3. **JSON integration**: build_char_properties_json, parse_char_shape_mods
4. **Frontend**: CharProperties type + extended tab backend connection
5. **Rendering**: SVG/Canvas emphasis dots + underline/strikethrough line shapes (dasharray, double line, triple line)

## Modified Target Files

| File | Change Description |
|------|-------------------|
| `src/model/style.rs` | 4 fields for CharShape + CharShapeMods |
| `src/parser/doc_info.rs` | parse_char_shape bit extraction |
| `src/serializer/doc_info.rs` | serialize_char_shape bit recording |
| `src/document_core/commands/formatting.rs` | JSON output 4 fields added |
| `src/document_core/helpers.rs` | JSON parsing 4 fields |
| `src/renderer/style_resolver.rs` | ResolvedCharStyle 4 fields |
| `src/renderer/mod.rs` | TextStyle 5 fields |
| `src/renderer/layout/text_measurement.rs` | resolved_to_text_style mapping |
| `src/renderer/svg.rs` | Emphasis dot rendering + draw_line_shape (11 types) |
| `src/renderer/web_canvas.rs` | Emphasis dot rendering + draw_line_shape_canvas |
| `src/renderer/html.rs` | CSS text-decoration-style extension |
| `rhwp-studio/src/core/types.ts` | CharProperties 4 fields |
| `rhwp-studio/src/ui/char-shape-dialog.ts` | Extended tab backend connection |

## Verification Methods

```bash
cargo test                                           # 615 pass
docker compose --env-file .env.docker run --rm wasm   # WASM build
cd rhwp-studio && npm run build                       # Frontend build
```
