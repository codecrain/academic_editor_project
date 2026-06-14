# 타스크 146 수행계획서: 거대 함수 분해

## 1. 개요

3개의 거대 함수(`build_render_tree` ~921줄, `paginate_with_measured` ~1,455줄, `layout_table` ~1,002줄)를 각각 ≤100줄 오케스트레이터로 분해한다.

## 2. 목표

- `build_render_tree`: 12개 private 메서드로 분해 → ~85줄 오케스트레이터
- `paginate_with_measured`: PaginationState 구조체 도입 + 서브모듈 분리 → ~85줄
- `layout_table`: 순수 계산 함수 추출 + 셀 레이아웃 분리 → ~85줄
- `table_partial.rs` 중복 ~750줄 제거 (공유 함수 활용)

## 3. 변경 파일

| 파일 | 변경 |
|------|------|
| src/renderer/layout.rs | build_render_tree 분해 (12개 메서드) |
| src/renderer/pagination/engine.rs | paginate_with_measured 분해 |
| src/renderer/pagination/state.rs (신규) | PaginationState 구조체 |
| src/renderer/pagination/text_pagination.rs (신규) | 텍스트 줄 분할 |
| src/renderer/pagination/table_pagination.rs (신규/확장) | 표 분할 |
| src/renderer/pagination/finalization.rs (신규) | 마무리 처리 |
| src/renderer/layout/table_layout.rs | layout_table 분해 |
| src/renderer/layout/table_partial.rs | 중복 → 공유 함수 호출 |

## 4. 검증

- 매 단계: `docker compose --env-file .env.docker run --rm test` (582개 통과)
- 최종: WASM 빌드 + Clippy 0
