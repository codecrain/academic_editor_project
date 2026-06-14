# Task 298 Plan: Inline Shape Cursor Character-by-Character Navigation

## 1. Current State Analysis

### 1.1 Problem Definition
When inline Shapes (rectangles, circles, etc.) with `treat_as_char=true` are placed between paragraph text, the cursor should recognize each Shape as a single character for left-right movement, but this is not currently implemented.

### 1.2 Current Behavior
- Inline Shapes are rendered only; cursor skips or fails to recognize Shape positions during movement
- hitTest does not accurately map clicks in the Shape area to the correct char_offset

### 1.3 Expected Behavior (Per Hancom)
- In a paragraph like `[Rectangle] [Set ID] ScrollPosInfo`:
  - Cursor before rectangle → right arrow → after rectangle (= before space)
  - Rectangle occupies 1-character width for cursor passage
  - Shift+Arrow can include the rectangle in the selection range

## 2. Technical Analysis

### 2.1 Existing Infrastructure
| Component | File | Status |
|----------|------|------|
| Control position restoration | `helpers.rs` → `find_control_text_positions()` | Position restoration via char_offsets gap — done |
| Navigable text length | `helpers.rs` → `navigable_text_len()` | Inline control position reflected — done |
| Left/right navigation | `doc_tree_nav.rs` → `navigate_next_editable()` | TextBox/Table entry implemented, simple Shape pass-through not done |
| hitTest | `cursor_rect.rs` → `hit_test_native()` | TextRun-based matching only — Shape area not supported |
| Inline Shape coordinates | `render_tree.rs` → `inline_shape_positions` | (sec, para, ctrl) → (x, y) storage done |

### 2.2 Key Challenges
1. **navigate_next_editable()**: When encountering a simple shape (Shape without TextBox), skip 1 position (distinguish from Table/TextBox entry)
2. **hitTest**: Click within inline Shape BoundingBox → return corresponding char_offset
3. **Cursor rendering**: Show caret at left/right of Shape when cursor is at Shape position

## 3. Implementation Plan

### 3.1 Step 1: Simple Shape Pass-Through in navigate_next_editable()
- In `doc_tree_nav.rs`, when a Shape exists at a control position:
  - Shape with TextBox → existing logic (enter)
  - Shape without TextBox → skip 1 position like Picture/Equation
- Same treatment for reverse direction (delta < 0)

### 3.2 Step 2: Inline Shape Area Click Support in hitTest
- In `hit_test_native()`, query `inline_shape_positions` to detect clicks within Shape BoundingBox
- Click on left half of Shape → char_offset before Shape, right half → char_offset after Shape

### 3.3 Step 3: Cursor Rendering Correction
- In `cursor_rect_native()`, when char_offset is at a Shape position, return caret position based on Shape coordinates
- Adjust caret height to match Shape height

## 4. Impact Scope
- `src/document_core/queries/doc_tree_nav.rs` — Left/right navigation logic
- `src/document_core/queries/cursor_rect.rs` — hitTest + cursor position calculation
- `src/document_core/helpers.rs` — Utility functions if needed

## 5. Test Plan
- Verify left/right movement behavior with `samples/inline-bug-01.hwp`
- Regression check for existing TextBox inline Shape entry behavior
- Regression check for inline image/equation pass-through behavior

## 6. Risks
- char_offset mapping accuracy in paragraphs with multiple inline Shapes
- Whether Group Shape internals need to be inspected for TextBox presence detection
