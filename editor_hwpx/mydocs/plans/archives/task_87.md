# 타스크 87 — 수행계획서

## 표 객체 선택 + 시각적 피드백

### 목표
표를 하나의 객체로 선택하고, 선택 시 외곽선 + 리사이즈 핸들을 표시하며, 핸들 드래그로 크기 조정 및 Delete 키로 표 삭제 기능 구현

### 현재 상태
- 셀 내부 클릭 → 셀 편집 모드 (캐럿 진입) ✓
- F5 셀 블록 선택 모드 ✓
- hitTest가 표 셀 컨텍스트(parentParaIndex, controlIndex, cellIndex) 감지 ✓
- getTableCellBboxes API로 셀별 바운딩박스 조회 가능 ✓
- SelectionRenderer, CellSelectionRenderer 오버레이 패턴 확립 ✓
- 표 객체 선택 모드: 미구현

### 구현 범위

1. **표 바운딩박스 WASM API**
   - `getTableBBox(sec, ppi, ci)` → `{pageIndex, x, y, width, height}`
   - 기존 getTableCellBboxes 기반으로 셀 bbox 합산 계산

2. **표 객체 선택 모드**
   - CursorState에 표 객체 선택 상태 추가
   - 진입 조건: 표 셀 내에서 Esc 키 → 표 객체 선택 → 한번 더 Esc → 표 밖으로 나감
   - 해제 조건: 표 밖 클릭, 다른 위치 클릭, Enter (셀 편집 복귀)

3. **시각적 피드백 (TableObjectRenderer)**
   - 선택된 표 외곽에 파란색 테두리 표시
   - 8개 리사이즈 핸들 (4모서리 + 4변 중점) 표시
   - 기존 CellSelectionRenderer 패턴 활용

4. **리사이즈 드래그**
   - 핸들 위 마우스 커서 변경 (resize cursor)
   - 핸들 드래그로 표 너비/높이 조정
   - WASM API: `resizeTable(sec, ppi, ci, newWidth, newHeight)`

5. **Delete 키로 표 삭제**
   - 표 객체 선택 상태에서 Delete/Backspace → 표 컨트롤 삭제
   - WASM API: `deleteTableControl(sec, ppi, ci)`

### 제외 범위
- 표 드래그 이동: HWP 표는 문단 내 인라인 객체이므로 자유 이동 불가. 향후 별도 검토
- 표 외곽(셀 간격 영역) 클릭으로 객체 선택: hitTest가 셀 단위로 동작하므로 정밀 감지 어려움. Esc 기반 진입으로 대체

### 영향도
- 중간: 기존 셀 편집/셀 선택 모드와의 상태 전환 로직 추가
- CursorState, InputHandler 확장

### 의존성
- 기존 인프라 모두 완비 (hitTest, cellBboxes, overlay 패턴)
