# 타스크 147 수행계획서: CQRS Command/Query 파일 분리

## 1. 개요

`wasm_api/` 11개 모듈을 `commands/` (7개)와 `queries/` (3개)로 재분류한다.

## 2. 분류

- **commands/**: document, text_editing, table_ops, object_ops, formatting, clipboard, html_import
- **queries/**: rendering, cursor_nav, cursor_rect
- **루트 유지**: helpers, html_table_import, tests

## 3. 변경 파일

| 파일 | 변경 |
|------|------|
| src/wasm_api.rs | mod 선언 재구성 (12개 → 4개) |
| src/wasm_api/commands/mod.rs (신규) | 7개 mod 선언 |
| src/wasm_api/commands/*.rs (7개) | super:: → super::super:: |
| src/wasm_api/queries/mod.rs (신규) | 3개 mod 선언 |
| src/wasm_api/queries/*.rs (3개) | super:: → super::super:: |

## 4. 검증

- 매 단계: `docker compose --env-file .env.docker run --rm test` (582개 통과)
- 최종: WASM 빌드 + Clippy 0
