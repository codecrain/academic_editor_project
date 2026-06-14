# 타스크 65 최종 결과보고서: 글상자(GSO TextBox) 커서 지원

## 개요

글상자(GSO TextBox) 내부 텍스트에 대한 커서 진입/이동/캐럿 계산을 구현했다.
기존 테이블 셀의 `CellContext` 인프라를 `cell_index=0`으로 재사용하여 추가 인프라 없이 완성했다.
추가로 글상자 테두리 및 채우기(그라데이션) 렌더링도 수정했다.

## 수정 파일 (13개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | `layout_textbox_content()`에 CellContext 전파, 테두리 line_type=0은 실선(HWP 스펙 표27), border width 단위 HWPUNIT 수정 |
| `src/wasm_api.rs` | `get_cell_paragraph_ref` Shape 매치 암, `getTextBoxControlIndex` 추가, hitTest 우선순위 수정 (셀/글상자 > 본문), `handle_cell_boundary` Shape 탈출 처리 |
| `src/parser/control.rs` | SHAPE_COMPONENT 채우기 2바이트 오프셋 자동 보정, `parse_fill()` 재사용 |
| `src/parser/doc_info.rs` | `parse_fill()` → `pub(crate)` 공개 |
| `src/parser/byte_reader.rs` | `set_position()` 메서드 추가 |
| `src/renderer/web_canvas.rs` | `angle_to_canvas_coords` sin/cos 교정 (SVG와 동일한 좌표계) |
| `rhwp-studio/src/core/types.ts` | `DocumentPosition`, `HitTestResult`, `MoveVerticalResult`에 `isTextBox` 필드 추가 |
| `rhwp-studio/src/engine/cursor.ts` | `moveHorizontalInBody` 글상자 진입 로직, `enterTextBox()`, `exitTextBox()`, `isInTextBox()` 메서드 |
| `rhwp-studio/src/engine/input-handler.ts` | hitTest 결과 `isTextBox` 전파, Tab 키 글상자 내 셀 이동 방지 |
| `rhwp-studio/src/core/wasm-bridge.ts` | `getTextBoxControlIndex` 브릿지 함수 |
| `mydocs/orders/20260214.md` | 타스크 65 상태 완료, 백로그 B1 등록 |
| `mydocs/plans/task_65.md` | 수행 계획서 |
| `mydocs/plans/task_65_impl.md` | 구현 계획서 |

## 구현 상세

### 1단계: Rust CellContext 전파

- `layout_textbox_content()` → `layout_composed_paragraph()`에 `Some(CellContext { cell_index: 0 })` 전달
- 렌더 트리 TextRun에 `parent_para_index`, `control_index`, `cell_index`, `cell_para_index` 포함

### 2단계: WASM API 확장

- `get_cell_paragraph_ref()`: `Control::Shape` → `get_textbox_from_shape()` → TextBox 문단 참조
- `get_cell_paragraph_count_native()`: Shape TextBox 문단 수 반환
- `hit_test_native()`: 셀/글상자 TextRun 우선 매칭, Shape이면 `isTextBox: true`
- `handle_cell_boundary()`: Shape 컨트롤은 셀 이동 없이 본문으로 탈출
- `getTextBoxControlIndex(sec, para)`: 문단의 첫 TextBox Shape 컨트롤 인덱스 반환 (-1: 없음)

### 3단계: TypeScript 커서 지원

- `moveHorizontalInBody()`: 현재/인접 문단이 글상자이면 `enterTextBox()` 호출
- `enterTextBox(sec, para, ctrlIdx, delta)`: 글상자 진입 (delta>0: 시작, delta<0: 끝)
- `moveHorizontalInTextBox(delta)`: 글상자 내 커서 이동, 경계에서 본문으로 탈출
- `exitTextBox(delta)`: 셀 컨텍스트 해제 + 본문 문단으로 복귀
- Tab 키: 글상자 내에서는 셀 이동 하지 않음

### 4단계: 테두리/채우기 렌더링

- **테두리**: `line_type=0`은 HWP 스펙(표 27) 기준 실선(Solid). `border.width > 0`으로 렌더링 판단. `shape_border_width_to_px()` 단위를 0.01mm → HWPUNIT로 수정
- **채우기**: SHAPE_COMPONENT 채우기 데이터에 2바이트 추가 데이터 존재 시 자동 보정. `doc_info::parse_fill()` 재사용
- **Canvas 그라데이션**: `angle_to_canvas_coords()` sin/cos 뒤바뀜 수정 (SVG와 동일 좌표계)

## 테스트 결과

- Rust: 486개 테스트 통과
- TypeScript: `tsc --noEmit` 성공
- Vite 빌드: 성공
- WASM 빌드: 성공
- SVG 내보내기: img-start-001.hwp 3페이지 정상 출력

## 백로그

| No | 내용 | 비고 |
|----|------|------|
| B1 | 텍스트+Table 컨트롤 동시 포함 문단의 텍스트 렌더링 누락 | layout.rs has_table=true 시 문단 텍스트 건너뜀. 다음 타스크에서 해결 |
