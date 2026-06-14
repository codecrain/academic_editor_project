# 타스크 65: 글상자(GSO TextBox) 커서 지원 — 구현계획서

## 1단계: Rust 렌더 트리 — 글상자에 CellContext 전파 (~30줄)

### src/renderer/layout.rs

1. `layout_shape()` (line 3359): `section_index` 파라미터 추가
   - 이미 `para_index`, `control_index` 보유
   - `layout_shape_object()`에 3개 파라미터 전달

2. `layout_shape_object()` (line 3447): `section_index, para_index, control_index` 파라미터 추가
   - 각 ShapeObject variant (Rectangle, Ellipse, Polygon, Curve)의 `layout_textbox_content()` 호출에 전달
   - Group variant는 재귀 호출 시 `0, 0, 0` 전달 (그룹 내부 텍스트박스는 최상위 컨텍스트 없음)

3. `layout_textbox_content()` (line 3606): `section_index, para_index, control_index` 파라미터 추가
   - 내부 루프에서 CellContext 생성:
     ```rust
     let cell_ctx = CellContext {
         parent_para_index: para_index,
         control_index,
         cell_index: 0,
         cell_para_index: tb_para_idx,
     };
     ```
   - `layout_composed_paragraph()`에 `Some(cell_ctx)` 전달

4. 호출 지점 수정:
   - line 413: `page_content.section_index` 전달
   - line 2663 (테이블 셀 내 shape): `0, 0, 0` 전달
   - line 3769 (텍스트박스 내 shape): `0, 0, 0` 전달

### 빌드 확인
- `docker compose --env-file /dev/null run --rm test` — 485개 테스트 통과

---

## 2단계: Rust WASM API — get_cell_paragraph_ref 확장 + hitTest isTextBox (~60줄)

### src/wasm_api.rs

1. `get_textbox_from_shape()` 헬퍼 함수 추가
   - ShapeObject variant별 `drawing.text_box` 추출
   - Rectangle, Ellipse, Polygon, Curve만 지원, 나머지 None 반환

2. `get_cell_paragraph_ref()` 확장
   - `Control::Shape` 매치 암 추가
   - `cell_idx != 0`이면 `None` (글상자는 셀이 1개)
   - `get_textbox_from_shape()` → `text_box.paragraphs.get(cell_para_idx)`

3. `get_cell_paragraph_count_native()` 확장
   - `Control::Shape` 매치 암 추가
   - `get_textbox_from_shape()` → `text_box.paragraphs.len()`

4. `hit_test_native()` 수정
   - `RunInfo` 구조체에 `is_textbox: bool` 필드 추가
   - `collect_runs()` 후 각 run에 대해 document 기반 컨트롤 타입 확인
   - `parent_para_index` 있고 `cell_index == 0`이면 컨트롤이 `Control::Shape`인지 검사
   - `format_hit()`에서 `is_textbox == true`이면 `,"isTextBox":true` 추가

5. `handle_cell_boundary()` 수정
   - 컨트롤이 Shape인 경우 셀 이동 없이 본문으로 직접 탈출
   - `exit_table_vertical()` 호출로 본문 이동

6. `move_vertical_native()` JSON 출력에 `isTextBox` 필드 추가

### 빌드 확인
- `docker compose --env-file /dev/null run --rm test` — 485개 테스트 통과

---

## 3단계: TypeScript — 글상자 커서 진입/이동/탈출 (~60줄)

### src/core/types.ts

1. `HitTestResult`에 `isTextBox?: boolean` 추가 (hitTest 결과)
2. `DocumentPosition`에 `isTextBox?: boolean` 추가 (커서 위치 보존)
3. `MoveVerticalResult`에 `isTextBox?: boolean` 추가 (수직 이동 결과)

### src/engine/cursor.ts

1. `isInTextBox()` public 메서드 추가
   - `this.position.isTextBox === true` 반환

2. `moveHorizontal()` 분기 수정
   - `isInTextBox()` → `moveHorizontalInTextBox()`
   - `isInCell()` → `moveHorizontalInCell()` (기존)
   - 그 외 → `moveHorizontalInBody()` (기존)

3. `moveHorizontalInTextBox(delta)` private 메서드 추가
   - 글상자 내 문단 간 이동 (셀 API 재사용)
   - 경계 도달 시 `exitTextBox(delta)` 호출 (셀 이동 없음)

4. `exitTextBox(delta)` private 메서드 추가
   - 셀 컨텍스트 해제 → 본문 문단으로 이동
   - delta > 0: parentParaIndex + 1 문단 시작
   - delta < 0: parentParaIndex - 1 문단 끝

5. `moveVertical()` 수정
   - 위치 갱신 시 `isTextBox: result.isTextBox` 포함

### src/engine/input-handler.ts

1. Tab 키 처리 수정
   - `if (inCell && !this.cursor.isInTextBox())` 조건 추가
   - 글상자 내부에서는 Tab으로 셀 이동하지 않음

### 빌드 확인
- `npx tsc --noEmit` — TypeScript 타입 체크 통과
- `npx vite build` — 빌드 성공

---

## 4단계: 통합 테스트 및 검증

1. `docker compose --env-file /dev/null run --rm test` — 전체 Rust 테스트 485개 통과
2. `cd rhwp-studio && npx tsc --noEmit` — TypeScript 타입 체크
3. `cd rhwp-studio && npx vite build` — 프로덕션 빌드 성공
4. `samples/img-start-001.hwp`로 수동 검증:
   - 글상자 클릭 → 캐럿 표시
   - 방향키 좌/우 이동
   - 방향키 상/하 이동
   - 글상자 경계 탈출
   - Tab 키 무시 확인
5. 기존 테이블 커서 동작 회귀 테스트

---

## 수정/신규 파일 목록

| 파일 | 작업 | 규모 |
|------|------|------|
| `src/renderer/layout.rs` | 수정 — textbox에 CellContext 전파 | ~30줄 |
| `src/wasm_api.rs` | 수정 — get_cell_paragraph_ref Shape 지원, hitTest isTextBox | ~60줄 |
| `rhwp-studio/src/core/types.ts` | 수정 — isTextBox 필드 추가 | ~6줄 |
| `rhwp-studio/src/engine/cursor.ts` | 수정 — moveHorizontalInTextBox, exitTextBox | ~55줄 |
| `rhwp-studio/src/engine/input-handler.ts` | 수정 — Tab 글상자 처리 | ~2줄 |
| **합계** | | **~153줄** |
