# Task 247 Plan: Shape Inline Control Structure Migration

## Background

Hancom stores shapes (gso) as inline controls within paragraphs (char code 11, 16 bytes).
Multiple shapes and text can coexist in one paragraph, and cursor movement/text insertion between controls is possible.

Our current implementation stores shapes in **dedicated paragraphs** (1 paragraph = 1 shape), causing:
- No cursor movement between controls
- F11 cannot select shapes (cursor cannot enter shape paragraphs)
- Structure mismatch when loading Hancom files

## Analysis: shape-01.hwp (Created by Hancom)

```
Para 1: secd(ch=2) + cold(ch=2) + gso(ch=11) + gso(ch=11) + gso(ch=11) + PARA_END
nChars=41, ctrlMask=0x00000804
```

- 3 shapes placed consecutively in the same paragraph
- char code 11 = drawing object (extended control, 16 bytes)
- ctrl_id = `gso ` (0x67736F20)

## Goals

1. Insert shapes as inline controls in existing paragraphs (instead of creating dedicated paragraphs)
2. Implement navigation so cursor can skip over shape controls like characters
3. Enable F11 shape control selection

## Deliverables

- Restructured `create_shape_control_native()` (inline insertion)
- Cursor movement: Skip over FFFC control characters
- F11 natural behavior
- Maintain compatibility with existing HWP files
