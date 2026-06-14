# Task 144 Implementation Plan: JSON Utility Consolidation

## Step 1: Extend helpers.rs — Add New Functions

Add new functions only, no changes to existing code.

### New Functions

| Function | Description |
|----------|-------------|
| `json_u32(json, key) -> Option<u32>` | Unsigned integer parsing |
| `json_u8(json, key) -> Option<u8>` | Delegates to json_u32 |
| `json_i16(json, key) -> Option<i16>` | Delegates to json_i32 |
| `json_f64(json, key) -> Option<f64>` | Floating point parsing |
| `json_usize(json, key) -> Result<usize, HwpError>` | Required field parsing (returns error) |
| `json_str` upgrade | Escape sequence decoding (`\"`, `\\`, `\n`, `\r`, `\t`) |
| `json_escape(s) -> String` | JSON string escaping |
| `json_ok_with(fields) -> String` | `{"ok":true,...fields}` response generation |

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass

## Step 2: Remove Duplicate Parsing Functions

Delete 14 local functions from 5 modules and replace with helpers.rs calls.

### Change Targets

| Module | Deleted Functions | Replacement |
|--------|-----------------|-------------|
| object_ops.rs | extract_u32, extract_i32, extract_bool, extract_str | json_u32, json_i32, json_bool, json_str |
| rendering.rs | parse_u32, parse_bool | json_u32, json_bool |
| table_ops.rs | parse_u32, parse_i16, parse_u8, parse_bool x2 | json_u32, json_i16, json_u8, json_bool |
| cursor_nav.rs | extract_num, extract_json_int | json_f64 + unwrap_or, json_usize |
| cursor_rect.rs | extract_json_f64 | json_f64 |

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass

## Step 3: Consolidate JSON Escaping

Replace `.replace(...)` chains at 11 locations across 5 modules with `json_escape()` calls.

### Change Targets

| Module | Location |
|--------|----------|
| clipboard.rs | 2 locations (L104-108, L185-189) |
| document.rs | 4 locations (L149, L151, L163, L177) |
| formatting.rs | 2 locations (L87-88, L103) |
| object_ops.rs | 1 location (L69-73) |
| rendering.rs | 2 locations (L193-196, L223-224) |

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass

## Step 4: Apply JSON Response Generation Helper

Replace high-frequency `format!("{{` patterns (≥2 repetitions) with `json_ok_with()` calls.

### Change Targets

| Pattern | Module | Count |
|---------|--------|-------|
| `{"ok":true,"charOffset":N}` | text_editing.rs | 4 |
| `{"ok":true,"paraIdx":N,"charOffset":N}` | text_editing.rs | 4 |
| `{"ok":true,"cellParaIndex":N,"charOffset":N}` | text_editing.rs | 2 |
| `{"ok":true,"rowCount":N,"colCount":N}` | table_ops.rs | 4 |
| `{"ok":true,"cellCount":N}` | table_ops.rs | 4 |
| `{"ok":true,"text":"..."}` | clipboard.rs | 3 |
| `{"ok":true,"paraIdx":N,"controlIdx":0}` | object_ops.rs | 2 |

Single-occurrence patterns are not replaced.

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass
- `docker compose --env-file .env.docker run --rm wasm` — WASM build
- `npx tsc --noEmit` — TypeScript compilation
- `docker compose --env-file .env.docker run --rm dev cargo clippy -- -D warnings`
