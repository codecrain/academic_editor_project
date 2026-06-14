# Task 250 Plan: Line Shape Editing Improvements

## Current State
- Line drawing: Can be created via drag, but horizontal/vertical constraint not working
- Line selection: Start/end 2 handles displayed but editing via drag not working
- Shift+line: Previously implemented but currently non-functional (regression)

## Issues to Resolve

### Step 1: Restore Horizontal/Vertical Line Drawing
- Shift+drag constrains to horizontal (dy=0) or vertical (dx=0)
- Also supports 45-degree snapping (while holding Shift)
- Identify and fix the regression root cause

### Step 2: Endpoint Marker Drag — Angle/Length Adjustment
- Start point (sw) handle drag: Moves start point → changes angle
- End point (ne) handle drag: Moves end point → changes angle
- Synchronize line bbox (horizontal_offset, vertical_offset, width, height) with start/end coordinates
- Shift+handle drag: Horizontal/vertical/45-degree constraint

### Step 3: Length Adjustment
- Dragging end handle along line direction → changes length only (preserves angle)
- Or free drag to change both angle and length simultaneously (integrated with Step 2)
