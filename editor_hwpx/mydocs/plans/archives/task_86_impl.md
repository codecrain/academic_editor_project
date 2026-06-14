# 타스크 86 구현계획서: 행/열 추가 및 삭제

## 구현 단계 (4단계)

### 1단계: Rust 모델 — delete_row / delete_column 구현 + 테스트

**수정 파일**: `src/model/table.rs`

1. `Table::delete_row(row_idx: u16)` 메서드 추가:
   - `row_idx` 범위 검증, 최소 1행 보장 (row_count == 1이면 에러)
   - 삭제 대상 행의 셀 제거 (`cell.row == row_idx && cell.row_span == 1`)
   - 삭제 행을 걸치는 병합 셀: `row_span -= 1`
   - 삭제 행 아래 셀: `cell.row -= 1`
   - `row_count -= 1`, `rebuild_row_sizes()`, 정렬, `update_ctrl_dimensions()`

2. `Table::delete_column(col_idx: u16)` 메서드 추가:
   - `col_idx` 범위 검증, 최소 1열 보장 (col_count == 1이면 에러)
   - 삭제 대상 열의 셀 제거 (`cell.col == col_idx && cell.col_span == 1`)
   - 삭제 열을 걸치는 병합 셀: `col_span -= 1`, `width` 축소
   - 삭제 열 오른쪽 셀: `cell.col -= 1`
   - `col_count -= 1`, `rebuild_row_sizes()`, 정렬, `update_ctrl_dimensions()`

3. 단위 테스트 추가 (기존 insert_row/insert_column 테스트 패턴 참고)

**완료 기준**: `docker compose run --rm test` 전체 통과

---

### 2단계: WASM API + 브릿지 + 단축키 등록

**수정 파일**: `src/wasm_api.rs`, `rhwp-studio/src/core/wasm-bridge.ts`, `rhwp-studio/src/command/shortcut-map.ts`

1. `wasm_api.rs`에 2개 메서드 추가:
   - `deleteTableRow(sec, ppi, ci, rowIdx)` → `delete_table_row_native()` 호출
   - `deleteTableColumn(sec, ppi, ci, colIdx)` → `delete_table_column_native()` 호출
   - 반환값: `{"ok":true,"rowCount":<N>,"colCount":<M>}`

2. `wasm-bridge.ts`에 4개 메서드 추가:
   - `insertTableRow(sec, ppi, ci, rowIdx, below)` → `{ok, rowCount, colCount}`
   - `insertTableColumn(sec, ppi, ci, colIdx, right)` → `{ok, rowCount, colCount}`
   - `deleteTableRow(sec, ppi, ci, rowIdx)` → `{ok, rowCount, colCount}`
   - `deleteTableColumn(sec, ppi, ci, colIdx)` → `{ok, rowCount, colCount}`

3. `shortcut-map.ts`에 2개 단축키 등록:
   - `Alt+Insert` → `table:insert-col-left`
   - `Alt+Delete` → `table:delete-col`

**완료 기준**: WASM 빌드 성공, Vite 빌드 성공

---

### 3단계: 커맨드 execute 구현

**수정 파일**: `rhwp-studio/src/command/commands/table.ts`

6개 스텁을 실제 구현으로 교체:

1. `table:insert-row-above`:
   - `getCellInfo()` → `insertTableRow(sec, ppi, ci, row, false)` → `document-changed`

2. `table:insert-row-below`:
   - `getCellInfo()` → `insertTableRow(sec, ppi, ci, row, true)` → `document-changed`

3. `table:insert-col-left`:
   - `getCellInfo()` → `insertTableColumn(sec, ppi, ci, col, false)` → `document-changed`

4. `table:insert-col-right`:
   - `getCellInfo()` → `insertTableColumn(sec, ppi, ci, col, true)` → `document-changed`

5. `table:delete-row`:
   - `getCellInfo()` → `deleteTableRow(sec, ppi, ci, row)` → `document-changed`

6. `table:delete-col`:
   - `getCellInfo()` → `deleteTableColumn(sec, ppi, ci, col)` → `document-changed`

공통 패턴: 커서 위치 → cellInfo 조회 → WASM 호출 → document-changed 이벤트

**완료 기준**: Vite 빌드 성공

---

### 4단계: 빌드 검증 + 웹 테스트

1. WASM 빌드 + Vite 캐시 삭제 + Vite 빌드 최종 확인
2. 웹 검증:
   - 컨텍스트 메뉴에서 위/아래 줄 추가 동작
   - 컨텍스트 메뉴에서 왼/오른쪽 칸 추가 동작
   - 컨텍스트 메뉴에서 줄/칸 지우기 동작
   - Alt+Insert / Alt+Delete 단축키 동작
   - 병합 셀이 있는 행/열 삭제 시 정상 처리

**완료 기준**: 전체 빌드 성공, 행/열 추가/삭제 동작 확인
