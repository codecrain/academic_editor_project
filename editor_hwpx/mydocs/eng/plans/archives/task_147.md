# Task 147 Execution Plan: CQRS Command/Query File Separation

## 1. Overview

Reclassify 11 `wasm_api/` modules into `commands/` (7) and `queries/` (3).

## 2. Classification

- **commands/**: document, text_editing, table_ops, object_ops, formatting, clipboard, html_import
- **queries/**: rendering, cursor_nav, cursor_rect
- **Remain at root**: helpers, html_table_import, tests

## 3. Changed Files

| File | Change |
|------|--------|
| src/wasm_api.rs | Reorganize mod declarations (12 → 4) |
| src/wasm_api/commands/mod.rs (new) | 7 mod declarations |
| src/wasm_api/commands/*.rs (7 files) | super:: → super::super:: |
| src/wasm_api/queries/mod.rs (new) | 3 mod declarations |
| src/wasm_api/queries/*.rs (3 files) | super:: → super::super:: |

## 4. Verification

- Each step: `docker compose --env-file .env.docker run --rm test` (582 pass)
- Final: WASM build + Clippy 0
