# 타스크 31: 캐럿 상하 이동 및 편집 영역 여백 제한 — 수행계획서

## 배경

### 1) 캐럿 상하 이동
현재 편집 모드에서 캐럿은 좌우(ArrowLeft/Right)와 줄 시작/끝(Home/End)만 이동 가능하다. 일반 워드프로세서처럼 ArrowUp/ArrowDown으로 위/아래 줄의 같은 X 위치로 캐럿을 이동하는 기능을 추가한다.

### 2) 편집 영역 여백 제한
텍스트 입력 시 텍스트 플로우(줄바꿈)가 용지의 좌우 여백을 제외한 콘텐츠 영역 내로 제한되어야 한다. 한컴 webhwp는 DOM 기반으로 CSS `width`가 자연스럽게 콘텐츠 영역을 제한하지만, 우리는 Canvas 기반이므로 compositor의 `reflow_line_segs()`에 전달하는 `available_width`가 정확해야 한다.

## 해결 방향

### 캐럿 상하 이동
기존 텍스트 레이아웃 데이터(runs 배열의 Y 좌표, charX 배열)를 활용하여 줄 그룹화 → 대상 줄에서 가장 가까운 X 위치 문자 탐색 방식으로 구현한다. 연속 상하 이동 시 원래 X 좌표를 기억(`_savedCaretX`)하여 일반 에디터와 동일한 UX를 제공한다.

### 편집 영역 여백 제한
현재 `reflow_paragraph()`에서 `col_area.width - margin_left - margin_right`로 폭을 계산하고 있다. 이 경로가 올바르게 동작하는지 검증하고, 문제가 있으면 수정한다. 특히 다단 레이아웃(`ColumnDef`)이 기본값으로 하드코딩된 부분을 확인한다.

## 변경 파일

| 파일 | 작업 |
|------|------|
| `web/editor.js` | ArrowUp/ArrowDown을 text_selection.js에 위임 |
| `web/text_selection.js` | `_moveCaretUp()`, `_moveCaretDown()` 및 헬퍼 메서드 추가 |
| `src/wasm_api.rs` | `reflow_paragraph()` 여백 계산 검증/수정 (필요시) |
| `src/renderer/composer.rs` | `reflow_line_segs()` 여백 적용 검증/수정 (필요시) |

## 검증 방법

1. 브라우저에서 ArrowUp/Down 줄 이동 동작 확인
2. 긴 줄 → 짧은 줄 이동 시 줄 끝 스냅 확인
3. 연속 상하 이동 후 원래 X 좌표 복원 확인
4. Shift+ArrowUp/Down 선택 범위 확장 확인
5. 텍스트 입력 시 용지 좌우 여백 내에서 줄바꿈 동작 확인
6. 다양한 여백 설정의 HWP 문서에서 텍스트 플로우 정확성 확인
