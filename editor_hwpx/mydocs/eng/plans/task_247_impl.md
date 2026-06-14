# Task 247 Implementation Plan (Revised): Shape Inline Control Structure Migration

## Completed Work
- `create_shape_control_native` changed to inline insertion
- Hancom-compatible serialization (5 scenarios passed)
- PARA_HEADER reserved bytes fix, flip/attr/description Hancom defaults

## Root Cause Analysis

The current "post-processing marker insertion (MarkerInsert)" approach cannot synchronize coordinates:
1. Coordinates shifted by MarkerInsert don't match getCursorRect's original coordinates
2. Two runs (marker and text) exist at the same char_start → collision
3. navigable_text_len double-counts overlapping positions

## Fundamental Solution Direction

**Treat inline shapes as actual text during the text composition stage**

### Step-by-Step Plan

#### Step 1: Accurate navigable_text_len Calculation
- Return `max(text_len, max_ctrl_pos + 1)` considering inline control text_positions
- Do not double-count overlapping positions

#### Step 2: Compose Shapes as Text in Control Code Mode
- Instead of MarkerInsert post-processing, **integrate shape marker text into paragraph text during the compose stage**
- Control code mode: Insert "[Line]", "[Rectangle]", "[Ellipse]" as text
- Normal mode: Replace with FFFC (U+FFFC, Object Replacement Character) at zero width
- This way, markers render as regular TextRuns, making cursor navigation work naturally

#### Step 3: getCursorRect Support for Inline Control Positions
- With markers integrated as TextRuns in Step 2, getCursorRect works naturally
- In normal mode, zero-width anchor provides cursor position

#### Step 4: F11 Shape Selection + Space Insertion Test
- With cursor moving between shapes, F11 works naturally
- Verify space/text insertion between shapes
