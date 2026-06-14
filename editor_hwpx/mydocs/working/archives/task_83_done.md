# 타스크 83 완료 보고서: F5 셀 선택 모드 + 셀 범위 선택

## 완료 요약

HWP의 F5 셀 블록 선택 모드를 구현했다. 표 셀 내부에서 F5를 누르면 셀 선택 모드에 진입하고, 화살표 키로 선택 셀을 이동하며, 선택된 셀 영역에 파란색 하이라이트 오버레이가 표시된다.

## 변경 파일

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `src/wasm_api.rs` | 수정 | `getTableCellBboxes` API 추가 — 표의 모든 셀 bbox 반환 |
| `rhwp-studio/src/core/types.ts` | 수정 | `CellBbox` 인터페이스 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 | `getTableCellBboxes()` 브릿지 메서드 추가 |
| `rhwp-studio/src/engine/cursor.ts` | 수정 | 셀 선택 모드 상태 관리 (enter/exit/move/shift/ctrl/getRange) |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 | F5 키 핸들러, 화살표/ESC/Shift+클릭/Ctrl+클릭 처리 |
| `rhwp-studio/src/engine/cell-selection-renderer.ts` | 신규 | 셀 범위 하이라이트 오버레이 렌더러 (excluded 셀 지원) |
| `rhwp-studio/src/command/types.ts` | 수정 | EditorContext에 `inCellSelectionMode` 추가 |
| `rhwp-studio/src/main.ts` | 수정 | CellSelectionRenderer 생성/주입, getContext 확장 |
| `rhwp-studio/src/style.css` | 수정 | `.cell-selection-highlight` 스타일 추가 |

## 구현 상세

### 1. WASM API: getTableCellBboxes
- 렌더 트리에서 특정 표의 모든 셀 bbox를 수집
- 반환: `[{cellIdx, row, col, rowSpan, colSpan, pageIndex, x, y, w, h}, ...]`

### 2. 셀 선택 모드 (CursorState)
- F5 → `enterCellSelectionMode()`: 현재 셀의 row/col을 anchor/focus로 설정
- 화살표 → `moveCellSelection(dr, dc)`: anchor/focus 함께 이동 (단일 셀 선택 이동)
- Shift+클릭 → `shiftSelectCell(row, col)`: anchor 고정, focus를 클릭 셀로 (범위 선택)
- Ctrl+클릭 → `ctrlToggleCell(row, col)`: 특정 셀 선택 제외/복원 토글
- ESC / 일반 클릭 → `exitCellSelectionMode()`: 모드 종료
- `getSelectedCellRange()`: 정렬된 범위 반환
- `getExcludedCells()`: Ctrl+클릭 제외 셀 Set 반환

### 3. InputHandler 키/마우스 처리
- F5: 브라우저 새로고침 차단 (`e.preventDefault()`), 셀 선택 모드 진입
- 셀 선택 모드 + 화살표: 선택 셀 이동 + 하이라이트 갱신
- 셀 선택 모드 + ESC: 모드 종료
- 셀 선택 모드 + Shift+클릭: 범위 선택 (`hitTestCellRowCol` → `shiftSelectCell`)
- 셀 선택 모드 + Ctrl+클릭: 셀 제외 토글 (`hitTestCellRowCol` → `ctrlToggleCell`)
- 셀 선택 모드 + 우클릭: 셀 선택 영역 유지 + 컨텍스트 메뉴 표시
- 셀 선택 모드 + 일반 좌클릭: 모드 종료
- 셀 선택 모드 + 수정자 키(Shift/Ctrl/Alt/Meta) 단독: 무시 (모드 유지)

### 4. CellSelectionRenderer
- 선택 범위 내 셀에 파란색 반투명 오버레이 표시
- 병합 셀 고려 (rowSpan/colSpan 영역 교차 판정)
- excluded Set으로 Ctrl+클릭 제외 셀 스킵

## 검증 결과

- Rust 테스트: 496개 통과
- WASM 빌드: 성공
- Vite 빌드: 성공 (38 modules)
- 웹 검증: F5 셀 선택, 화살표 이동, Shift+클릭 범위선택, Ctrl+클릭 제외, 우클릭 영역유지 확인

## 브랜치

- `local/table-edit` → `local/task83`
