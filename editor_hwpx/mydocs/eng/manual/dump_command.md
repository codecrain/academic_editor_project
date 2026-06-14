# rhwp dump Command Manual

## Overview

A debugging tool that outputs the typesetting control structure of an HWP document as text.
It displays detailed properties of all paragraphs, shapes, tables, headers/footers, and more.

## Usage

```bash
rhwp dump <file.hwp> [--section <number>] [--para <number>]
```

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--section <number>` | `-s` | Output only a specific section (0-based) |
| `--para <number>` | `-p` | Output only a specific paragraph (0-based) |

### Examples

```bash
# Full document dump
rhwp dump samples/basic/KTX.hwp

# Section 0 only
rhwp dump samples/basic/KTX.hwp --section 0

# Paragraph 0 only
rhwp dump samples/basic/KTX.hwp --para 0

# Section 0, paragraph 3 only
rhwp dump samples/basic/KTX.hwp -s 0 -p 3
```

## Output Format

### Section Header

```
=== Section 0 ===
  Paper: 210.0mm x 297.0mm (59528x84188 HU), Landscape
  Margins: left=8.0 right=8.0 top=5.0 bottom=5.0 mm
```

- Paper size: shown in both mm and HWPUNIT
- Paper orientation: Portrait/Landscape
- Margins: left/right/top/bottom in mm

### Paragraph Header

```
--- Paragraph 0.3 --- cc=17, text_len=0, controls=2 [ColumnBreak]
  Text: (empty paragraph)
```

| Field | Description |
|-------|-------------|
| `0.3` | section.paragraph number |
| `cc` | char_count (total characters including control characters) |
| `text_len` | actual text character count |
| `controls` | number of controls |
| `[ColumnBreak]` etc. | paragraph break type (if present) |

Break types:
- `[SectionBreak]` -- Section break
- `[MultiColumnBreak]` -- MultiColumn break (column count change)
- `[PageBreak]` -- Page break
- `[ColumnBreak]` -- Column break

### Control Output

#### ColumnDef

```
  [1] ColumnDef: 2 columns, type=Normal, gap=5.0mm(1417), equalWidth=false
  [1]   Column widths: [48.4mm, 2.1mm]
  [1]   Divider: type=1, width=3, color=0x00000000
```

#### Shape

```
  [3]   [Line] start=(0,79) end=(54356,0)
    Line: color=0x00787878, width=567, style=0x4a0000
    Size: 127.0mm x 0.0mm (36000x3 HU)
    Position: horiz=Paper offset=8.2mm(2331), vert=Paper offset=19.5mm(5532)
    Wrap: TopAndBottom, treatAsChar=false, z=65
    Element: orig=54356x79, curr=36000x3, scale=(0.662,0.038), offset=(0,0), eff=84.1mmx0.0mm
```

**Common shape properties:**

| Item | Description |
|------|-------------|
| Size | CommonObjAttr width x height (mm + HWPUNIT) |
| Position horiz | HorzRelTo (Paper/Page/Column/Para) + horizontal_offset |
| Position vert | VertRelTo (Paper/Page/Para) + vertical_offset |
| Wrap | TextWrap type |
| treatAsChar | treat_as_char (inline placement) |
| z | z-order |

**Shape element properties (only shown when scale/offset differ from defaults):**

| Item | Description |
|------|-------------|
| orig | ShapeComponentAttr original_width x original_height |
| curr | current_width x current_height |
| scale | render_sx, render_sy (rendering scale) |
| offset | render_tx, render_ty (rendering offset) |
| eff | curr x scale result (effective size, mm) |

**Transform properties (only shown when flip/rotation is present):**

```
    Transform: flip=(false,false), rotation=67
```

**Additional info by shape type:**

| Type | Additional Output |
|------|-------------------|
| Line | start/end coordinates, line color/width/style |
| Rectangle | corner radius, line properties, textbox text |
| Ellipse | (common properties only) |
| Arc | (common properties only) |
| Polygon | vertex count |
| Curve | control point count |
| Group | child count + recursive output |
| Picture | bin_data_id |

#### Table

```
  [0] Table: 3 rows x 11 cols, cells=28, pageBreak=None
```

#### Header/Footer

```
  [2] Footer: "Note: KTX travel times and fares..."
  [0] Header: "Title text"
```

#### Picture

```
  [0] Picture: bin_data_id=1
    Size: 50.0mm x 30.0mm (14173x8504 HU)
    Position: ...
```

#### Other Controls

```
  [0] SectionDef: paper 210.0x297.0mm, Landscape
  [0] AutoNumber: type=Footnote, number=1
  [0] Bookmark: "bookmark_name"
  [0] Hyperlink: "https://..."
  [0] Field: ClickHere "field_command"
  [0] Hide: header=true, footer=false, border=false, fill=false
```

## Position Reference

### Horizontal Position Reference (HorzRelTo)

| Value | Display | Description |
|-------|---------|-------------|
| Paper | Paper | Absolute coordinates from the left edge of the paper |
| Page | Page | Relative to the body area (excluding margins) |
| Column | Column | Relative to the current column area |
| Para | Para | Relative to the current paragraph |

### Vertical Position Reference (VertRelTo)

| Value | Display | Description |
|-------|---------|-------------|
| Paper | Paper | Absolute coordinates from the top edge of the paper |
| Page | Page | Relative to the body area (excluding margins) |
| Para | Para | Relative to the current paragraph |

### Text Wrap (TextWrap / TextFlowMethod)

The HWP binary format uses only 4 values (based on hwplib):

| Value | Display | HWP Binary | Description |
|-------|---------|------------|-------------|
| Square | FitWithText | 0 | Wrap text around a rectangular area |
| TopAndBottom | TakePlace | 1 | Place text only above/below the object |
| BehindText | BehindText | 2 | Place behind text |
| InFrontOfText | InFrontOfText | 3 | Place in front of text |

The HWPX format additionally uses Tight and Through values.

## Unit Conversion

| Conversion | Formula |
|------------|---------|
| HWPUNIT to mm | `hu x 25.4 / 7200` |
| mm to HWPUNIT | `mm x 7200 / 25.4` |
| HWPUNIT to px (96DPI) | `hu x 96 / 7200` |

Reference: 1 inch = 7200 HWPUNIT = 25.4mm = 96px (at 96DPI)

## Running in Docker

```bash
docker compose --env-file /dev/null run --rm dev cargo run -- dump samples/basic/KTX.hwp
```
