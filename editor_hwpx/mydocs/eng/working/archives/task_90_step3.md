# Task 90 — Stage 3 Completion Report

## Stage Goal
borderFill improvements + font language mapping fix

## Completed Items

### 1. Font Language Group Mapping Fix (Key Fix)
- **Problem**: All fonts were added only to `font_faces[0]` (Korean)
- **Fix**: Tracked `lang` attribute of `<hh:fontface lang="...">` parent element
  - Tracked context with `current_font_group` variable in `parse_hwpx_header`
  - Separated `Event::Start` and `Event::Empty` to handle `fontface` Start event
  - Added `font_group: usize` parameter to `parse_font`
- **Mapping table**:
  - HANGUL -> `font_faces[0]`
  - LATIN -> `font_faces[1]`
  - HANJA -> `font_faces[2]`
  - JAPANESE -> `font_faces[3]`
  - OTHER -> `font_faces[4]`
  - SYMBOL -> `font_faces[5]`
  - USER -> `font_faces[6]`

### 2. borderFill Improvements

**Gradation color parsing**:
- `<hh:color value="#RRGGBB"/>` child elements -> added to `grad.colors` vector
- Previously only parsed gradation basic attributes (type, angle, center, blur), missing color list

**imgBrush parsing added**:
- `<hh:imgBrush>` -> ImageFill creation
  - `mode` -> ImageFillMode (11 types: TILE_ALL, CENTER, FIT_TO_SIZE, etc.)
  - `bright`, `contrast` parsing
- `<hh:img binaryItemIDRef="...">` -> ImageFill.bin_data_id

**slash (diagonal) parsing added**:
- `<hh:slash>` -> diagonal_type, width, color

### 3. Code Cleanup
- Removed unused imports (`attr_eq`, `skip_element`)

## Verification Results
- `docker compose run --rm test` �� **All 532 tests passed**

## Modified Files
| File | Changes |
|------|---------|
| `src/parser/hwpx/header.rs` | fontface lang tracking, borderFill gradation/imgBrush/slash, import cleanup |
