# 타스크 157 — 최종 결과 보고서

## 개요

글상자(TextBox) 삽입 및 기본 편집 기능을 구현했다. 사용자가 메뉴에서 글상자를 생성하고, 선택/이동/크기조절하며, 개체 속성 대화상자에서 여백/정렬을 편집할 수 있다.

## 구현 단계 요약

| 단계 | 목표 | 상태 |
|------|------|------|
| 1단계 | WASM API + Rust 백엔드 | 완료 |
| 2단계 | 글상자 선택/이동/크기조절 UI | 완료 |
| 3단계 | 글상자 생성 UI (마우스 드래그) | 완료 |
| 4단계 | 개체 속성 대화상자 글상자 탭 | 완료 |

## 변경 파일 총괄

### Rust 백엔드 (1단계)

| 파일 | 변경 |
|------|------|
| `src/model/shape.rs` | `ShapeObject`에 `common_mut()`, `drawing()`, `drawing_mut()` 메서드 추가 |
| `src/document_core/commands/object_ops.rs` | `create_shape_control_native()`, `get_shape_properties_native()`, `set_shape_properties_native()`, `delete_shape_control_native()` + 헬퍼 함수 |
| `src/wasm_api.rs` | 4개 WASM 바인딩: `createShapeControl`, `getShapeProperties`, `setShapeProperties`, `deleteShapeControl` |
| `src/renderer/render_tree.rs` | `RectangleNode`에 `section_index`, `para_index`, `control_index` 필드 추가 |
| `src/renderer/layout/shape_layout.rs` | Shape RectangleNode에 문서 좌표 설정 |
| `src/renderer/layout/table_layout.rs` | None 초기화 추가 |
| `src/renderer/layout/paragraph_layout.rs` | None 초기화 추가 |
| `src/renderer/layout/table_cell_content.rs` | None 초기화 추가 |
| `src/document_core/queries/rendering.rs` | `getPageControlLayout`에 shape 타입 수집 추가 |

### TypeScript 프론트엔드 (2~4단계)

| 파일 | 변경 |
|------|------|
| `rhwp-studio/index.html` | `insert:textbox` 메뉴 항목 활성화 |
| `rhwp-studio/src/core/types.ts` | `ObjectRef`, `ShapeProperties` 인터페이스, `ControlLayoutItem.type`에 `'shape'` 추가 |
| `rhwp-studio/src/core/wasm-bridge.ts` | Shape WASM API 4개 메서드 |
| `rhwp-studio/src/engine/cursor.ts` | `selectedPictureRef`에 `type` 필드, `enterPictureObjectSelectionDirect`에 type 매개변수 |
| `rhwp-studio/src/engine/input-handler-picture.ts` | 통합 개체 선택: `getObjectProperties`/`setObjectProperties`/`deleteObjectControl` 헬퍼, type 기반 분기 |
| `rhwp-studio/src/engine/input-handler.ts` | 글상자 배치 모드 상태+메서드 6개, 통합 개체 wrapper 메서드 3개, 상태 타입에 type 필드 |
| `rhwp-studio/src/engine/input-handler-mouse.ts` | 글상자 배치 모드 드래그, type 기반 리사이즈/이동 |
| `rhwp-studio/src/engine/input-handler-keyboard.ts` | Escape로 글상자 배치 취소, `deleteObjectControl` 사용 |
| `rhwp-studio/src/engine/input-handler-table.ts` | `moveSelectedPicture` type 분기 |
| `rhwp-studio/src/engine/command.ts` | `MoveShapeCommand` 클래스 (Undo/Redo) |
| `rhwp-studio/src/command/commands/insert.ts` | `insert:textbox` 실제 구현, `insert:picture-delete` shape 분기, `insert:picture-props` type 전달 |
| `rhwp-studio/src/ui/picture-props-dialog.ts` | 개체 타입별 동적 탭 구성, 글상자 탭 (여백/세로정렬), shape API 분기 |

## 지원 기능

| 기능 | 설명 |
|------|------|
| 글상자 생성 | 메뉴 `입력 → 글상자` → 마우스 드래그로 영역 지정 (또는 클릭시 30mm×30mm) |
| 글상자 선택 | 클릭으로 8방향 핸들 표시 |
| 크기조절 | 핸들 드래그 (코너: 비율 유지) |
| 이동 | 본체 드래그 또는 방향키 (그리드 단위) |
| 삭제 | Delete/Backspace 키 |
| 속성 편집 | 개체 속성 대화상자 → 기본 탭(크기/위치) + 글상자 탭(여백/세로정렬) |
| Undo/Redo | 이동 취소/다시실행 (`MoveShapeCommand`) |
| 배치 모드 취소 | Escape 키 |

## 검증

- **Rust 테스트**: 608 passed, 0 failed
- **WASM 빌드**: 성공
- **TypeScript 타입 검사**: 에러 없음

## 제외 사항 (다음 타스크)

- 테두리/채우기/세로쓰기/회전/도형변환 (타스크 158)
- 글상자 연결/하이퍼링크/묶기 (타스크 159)
