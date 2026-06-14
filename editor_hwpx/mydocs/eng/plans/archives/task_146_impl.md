# Task 146 Implementation Plan: Giant Function Decomposition

## Step 1: build_render_tree — Page Element Extraction

Extract 8 independent rendering blocks as private methods: build_page_background, build_page_borders, build_master_page, build_header, build_footer, build_column_separators, build_footnote_area_node, build_page_number

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass

## Step 2: build_render_tree — Column Processing Loop Extraction

Decompose 548-line column processing loop into 4 functions: build_columns, build_single_column, layout_column_item, layout_column_shapes_pass. Achieve ~85-line orchestrator.

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass

## Step 3: paginate_with_measured — Introduce PaginationState

12 mutable states → PaginationState struct. Flush/new page boilerplate at 10+ locations → method calls. Extract 3 break handlers.

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass

## Step 4: paginate_with_measured — Text/Table/Finalization Extraction

Extract paginate_text_lines (~330 lines), paginate_table_control (~600 lines), finalize_pages (~124 lines). Achieve ~85-line orchestrator.

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass

## Step 5: layout_table — Computation Functions + Position Determination Extraction

Extract 6 functions including resolve_column_widths, resolve_row_heights, compute_table_grid, compute_table_x/y_position (~465 lines).

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass

## Step 6: layout_table — Cell Layout + table_partial Duplication Removal

Extract layout_table_cell (~436 lines). Replace shared function calls in table_partial.rs (~750 lines duplication removed). Achieve ~85-line orchestrator.

### Verification
- `docker compose --env-file .env.docker run --rm test` — 582 tests pass
- `docker compose --env-file .env.docker run --rm wasm` — WASM build
- `docker compose --env-file .env.docker run --rm dev cargo clippy -- -D warnings` — 0 warnings
