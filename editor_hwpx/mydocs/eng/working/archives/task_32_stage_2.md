# Task 32 - Stage 2 Completion Report

## Stage: CharShape/ParaShape Modification Logic

## Changed Files

| File | Changes |
|------|---------|
| `src/model/style.rs` | Added `PartialEq` derive to CharShape/ParaShape; `CharShapeMods`, `ParaShapeMods` structs + `apply_to()` methods |
| `src/model/paragraph.rs` | `apply_char_shape_range()` method — CharShapeRef range split/replace algorithm |
| `src/model/document.rs` | `find_or_create_char_shape()`, `find_or_create_para_shape()` — style deduplication |

## Implementation Details

### 1. CharShapeMods / ParaShapeMods (style.rs)
- `Option<T>` pattern to specify only properties to change (None preserves existing value)
- `apply_to(&self, base: &CharShape) -> CharShape` — overlays modifications on existing style
- CharShapeMods: bold, italic, underline, strikethrough, font_id, base_size, text_color, shade_color
- ParaShapeMods: alignment, line_spacing, line_spacing_type, indent

### 2. apply_char_shape_range() (paragraph.rs)
- Applies new char_shape_id to `[start_char_offset, end_char_offset)` range
- UTF-8 char offset → UTF-16 position conversion
- Handles overlapping CharShapeRef in 3 cases:
  - **Left partial overlap**: Keep existing ref + insert new ref
  - **Full overlap**: Replace with new ref
  - **Right partial overlap**: Insert new ref + restore existing ref
- Prevents unnecessary restore ref beyond text end (`utf16_end < text_utf16_len` guard)
- Auto-merges consecutive identical IDs

### 3. find_or_create_char_shape / para_shape (document.rs)
- Clones existing style → applies modifications → searches existing array via PartialEq
- Returns existing ID if identical style already exists (deduplication)
- If not found, adds new entry and invalidates raw_stream (triggers re-serialization)

## Added Tests (9)

| Test | Content |
|------|---------|
| `test_char_shape_id_at` | CharShape ID query by position |
| `test_apply_char_shape_range_full` | Full range application |
| `test_apply_char_shape_range_left_partial` | Left partial change |
| `test_apply_char_shape_range_right_partial` | Right partial change |
| `test_apply_char_shape_range_middle` | Middle partial change |
| `test_apply_char_shape_range_multi_segment` | Spanning multiple segments |
| `test_apply_char_shape_range_merge_same_id` | Same ID merge |
| `test_find_or_create_char_shape_reuse` | CharShape deduplication |
| `test_find_or_create_para_shape_reuse` | ParaShape deduplication |

## Test Results
- **399 tests all passed** (390 existing + 9 new)
