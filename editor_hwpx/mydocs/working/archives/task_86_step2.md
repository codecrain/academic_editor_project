# 타스크 86 — 2단계 완료보고서

## WASM API + 브릿지 + 단축키 등록

### 수정 내용

**`src/wasm_api.rs`**:
- `deleteTableRow(sec, ppi, ci, rowIdx)` WASM 바인딩 + 네이티브 구현 추가
- `deleteTableColumn(sec, ppi, ci, colIdx)` WASM 바인딩 + 네이티브 구현 추가

**`rhwp-studio/src/core/wasm-bridge.ts`**:
- `insertTableRow()` 브릿지 메서드 추가
- `insertTableColumn()` 브릿지 메서드 추가
- `deleteTableRow()` 브릿지 메서드 추가
- `deleteTableColumn()` 브릿지 메서드 추가

**`rhwp-studio/src/command/shortcut-map.ts`**:
- `Alt+Insert` → `table:insert-col-left` 등록
- `Alt+Delete` → `table:delete-col` 등록

### 검증
- WASM 빌드: 성공
- Vite 빌드: 성공
