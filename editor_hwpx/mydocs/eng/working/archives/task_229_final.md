# Task 229 Completion Report: Field Control Parsing and Basic Rendering

## Implementation Summary

Implemented parsing of field controls (`%clk`, `%hlk`, etc.) from HWP binary files, and rendering ClickHere guide text in red italic style.

## Implementation Details

### Stage 1: Field Control Binary Parsing

- **`src/parser/tags.rs`**: Defined 15 field ctrl_id constants (`FIELD_CLICKHERE`, `FIELD_HYPERLINK`, etc.) and added `is_field_ctrl_id()` function
- **`src/parser/control.rs`**: Added field ctrl_id matching in `parse_control()`, implemented `parse_field_control()` (parsing properties 4B + extra_properties 1B + variable-length command + id 4B)
- **`src/model/control.rs`**: Extended `Field` struct with `properties`, `extra_properties`, `field_id`, `ctrl_id` fields, added `guide_text()` method

### Stage 2: Field Text Range Tracking and Rendering

- **`src/model/paragraph.rs`**: Added `FieldRange` struct (start_char_idx, end_char_idx, control_idx), added `field_ranges` field to `Paragraph`, handled field_ranges in insert/delete/split/merge operations
- **`src/parser/body_text.rs`**: Tracked 0x03 (FIELD_BEGIN) / 0x04 (FIELD_END) positions in `parse_para_text()` to generate `FieldRange`, used extended control index counter for controls[] mapping
- **`src/renderer/layout/paragraph_layout.rs`**: Inserted guide text TextRunNode in red italic when empty ClickHere field detected in `layout_composed_paragraph()`

### Stage 3: Serialization and Tests

- **`src/serializer/control.rs`**: Generated CTRL_HEADER records using `Control::Field` ctrl_id
- **`src/serializer/body_text.rs`**: Recorded field ctrl_id accurately during PARA_TEXT serialization
- **3 tests added**:
  - `test_task229_field_parsing`: Verified parsing of 6 ClickHere fields + range tracking
  - `test_task229_field_roundtrip`: Verified serialization → re-parsing round-trip
  - `test_task229_field_svg_guide_text`: Verified SVG guide text rendering (red, italic)

## Test Results

- All tests: 700 passed, 0 failed, 1 ignored (pre-existing ignored item)
- samples/field-01.hwp: 6 ClickHere fields parsed successfully, 0 Unknown fields

## Rendering Style

Based on Hancom word processor's layout code hidden mode:
- Guide text for empty ClickHere fields: **red (`#ff0000`) italic**
- Layout codes (`[ClickHere start/end]`) are hidden in viewer mode (togglable in future edit mode)

## Modified Files

| File | Changes |
|------|---------|
| `src/parser/tags.rs` | 15 field ctrl_id constants + `is_field_ctrl_id()` |
| `src/parser/control.rs` | `parse_field_control()`, `ctrl_id_to_field_type()` |
| `src/parser/body_text.rs` | Field range tracking (char_count based), `is_extended_only_ctrl_char()` |
| `src/model/control.rs` | `Field` extension, `guide_text()` method |
| `src/model/paragraph.rs` | `FieldRange` struct, `field_ranges` field, editing operation handling |
| `src/renderer/layout/paragraph_layout.rs` | ClickHere guide text TextRunNode insertion |
| `src/serializer/control.rs` | Field ctrl_id serialization |
| `src/serializer/body_text.rs` | Field ctrl_id PARA_TEXT serialization |
| `src/wasm_api/tests.rs` | 3 tests added |
