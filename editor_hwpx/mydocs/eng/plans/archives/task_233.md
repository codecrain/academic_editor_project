# Task 233 Execution Plan: Form Object Interaction and Data Binding

## Background

Task 232 completed parsing and visual rendering of 5 form object types. Currently form objects are display-only and do not respond to clicks or input.

## Goals

1. Implement form object click detection and interaction
2. Expose getFormValue/setFormValue WASM API
3. Implement per-type behaviors (checkbox toggle, radio button selection, combo box dropdown, etc.)

## Implementation Scope

### WASM API Additions
- `getFormObjectAt(pageNum, x, y)` — return form object info at coordinates
- `getFormValue(sec, para, controlIndex)` — query form object value
- `setFormValue(sec, para, controlIndex, value)` — set form object value + re-render
- `getFormObjectInfo(sec, para, controlIndex)` — return detailed form object info

### Frontend Interactions
- Mouse click detects form object ��� execute type-specific behavior
- CheckBox: toggle value (0↔1) on click
- RadioButton: change selection within same group on click
- PushButton: visual pressed feedback on click
- ComboBox: show dropdown list (HTML overlay) on click
- Edit: text input mode (HTML input overlay) on click
