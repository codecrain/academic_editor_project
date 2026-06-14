# Task 244 Plan: Advanced Shape Editing

## Current State

Polygon/Curve/Arc/Group all have model+parser+serialization+rendering complete.
Only creation API and UI need to be added.

## Scope

### 1. Shape Creation API Extension (create_shape_control_native)
- `"polygon"`: PolygonShape — Generate basic polygon (triangle/pentagon) based on drag bbox
- `"arc"`: ArcShape — Elliptical arc (default: semicircle)
- Curve requires control point editing, to be considered separately
- Group handled via multi-selection → grouping command

### 2. shape-picker UI Extension
- Add Arc, Polygon to existing 3 types
- Group as a separate command (Ctrl+G, etc.)

### 3. Group Objects
- Multi-selection (Shift+click)
- Group/Ungroup commands
