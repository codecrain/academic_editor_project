# Task 230: Field WASM API and Data Binding

## Goal

Provide a WASM API for querying/setting values by field name (or command) from external JavaScript. This is a core requirement for web document authoring, enabling programmatic data population of HWP form document ClickHere fields.

## Implementation Plan

### Step 1: Field Query API (Rust)

Add `field_name()` method to Field model (extract Name from command). Implement helper for recursive field search across the entire document.

**WASM API**:
- `getFieldList()` → JSON array
- `getFieldValue(fieldId)` → field current value (text)
- `getFieldValueByName(name)` → query by name

### Step 2: Field Value Set API (Rust + Rendering)

Replace text within field range (start~end). Handle guide text ↔ user input transition. Invalidate render tree cache.

**WASM API**:
- `setFieldValue(fieldId, value)` → set field value
- `setFieldValueByName(name, value)` → set by name

### Step 3: Frontend Integration + Testing

Add field API wrappers to WasmBridge. Test: field query → value set → re-render → SVG verification.
