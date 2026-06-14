# 타스크 65: 글상자(GSO TextBox) 커서 지원 — 수행계획서

## 배경

현재 rhwp-studio에서 글상자(GSO TextBox) 내부 텍스트는 렌더링만 되고, 커서 진입/이동/캐럿 계산이 미구현 상태이다. `samples/img-start-001.hwp` 등 글상자가 포함된 문서에서 글상자 영역을 클릭하면 본문 문단으로 잘못 매핑되어 비정상 캐럿이 표시되고, 방향키 이동도 불가능하다.

테이블 셀은 `CellContext`를 통해 완전한 커서 지원이 되지만, 글상자는 `layout_textbox_content()`에서 `cell_ctx=None`으로 호출하여 TextRun에 컨텍스트가 없다.

## 현재 상태

| 항목 | 상태 |
|------|------|
| 글상자 렌더링 | 정상 동작 (layout_textbox_content → layout_composed_paragraph) |
| 글상자 hitTest | TextRun에 CellContext 미전파 → 본문 문단으로 반환 |
| 글상자 커서 진입 | 미구현 — 본문 커서로 배치됨 |
| 글상자 내 이동 | 미구현 — 방향키 이동 불가 |
| 글상자 경계 탈출 | 미구현 |
| 기존 테이블 셀 커서 | CellContext 기반 완전 구현 |

## 핵심 설계 결정

**새로운 인프라를 만들지 않고 기존 `CellContext`를 `cell_index=0`으로 재사용한다.**

- 글상자는 테이블과 달리 셀이 1개뿐이므로 `cell_index=0` 고정
- 기존 WASM API (`getCursorRectInCell`, `getCellParagraphLength`, `getCellParagraphCount` 등)를 그대로 활용
- `Control::Shape` 매치 암을 추가하여 기존 셀 API가 글상자도 처리
- `isTextBox` 플래그로 테이블/글상자 구분

## 수정 범위

### Rust (렌더 트리 + WASM API)
| 파일 | 변경 |
|------|------|
| `src/renderer/layout.rs` | `layout_textbox_content()`에 CellContext 전파 — section_index, para_index, control_index 파라미터 추가 |
| `src/wasm_api.rs` | `get_cell_paragraph_ref()`에 Shape 지원, hitTest에 isTextBox 플래그, handle_cell_boundary에 글상자 탈출 |

### TypeScript (rhwp-studio)
| 파일 | 변경 |
|------|------|
| `src/core/types.ts` | `DocumentPosition`, `MoveVerticalResult`, `HitTestResult`에 `isTextBox` 필드 추가 |
| `src/engine/cursor.ts` | `isInTextBox()`, `moveHorizontalInTextBox()`, `exitTextBox()` 메서드 추가 |
| `src/engine/input-handler.ts` | Tab 키 글상자 내 셀 이동 방지 |

## 주요 기술 사항

### CellContext 재사용 구조

```
테이블 셀:  CellContext { parent_para_index, control_index, cell_index: 0..N, cell_para_index }
글상자:     CellContext { parent_para_index, control_index, cell_index: 0,    cell_para_index }
```

### ShapeObject variant별 TextBox 지원

| Variant | TextBox 가능 | 비고 |
|---------|-------------|------|
| Rectangle | O | drawing.text_box |
| Ellipse | O | drawing.text_box |
| Polygon | O | drawing.text_box |
| Curve | O | drawing.text_box |
| Line | X | DrawingObjAttr 없음 |
| Arc | X | DrawingObjAttr 없음 |
| Group | X | 하위 shape 개별 처리 |

### 글상자 vs 테이블 경계 동작 차이

| 동작 | 테이블 | 글상자 |
|------|--------|--------|
| ArrowLeft/Right 경계 | 이전/다음 셀로 이동 | 본문으로 탈출 |
| ArrowUp/Down 경계 | WASM handle_cell_boundary (인접 셀) | 본문으로 직접 탈출 |
| Tab/Shift+Tab | 다음/이전 셀로 이동 | 무시 (동작 없음) |
| Enter | 미구현 (무시) | 미구현 (무시) |
