# 타스크 59: 표 셀 내부 줄 단위 페이지 분할 — 구현계획서

## 1단계: 데이터 구조 확장 + 측정 로직 (~120줄)

### height_measurer.rs

1. `MeasuredCell` 구조체 추가 (row, col, row_span, padding, line_heights, total_content_height, para_line_counts)
2. `MeasuredTable`에 `cells: Vec<MeasuredCell>`, `page_break: TablePageBreak` 필드 추가
3. `measure_table()`에서 `CellBreak`일 때 셀별 줄 단위 데이터 수집
4. 헬퍼 메서드: `remaining_content_for_row()`, `max_padding_for_row()`, `effective_row_height()`

### pagination.rs

5. `PageItem::PartialTable`에 `split_start_content_offset: f64`, `split_end_content_limit: f64` 추가
6. 기존 PartialTable 생성 4곳에 `0.0` 디폴트값 추가

## 2단계: Pagination 행 내부 분할 로직 (~80줄)

### pagination.rs (lines 569-686)

1. `content_offset: f64` 상태 변수 추가
2. `CellBreak` 분기: 행이 안 들어갈 때 셀 내용 부분 배치
3. `r > cursor_row`: 완전 행들 + 부분 행 배치
4. `r == cursor_row`: 첫 행 안 들어감 → 인트라-로우 분할
5. continuation 행 유효 높이 계산
6. 페이지 플러시 후 cursor_row 유지

## 3단계: Layout 분할 행 셀 렌더링 (~90줄)

### layout.rs

1. `PartialTable` dispatch (line 323) 새 필드 전달
2. `layout_partial_table()` 시그니처 확장
3. 분할 행 높이 오버라이드
4. `compute_cell_line_range()` 헬퍼: content_offset/limit → (start_line, end_line) per paragraph
5. 셀 렌더링 루프에서 줄 범위 적용
6. 분할 행 Top 정렬 강제

## 4단계: 빌드 검증 + 테스트 + 시각 확인

1. WASM 빌드 성공
2. 기존 테스트 통과
3. 유닛 테스트 3종: intra_row_split, cell_break_disabled, multi_page_row
4. k-water-rfp.hwp SVG 시각 검증
