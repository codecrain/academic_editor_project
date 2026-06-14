# Task 248 Plan: Control Code Shape Marker Cursor Navigation

## Background

Task 247 completed inline shape insertion + Hancom-compatible serialization.
Remaining issue: Shape marker placement/cursor movement/F11 selection in control code display mode.

## Hancom Structure (Target)

In control code display mode:
- Inline controls are rendered as **actual-width TextRuns** in `[ControlName]` format
- These TextRuns occupy space within the line → subsequent content is pushed to the right
- Cursor moves between these TextRuns as if they were normal text
- F11 selects controls before the cursor position in reverse order

## 5 Root Causes

1. navigable_text_len over-calculation → generates invalid offsets
2. getCursorRect cannot return coordinates for inline control positions
3. Control code markers are separated from text flow (MarkerInsert post-processing)
4. No mapping between inline control char_pos and rendering coordinates
5. Forward/backward navigation skip logic inconsistency

## Solution Direction

**Integrate shape markers as actual text during the composition stage**

Control code mode: Insert marker text like "[Line]" at shape control positions into ComposedLine runs
→ Markers render as regular TextRuns → getCursorRect works naturally → cursor movement works naturally
