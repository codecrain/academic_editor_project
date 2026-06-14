# 타스크 136 최종 결과보고서 — 표 크기 조절 기능 구현

## 1. 목표

1. **Rust `resizeTableCells` 배치 WASM API**: 다수 셀의 width/height 델타를 한 번에 적용하고 recompose+paginate 1회만 수행
2. **Per-row 열 위치 레이아웃**: HWP 특성(셀별 독립 너비)을 반영하여 `build_row_col_x`로 행별 열 좌표 계산
3. **셀 선택 모드(F5) 키보드 리사이즈**: Ctrl+방향키로 선택된 셀의 가로/세로 크기 조절 + 이웃 셀 보상
4. **마우스 드래그 리사이즈**: 경계선 드래그로 열/행 크기 변경 + 셀 선택 모드에서 선택 셀만 변경
5. **텍스트 리플로우**: 셀 너비 변경 시 `reflow_cell_paragraph`로 줄바꿈 재계산
6. **셀 선택 블럭 갱신**: 크기 변경 후 선택 영역 시각적 동기화

## 2. 구현 내역

### 1단계: Rust — `resizeTableCells` 배치 WASM API ✅
- `wasm_api.rs`에 `resize_table_cells_native()` 추가
- JSON 입력: `[{cellIdx, widthDelta, heightDelta}]`
- 각 셀에 delta 적용 (최소 200 HWPUNIT 보장)
- `update_ctrl_dimensions()` → `recompose` → `paginate` 1회 수행
- 텍스트 리플로우: width 변경된 셀의 모든 문단에 `reflow_cell_paragraph` 호출

### 2단계: Per-row 열 위치 레이아웃 ✅
- `layout.rs`에 `build_row_col_x()` 자유함수 추가
- 셀별 독립 너비를 반영하여 행(row)마다 누적 열 좌표 계산
- `layout_table`, `layout_partial_table`, `layout_embedded_table` 3개 함수 수정
- 셀 위치: `col_x[c]` → `row_col_x[r][c]`
- 표 너비: 모든 행의 최대 너비 사용

### 3단계: 테두리 렌더링 Per-row 대응 ✅
- `render_edge_borders`, `render_transparent_borders` 함수 시그니처 변경
  - `col_x: &[f64]` → `row_col_x: &[Vec<f64>]`
- 세로 테두리: 행별 x 좌표가 변할 때 세그먼트 분리
- 가로 테두리: 경계 아래 행의 x 좌표 참조

### 4단계: 셀 선택 모드 키보드 리사이즈 ✅
- `input-handler.ts` — F5 셀 선택 모드에서 Ctrl+방향키 핸들러 추가
- `resizeCellByKeyboard()` 메서드: Left/Right(너비), Up/Down(높이)
- 1회 300 HWPUNIT (~1mm) 증감
- 이웃 셀 보상: 같은 행의 오른쪽 이웃(너비) / 같은 열의 아래쪽 이웃(높이)에 반대 delta 적용 → 행 총 너비 유지

### 5단계: 마우스 드래그 리사이즈 ✅
- 기존 타스크 135의 경계선 마커 + hitTest 인프라 활용
- `startResizeDrag()` / `updateResizeDrag()` / `finishResizeDrag()` 3단계
- 일반 모드: 경계선 좌측/상단의 모든 셀 크기 변경 (열/행 전체)
- 셀 선택 모드: 선택된 셀만 크기 변경 + 이웃 셀 보상
- `showDragMarker()`: 드래그 중 마커 위치 실시간 추적

### 6단계: 셀 선택 블럭 갱신 ✅
- 키보드/마우스 리사이즈 후 `this.updateCellSelection()` 호출
- 변경된 셀 좌표에 맞게 선택 블럭 시각적 동기화

## 3. 핵심 기술 결정

### Per-row 레이아웃 + 이웃 셀 보상 조합
- **문제**: HWP는 셀마다 독립적인 width를 허용하지만, 기존 레이아웃은 열별 최대 너비(`col_widths[c] = max(all cells in col c)`)를 사용하여 개별 셀 크기 변경이 시각적으로 반영되지 않았음
- **해결**: Per-row 누적 열 좌표 도입 → 각 행이 독립적인 열 경계를 가짐
- **이웃 셀 보상 필요성**: Per-row 누적 레이아웃에서 한 셀만 넓히면 같은 행의 오른쪽 셀들이 모두 이동. 오른쪽 이웃에 반대 delta를 적용하여 행 총 너비 유지

### 텍스트 리플로우
- `compose_paragraph`는 사전 저장된 `line_segs`로 줄바꿈. 셀 너비 변경 시 `reflow_cell_paragraph`로 새 너비 기준 재계산 필수

## 4. 변경 파일 요약

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/renderer/layout.rs` | `build_row_col_x()` + 3개 레이아웃 함수 per-row 전환 + 2개 테두리 함수 per-row 대응 | +148줄 |
| `src/wasm_api.rs` | `resizeTableCells` 배치 API + 텍스트 리플로우 로직 | +23줄 |
| `rhwp-studio/src/engine/input-handler.ts` | 키보드 리사이즈 + 마우스 드래그 이웃 보상 + 셀 선택 갱신 | +178줄 -63줄 |
| `mydocs/orders/20260221.md` | 타스크 136 상태 갱신 | 1줄 |

총 4파일, ~350줄 변경.

## 5. 검증 결과

| 항목 | 결과 |
|------|------|
| 기존 582개 테스트 회귀 | 통과 |
| WASM 빌드 | 성공 |
| TypeScript 컴파일 | 성공 |
| 셀 선택 모드 Ctrl+방향키 리사이즈 | 성공 — 선택된 셀만 크기 변경 |
| 마우스 경계선 드래그 리사이즈 | 성공 — 마커 추적 + 놓으면 적용 |
| 이웃 셀 보상 | 성공 — 행 총 너비 유지 |
| 셀 선택 블럭 갱신 | 성공 — 크기 변경 후 동기화 |
| 텍스트 리플로우 | 성공 — 셀 너비 변경 시 줄바꿈 재계산 |
| saved/111.hwp (셀별 독립 크기) | 정상 렌더링 확인 |

## 6. 미해결/향후 개선

- **셀 높이 자동 조절**: 현재 높이 리사이즈는 수동 지정만 가능. 텍스트 양에 따른 자동 높이 조절은 별도 타스크 필요
- **표 외곽 드래그로 표 전체 크기 변경**: 현재 외곽 경계선 드래그 시 마지막 열/행 셀만 변경. 비례 스케일링 옵션 검토 필요
- **B-006 다단 내 표 리사이즈**: 다단 편집 미지원 상태이므로 다단 내 표 크기 조절도 미지원
