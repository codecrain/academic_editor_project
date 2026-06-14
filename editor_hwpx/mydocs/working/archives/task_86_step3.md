# 타스크 86 — 3단계 완료보고서

## 커맨드 execute 6개 구현

### 수정 내용

**`rhwp-studio/src/command/commands/table.ts`**:
- `table:insert-row-above` 스텁 → 실제 구현: `getCellInfo()` → `insertTableRow(row, false)` → `document-changed`
- `table:insert-row-below` 스텁 → 실제 구현: `getCellInfo()` → `insertTableRow(row, true)` → `document-changed`
- `table:insert-col-left` 스텁 → 실제 구현: `getCellInfo()` → `insertTableColumn(col, false)` → `document-changed`
- `table:insert-col-right` 스텁 → 실제 구현: `getCellInfo()` → `insertTableColumn(col, true)` → `document-changed`
- `table:delete-row` 스텁 → 실제 구현: `getCellInfo()` → `deleteTableRow(row)` → `document-changed`
- `table:delete-col` 스텁 → 실제 구현: `getCellInfo()` → `deleteTableColumn(col)` → `document-changed`

공통 패턴: 커서 위치 → cellInfo 조회 → WASM 호출 → document-changed 이벤트

### 검증
- Vite 빌드: 성공
