# Task 249 Plan: Group Objects (Multi-Selection + Group/Ungroup)

## Hancom Behavior (Per Help Documentation)

1. In "Object Select" mode, multi-select objects by mouse-dragging an area
2. "Group Objects" command combines selected objects into a GroupShape
3. "Ungroup Objects" command separates a GroupShape into individual objects
4. Restrictions: Same page only, tables cannot be grouped

## Implementation Plan

### Step 1: Multi-Selection
- Shift+click to add objects to selection
- Manage multi-selection state in cursor (selectedPictureRefs: array)
- Display combined handles encompassing all selected objects' bboxes

### Step 2: Group Objects
- Rust: group_shapes_native(sec, para_indices, ctrl_indices) → Create GroupShape
- Move selected objects to GroupShape.children
- WASM API + command registration

### Step 3: Ungroup Objects
- Rust: ungroup_shape_native(sec, para, ctrl_idx) → Separate GroupShape into individual objects
- WASM API + command registration
