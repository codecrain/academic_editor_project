# Picture Save Hancom Compatibility Issues

## Symptoms

When opening an HWP file saved by our editor with an inserted picture in Hancom Word Processor:
1. File corruption message displayed
2. Image not shown (even the [Image] text is missing in layout marks)
3. Image displayed at an abnormally large size (425.20%)

## Root Cause Analysis

### 1. Missing `prevent_page_break` Field in CommonObjAttr

When serializing CTRL_HEADER, the `prevent_page_break` (INT32, 4 bytes) field was omitted,
shifting all subsequent fields (object description length + data) by 4 bytes -> file structure corruption.

**Fix**: Added `prevent_page_break` write to `serialize_common_obj_attr()`,
added read to `parse_common_obj_attr()`.

### 2. Incorrect `ctrl_id` Value in SHAPE_COMPONENT

In the SHAPE_COMPONENT record, the picture's ctrl_id was written as `"gso "` (0x67736F20).
Hancom files use `"$pic"` (0x24706963).

**Fix**: Use `tags::SHAPE_PICTURE_ID` (`$pic`) in `serialize_picture_control()`.
Also set `local_file_version` to 1.

### 3. Missing Rendering Matrix in SHAPE_COMPONENT

The rendering matrix was serialized as `cnt=0 + 48 bytes zeros` (100 bytes).
Hancom files use `cnt=1 + translation/scale/rotation matrix 3 sets` (196 bytes).

**Fix**: When `raw_rendering` is empty, generate identity translation + scale(cur/orig) +
identity rotation matrices.

### 4. Missing `border_x/border_y`, `crop`, `extra` in SHAPE_COMPONENT_PICTURE

- `border_x/border_y`: All 4 vertex coordinates set to 0
- `crop`: Image source range incorrectly set to display size
- Serialization missing extra 9 bytes (border_opacity + instance_id + image_effect)

**Fix**:
- border: `bx = [0, 0, width, 0]`, `by = [width, height, 0, height]`
- crop: Image source pixel size x 75 (HWPUNIT/pixel at 96DPI)
- extra: Generate 9-byte defaults when `raw_picture_extra` is empty

### 5. Default PARA_LINE_SEG Values Preventing Image Display

The picture paragraph's PARA_LINE_SEG was set to text defaults (line_height=1000, text_height=1000),
so Hancom could not reserve the image area.

**Fix**:
- `line_height = height` (image height in HWPUNIT)
- `text_height = height`
- `baseline_distance = height x 850 / 1000`
- `segment_width = content_width` (page content area width)
- `tag = 0x00060000` (standard LineSeg tag)

**Note**: The `segment_width` (offset 28) and `tag` (offset 32) fields are easily confused.
LineSeg is 9 fields x 4 bytes = 36 bytes/segment.

### 6. Missing Size Reference Bits in CommonObjAttr `attr`

Bits `15-17` (object width reference) and `18-19` (height reference) of the `attr` field were set to 0 (paper),
causing Hancom to interpret width/height values as percentages relative to paper size.

- 42520 HWPUNIT -> 425.20% (relative to paper)
- 22238 HWPUNIT -> 222.38% (relative to paper)

**HWP Spec (Table 72, CommonObjAttr Attributes)**:
```
bit 15-17: Object width reference
  0=paper, 1=page, 2=column, 3=para, 4=absolute

bit 18-19: Object height reference
  0=paper, 1=page, 2=absolute
```

**Fix**: Added `(4 << 15) | (2 << 18)` to attr -> width=absolute, height=absolute.
Final attr: `0x000A0211` (was `0x00000211`).

### 7. Unhandled JSON Escapes in `extract_str`

When object descriptions contain line breaks (\n), JSON escapes were stored as-is.
`"Picture.\nSave test"` -> literal `\n` was stored.

**Fix**: Changed `extract_str` return type from `Option<&str>` to `Option<String>`,
added decoding logic for `\n`, `\r`, `\t`, `\\`, `\"`.

## Binary Comparison Method

```python
import olefile, zlib, struct

ole = olefile.OleFileIO('file.hwp')
section = ole.openstream('BodyText/Section0').read()
data = zlib.decompress(section, -15)
# Parse records and compare field by field
```

Note: PARA_LINE_SEG is 36 bytes/segment (easy to mistake for 32 bytes):
```
offset 0:  text_start (u32)
offset 4:  vertical_pos (i32)
offset 8:  line_height (i32)
offset 12: text_height (i32)
offset 16: baseline_distance (i32)
offset 20: line_spacing (i32)
offset 24: column_start (i32)
offset 28: segment_width (i32)  <- offset 28
offset 32: tag (u32)            <- offset 32
```

## Affected Scope

- `src/wasm_api.rs`: insert_picture_native, extract_str, setPictureProperties
- `src/serializer/control.rs`: serialize_common_obj_attr, serialize_shape_component, serialize_picture_data, serialize_picture_control
- `src/parser/control.rs`: parse_common_obj_attr
- `src/model/shape.rs`: Added prevent_page_break field to CommonObjAttr
- `src/parser/tags.rs`: Added SHAPE_PICTURE_ID constant
- `src/serializer/byte_writer.rs`: Added write_f64

## Lessons Learned

1. In the HWP binary format, omitting even a single field shifts all subsequent data offsets, causing file corruption
2. Hancom interprets width/height completely differently depending on the size reference bits in `attr`
3. Byte-by-byte comparison between Hancom-generated normal files and our files is essential
4. Watch out for confusion between PARA_LINE_SEG's `segment_width` (offset 28) and `tag` (offset 32)
