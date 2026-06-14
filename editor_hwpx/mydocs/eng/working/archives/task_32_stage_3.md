# Task 32 - Stage 3 Completion Report

## Stage: WASM Format Application API

## Changed Files

| File | Changes |
|------|---------|
| `src/wasm_api.rs` | 4 WASM APIs + 4 native methods + JSON parsing helpers + rebuild_section + css_color_to_bgr |

## Added WASM APIs

| API | Description |
|-----|-------------|
| `applyCharFormat(sec, para, start, end, propsJson)` | Apply character formatting to body paragraph |
| `applyCharFormatInCell(sec, parentPara, ctrl, cell, cellPara, start, end, propsJson)` | Apply character formatting in cell |
| `applyParaFormat(sec, para, propsJson)` | Apply paragraph formatting to body paragraph |
| `applyParaFormatInCell(sec, parentPara, ctrl, cell, cellPara, propsJson)` | Apply paragraph formatting in cell |

## Implementation Details

### props_json Format (Character Formatting)
```json
{"bold":true}
{"italic":true,"underline":false}
{"fontSize":2400,"textColor":"#ff0000"}
{"fontId":5}
```

### props_json Format (Paragraph Formatting)
```json
{"alignment":"center"}
{"lineSpacing":200,"lineSpacingType":"Percent"}
{"indent":1000}
```

### Processing Flow
1. Parse `props_json` → `CharShapeMods` / `ParaShapeMods`
2. Query existing style ID of target paragraph
3. `find_or_create_char_shape(base_id, mods)` → new ID (deduplicated)
4. `apply_char_shape_range(start, end, new_id)` (character) or `para_shape_id = new_id` (paragraph)
5. `rebuild_section()` → style re-resolution + re-composition + re-pagination
6. Return `{"ok":true}`

### Utility Functions
- `parse_char_shape_mods(json)` — JSON → CharShapeMods
- `parse_para_shape_mods(json)` — JSON → ParaShapeMods
- `json_bool/json_i32/json_u16/json_str/json_color` — Simple JSON value parsers
- `css_color_to_bgr(css)` — CSS hex (#rrggbb) → HWP BGR (0x00BBGGRR)
- `rebuild_section(idx)` — resolve_styles + compose_section + paginate

## Test Results
- **399 tests all passed**
