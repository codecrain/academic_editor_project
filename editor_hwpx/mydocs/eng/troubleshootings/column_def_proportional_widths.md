# HWP 5.0 Column Definition (cold) Proportional Width/Gap Encoding

## Symptoms

When rendering 2-column layout (same_width=false) in KTX.hwp, the right column's content was pushed to the right as if padded from the left edge. In the HWP program, the right column's content starts directly at the column's left position.

## Cause

### Primary Cause: Parser Byte Order Error

The HWP 5.0 spec (Table 140) and the hwplib Java library describe different binary formats:

**HWP 5.0 Spec (Table 140)**:
```
[attr(2)] [spacing(2)] [widths... 2xcnt] [attr2(2)] [separator(6)]
```
- spacing is always present
- Only widths, no gaps

**hwplib Java Library** (ForControlColumnDefine.java):
```
same_width=false: [attr(2)] [attr2(2)] [col0_width(2) col0_gap(2)] [col1_width(2) col1_gap(2)] ... [separator(6)]
same_width=true:  [attr(2)] [gap(2)] [attr2(2)] [separator(6)]
```
- attr2/spacing position differs based on same_width
- Stored as width + gap pairs

**Actual binary verification result**: The hwplib format is correct.

### Secondary Cause (Key): Width/Gap Values Are Proportional

Raw byte analysis:
```
08 00 89 05 9a 35 4e 02 18 48 00 00 00 00 00 00 00 00
attr  attr2 w0    g0    w1    g1    sep...
0x08  1417  13722 590   18456 0
```

Sum of width/gap values: 13722 + 590 + 18456 + 0 = **32768 (= 2^15)**

These values are not absolute HWPUNITs but **proportional values relative to body_width**:
- 13722 = 48.4mm -> actual: 117.7mm
- 590 = 2.1mm -> actual: 5.1mm
- 18456 = 65.1mm -> actual: 158.3mm

Proportional conversion formula:
```
actual_value = proportional_value / sum(32768) x body_width
```

Verification:
- col0_width = 13722/32768 x 79652 HU = 33363 HU = **117.7mm** (matches HWP dialog)
- col0_gap = 590/32768 x 79652 HU = 1434 HU = **5.1mm**
- col1_width = 18456/32768 x 79652 HU = 44856 HU = **158.3mm**

## Changes

### File: `src/parser/body_text.rs`
- `parse_column_def_ctrl`: Read using hwplib byte order (attr2 -> width+gap pairs)
- Set `cd.proportional_widths = true`

### File: `src/model/page.rs`
- Added `gaps: Vec<HwpUnit16>` field to `ColumnDef`
- Added `proportional_widths: bool` flag

### File: `src/renderer/page_layout.rs`
- `calculate_column_areas`: Proportional conversion based on body_area.width when proportional_widths=true

### File: `src/serializer/control.rs`
- `serialize_column_def`: Correct byte order serialization based on same_width flag

## Notes

- The HWPML 3.0 spec (Table 101, COLUMN element) specifies Width and Gap as `[hwpunit]` absolute values
- The HWP 5.0 binary format and HWPX/HWPML format use different encoding methods
- The hwplib Java code has correct byte reading order, but proportional-to-absolute conversion is presumably handled at the rendering stage

## Date

2026-02-16
