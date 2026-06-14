# 타스크 85 구현계획서: 셀 병합/나누기

## 구현 단계 (3단계)

### 1단계: WASM 브릿지 + InputHandler 메서드

**수정 파일**: `rhwp-studio/src/core/wasm-bridge.ts`, `rhwp-studio/src/engine/input-handler.ts`

1. `wasm-bridge.ts`에 2개 메서드 추가:
   - `mergeTableCells(sec, ppi, ci, startRow, startCol, endRow, endCol)` → `{ok, cellCount}`
   - `splitTableCell(sec, ppi, ci, row, col)` → `{ok, cellCount}`

2. `input-handler.ts`에 3개 공용 메서드 추가:
   - `getSelectedCellRange()` → 셀 선택 범위 (cursor 위임)
   - `getCellTableContext()` → 표 컨텍스트 (cursor 위임)
   - `exitCellSelectionMode()` → 셀 선택 모드 종료 + 렌더러 클리어 + 캐럿 갱신

**완료 기준**: Vite 빌드 성공

---

### 2단계: 커맨드 execute + 단축키 구현

**수정 파일**: `rhwp-studio/src/command/commands/table.ts`, `rhwp-studio/src/engine/input-handler.ts`

1. `table:cell-merge` 스텁 → 실제 구현:
   - `canExecute`: `ctx.inCellSelectionMode`
   - `execute`: 셀 범위 조회 → `wasm.mergeTableCells()` 호출 → 셀 선택 모드 종료 → `document-changed`

2. `table:cell-split` 스텁 → 실제 구현:
   - `canExecute`: `inTable`
   - `execute`: `wasm.getCellInfo()` → rowSpan/colSpan > 1 확인 → `wasm.splitTableCell()` 호출 → `document-changed`

3. `input-handler.ts` 셀 선택 모드 키 처리 블록에 추가:
   - `M` 키: `table:cell-merge` 디스패치
   - `S` 키: `table:cell-split` 디스패치

**완료 기준**: Vite 빌드 성공

---

### 3단계: 빌드 검증 + 웹 테스트

1. WASM 빌드 확인 (Rust 코드 변경 없으므로 재빌드 불필요, Vite 캐시만 삭제)
2. Vite 빌드 최종 확인
3. 웹 검증:
   - F5 → 셀 범위 선택 → M(병합) 동작
   - 병합된 셀에서 F5 → S(나누기) 동작
   - 컨텍스트 메뉴에서 셀 합치기/나누기 동작

**완료 기준**: 전체 빌드 성공, 병합/나누기 동작 확인
