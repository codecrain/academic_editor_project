# Task 215 — 1단계 완료보고서

## 완료 내용

### BreakToken 자료구조 도입

- `TableBreakToken`: 표 분할 재개 정보 (start_row, cell_content_offsets)
- `FormattedTable`: 표의 format() 결과 (row_heights, host_spacing, effective_height, header_row_count 등)
- `HostSpacing`: 호스트 문단의 before/after spacing 분리

### format_table() 구현

- MeasuredTable 데이터 + host_spacing을 통합 계산
- layout과 동일한 규칙으로 host_spacing 계산:
  - spacing_before: 단 상단 제외, text_wrap=1 비-TAC 표 제외
  - spacing_after: sa + outer_margin_bottom + host_line_spacing
  - outer_margin: TAC 표에만 적용

### typeset_table_paragraph() 리팩터링

- 기존 Phase 1 호환 코드(process_table_controls, split_table_into_pages) 제거
- 각 컨트롤별 format → fits → place/split 패턴 적용:
  - `typeset_tac_table()`: TAC 표 조판 (분할 없이 통째 배치, 다중 TAC LINE_SEG 기반)
  - `typeset_block_table()`: 비-TAC 블록 표 조판 (Break Token 기반 행 분할)

### typeset_block_table() Break Token 기반 행 분할

- 기존 Paginator의 split_table_rows와 동일한 높이 누적 규칙 적용:
  - 전체 배치: `cumulative + host_spacing_total`
  - 마지막 fragment: `cumulative + spacing_after`
  - 중간 fragment: host_spacing 없이 다음 페이지로 이동
- 머리행 반복 (header_row_count > 0 시 continuation fragment에서 반복)
- 첫 행이 남은 공간보다 크면 다음 페이지로 이동

## 검증 결과

### TYPESET_VERIFY 비교

| 문서 | Phase 1 | Phase 2 1단계 | Paginator |
|------|---------|-------------|-----------|
| k-water-rfp sec1 | 25→27 | 25→28 | 25 |
| kps-ai sec0 | 79→75 | 79→81 | 79 |
| hwpp-001 sec3 | 57→55 | **일치** | 57 |
| p222 sec2 | 44→43 | **일치** | 44 |
| hongbo | 일치 | 일치 | - |
| biz_plan | 일치 | 일치 | - |

### 개선 사항
- hwpp-001: 55→57 (Paginator와 완전 일치)
- p222: 43→44 (Paginator와 완전 일치)
- kps-ai: 75→81 (75보다 79에 가까워짐, 방향은 올바름)

### 남은 차이 원인
- k-water-rfp, kps-ai: 인트라-로우 분할, 캡션 처리, find_break_row 등 세밀한 분할 로직 미구현
- 2~3단계에서 해결 예정

### 테스트
- 694개 PASS, 0 FAIL
- 빌드 성공
