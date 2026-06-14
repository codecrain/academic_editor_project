# Task 13: Execution Plan - Format > Paragraph > Numbering: Start Number/Paragraph Number Processing

## 1. Overview

Implement parsing and rendering of paragraph numbering (Numbering) corresponding to HWP document's "Format > Paragraph > Numbering".

## 2. Current Status Analysis

### Implemented
- `AutoNumber` (atno control): Auto numbering for figures/tables/footnotes, etc. -- already implemented
- `ParaShape.numbering_id`: Parsed but not actually used
- `HWPTAG_NUMBERING` tag constant: Definition exists only, no parsing logic
- `NumberFormat` and `format_number()`: Number format conversion function exists (reusable)

### Not Implemented
- `HWPTAG_NUMBERING` record parsing (DocInfo)
- `Numbering` model struct (numbering definition data)
- `ParaShape.attr1` bit 23~24 (paragraph head type) and bit 25~27 (paragraph level) utilization
- Paragraph number rendering (number string generation and insertion before text)
- Level-specific start number processing
- Number counter management (increment for consecutive same-level paragraphs, reset on level change)

## 3. Design Based on HWP Spec

### Paragraph Numbering Behavior
1. **DocInfo's HWPTAG_NUMBERING**: Number format definition (level-specific format strings, start numbers)
2. **ParaShape.attr1 bit 23~24**: Paragraph head type (0=None, 1=Outline, 2=Number, 3=Bullet)
3. **ParaShape.attr1 bit 25~27**: Paragraph level (1~7)
4. **ParaShape.numbering_id**: Reference ID for which numbering definition to use

### Number Format Strings (Spec Table 40)
- Format string exists for each level (1~7)
- `^n`: Level path display (e.g., 1.1.1)
- `^N`: Level path + trailing period (e.g., 1.1.1.)

### Paragraph Head Info (Spec Table 41)
- Properties (4 bytes): Alignment, follow width, auto hanging indent, etc.
- Width correction value (2 bytes)
- Distance from body text (2 bytes)
- Character shape ID reference (4 bytes)

## 4. Work Scope

| Item | Description |
|------|-------------|
| Model | Add `Numbering` struct, `NumberingHead` struct |
| Parser | Parse HWPTAG_NUMBERING from DocInfo |
| Parser | Extract head type/level from ParaShape.attr1 |
| Rendering | Manage per-paragraph number counters and generate number text |
| Rendering | Insert number string before paragraph text |

## 5. Expected Results

- Paragraph numbers like "1. Item", "a. Item", "I. Item" etc. correctly rendered in HWP documents
- Level-specific start numbers reflected
- Consecutive paragraphs at the same level auto-increment their numbers
