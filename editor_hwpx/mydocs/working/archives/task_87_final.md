# 타스크 87 — 최종 결과보고서

## 표 객체 선택 + 시각적 피드백

### 구현 요약

표를 하나의 객체로 선택하고, 선택 시 외곽선 + 리사이즈 핸들을 표시하며, Delete 키로 표 삭제, 핸들 위 리사이즈 커서 변경 기능을 구현했다. 셀 진입 시 투명선 자동 활성화도 추가했다.

### 단계별 구현 내용

#### 1단계: WASM API + Rust 모델
- `getTableBBox(sec, ppi, ci)` — 렌더 트리에서 Table 노드를 찾아 `{pageIndex, x, y, width, height}` 반환
- `deleteTableControl(sec, ppi, ci)` — UTF-16 스트림의 char_offsets 갭 위치를 찾아 컨트롤 삭제 + 후속 오프셋 조정
- `remove_control(index)` — paragraph.rs의 controls 배열에서 컨트롤 제거
- Rust 테스트 2건 추가 (`test_get_table_bbox`, `test_delete_table_control`)

#### 2단계: CursorState 표 객체 선택 + Esc 키 + 투명선 자동
- CursorState에 `_tableObjectSelected`, `selectedTableRef` 상태 추가
- Esc 키 상태 전환 머신:
  - 셀 편집 → Esc → 표 객체 선택
  - F5 셀 선택 → Esc → 표 객체 선택
  - 표 객체 선택 → Esc → 표 밖 이동
  - 표 객체 선택 → Enter → 셀 편집 복귀
  - 표 객체 선택 → Delete → 표 삭제
- 투명선 자동 활성화: 셀 진입 시 ON, 탈출 시 OFF (수동 토글과 공존)
- `table:delete` 커맨드 등록 + 컨텍스트 메뉴 "표 지우기" 항목

#### 3단계: TableObjectRenderer 시각적 피드백
- `table-object-renderer.ts` 신규 생성
- 파란색 2px 실선 테두리 + 8개 리사이즈 핸들(8x8px, 줌 무관)
- `getHandleAtPoint()` — 마우스 좌표 → 핸들 방향 판별
- CSS: `.table-object-border`, `.table-object-handle`

#### 4단계: 빌드 검증 + 리사이즈 커서
- `onMouseMove` 핸들러 — 핸들별 커서: NW/SE=nwse-resize, NE/SW=nesw-resize, N/S=ns-resize, E/W=ew-resize
- Rust 테스트 514 passed, WASM 빌드 성공, Vite 빌드 성공

### 수정 파일 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/wasm_api.rs` | 수정 | getTableBBox, deleteTableControl WASM 바인딩 + 네이티브 구현 + 테스트 |
| `src/model/paragraph.rs` | 수정 | remove_control(index) 메서드 추가 |
| `src/serializer/cfb_writer.rs` | 수정 | delete_table_control_roundtrip 테스트 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | 수정 | getTableBBox, deleteTableControl 브릿지 메서드 |
| `rhwp-studio/src/engine/cursor.ts` | 수정 | 표 객체 선택 상태 + 메서드 5개 |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 | Esc 상태 머신 + 투명선 자동 + onMouseMove + 렌더러 연동 |
| `rhwp-studio/src/engine/table-object-renderer.ts` | **신규** | 표 객체 선택 오버레이 렌더러 |
| `rhwp-studio/src/command/types.ts` | 수정 | EditorContext에 inTableObjectSelection 추가 |
| `rhwp-studio/src/command/commands/view.ts` | 수정 | transparent-borders-changed 이벤트 발행 |
| `rhwp-studio/src/command/commands/table.ts` | 수정 | table:delete 커맨드 등록 |
| `rhwp-studio/src/main.ts` | 수정 | getContext() 확장 + TableObjectRenderer 주입 |
| `rhwp-studio/src/style.css` | 수정 | 표 객체 선택 CSS 추가 |

### 테스트 결과
- Rust 테스트: **514 passed**, 0 failed
- WASM 빌드: 성공
- Vite 빌드: 성공 (40 modules)

### 제외 범위 (후속 타스크)
- 드래그 리사이즈 (핸들 드래그로 표 크기 조정): 커서 변경까지만 구현, 실제 드래그 조정은 WASM API `resizeTable` 필요
- 표 드래그 이동: HWP 표는 문단 내 인라인 객체이므로 자유 이동 불가
