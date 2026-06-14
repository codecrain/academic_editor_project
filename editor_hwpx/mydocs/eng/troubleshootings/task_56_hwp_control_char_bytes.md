# Troubleshooting: HWP Extended Control Character Byte Structure

## Problem

Confusion arose while interpreting the byte size of control characters defined in the HWP 5.0 spec document's "Table 6: Paragraph Text."

### Spec Document Contents (Table 6)

| Char Code | Type | Size | Description |
|-----------|------|------|-------------|
| 0-1 | Character control | 1 | Unused, reserved |
| 2-3 | Extended control | 8 | Extended control |
| 4-9 | Inline control | 8 | |
| 10 | Extended control | 8 | |
| 11-12 | Extended control | 8 | Table, drawing object |
| ... | ... | ... | ... |

**Problem**: The spec explicitly states "size = 8," which was interpreted as 8 bytes, but parsing errors occurred.

---

## Analysis

### 1. hwplib (Java) Code Analysis

[ForParaText.java](../../hwplib/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/ForParaText.java):

```java
case ControlExtend:
    extendChar(paraText.addNewExtendControlChar(), sr);
    return 16;  // <- Returns 16 bytes!

private static void extendChar(HWPCharControlExtend extendChar,
                               StreamReader sr) throws Exception {
    byte[] addition = new byte[12];  // <- 12-byte addition
    sr.readBytes(addition);
    extendChar.setAddition(addition);
    extendChar.setCode(sr.readSInt2());  // <- 2-byte code
}
```

### 2. HWPCharControlExtend.java Analysis

```java
public void setAddition(byte[] addition) throws Exception {
    if (addition.length != 12) {  // <- Must be exactly 12 bytes
        throw new Exception("addition's length must be 12");
    }
    this.addition = addition;
}
```

### 3. Actual HWP File Hex Dump Analysis

PARA_TEXT record from the file "Consolidated Fiscal Statistics (Jan-Jun 2010).hwp":

```
0b00 206c627400000000000000000b00 0d00
+--2B--++------------- 12B --------++2B++next+
code    addition (ctrl_type+extra)  code  char
```

Breakdown:
- `0b 00` = 0x000B (code 11, table/drawing object)
- `20 6c 62 74` = ' lbt' (little-endian -> 'tbl ': table)
- `00 00 00 00 00 00 00 00` = 8 bytes of additional info
- `0b 00` = 0x000B (end code)
- `0d 00` = 0x000D (next character: paragraph end)

---

## Conclusion: Interpreting the Spec

### What "Size = 8" Actually Means

**8 WCHAR (Wide Character) units = 8 x 2 bytes = 16 bytes**

HWP 5.0 is Unicode-based, where all characters are 2-byte (WCHAR) units. Therefore, the "size" column in the spec uses WCHAR units, not bytes.

### Actual Structure of Extended Control Characters (16 bytes)

| Offset | Size | Content |
|--------|------|---------|
| 0-1 | 2 bytes | Control character code |
| 2-5 | 4 bytes | Control type ('tbl ', 'gso ', 'eqed', etc.) |
| 6-13 | 8 bytes | Additional info (instance id, etc.) |
| 14-15 | 2 bytes | Control character code (repeated) |

### Implementation Code (After Fix)

[record_parser.py](../../hwp_semantic/record_parser.py):

```python
class CtrlChar:
    """
    HWP control character

    Extended control character structure (16 bytes):
    - Code (2 bytes)
    - Addition (12 bytes): ctrl_type[0:4] + extra[4:12]
    - Code (2 bytes)

    After reading the initial 2-byte code, 14 additional bytes must be skipped
    """
    EXTENDED_EXTRA_BYTES = 14     # addition(12) + final code(2)
```

---

## Control Type Identifiers

4-byte ASCII strings stored in addition[0:4] (little-endian):

| Stored Value | Actual Meaning | Code |
|-------------|---------------|------|
| ' lbt' | 'tbl ' | Table |
| ' osg' | 'gso ' | Drawing Object (GSO) |
| 'deqe' | 'eqed' | Equation |
| 'mrof' | 'form' | Form Control |
| 'dces' | 'secd' | Section Definition |
| 'dloc' | 'cold' | Column Definition |
| 'klh%' | '%hlk' | Hyperlink |

---

## Lessons Learned

1. "Size" in the HWP spec uses **WCHAR units** (not bytes)
2. Extended control character = 16 bytes = 8 WCHAR
3. The hwplib Java code is the ground truth for actual implementation (returns 16 bytes)
4. Byte-level interpretation from the spec document alone is difficult -- hex dump verification of actual files is essential

---

## Related Files

- [HWP 5.0 Spec](../tech/한글문서파일형식_5.0_revision1.3.pdf) - Table 6: Paragraph Text
- [hwplib ForParaText.java](../../hwplib/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/ForParaText.java)
- [hwplib HWPCharControlExtend.java](../../hwplib/src/main/java/kr/dogfoot/hwplib/object/bodytext/paragraph/text/HWPCharControlExtend.java)
- [record_parser.py](../../hwp_semantic/record_parser.py) - CtrlChar class

---

**Date**: 2026-01-06
**Related task**: Task 56 - Implement rendering-order-based document tree
