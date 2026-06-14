# 타스크 87 — 구현계획서

## 표 객체 선택 + 시각적 피드백

### 단계 분할 (4단계)

---

### 1단계: 표 바운딩박스 WASM API + 표 삭제 Rust 모델

**목표**: 표 전체 바운딩박스를 반환하는 WASM API 추가, 표 컨트롤 삭제 Rust 모델 구현

**수정 파일**:
- `src/wasm_api.rs`
  - `getTableBBox(sec, ppi, ci)` WASM 바인딩 + 네이티브 구현
  - 기존 `get_table_cell_bboxes_native`와 유사하되, 셀 개별이 아닌 표 노드의 bbox를 반환
  - 렌더 트리에서 Table 노드를 찾아 `{pageIndex, x, y, width, height}` JSON 반환
  - `deleteTableControl(sec, ppi, ci)` WASM 바인딩 + 네이티브 구현
  - 문단의 controls 배열에서 해당 표 컨트롤을 제거
- `src/model/paragraph.rs`
  - `remove_control(index)` 메서드 추가 (controls 배열에서 해당 인덱스 제거)
- `rhwp-studio/src/core/wasm-bridge.ts`
  - `getTableBBox()` 브릿지 메서드 추가
  - `deleteTableControl()` 브릿지 메서드 추가

**검증**: Rust 테스트 + WASM/Vite 빌드

---

### 2단계: CursorState 표 객체 선택 모드 + InputHandler Esc 키 처리 + 투명선 자동 활성화

**목표**: 표 객체 선택 상태 관리 + Esc 키로 모드 전환 + 셀 진입 시 투명선 자동 ON/OFF

**수정 파일**:
- `rhwp-studio/src/engine/cursor.ts`
  - `_tableObjectSelected` 상태 추가 (boolean)
  - `selectedTableRef` 추가 (`{sec, ppi, ci}` | null)
  - `enterTableObjectSelection()` — 현재 셀 위치의 표를 객체 선택
  - `exitTableObjectSelection()` — 객체 선택 해제
  - `isInTableObjectSelection()` 반환
  - `getSelectedTableRef()` 반환
- `rhwp-studio/src/engine/input-handler.ts`
  - Esc 키 처리 확장:
    - 셀 선택 모드 → Esc → 표 객체 선택 모드
    - 셀 편집 모드 → Esc → 표 객체 선택 모드
    - 표 객체 선택 → Esc → 표 밖 커서 이동
    - 표 객체 선택 → Enter → 셀 편집 모드 복귀
  - onClick 확장: 표 객체 선택 중 표 밖 클릭 → 해제
  - Delete/Backspace 처리: 표 객체 선택 중 → 표 삭제 + document-changed
  - public 접근자: `isInTableObjectSelection()`, `getSelectedTableRef()`
  - **투명선 자동 활성화**: 커서 이동 후 셀 진입/탈출 상태 변화 감지
    - 이전 상태 추적: `wasInCell: boolean`
    - 셀 밖 → 셀 진입: `wasm.setShowTransparentBorders(true)` + `document-changed`
    - 셀 안 → 셀 탈출: `wasm.setShowTransparentBorders(false)` + `document-changed`
    - 수동 토글(`view:border-transparent`)과 공존: `manualTransparentBorders` 플래그로 수동 ON 시 자동 OFF 방지
- `rhwp-studio/src/command/commands/view.ts`
  - `view:border-transparent` 커맨드의 상태를 외부에서 읽을 수 있도록 eventBus 연동
  - `transparent-borders-changed` 이벤트 발행하여 수동 토글 상태 전파

**검증**: Vite 빌드

---

### 3단계: TableObjectRenderer 시각적 피드백

**목표**: 표 객체 선택 시 외곽선 + 8개 리사이즈 핸들 표시

**수정 파일**:
- `rhwp-studio/src/engine/table-object-renderer.ts` (신규)
  - CellSelectionRenderer와 동일 패턴
  - `render(tableBBox, zoom)` — 표 외곽에 파란색 테두리 + 8개 핸들 사각형
  - 핸들 위치: 4모서리(NW, NE, SW, SE) + 4변 중점(N, S, E, W)
  - 핸들 크기: 8x8px (화면 고정, 줌 무관)
  - `clear()`, `dispose()`
- `rhwp-studio/src/style.css`
  - `.table-object-border` — 파란색 2px 실선 테두리
  - `.table-object-handle` — 파란색 배경 흰색 테두리 사각형
- `rhwp-studio/src/engine/input-handler.ts`
  - `setTableObjectRenderer()` 주입 메서드
  - 표 객체 선택 시 `tableObjectRenderer.render()` 호출
  - 해제 시 `tableObjectRenderer.clear()` 호출
- `rhwp-studio/src/main.ts`
  - TableObjectRenderer 인스턴스 생성 + InputHandler에 주입

**검증**: Vite 빌드 + 웹에서 Esc 키로 표 선택 시 시각적 피드백 확인

---

### 4단계: 빌드 검증 + 웹 테스트 + 리사이즈 커서

**목표**: 전체 빌드 검증 + 웹 동작 테스트 + 핸들 위 커서 변경

**수정 파일**:
- `rhwp-studio/src/engine/input-handler.ts`
  - `onMouseMove` 이벤트 추가: 표 객체 선택 중 핸들 위 마우스 → 커서 변경 (resize cursor)
  - 핸들별 커서: NW/SE=`nwse-resize`, NE/SW=`nesw-resize`, N/S=`ns-resize`, E/W=`ew-resize`
  - 핸들 밖 → `default` 커서 복원
- `rhwp-studio/src/engine/table-object-renderer.ts`
  - `getHandleAtPoint(x, y, zoom)` — 마우스 좌표가 어떤 핸들 위인지 판별
- 컨텍스트 메뉴에 "표 삭제" 항목 추가

**검증**:
- Rust 테스트 전체 통과
- WASM 빌드 성공
- Vite 빌드 성공
- 웹 테스트:
  - 표 셀에서 Esc → 표 객체 선택 (파란 테두리 + 핸들)
  - 표 객체 선택에서 Esc → 표 밖으로
  - 표 객체 선택에서 Enter → 셀 편집 복귀
  - 표 객체 선택에서 Delete → 표 삭제
  - 핸들 위 마우스 → 커서 변경

---

### 요약

| 단계 | 내용 | 핵심 파일 |
|------|------|-----------|
| 1 | WASM API (getTableBBox, deleteTableControl) + Rust 모델 | wasm_api.rs, paragraph.rs, wasm-bridge.ts |
| 2 | CursorState 표 객체 선택 + Esc 키 처리 | cursor.ts, input-handler.ts |
| 3 | TableObjectRenderer 시각적 피드백 | table-object-renderer.ts (신규), style.css, main.ts |
| 4 | 빌드 검증 + 웹 테스트 + 리사이즈 커서 | input-handler.ts, table-object-renderer.ts |

### 비고
- 드래그 리사이즈 (핸들 드래그로 표 크기 조정)는 이번 타스크에서 커서 변경까지만 구현하고, 실제 드래그 조정은 후속 타스크로 분리 (WASM API resizeTable 필요)
