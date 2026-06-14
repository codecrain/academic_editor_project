# 타스크 102 — 4단계 완료 보고서

## 단계명
페이지 분할 최적화 + Section-Level Dirty 캐싱

## 작업 기간
2026-02-17

## 수정 내역

### 서브스텝 4-1: 구역 단위 Dirty 캐싱 (`src/wasm_api.rs`)
- `dirty_sections: Vec<bool>` 필드 추가 (구역별 재페이지네이션 필요 여부)
- `recompose_section(section_idx)` 헬퍼 메서드: 구역 재구성 + dirty 마킹을 단일 호출로 통합
- 편집 함수 27곳의 `compose_section()` 직접 호출을 `recompose_section()` 위임으로 기계적 치환
- 전체 재구성 3곳에 `mark_all_sections_dirty()` 추가
- `paginate()` 리팩토링: `dirty_sections[idx] == false`인 구역은 스킵하여 미편집 구역 재처리 방지

### 서브스텝 4-2: Prefix Sum + 이진 탐색 (`src/renderer/height_measurer.rs`, `src/renderer/pagination.rs`)
- `MeasuredTable`에 `cumulative_heights: Vec<f64>` 필드 추가
  - `cumulative_heights[0] = 0`, `cumulative_heights[i+1] = cumulative_heights[i] + row_heights[i] + cs`
- `find_break_row(avail, cursor_row, effective_first_row_h)`: O(log R) 이진 탐색으로 행 분할점 결정
  - `partition_point()`로 누적 높이 배열에서 available 높이에 맞는 최대 행 인덱스 탐색
- `range_height(start_row, end_row)`: O(1) 행 범위 높이 조회
  - `cumulative_heights[end] - cumulative_heights[start]` + cell_spacing 보정
- `pagination.rs` 행 분할 루프: 기존 O(R) 선형 스캔 → `find_break_row()` O(log R) 이진 탐색으로 대체
- `partial_height` 계산: 기존 O(R) `sum()` → `range_height()` O(1)로 대체
- `paginate_with_measured()` 공개화 (증분 측정 파이프라인에서 직접 호출)
- 단위 테스트 8개 추가: cumulative_heights 일관성, find_break_row (5개 시나리오), range_height

### 서브스텝 4-3: 표 Dirty 플래그 + 측정 캐시 (`src/model/table.rs`, `src/renderer/height_measurer.rs`, `src/wasm_api.rs`)
- `Table`에 `dirty: bool` 필드 추가 (Default: false)
- 8개 표 편집 함수에 `table.dirty = true` 마킹:
  - 구조 변경: `insert_table_row`, `insert_table_column`, `delete_table_row`, `delete_table_column`, `merge_table_cells`, `split_table_cell`
  - 셀 내용 변경: `insert_text_in_cell`, `delete_text_in_cell` (부모 표 dirty 마킹)
- `measure_section_incremental()`: 이전 MeasuredSection을 참조하여 dirty 표만 재측정, non-dirty 표는 clone으로 재사용
- `HwpDocument`에 `measured_sections: Vec<MeasuredSection>` 캐시 필드 추가
- `paginate()` 증분 측정 파이프라인:
  - dirty 구역 + 기존 측정 존재 → `measure_section_incremental()` 사용
  - dirty 구역 + 최초 측정 → `measure_section()` 사용
  - clean 구역 → 스킵
  - 측정 완료 후 모든 표의 dirty 플래그 초기화

## 테스트 결과
- 564개 테스트 통과 (기존 556 + height_measurer 단위 테스트 8개)
- WASM 빌드 성공
- Vite 빌드 성공

## 수정 파일
| 파일 | 변경 |
|------|------|
| `src/model/table.rs` | `dirty: bool` 필드 추가 |
| `src/renderer/height_measurer.rs` | `cumulative_heights` 필드, `find_break_row()`, `range_height()`, `measure_section_incremental()`, 단위 테스트 8개 |
| `src/renderer/pagination.rs` | 행 분할 이진 탐색 O(log R), partial_height O(1), `paginate_with_measured()` 공개화 |
| `src/wasm_api.rs` | `dirty_sections`/`measured_sections` 필드, `recompose_section()` 헬퍼, `paginate()` 증분 측정 파이프라인, 편집 함수 27+8곳 dirty 마킹 |

## 성능 개선 효과

| 연산 | 개선 전 | 개선 후 |
|------|---------|---------|
| 편집 후 페이지네이션 | O(S × P × T) 전체 구역 재처리 | O(P × T) 편집된 구역만 |
| 행 분할점 결정 | O(R) 선형 스캔 | O(log R) 이진 탐색 |
| 행 범위 높이 조회 | O(R) 합산 | O(1) 누적 배열 차분 |
| 표 측정 | 항상 전체 재측정 | dirty 표만 재측정 |

## 다음 단계
5단계: 증분 리플로우 (comemo 메모이제이션, 편집 범위 제한 재구성)
