# 타스크 137 최종 결과보고서 — 표 키보드/마우스 이동 + 격자 설정 + Undo

## 1. 목표

1. **표 객체 선택 모드에서 방향키로 표 이동** (격자 크기 단위)
2. **마우스 드래그로 표 이동** (실시간 추적)
3. **표 외곽 클릭으로 표 선택** (셀 바깥에서도 선택 가능)
4. **격자 설정 대화상자** (보기 메뉴 → 이동 간격 mm 설정)
5. **treat_as_char(본문배치) 표 오프셋 적용** (인라인 위치에서 h/v 오프셋 반영)
6. **문단 경계 이동** (v_offset이 줄 높이를 넘으면 인접 문단으로 표 이동)
7. **Undo/Redo 지원** (키보드 이동 병합 + 마우스 드래그 일괄 기록)

## 2. 구현 내역

### 1단계: Rust — `moveTableOffset` WASM API ✅
- `wasm_api.rs`에 `move_table_offset` 공개 WASM 메서드 + `move_table_offset_native` 네이티브 구현 추가
- `raw_ctrl_data[0..4]` (v_offset), `[4..8]` (h_offset)에 delta 적용
- treat_as_char 표: `while` 루프로 다중 문단 경계 교환 (아래: v_offset >= line_height, 위: v_offset < 0)
- 반환 JSON에 `ppi`, `ci` 포함: 문단 교환 후 새 위치 전달

### 2단계: 레이아웃 엔진 — treat_as_char 오프셋 적용 ✅
- `layout.rs` `layout_table()`: treat_as_char 표에 h_offset/v_offset 적용
- 수평: 인라인 x + h_offset, 정렬 기반 x + h_offset
- 수직: y_start + v_offset (캡션 포함)

### 3단계: TypeScript — 키보드/마우스 이동 ✅
- `wasm-bridge.ts`: `moveTableOffset()` 브릿지 메서드
- `cursor.ts`: `updateSelectedTableRef()` 메서드 추가
- `input-handler.ts`:
  - 방향키 핸들러: `moveSelectedTable()` — 격자 크기(mm→HWPUNIT) 단위 이동
  - 마우스 드래그: `updateMoveDrag()` / `finishMoveDrag()` — 실시간 이동
  - `gridStepMm` 필드 + `setGridStep()` / `getGridStepMm()`

### 4단계: 표 외곽 클릭 선택 ✅
- `findTableByOuterClick()`: hitTest가 셀을 반환하지 않을 때 인접 문단(±2)의 표 외곽 근접 검사
- `onClick`에 외곽 클릭 분기 추가: 표 발견 시 `enterTableObjectSelectionDirect()` 호출
- 표 객체 선택 중 move 커서 표시

### 5단계: 격자 설정 대화상자 ✅
- `grid-settings-dialog.ts`: `ModalDialog` 상속, number 입력 (0.5~50mm, step 0.5)
- `view.ts`: 기존 비활성 `view:grid` → 활성 `view:grid-settings` 커맨드로 교체
- `index.html`: 메뉴 항목 갱신

### 6단계: Undo/Redo 지원 ✅
- `command.ts`: `MoveTableCommand` 클래스 추가
  - `execute()`: `moveTableOffset(delta)` 호출 (redo용)
  - `undo()`: `moveTableOffset(-delta)` 역방향 적용 (다중 문단 경계 루프 지원)
  - `mergeWith()`: 500ms 이내 연속 이동 병합
- 키보드 이동: 매 이동마다 `recordWithoutExecute()` 기록
- 마우스 드래그: `finishMoveDrag()`에서 누적 delta로 하나의 명령 기록

## 3. 핵심 기술 결정

### 문단 경계 교환 방식
- **문제**: treat_as_char 표가 v_offset으로 다음 줄 위치에 도달 시 문서 구조 변경 필요
- **해결**: `paragraphs.swap(ppi, ppi±1)` — 표 문단과 인접 문단의 위치 교환
- **장점**: 컨트롤 이동(삭제+삽입) 대비 단순하고 안전

### Undo를 위한 다중 경계 루프
- **문제**: 마우스 드래그 Undo 시 큰 역방향 delta가 여러 문단을 한번에 넘어야 함
- **해결**: `if` → `while` 루프로 변경하여 한 번의 호출로 N개 문단 경계 통과
- **검증**: 정방향 swap 순서의 역순이 자연스럽게 재현됨

### 키보드 이동 병합 (mergeWith)
- 500ms 이내 연속 방향키 입력을 하나의 MoveTableCommand로 병합
- Ctrl+Z 한 번에 연속 이동 전체 복원

## 4. 변경 파일 요약

| 파일 | 변경 내용 | 규모 |
|------|-----------|------|
| `src/wasm_api.rs` | `moveTableOffset` API + treat_as_char 문단 경계 루프 | +106줄 |
| `src/renderer/layout.rs` | treat_as_char 표 h/v 오프셋 적용 | +34줄 |
| `rhwp-studio/src/core/wasm-bridge.ts` | `moveTableOffset()` 브릿지 | +5줄 |
| `rhwp-studio/src/engine/command.ts` | `MoveTableCommand` 클래스 | +53줄 |
| `rhwp-studio/src/engine/cursor.ts` | `updateSelectedTableRef()` | +6줄 |
| `rhwp-studio/src/engine/input-handler.ts` | 키보드/마우스 이동 + 외곽 클릭 + Undo 연동 | +253줄 |
| `rhwp-studio/src/ui/grid-settings-dialog.ts` | 새 파일 — 격자 설정 대화상자 | +49줄 |
| `rhwp-studio/src/command/commands/view.ts` | `view:grid-settings` 커맨드 | +13줄 -13줄 |
| `rhwp-studio/index.html` | 메뉴 항목 갱신 | 1줄 |

총 9파일, ~505줄 변경.

## 5. 검증 결과

| 항목 | 결과 |
|------|------|
| 기존 582개 테스트 회귀 | 통과 |
| WASM 빌드 | 성공 |
| TypeScript 컴파일 | 성공 |
| 방향키 표 이동 | 성공 — 격자 크기 단위 |
| 마우스 드래그 표 이동 | 성공 — 실시간 추적 |
| 표 외곽 클릭 선택 | 성공 — 셀 바깥 클릭도 선택 |
| 격자 설정 대화상자 | 성공 — 간격 변경 적용 |
| treat_as_char 오프셋 | 성공 — 인라인 위치에서 이동 |
| 문단 경계 이동 | 성공 — 줄 높이 초과 시 문단 교환 |
| Undo/Redo (키보드) | 성공 — 연속 이동 병합 + Ctrl+Z 복원 |
| Undo/Redo (마우스 드래그) | 성공 — 드래그 일괄 Ctrl+Z 복원 |

## 6. 미해결/향후 개선

- **표 전체 크기 비례 조절**: 핸들 드래그로 표 크기 변경 (현재 핸들 커서만 표시, 크기 조절 미구현)
- **비-treat_as_char 표 이동**: 절대 배치 표의 기준 좌표(페이지/용지/단) 별 이동 로직 세분화
- **Undo 후 표 객체 선택 자동 복원**: 현재 Undo 후 커서가 문단으로 이동하며, 표 재선택은 수동
