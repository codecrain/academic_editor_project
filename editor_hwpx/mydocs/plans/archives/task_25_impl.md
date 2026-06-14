# 타스크 25: 컨트롤 객체 선택 및 셀 선택 — 구현 계획서

## 현재 아키텍처 분석

### 데이터 흐름 (현재)
```
Rust PageRenderTree → get_page_text_layout_native() → TextRun만 JSON 출력
  → JS TextLayoutManager.runs[] → hitTest(x,y) → TextRun만 매칭 → 캐럿/텍스트 편집
```

### 핵심 갭
- `get_page_text_layout_native()`는 **TextRun 노드만** 수집 — Table, TableCell, Image 노드 미포함
- JS hitTest는 TextRun 바운딩 박스만 검사 — 컨트롤 영역 판정 불가
- 편집 모드가 텍스트 편집 하나만 존재 — 객체 선택/셀 선택 모드 없음

---

## 1단계: WASM API — 컨트롤/셀 레이아웃 정보 제공

**목표**: 렌더트리에서 Table, TableCell, Image, Shape 노드의 바운딩 박스를 JS에 전달

### `src/wasm_api.rs` — `getPageControlLayout` API 추가

`get_page_text_layout_native()`와 유사하게 렌더트리를 재귀 순회하되, 컨트롤 노드를 수집:

```rust
#[wasm_bindgen(js_name = getPageControlLayout)]
pub fn get_page_control_layout(&self, page_num: u32) -> String
```

**반환 JSON 구조**:
```json
{
  "controls": [
    {
      "type": "table",
      "x": 85.3, "y": 200.0, "w": 500.0, "h": 300.0,
      "secIdx": 0, "paraIdx": 2, "controlIdx": 0,
      "rowCount": 3, "colCount": 4,
      "cells": [
        {
          "x": 85.3, "y": 200.0, "w": 125.0, "h": 100.0,
          "row": 0, "col": 0, "rowSpan": 1, "colSpan": 1,
          "cellIdx": 0
        }
      ]
    },
    {
      "type": "image",
      "x": 300.0, "y": 500.0, "w": 200.0, "h": 150.0,
      "secIdx": 0, "paraIdx": 5, "controlIdx": 0
    },
    {
      "type": "shape",
      "x": 100.0, "y": 600.0, "w": 150.0, "h": 80.0,
      "secIdx": 0, "paraIdx": 7, "controlIdx": 0
    }
  ]
}
```

### 구현 방법
- `collect_text_runs()`과 유사한 `collect_controls()` 헬퍼 함수 작성
- 렌더트리 순회 시 `RenderNodeType::Table`, `Image`, `Shape` 등을 만나면 수집
- Table 노드의 경우 자식 TableCell 노드도 함께 수집하여 `cells` 배열에 포함
- 문서 좌표(secIdx, paraIdx, controlIdx)는 렌더트리 노드에서 추적 필요

### 문서 좌표 추적 방안
- 현재 TextRunNode에만 section_index/para_index가 있음
- Table/Image/Shape 노드에도 문서 좌표 필드를 추가하거나,
- 렌더트리 순회 시 부모 노드의 문맥에서 추적 (레이아웃 단계에서 컨트롤 노드에 태깅)

### 테스트
- `test_get_page_control_layout_with_table` — 표 포함 문서의 컨트롤 레이아웃 검증
- `test_get_page_control_layout_with_image` — 이미지 포함 문서의 컨트롤 레이아웃 검증

---

## 2단계: JS 컨트롤 레이아웃 매니저 + 히트테스트 확장

**목표**: JS에서 컨트롤/셀 영역 히트테스트 지원

### `web/text_selection.js` — ControlLayoutManager 추가

```javascript
class ControlLayoutManager {
    controls = [];  // 컨트롤 배열

    loadPage(doc, pageNum) {
        const json = doc.getPageControlLayout(pageNum);
        this.controls = JSON.parse(json).controls || [];
    }

    hitTestControl(x, y) {
        // 컨트롤 바운딩 박스 검사 → {type, secIdx, paraIdx, controlIdx, ...} | null
    }

    hitTestCell(x, y, control) {
        // 특정 표 컨트롤 내 셀 매칭 → {cellIdx, row, col, ...} | null
    }
}
```

### `web/text_selection.js` — SelectionController 히트테스트 확장

현재 `_onMouseDown` 흐름:
```
클릭 → layout.hitTest(x,y) → TextRun 매칭 → 캐럿 설정
```

확장 후 흐름:
```
클릭 → controlLayout.hitTestControl(x,y)
  ├── 컨트롤 히트 → 표: 셀 내부인지 확인
  │   ├── 셀 텍스트 영역 → 기존 텍스트 편집 모드 (변경 없음)
  │   └── 셀 테두리/여백 → 컨트롤 선택 콜백 호출
  ├── 이미지/도형 히트 → 컨트롤 선택 콜백 호출
  └── 컨트롤 미히트 → 기존 layout.hitTest(x,y) (변경 없음)
```

### 히트테스트 우선순위
1. TextRun 히트 → 텍스트 편집 모드 (기존 동작 유지)
2. 컨트롤 히트 but TextRun 미히트 → 객체 선택
3. 아무것도 미히트 → 선택 해제

---

## 3단계: 편집 모드 상태 머신 + 객체/셀 선택 시각화

**목표**: 편집 모드 상태 전이 구현, 선택 시각화

### `web/editor.js` — 편집 모드 상태

```javascript
// 편집 모드
let editMode = 'none';  // 'none' | 'text' | 'objectSelected' | 'cellSelected'
let selectedControl = null;  // 선택된 컨트롤 정보
let selectedCells = [];  // 선택된 셀 배열 [{row, col}, ...]
```

### 상태 전이 규칙

| 현재 모드 | 이벤트 | 새 모드 |
|-----------|--------|---------|
| none/text | 컨트롤 영역 클릭 (TextRun 미히트) | objectSelected |
| none/text | TextRun 클릭 | text |
| objectSelected | Esc | none |
| objectSelected | Enter / F5 (표인 경우) | cellSelected |
| objectSelected | 다른 영역 클릭 | none/text/objectSelected |
| cellSelected | Esc | objectSelected |
| cellSelected | Enter (셀 더블클릭) | text (해당 셀 내) |
| cellSelected | 방향키 | cellSelected (셀 이동) |
| cellSelected | Shift+방향키 | cellSelected (범위 확장) |
| text (셀 내) | Esc | cellSelected |

### 시각화 — selection-canvas에 그리기

**객체 선택 시각화**:
- 선택된 컨트롤 주위에 파란색 점선 테두리 (2px)
- 모서리 4개 + 변 중간 4개 = 8개 리사이즈 핸들 (사각형, 6×6px) — 표시만, 동작 없음

**셀 선택 시각화**:
- 선택된 셀에 반투명 파란색 배경 (rgba(0, 100, 255, 0.2))
- 셀 테두리에 파란색 실선 (2px)

### `web/editor.js` — 키보드 핸들러 수정

기존 keydown 핸들러에 editMode 분기 추가:
- `objectSelected` 모드: Esc → 선택 해제, Enter → 셀 선택 진입, Delete → (표 제외) 객체 삭제
- `cellSelected` 모드: Esc → 객체 선택, Enter → 텍스트 편집, 방향키 → 셀 이동
- `text` 모드 (셀 내): Esc → 셀 선택

---

## 4단계: 셀 범위 선택 + 테스트 및 검증

**목표**: 다중 셀 선택, 셀 탐색, 전체 테스트

### 셀 범위 선택

- **Shift+방향키**: 현재 셀에서 범위 확장/축소
- **Shift+클릭**: 앵커 셀 ~ 클릭 셀 직사각형 범위 선택
- **범위 모델**: `{startRow, startCol, endRow, endCol}` → 직사각형 영역

### 셀 탐색 (B-903 기초)

- **Tab**: 다음 셀 (좌→우, 위→아래)
- **Shift+Tab**: 이전 셀
- **방향키**: 인접 셀 이동

### 테스트

**Rust 테스트 (wasm_api.rs)**:
- `test_get_page_control_layout_with_table` — 표 컨트롤 레이아웃 JSON 검증
- `test_control_layout_cell_bounding_boxes` — 셀 바운딩 박스 정확성 검증
- `test_control_layout_multiple_controls` — 여러 컨트롤 타입 혼합 검증

**수동 브라우저 테스트**:
- 표 테두리 클릭 → 객체 선택 시각화 확인
- Enter → 셀 선택 모드 진입 확인
- 방향키/Shift+방향키 → 셀 이동/범위 확인
- Enter → 텍스트 편집 진입, Esc → 모드 복귀 확인
- 이미지 클릭 → 객체 선택 확인

---

## 변경 파일 요약

| 파일 | 단계 | 변경 내용 |
|------|------|-----------|
| `src/renderer/render_tree.rs` | 1 | Table/Image/Shape 노드에 문서 좌표 필드 추가 |
| `src/renderer/layout.rs` | 1 | 레이아웃 시 컨트롤 노드에 문서 좌표 태깅 |
| `src/wasm_api.rs` | 1 | getPageControlLayout API, collect_controls 헬퍼, 테스트 |
| `web/text_selection.js` | 2,3 | ControlLayoutManager 클래스, hitTest 확장 |
| `web/editor.js` | 3,4 | editMode 상태 머신, 시각화, 키보드 핸들러 |

## 검증 방법

1. `docker compose run --rm test` — 기존 344개 + 신규 테스트 통과
2. `docker compose run --rm wasm` — WASM 빌드 성공
3. 브라우저 테스트 — 표/이미지 객체 선택, 셀 선택, 모드 전환
