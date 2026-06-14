# 타스크 146 구현계획서: 거대 함수 분해

## 1단계: build_render_tree — 페이지 요소 추출

8개 독립 렌더링 블록을 private 메서드로 추출: build_page_background, build_page_borders, build_master_page, build_header, build_footer, build_column_separators, build_footnote_area_node, build_page_number

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과

## 2단계: build_render_tree — 단 처리 루프 추출

548줄 단 처리 루프를 4개 함수로 분해: build_columns, build_single_column, layout_column_item, layout_column_shapes_pass. 오케스트레이터 ~85줄 달성.

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과

## 3단계: paginate_with_measured — PaginationState 도입

12개 가변 상태 → PaginationState 구조체. flush/새 페이지 보일러플레이트 10+곳 → 메서드 호출. 나누기 처리 3개 추출.

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과

## 4단계: paginate_with_measured — 텍스트/표/마무리 추출

paginate_text_lines (~330줄), paginate_table_control (~600줄), finalize_pages (~124줄) 등 추출. 오케스트레이터 ~85줄 달성.

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과

## 5단계: layout_table — 계산 함수 + 위치 결정 추출

resolve_column_widths, resolve_row_heights, compute_table_grid, compute_table_x/y_position 등 6개 함수 추출 (~465줄).

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과

## 6단계: layout_table — 셀 레이아웃 + table_partial 중복 제거

layout_table_cell (~436줄) 추출. table_partial.rs에서 공유 함수 호출로 교체 (~750줄 중복 제거). 오케스트레이터 ~85줄 달성.

### 검증
- `docker compose --env-file .env.docker run --rm test` — 582개 테스트 통과
- `docker compose --env-file .env.docker run --rm wasm` — WASM 빌드
- `docker compose --env-file .env.docker run --rm dev cargo clippy -- -D warnings` — 0개
