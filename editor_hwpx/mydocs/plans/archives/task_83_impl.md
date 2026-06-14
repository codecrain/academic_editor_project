# 타스크 83 구현계획서: F5 셀 선택 모드 + 셀 범위 선택

## 단계 1: WASM API — getTableCellBboxes 추가

**파일**: `src/wasm_api.rs` (수정), `rhwp-studio/src/core/wasm-bridge.ts` (수정), `rhwp-studio/src/core/types.ts` (수정)

### 구현 내용

Rust WASM API:
```rust
#[wasm_bindgen(js_name = getTableCellBboxes)]
pub fn get_table_cell_bboxes(
    &self, section_idx: u32, parent_para_idx: u32, control_idx: u32,
) -> Result<String, JsValue>
```
- 렌더 트리에서 해당 표의 모든 셀 bbox를 수집
- 반환 JSON: `[{cellIdx, row, col, rowSpan, colSpan, pageIndex, x, y, w, h}, ...]`

TypeScript 타입 및 브릿지:
```typescript
interface CellBbox {
  cellIdx: number; row: number; col: number;
  rowSpan: number; colSpan: number;
  pageIndex: number; x: number; y: number; w: number; h: number;
}
getTableCellBboxes(sec, parentPara, controlIdx): CellBbox[]
```

---

## 단계 2: CursorState 셀 선택 모드 + InputHandler F5 키 처리

**파일**: `rhwp-studio/src/engine/cursor.ts` (수정), `rhwp-studio/src/engine/input-handler.ts` (수정)

### CursorState 확장
- `cellSelectionMode: boolean`
- `cellSelectionAnchor: {row: number, col: number} | null`
- `cellSelectionFocus: {row: number, col: number} | null`
- `enterCellSelectionMode()`: 현재 셀의 row/col을 anchor/focus로 설정
- `exitCellSelectionMode()`: 모든 셀 선택 상태 초기화
- `expandCellSelection(dr, dc)`: focus를 (dr, dc)만큼 이동 (표 범위 내 클램핑)
- `getSelectedCellRange()`: {startRow, startCol, endRow, endCol} 반환
- `isInCellSelectionMode()`: boolean

### InputHandler 변경
- F5 키: `e.preventDefault()`, 표 셀 내부 → `enterCellSelectionMode()`
- 셀 선택 모드 + 화살표 키 → `expandCellSelection(dr, dc)` + 렌더링
- 셀 선택 모드 + ESC → `exitCellSelectionMode()`
- 셀 선택 모드 + 다른 키(Tab, Enter, 문자 입력) → 모드 종료 후 기존 처리

---

## 단계 3: CellSelectionRenderer + EditorContext 확장 + 통합

**파일**: `rhwp-studio/src/engine/cell-selection-renderer.ts` (신규), `rhwp-studio/src/command/types.ts` (수정), `rhwp-studio/src/style.css` (수정)

### CellSelectionRenderer 클래스
- `render(cellBboxes, selectedRange, zoom)`: 범위 내 셀의 bbox에 하이라이트 오버레이 생성
- `clear()`: 모든 오버레이 제거
- SelectionRenderer와 유사한 패턴, 별도 레이어

### EditorContext 확장
- `inCellSelectionMode: boolean` 추가
- 기존 `inTable` 외에 셀 선택 모드 여부를 커맨드 시스템에 전달

### style.css
- `.cell-selection-highlight` 스타일 (연한 파란색 배경)

---

## 완료 기준

- [ ] F5 키로 셀 선택 모드 진입 (브라우저 새로고침 차단)
- [ ] 화살표 키로 셀 범위 확장
- [ ] 선택된 셀 범위에 하이라이트 오버레이 표시
- [ ] ESC로 셀 선택 모드 종료
- [ ] 기존 Rust 테스트 전체 통과
- [ ] WASM 빌드 성공
- [ ] Vite 빌드 성공
- [ ] 웹 검증 완료
