# 타스크 198 — 3단계 완료 보고서: 네이티브 단위 테스트 추가

## 수행 내용

`src/renderer/pagination/tests.rs`에 표 페이지 분할 검증 테스트 4개 추가.

### 추가된 테스트

| 테스트 | 시나리오 | 검증 내용 |
|--------|----------|-----------|
| `test_table_split_10rows_at_page_bottom` (S1) | 10행 표가 페이지 하단에서 시작 | 행 단위 분리, 행 범위 연속성, 전체 행 커버 |
| `test_table_split_50rows_multi_page` (S2) | 50행 대형 표 | 3+페이지 분할, 행 범위 연속성, 50행 완전 커버 |
| `test_table_split_with_nested_table` (S3) | 셀 내 중첩 표(10행)가 있는 외부 표 | PartialTable 분할 발생 확인 |
| `test_table_height_within_body_area` (S4) | 5개 표 연속 배치 (B-011 재현) | 각 페이지 콘텐츠 높이가 body area 이내 |

### 테스트 설계 포인트

- **S1**: 필러 문단(~500px)으로 페이지 하단 상황 시뮬레이션 → 남은 공간에 10행 표가 안 맞아 분할
- **S2**: 50행 단일 열 대형 표가 여러 페이지에 걸쳐 빠짐없이 분할되는지 검증
- **S3**: 중첩 표의 전체 높이(~1067px)가 body area(~826px)를 초과하여 외부 표가 분할되는 상황
- **S4**: measured_table의 cumulative_heights를 이용해 PartialTable 부분 높이를 계산하여 body area 초과 여부 검증

## 검증 결과

- 전체 테스트: **681 passed**, 0 failed, 1 ignored
  - 기존 677개 + 신규 4개
