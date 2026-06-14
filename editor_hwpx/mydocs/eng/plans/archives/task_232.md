# Task 232: Form Object Parsing and Rendering

## Overview

Parse HWP form objects (Form Object, ctrl_id=0x666f726d='form') and visually render 5 types of form objects.

## Background

### What Are Form Objects?

Hancom word processor form objects are interactive UI controls inserted into documents. There are 5 types:

| Form Object | Type ID | Description |
|-------------|---------|-------------|
| PushButton | `tbp+` | Button for script execution |
| CheckBox | `tbc+` | Multi-selectable checkbox |
| ComboBox | `boc+` | Select one from dropdown list |
| RadioButton | `tbr+` | Single selection within group |
| Edit | `tde+` | Text input/output |

## Goals

1. **Parsing**: Parse Form control binary data into `FormObject` model
2. **Rendering**: Render visual appearance of 5 form object types in SVG/Canvas
3. **Layout**: Place form objects as inline extended controls in paragraph layout

## Expected Change Files

| File | Changes |
|------|---------|
| `src/model/control.rs` | Add `FormObject` struct + `FormType` enum, `Control::Form` variant |
| `src/parser/control.rs` | Add `parse_form_control()` function |
| `src/renderer/render_tree.rs` | Add `RenderNodeType::FormObject` + `FormObjectNode` |
| `src/renderer/layout/paragraph_layout.rs` | Form control layout placement |
| `src/renderer/svg.rs` | Form object SVG rendering |
| `src/renderer/web_canvas.rs` | Form object Canvas rendering |
