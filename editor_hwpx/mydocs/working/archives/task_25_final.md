# 타스크 25 — 최종 결과 보고서: 컨트롤 객체 선택 및 셀 선택 (B-901, B-902)

## 목표

- B-901: 표/이미지/도형 컨트롤 객체 선택 (점선 테두리 + 핸들 시각화)
- B-902: 표 셀 단위 선택 (방향키, Shift 범위, Tab 탐색)

## 구현 내용

### 1단계: WASM API — 컨트롤/셀 레이아웃 정보 제공

| 변경 | 내용 |
|------|------|
| `render_tree.rs` | TableNode, ImageNode에 문서 좌표 필드(section_index, para_index, control_index) 추가 |
| `layout.rs` | 레이아웃 시 컨트롤 노드에 문서 좌표 태깅 |
| `wasm_api.rs` | `getPageControlLayout()` API — 표/이미지 바운딩 박스 + 셀 배열 JSON 제공 |

### 2단계: JS 히트테스트 확장

| 변경 | 내용 |
|------|------|
| `text_selection.js` | `ControlLayoutManager` 클래스 — `hitTestControl()`, `hitTestCell()` |
| `text_selection.js` | `SelectionController` 확장 — controlLayout, onControlSelect, onControlDeselect 콜백 |
| `editor.js` | ControlLayoutManager 생성/연동, renderCurrentPage에서 로드 |

### 3단계: 편집 모드 상태 머신 + 시각화

| 변경 | 내용 |
|------|------|
| `text_selection.js` | `drawObjectSelection()` — 점선 테두리 + 8개 핸들 |
| `text_selection.js` | `drawCellSelection()` — 반투명 배경 + 실선 테두리 |
| `editor.js` | editMode 상태 머신 (none/text/objectSelected/cellSelected) |
| `editor.js` | 키보드 핸들러 확장, enterCellTextEdit, findControlForCell 헬퍼 |

### 4단계: 셀 범위 선택 + 테스트

| 변경 | 내용 |
|------|------|
| `text_selection.js` | `onTextClick(x, y, shiftKey)` — 반환값으로 캐럿 설정 취소 |
| `editor.js` | cellAnchor 상태, getCellRange 직사각형 범위, Shift+방향키/클릭 범위 확장 |
| `editor.js` | handleTabNavigation — Tab/Shift+Tab 순환 탐색 |

### 추가: 빈 셀 텍스트 입력 지원

| 변경 | 내용 |
|------|------|
| `layout.rs` | 빈 문단 fallback에서 빈 TextRun 노드 생성 — 캐럿 위치 제공 |

## 상태 전이 규칙

```
none ←→ text ←→ objectSelected ←→ cellSelected
         ↑                            ↓
         ←─── Enter (셀 편집) ────────┘
```

| 현재 모드 | 이벤트 | 새 모드 |
|-----------|--------|---------|
| none/text | 컨트롤 클릭 | objectSelected |
| none/text | TextRun 클릭 | text |
| objectSelected | Esc | none |
| objectSelected | Enter/F5 (표) | cellSelected |
| cellSelected | Esc | objectSelected |
| cellSelected | Enter | text (셀 내) |
| cellSelected | 방향키 | cellSelected (이동) |
| cellSelected | Shift+방향키 | cellSelected (범위 확장) |
| cellSelected | Tab/Shift+Tab | cellSelected (순환 탐색) |
| text (셀) | Esc | cellSelected |
| text (본문) | Esc | none |

## 변경 파일 요약

| 파일 | 변경 유형 |
|------|-----------|
| `src/renderer/render_tree.rs` | 구조체 필드 추가 |
| `src/renderer/layout.rs` | 문서 좌표 태깅, 빈 문단 TextRun 생성 |
| `src/wasm_api.rs` | getPageControlLayout API + 테스트 2개 |
| `web/text_selection.js` | ControlLayoutManager, 시각화, 콜백 확장 |
| `web/editor.js` | 상태 머신, 키보드 핸들러, 셀 탐색/범위 선택 |

## 검증 결과

- `docker compose run --rm test` — **346개 테스트 통과**
- `docker compose run --rm wasm` — **WASM 빌드 성공**
- 브라우저 테스트 — **12개 항목 정상 동작 확인** (작업지시자 검증)
- 빈 셀 텍스트 입력 — 빈 문단 TextRun 생성으로 캐럿 위치 제공 가능
