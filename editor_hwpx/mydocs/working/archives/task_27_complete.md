# 타스크 27: 표 페이지 나누기 — 완료 보고서

## 결과 요약

페이지 본문 영역을 초과하는 표를 행 단위로 분할하여 여러 페이지에 렌더링하는 기능을 구현했다.

### 구현 결과

| 항목 | 결과 |
|------|------|
| 테스트 | 384개 통과 (기존 381 + 신규 3) |
| WASM 빌드 | 성공 |
| SVG 출력 | k-water-rfp.hwp 5-6페이지 표 분할 확인 |

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/pagination.rs` | `PageItem::PartialTable` 추가, 행 단위 분할 로직, 테스트 3개 |
| `src/renderer/layout.rs` | `layout_partial_table()` 함수 추가, PartialTable 렌더링 분기 |
| `src/renderer/height_measurer.rs` | `MeasuredTable`에 `cell_spacing`, `repeat_header` 필드 추가, `get_measured_table()` 메서드 |

### 핵심 알고리즘

1. **페이지네이션 분할** (`pagination.rs`):
   - 표 높이가 남은 페이지 영역을 초과하면 `MeasuredTable.row_heights`를 이용해 행별 누적 높이로 분할점 결정
   - 각 페이지에 `PageItem::PartialTable { start_row, end_row, is_continuation }` 배치
   - `repeat_header=true`인 표의 연속 페이지에서 제목행(행0) 높이를 사용 가능 영역에서 차감

2. **부분 표 렌더링** (`layout.rs`):
   - `layout_partial_table()`: 전체 열폭/행높이 계산 후 지정 행 범위만 렌더링
   - `is_continuation && repeat_header` → 제목행을 먼저 렌더링 후 본문 행 배치
   - 병합 셀(row_span): 렌더링 범위 내 행만 높이 합산
   - 페이지 경계를 넘는 row_span 셀: 시작행이 render_rows에 없어도 span 범위 내 첫 번째 render_row에서 렌더링

### 검증 결과 (k-water-rfp.hwp)

**변경 전:**
- 5페이지: 텍스트만 (표가 6페이지로 밀림)
- 6페이지: 표 전체 (y=113→1166, 페이지 높이 1122 초과 overflow)

**변경 후:**
- 5페이지: 텍스트 + 표 시작 (헤더+행1+행2, y=309→633 페이지 내)
- 6페이지: 헤더 반복 + 행3 (y=113→883 페이지 내) + 후속 텍스트

### 버그 수정

- **row_span 셀 경계선 누락**: 연속 페이지에서 "제안서" 셀(row=2, col=0, row_span=2)의 왼쪽 경계선이 렌더링되지 않는 문제
  - 원인: `render_rows = [0, 3]`에서 `cell_row=2`를 exact match로 찾아 None → continue
  - 수정: `or_else()`로 셀 span 범위 내 첫 번째 render_row를 fallback 검색

### 신규 테스트

- `test_table_page_split`: 큰 표가 PartialTable로 분할되는지 확인
- `test_table_fits_single_page`: 작은 표가 Table로 배치되는지 확인
- `test_table_split_with_repeat_header`: repeat_header 표의 is_continuation 확인
