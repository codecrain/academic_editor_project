# Task 32 - Stage 1 Completion Report

## Stage: Text Layout JSON Extension + Property Query API

## Changed Files

| File | Changes |
|------|---------|
| `src/renderer/render_tree.rs` | Added `char_shape_id: Option<u32>`, `para_shape_id: Option<u16>` fields to `TextRunNode` |
| `src/renderer/layout.rs` | Updated 9 TextRunNode creation sites with new fields (actual IDs for 2 edit sites, None for 7 non-edit sites) |
| `src/model/paragraph.rs` | Added `char_shape_id_at(char_offset)` method — UTF-16 position conversion then CharShapeRef lookup |
| `src/wasm_api.rs` | (1) JSON extension: underline, strikethrough, textColor, charShapeId, paraShapeId fields added |
| `src/wasm_api.rs` | (2) Property query APIs: `getCharPropertiesAt`, `getCellCharPropertiesAt`, `getParaPropertiesAt`, `getCellParaPropertiesAt` |
| `src/wasm_api.rs` | (3) `color_ref_to_css()` utility function (BGR → CSS hex conversion) |

## Implementation Details

### 1. TextRunNode Extension
- `char_shape_id`: Character shape ID (CharShape array index)
- `para_shape_id`: Paragraph shape ID (ParaShape array index)
- Only editable text runs get actual IDs; auxiliary text (footnote numbers, raw fallback) gets None

### 2. Text Layout JSON Extension
Additional fields in existing `getPageTextLayout` JSON:
```json
{
  "underline": false,
  "strikethrough": false,
  "textColor": "#000000",
  "charShapeId": 0,
  "paraShapeId": 0
}
```

### 3. Property Query APIs
- `getCharPropertiesAt(secIdx, paraIdx, charOffset)` → Character properties JSON
- `getCellCharPropertiesAt(secIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx, charOffset)` → Cell character properties
- `getParaPropertiesAt(secIdx, paraIdx)` → Paragraph properties JSON
- `getCellParaPropertiesAt(secIdx, parentParaIdx, controlIdx, cellIdx, cellParaIdx)` → Cell paragraph properties

### 4. Color Conversion
`color_ref_to_css()`: HWP BGR `0x00BBGGRR` → CSS hex `#rrggbb`

## Test Results
- 390 tests all passed
- Compile warnings: 2 existing (unused assignment, dead code) — unchanged
