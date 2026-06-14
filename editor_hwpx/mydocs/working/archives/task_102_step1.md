# 타스크 102 — 1단계 완료 보고서

## 단계명
Dense Grid 인덱스 + MeasuredTable 전달

## 작업 기간
2026-02-17

## 수정 내역

### 1. Table에 cell_grid 2D 인덱스 추가
- `src/model/table.rs`: `cell_grid: Vec<Option<usize>>` 필드 추가
- `#[derive(Default)]`로 빈 Vec 자동 초기화
- HWP 직렬화(파싱/저장)에 영향 없음 (런타임 전용 인덱스)

### 2. Grid API 구현
- `rebuild_grid()`: 셀 목록에서 2D 그리드 인덱스 재구축. 병합 셀의 span 영역 전체가 앵커 셀 인덱스를 가리킴
- `cell_index_at(row, col) -> Option<usize>`: O(1) 셀 인덱스 조회
- `cell_at(row, col) -> Option<&Cell>`: O(1) 불변 셀 접근
- `cell_at_mut(row, col) -> Option<&mut Cell>`: O(1) 가변 셀 접근

### 3. 편집 API에 rebuild_grid() 호출 추가
- `insert_row()`, `insert_column()`, `delete_row()`, `delete_column()`, `merge_cells()`, `split_cell()` — 6개 메서드 끝에 `self.rebuild_grid()` 호출

### 4. 파서에서 rebuild_grid() 호출
- `src/parser/control.rs`: HWP 바이너리 파서 — 표 파싱 완료 직전 호출
- `src/parser/hwpx/section.rs`: HWPX XML 파서 — 표 파싱 완료 직전 호출
- `src/wasm_api.rs`: 표 생성 API (`insert_table`) — 테이블 구성 후 호출

### 5. find_cell_at_row_col → cell_index_at 전환
- `src/wasm_api.rs:3293`: O(n) 선형탐색 `find_cell_at_row_col()` → O(1) `table.cell_index_at()` 전환
- `find_cell_at_row_col()` 함수 삭제

### 6. MeasuredTable 전달 파이프라인 구축
- `src/renderer/pagination.rs`: `paginate()` 반환 타입 `PaginationResult` → `(PaginationResult, MeasuredSection)` 튜플로 확장
- `src/wasm_api.rs`: HwpDocument에 `measured_tables: Vec<Vec<MeasuredTable>>` 필드 추가. paginate() 후 구역별 표 측정 데이터 보존
- `src/renderer/layout.rs`: `layout_table()` 시그니처에 `measured_table: Option<&MeasuredTable>` 추가. 본문 표 렌더링 시 MeasuredTable.row_heights 직접 사용, 마스터 페이지/머리글/꼬리글은 None(기존 계산 폴백)
- `build_render_tree()` 시그니처에 `measured_tables: &[MeasuredTable]` 추가

### 7. 테스트
- 7개 신규 테스트 추가:
  - `test_rebuild_grid_basic`, `test_rebuild_grid_merged`
  - `test_cell_at_basic`, `test_cell_at_out_of_bounds`, `test_cell_at_merged_span`
  - `test_cell_index_at_basic`, `test_edit_ops_rebuild_grid`

## 테스트 결과
- 554개 테스트 통과 (기존 547 + 신규 7)
- WASM 빌드 성공
- Vite 빌드 성공

## 수정 파일
| 파일 | 변경 |
|------|------|
| `src/model/table.rs` | +165줄 (cell_grid, API, 테스트) |
| `src/parser/control.rs` | +1줄 |
| `src/parser/hwpx/section.rs` | +1줄 |
| `src/renderer/layout.rs` | +29줄, -2줄 |
| `src/renderer/pagination.rs` | +13줄, -18줄 |
| `src/wasm_api.rs` | +18줄, -13줄 |
