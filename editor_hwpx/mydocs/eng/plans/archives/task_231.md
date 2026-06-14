# Task 231: ClickHere Editing UI

## Goal

Enable clicking on ClickHere fields in the web editor to input/modify content.

## Implementation Plan

### Step 1: Field Click Entry + Cursor Placement
Extend hitTest to return field information, enter field edit mode on click.

### Step 2: Text Input/Deletion Within Field
Implement text editing behavior within field area.

### Step 3: F11 Block Selection + Status Bar
- F11 key: select all text within current field as block
- Status bar: display field name/guide text
