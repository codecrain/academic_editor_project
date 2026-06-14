# HWP Form Object API Technical Reference

## Overview

Provides WASM APIs for querying and setting values of form objects embedded in HWP documents via JavaScript. Supports 5 types of form objects: push button, check box, combo box, radio button, and edit box.

## Form Object Types

| Type | formType String | HWP Type ID | Key Properties |
|------|----------------|-------------|----------------|
| Push Button | `PushButton` | `tbp+` | caption |
| Check Box | `CheckBox` | `tbc+` | value (0/1), caption |
| Combo Box | `ComboBox` | `boc+` | text (selected value), items (item list) |
| Radio Button | `RadioButton` | `tbr+` | value (0/1), caption, RadioGroupName |
| Edit Box | `Edit` | `tde+` | text (input value) |

## API Reference

### getFormObjectAt(pageNum, x, y)

Finds a form object at the given page coordinates.

**Parameters:**
- `pageNum` (number) -- Page number (0-based)
- `x` (number) -- X coordinate within the page (px, 96dpi basis)
- `y` (number) -- Y coordinate within the page (px, 96dpi basis)

**Return value:**
```json
{
  "found": true,
  "sec": 0,
  "para": 4,
  "ci": 0,
  "formType": "ComboBox",
  "name": "ComboBox",
  "value": 0,
  "caption": "",
  "text": "Select Season",
  "bbox": { "x": 42.5, "y": 111.5, "w": 80.8, "h": 19.3 }
}
```

Returns `{"found": false}` if no form object is found.

### getFormValue(sec, para, ci)

Queries the current value of a form object.

**Parameters:**
- `sec` (number) -- Section index (0-based)
- `para` (number) -- Paragraph index
- `ci` (number) -- Control index

**Return value:**
```json
{
  "ok": true,
  "formType": "CheckBox",
  "name": "CheckBox",
  "value": 1,
  "text": "",
  "caption": "Check Box",
  "enabled": true
}
```

**Value interpretation by type:**

| Type | value meaning | text meaning |
|------|--------------|-------------|
| CheckBox | 0=unchecked, 1=checked | -- |
| RadioButton | 0=unselected, 1=selected | -- |
| ComboBox | -- | Currently selected item text |
| Edit | -- | Entered text |
| PushButton | -- | -- |

### setFormValue(sec, para, ci, valueJson)

Sets the value of a form object. After setting, re-typesetting and render cache are automatically invalidated.

**Parameters:**
- `sec` (number) -- Section index
- `para` (number) -- Paragraph index
- `ci` (number) -- Control index
- `valueJson` (string) -- JSON string

**valueJson format:**

```javascript
// CheckBox / RadioButton: set value
'{"value": 1}'          // check/select
'{"value": 0}'          // uncheck/deselect

// ComboBox / Edit: set text
'{"text": "Summer"}'    // set text

// Combined setting (value + text simultaneously)
'{"value": 1, "text": "new value"}'

// Change caption
'{"caption": "New Caption"}'
```

**Return value:**
```json
{ "ok": true }
```

After setting, call `renderPageToCanvas()` again to reflect the changed value on screen.

### getFormObjectInfo(sec, para, ci)

Returns detailed information about a form object. Includes all properties extracted by the parser and ComboBox item lists.

**Parameters:**
- `sec` (number) -- Section index
- `para` (number) -- Paragraph index
- `ci` (number) -- Control index

**Return value:**
```json
{
  "ok": true,
  "formType": "ComboBox",
  "name": "ComboBox",
  "value": 0,
  "text": "Select Season",
  "caption": "",
  "enabled": true,
  "width": 6058,
  "height": 1450,
  "foreColor": 0,
  "backColor": 15790320,
  "properties": {
    "TabOrder": "3",
    "ListBoxRows": "4",
    "EditEnable": "1",
    "GroupName": "",
    "BorderType": "5"
  },
  "items": ["Spring", "Summer", "Autumn", "Winter"]
}
```

**Notes:**
- `width`, `height` are in HWPUNIT (1 inch = 7200 HWPUNIT)
- `foreColor`, `backColor` are BGR 24-bit integers (0x00BBGGRR)
- `items` is ComboBox-only -- extracted from `InsertString()` calls in HWP scripts
- `properties` contains other property originals parsed from HWP property strings

## Usage Examples

### JavaScript (Browser Console)

```javascript
// WasmBridge instance (in rhwp-studio, the wasm variable)

// 1. Query all form object values
for (let para = 0; para < 10; para++) {
  const result = wasm.getFormValue(0, para, 0);
  if (result.ok) {
    console.log(`${result.formType}[${result.name}]: value=${result.value}, text="${result.text}"`);
  }
}

// 2. Toggle checkbox
const cb = wasm.getFormValue(0, 2, 0);  // sec=0, para=2, ci=0
if (cb.ok && cb.formType === 'CheckBox') {
  const newVal = cb.value === 0 ? 1 : 0;
  wasm.setFormValue(0, 2, 0, JSON.stringify({ value: newVal }));
}

// 3. Query combo box item list and select
const info = wasm.getFormObjectInfo(0, 4, 0);
if (info.ok && info.items) {
  console.log('Items:', info.items);  // ["Spring", "Summer", "Autumn", "Winter"]
  wasm.setFormValue(0, 4, 0, JSON.stringify({ text: info.items[2] }));  // Select "Autumn"
}

// 4. Find form object by page coordinates
const hit = wasm.getFormObjectAt(0, 100, 120);
if (hit.found) {
  console.log(`${hit.formType} "${hit.name}" at (${hit.bbox.x}, ${hit.bbox.y})`);
}
```

## ComboBox Item Extraction Principle

HWP document ComboBox items are not stored directly in the file binary. Instead, they are added at runtime via `InsertString()` calls in script code contained in the `Scripts/DefaultJScript` OLE stream.

**File structure:**
```
HWP OLE Compound File
|- FileHeader
|- DocInfo
|- BodyText/Section0    <- Form object definitions (type, size, properties)
|- Scripts/
|   |- DefaultJScript   <- zlib compressed + UTF-16LE script
|   +- JScriptVersion
+- ...
```

**Script example:**
```javascript
ComboBox.ResetContent();
ComboBox.Text = "Select Season";
ComboBox.InsertString("Spring", 0);
ComboBox.InsertString("Summer", 1);
ComboBox.InsertString("Autumn", 2);
ComboBox.InsertString("Winter", 3);
```

**Extraction method:**
1. Decompress `Scripts/DefaultJScript` stream via zlib (raw deflate)
2. Decode UTF-16LE -> String
3. Regex match `controlName.InsertString("item", index)` pattern
4. Sort by index to construct item list

**Limitations:**
- Item list cannot be extracted from documents without scripts
- Complex script logic such as conditional item addition (inside `if` statements) is not handled
- Only `InsertString` pattern matching is supported (not a complete script engine)

## Source File References

| Category | File Path |
|----------|-----------|
| Model | `src/model/control.rs` -- FormType, FormObject |
| Parser | `src/parser/control.rs` -- parse_form_control, parse_form_properties |
| WASM API | `src/wasm_api.rs` -- getFormObjectAt, getFormValue, setFormValue, getFormObjectInfo |
| Native Implementation | `src/document_core/queries/form_query.rs` |
| Render Tree | `src/renderer/render_tree.rs` -- FormObjectNode |
| Layout | `src/renderer/layout/paragraph_layout.rs` -- inline placement |
| SVG Rendering | `src/renderer/svg.rs` -- render_form_object |
| Canvas Rendering | `src/renderer/web_canvas.rs` -- render_form_object |
| TS Interface | `rhwp-studio/src/core/types.ts` -- FormObjectHitResult, FormValueResult, FormObjectInfoResult |
| TS Bridge | `rhwp-studio/src/core/wasm-bridge.ts` -- getFormObjectAt etc. wrappers |
| Click Handling | `rhwp-studio/src/engine/input-handler.ts` -- handleFormObjectClick |
| CSS | `rhwp-studio/src/styles/form-overlay.css` |
