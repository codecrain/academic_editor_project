# rhwp ir-diff Command Manual

## Overview

A debugging tool that parses HWPX and HWP files of the same document and automatically detects differences in their IR (Intermediate Representation).
It systematically verifies that the HWPX parser produces the same IR as the HWP binary parser.

## Background

HWPX (XML-based) and HWP (binary) store the same document in different formats.
When Hancom saves an HWPX as HWP (or vice versa), the resulting IR should be identical.
However, the following discrepancies can occur during parsing:

- UTF-16 code unit mapping differences (e.g., tab character = 8 code units)
- Missing 2x scale conversion (margins, tab positions, line spacing, etc.)
- Missing XML attribute parsing (underline shape, fill, etc.)
- `<hp:switch>/<hp:case>/<hp:default>` branch handling errors

## Usage

```bash
rhwp ir-diff <fileA> <fileB> [-s <section>] [-p <paragraph>]
```

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--section <number>` | `-s` | Compare only a specific section (0-based) |
| `--para <number>` | `-p` | Compare only a specific paragraph (0-based) |

### Examples

```bash
# Full comparison
rhwp ir-diff samples/tac-img-02.hwpx samples/tac-img-02.hwp

# Compare a specific paragraph only
rhwp ir-diff samples/tac-img-02.hwpx samples/tac-img-02.hwp -s 0 -p 810

# Filter ParaShape differences only
rhwp ir-diff samples/tac-img-02.hwpx samples/tac-img-02.hwp 2>&1 | grep "\[PS "

# Filter TabDef differences only
rhwp ir-diff samples/tac-img-02.hwpx samples/tac-img-02.hwp 2>&1 | grep "\[TD "

# Check difference count only
rhwp ir-diff samples/tac-img-02.hwpx samples/tac-img-02.hwp 2>&1 | tail -1
```

## Comparison Items

### Per-Paragraph Comparison

| Item | Description | Meaning When Mismatched |
|------|-------------|------------------------|
| `text` | Paragraph text | Text parsing error |
| `cc` (char_count) | Character count (UTF-16 code units) | Tab/control code unit mapping error |
| `char_offsets` | Per-character UTF-16 positions | LINE_SEG text_start mapping mismatch |
| `char_shapes` | Character shape change positions/IDs | CharShape mapping error |
| `line_segs` | Line layout (text_start, line_height, segment_width) | Line break/height mismatch |
| `controls` | Control count | Table/picture/textbox parsing omission |
| `tab_extended` | Tab extended data (width, leader, type) | Inline tab parsing error |

### ParaShape Comparison

| Item | Description | Notes |
|------|-------------|-------|
| `ml` (margin_left) | Left margin | HWP stores at 2x scale |
| `mr` (margin_right) | Right margin | HWP stores at 2x scale |
| `indent` | Indent | HWP stores at 2x scale |
| `tab_def` (tab_def_id) | Tab definition reference | Index mismatch causes tab rendering errors |
| `sb` (spacing_before) | Spacing before paragraph | HWP stores at 2x scale |
| `sa` (spacing_after) | Spacing after paragraph | HWP stores at 2x scale |
| `ls` (line_spacing) | Line spacing | Only Fixed/SpaceOnly/Minimum use 2x scale; Percent uses 1x |

### TabDef Comparison

| Item | Description |
|------|-------------|
| Tab count | TabItem count mismatch |
| `position` | Tab position (2x scale) |
| `tab_type` | Tab type (0=Left, 1=Right, 2=Center, 3=Decimal) |
| `fill_type` | Fill pattern (0=None through 11=Triple line) |

## Output Format

```
=== IR Comparison: tac-img-02.hwpx vs tac-img-02.hwp ===

--- Paragraph 0.810 --- "New Business Expansion Plan"
  [Diff] cc: A=24 vs B=108
  [Diff] char_offsets[0]: A=0 vs B=0

  [PS 30] ls: 1800vs3600     <- lineSpacing 2x scale mismatch

  [TD 5] pos: 50152vs100304  <- TabDef position 2x scale mismatch

=== Comparison complete: 1091 differences ===
```

- `A` = First file (typically HWPX)
- `B` = Second file (typically HWP)
- `[PS N]` = Difference in ParaShape index N
- `[TD N]` = Difference in TabDef index N

## Expected Differences (Can Be Ignored)

The following items may always differ due to structural differences between HWPX and HWP, with no impact on rendering:

- **char_shapes ID differences** (`cs[].id`): CharShape table ordering differs
- **char_shapes pos differences** (`cs[].pos`): Control offset differences in empty paragraphs
- **controls count differences**: SectionDef and similar are handled separately in HWPX

## Debugging Workflow

When an HWPX rendering bug is found, follow this sequence:

1. **Detect differences with ir-diff**
   ```bash
   rhwp ir-diff sample.hwpx sample.hwp
   ```

2. **Detailed comparison of relevant paragraphs**
   ```bash
   rhwp dump sample.hwpx -s 0 -p 810
   rhwp dump sample.hwp -s 0 -p 810
   ```

3. **Inspect original HWPX XML** -- Extract the zip and examine header.xml / section0.xml

4. **Re-verify differences after fix**
   ```bash
   # Compare difference counts before and after the fix
   rhwp ir-diff sample.hwpx sample.hwp 2>&1 | tail -1
   ```

## Discovery History

Bugs found and fixed using this tool:

| Task | Finding | Root Cause |
|------|---------|------------|
| #13 | TabDef position 2x scale | HWPX HwpUnitChar value not converted |
| #13 | ParaShape margin/indent 2x scale | HWPX HwpUnitChar value not converted |
| #13 | TabDef fill_type mapping error | HWPML DASH/DOT naming inversion |
| #15 | Shape curSz width=0 | orgSz fallback not implemented |
| #16 | underline shape not parsed | HWPX charPr shape attribute missing |
| #17 | Tab character UTF-16 code unit | Tab 1 code unit -> 8 code units |
| #18 | ParaShape lineSpacing 2x scale | Fixed/SpaceOnly/Minimum not converted |
