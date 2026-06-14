# 타스크 85 — 1단계 완료보고서

## WASM 브릿지 + InputHandler 메서드 추가

### 수정 내용

**`rhwp-studio/src/core/wasm-bridge.ts`**:
- `mergeTableCells(sec, ppi, ci, startRow, startCol, endRow, endCol)` → `{ok, cellCount}`
- `splitTableCell(sec, ppi, ci, row, col)` → `{ok, cellCount}`

**`rhwp-studio/src/engine/input-handler.ts`**:
- `getSelectedCellRange()` → cursor 위임, 셀 선택 범위 반환
- `getCellTableContext()` → cursor 위임, 표 컨텍스트 반환
- `exitCellSelectionMode()` → 셀 선택 모드 종료 + 렌더러 클리어 + 캐럿 갱신

### 검증
- Vite 빌드: 성공
