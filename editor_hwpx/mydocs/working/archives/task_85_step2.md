# 타스크 85 — 2단계 완료보고서

## 커맨드 execute + 단축키 구현

### 수정 내용

**`rhwp-studio/src/command/commands/table.ts`**:
- `table:cell-merge` 스텁 → 실제 구현
  - `canExecute`: `ctx.inCellSelectionMode`
  - `execute`: 셀 범위 조회 → `mergeTableCells()` → 셀 선택 모드 종료 → `document-changed`
- `table:cell-split` 스텁 → 실제 구현
  - `canExecute`: `inTable`
  - `execute`: `getCellInfo()` → rowSpan/colSpan > 1 확인 → `splitTableCell()` → `document-changed`

**`rhwp-studio/src/engine/input-handler.ts`**:
- 셀 선택 모드 키 처리 블록에 M/S 키 추가
  - `M` 키: `table:cell-merge` 디스패치
  - `S` 키: `table:cell-split` 디스패치

### 검증
- Vite 빌드: 성공
