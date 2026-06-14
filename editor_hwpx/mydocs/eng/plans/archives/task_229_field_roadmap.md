# Field/Form Object Implementation Roadmap

## Background

Since the goal is a web document authoring system, not just simple rendering but data binding through external APIs is the core requirement. Hancom's field-related controls fall into 3 broad categories:

| Category | Control | ctrlId | Purpose |
|----------|---------|--------|---------|
| **Field** | ClickHere | `%clk` | Input position guidance + data binding in form documents |
| | Bookmark | `%bmk` | Position reference + data binding |
| | Date/Path/Summary etc. | `%dte`, `%pat`, `%smr` etc. | Auto-generated fields |
| | Hyperlink | `%hlk` | URL link |
| **Form Object** | Edit Box | FORM_OBJECT | Text input/output |
| | CheckBox | FORM_OBJECT | Multiple selection options |
| | RadioButton | FORM_OBJECT | Single selection options |
| | ComboBox | FORM_OBJECT | Dropdown selection |
| | PushButton | FORM_OBJECT | Script execution |

## Step-by-Step Task Plan

### Task 229: Field Control Parsing and Basic Rendering
### Task 230: Field WASM API and Data Binding
### Task 231: ClickHere Editing UI
### Task 232: Form Object Parsing and Rendering
### Task 233: Form Object Interaction and Data Binding

## Priority

| Order | Task | Importance | Reason |
|-------|------|------------|--------|
| 1 | **229** (Field parsing/rendering) | Highest | Foundation for all field features |
| 2 | **230** (Field data binding API) | Core | Core requirement for web document authoring |
| 3 | **231** (ClickHere editing UI) | High | User input handling |
| 4 | **232** (Form object parsing/rendering) | Medium | Advanced form support |
| 5 | **233** (Form object interaction) | Medium | Complete form support |
