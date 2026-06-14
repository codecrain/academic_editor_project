# 타스크 86 — 1단계 완료보고서

## Rust 모델 — delete_row / delete_column 구현 + 테스트

### 수정 내용

**`src/model/table.rs`**:
- `Table::delete_row(row_idx)` 메서드 추가
  - 범위 검증, 최소 1행 보장
  - 병합 셀 row_span 축소, 앵커 행 삭제 시 다음 행으로 이동
  - 아래 셀 row 시프트, row_count/row_sizes 갱신
- `Table::delete_column(col_idx)` 메서드 추가
  - 범위 검증, 최소 1열 보장
  - 병합 셀 col_span/width 축소, 앵커 열 삭제 시 다음 열로 이동
  - 오른쪽 셀 col 시프트, col_count/row_sizes 갱신
- 단위 테스트 14개 추가 (delete_row 7개 + delete_column 7개)

### 검증
- Rust 테스트: 510개 전체 통과 (기존 496 + 신규 14)
