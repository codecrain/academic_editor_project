# Task 146 Execution Plan: Giant Function Decomposition

## 1. Overview

Decompose 3 giant functions (`build_render_tree` ~921 lines, `paginate_with_measured` ~1,455 lines, `layout_table` ~1,002 lines) into ≤100-line orchestrators each.

## 2. Goals

- `build_render_tree`: Decompose into 12 private methods → ~85-line orchestrator
- `paginate_with_measured`: Introduce PaginationState struct + submodule separation → ~85 lines
- `layout_table`: Extract pure computation functions + cell layout separation → ~85 lines
- Remove ~750 lines of duplication in `table_partial.rs` (using shared functions)

## 3. Changed Files

| File | Change |
|------|--------|
| src/renderer/layout.rs | Decompose build_render_tree (12 methods) |
| src/renderer/pagination/engine.rs | Decompose paginate_with_measured |
| src/renderer/pagination/state.rs (new) | PaginationState struct |
| src/renderer/pagination/text_pagination.rs (new) | Text line splitting |
| src/renderer/pagination/table_pagination.rs (new/extended) | Table splitting |
| src/renderer/pagination/finalization.rs (new) | Finalization processing |
| src/renderer/layout/table_layout.rs | Decompose layout_table |
| src/renderer/layout/table_partial.rs | Duplication → shared function calls |

## 4. Verification

- Each step: `docker compose --env-file .env.docker run --rm test` (582 pass)
- Final: WASM build + Clippy 0
