# Task 144 Execution Plan: JSON Utility Consolidation

## 1. Overview

Consolidate scattered manual JSON parsing/generation code across `wasm_api/` modules into `helpers.rs`.

## 2. Current Status

- 14 local JSON parsing functions duplicated across 5 modules
- 11 locations repeating the same `.replace(...)` JSON escape chain
- 36 locations individually generating `format!("{{` JSON responses

## 3. Goals

- Consolidate 14 duplicate parsing functions → common functions in `helpers.rs`
- Consolidate 11 JSON escape locations → single `json_escape()` function
- Consolidate 23 high-frequency JSON response patterns → `json_ok_with()` helper
- All existing 582 tests pass

## 4. Change Scope

| File | Change Description |
|------|-------------------|
| helpers.rs | Add json_u32/u8/i16/f64/usize, json_str upgrade, json_escape, json_ok_with |
| object_ops.rs | Delete 4 extract_* functions, replace escapes |
| rendering.rs | Delete 2 parse_* functions, replace escapes |
| table_ops.rs | Delete 5 parse_* functions, replace response generation |
| cursor_nav.rs | Remove extract_num/extract_json_int |
| cursor_rect.rs | Remove extract_json_f64 |
| clipboard.rs | Replace escape + response generation |
| document.rs | Replace escapes |
| formatting.rs | Replace escapes |
| text_editing.rs | Replace response generation |

## 5. Constraints

- Maintain no serde_json usage (WASM binary size)
- No functional changes (pure refactoring)
- No JS/TS changes

## 6. Verification

- Each step: `docker compose --env-file .env.docker run --rm test`
- Final: WASM build + TypeScript compilation + Clippy
