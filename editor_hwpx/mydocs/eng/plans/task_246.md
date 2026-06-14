# Task 246 Plan: Hancom-Level Shape Completion

## Current State Analysis

### Already Implemented
- 7 shape types model/parser/renderer: Line, Rectangle, Ellipse, Arc, Polygon, Curve, Group
- 3 connector types ($col): Straight/Bent/Curved + connection point snapping + auto-tracking
- Shape property editing: Border color/thickness, fill (solid/gradient), rotation/flip
- Group/ungroup, multi-selection, Z-order

### Not Yet Implemented (vs Hancom)
1. **Arrow rendering** — ArrowStyle exists in model but not reflected in SVG
2. **Shape shadow** — shadow_type/color/offset exists in model but not rendered
3. **Rounded rectangle** — round_rate field exists but not applied in rendering
4. **Line types** — Double/triple lines, etc. (LineRenderType) not reflected
5. **Shape category expansion** — Speech bubbles, flowcharts, etc. (Hancom basic shape set)

## Implementation Plan

### Step 1: Arrow Rendering
- Display arrows on lines/connectors using SVG markers
- 6 ArrowStyle types: Arrow, Concave Arrow, Diamond, Circle, Square
- 3 arrow size levels (Small/Medium/Large)
- Target: Lines ($lin), Connectors ($col)

### Step 2: Shape Shadow
- SVG filter (feDropShadow or feOffset+feGaussianBlur)
- shadow_type (direction) + shadow_color + shadow_offset + shadow_alpha
- Apply to all shapes: Rectangle, Ellipse, Polygon, Arc, etc.

### Step 3: Line Types + Rounded Rectangle
- Double/triple line rendering (LineRenderType)
- Rounded rectangle: round_rate → SVG rect rx/ry
- Line end shape (lineEndShape)

### Step 4: Shape Property UI Enhancement
- Arrow property editing (start/end shape, size)
- Shadow property editing (type, color, offset)
- Line type selection UI

## References
- Hancom Help: draw/line/, draw/face/
- HWP Spec: Tables 84~86 (Object Element Properties)
- hwplib: ArrowStyle, LineRenderType
