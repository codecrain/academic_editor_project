# Task 230 Final Report: Field WASM API and Data Binding

## Implementation Results

### 1. Field Model Extension (`src/model/control.rs`)

- `Field::field_name()` — Extracts Name or Direction (guide text) from command
- `Field::field_type_str()` — FieldType → string conversion
- `Field::extract_wstring_value()` — Extracts wstring pattern value from command (common helper)

### 2. Field Query/Set Engine (`src/document_core/queries/field_query.rs`)

- `collect_all_fields()` — Recursively scans all fields in document (body, table cells, text boxes included)
- `get_field_list_json()` — Returns full field list as JSON
- `get_field_value_by_id()` — Retrieves value by field_id
- `get_field_value_by_name()` — Retrieves value by name
- `set_field_value_by_id()` — Sets value by field_id + recompose
- `set_field_value_by_name()` — Sets value by name + recompose
- `set_field_text_at()` — Replaces text within field range + updates field_range
- `get_para_mut_at_location()` — Accesses paragraph via nested path (stage 1 support)

### 3. WASM API (`src/wasm_api.rs`)

| JS API | Description |
|--------|-------------|
| `getFieldList()` | Full field list (fieldId, name, guide, value, location) |
| `getFieldValue(fieldId)` | Retrieve value by field_id |
| `getFieldValueByName(name)` | Retrieve value by name |
| `setFieldValue(fieldId, value)` | Set value by field_id |
| `setFieldValueByName(name, value)` | Set value by name |

### 4. Frontend (`rhwp-studio/src/core/wasm-bridge.ts`)

Added 5 field API wrappers to WasmBridge class.

### 5. Error Handling (`src/error.rs`)

Added `HwpError::InvalidField` variant.

### 6. Tests (3 types)

- `test_task230_get_field_list` — Field list query, verified 11 fields
- `test_task230_get_field_value` — Value query by field_id/name
- `test_task230_set_field_value` — Set value on empty field → re-rendering verification

## Changed Files

| File | Changes |
|------|---------|
| `src/model/control.rs` | Added field_name(), field_type_str(), extract_wstring_value() |
| `src/error.rs` | Added InvalidField error variant |
| `src/document_core/queries/mod.rs` | Registered field_query module |
| `src/document_core/queries/field_query.rs` | New field query/set engine |
| `src/wasm_api.rs` | Added 5 field WASM APIs |
| `rhwp-studio/src/core/wasm-bridge.ts` | Added 5 field API wrappers |
| `src/wasm_api/tests.rs` | Added 3 tests |

## Test Results

- All 703 tests passed (including 3 task 230 tests)
