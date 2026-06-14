# 타스크 83 수행계획서: F5 셀 선택 모드 + 셀 범위 선택

## 1. 목표

HWP의 F5 셀 블록 선택 모드를 구현한다. 표 셀 내부에서 F5를 누르면 셀 선택 모드에 진입하고, 화살표 키로 셀 범위를 확장하며, 선택된 셀 영역을 하이라이트 오버레이로 표시한다.

## 2. 현재 상태 분석

### 기존 인프라
- **CursorState**: 셀 내부 위치 관리 (`parentParaIndex`, `controlIndex`, `cellIndex`)
- **getCellInfo WASM API**: 셀의 row/col/rowSpan/colSpan 조회 가능
- **getTableDimensions WASM API**: 표의 rowCount/colCount/cellCount 조회 가능
- **SelectionRenderer**: 텍스트 선택 하이라이트 (blue overlay) 구현 완료
- **InputHandler**: F5 키 처리 없음 (현재 default 브랜치로 떨어짐)
- **get_page_control_layout_native**: 렌더 트리에서 셀 bbox를 이미 JSON으로 내보내는 API 존재 (프론트엔드 미연동)

### 부족한 부분
- 셀 선택 모드 상태 관리 없음
- F5 키 핸들러 없음
- 셀 범위 시각화 없음 (개별 셀 bbox 조회 API 없음)
- 셀 선택 모드에서 화살표 키 → 셀 범위 확장 로직 없음

## 3. 구현 범위

### 3-1. WASM API 추가: getCellBboxInTable
- 표의 모든 셀 bbox를 한번에 반환하는 API 추가
- 렌더 트리에서 TableCell 노드의 bbox를 수집
- 반환: `[{cellIdx, row, col, rowSpan, colSpan, pageIndex, x, y, w, h}, ...]`

### 3-2. CursorState 확장
- `cellSelectionMode: boolean` — 셀 선택 모드 활성 여부
- `cellSelectionAnchor: {row, col}` — 선택 시작 셀
- `cellSelectionFocus: {row, col}` — 선택 끝 셀
- `enterCellSelectionMode()` / `exitCellSelectionMode()`
- `expandCellSelection(deltaRow, deltaCol)` — 화살표로 범위 확장

### 3-3. InputHandler F5 키 처리
- F5 키 가로채기 (`e.preventDefault()` — 브라우저 새로고침 차단)
- 표 셀 내부에서 F5 → 셀 선택 모드 진입
- 셀 선택 모드에서 화살표 → 셀 범위 확장
- ESC → 셀 선택 모드 종료
- Tab/Enter 등 → 셀 선택 모드 종료

### 3-4. CellSelectionRenderer
- 선택된 셀 범위에 하이라이트 오버레이 표시
- WASM API로 셀 bbox 조회 → 범위 내 셀만 하이라이트

### 3-5. EditorContext 확장
- `inCellSelectionMode: boolean` 추가
- 컨텍스트 메뉴에서 셀 선택 상태 활용 가능

## 4. 영향도

- **중간**: F5 키 가로채기 (브라우저 기본 동작 차단), 화살표 키 동작 분기 추가
- 기존 텍스트 선택/캐럿 이동에 영향 없음 (셀 선택 모드는 별도 상태)

## 5. 브랜치

- `local/table-edit` → `local/task83`
- 완료 후 `local/table-edit`에 병합
