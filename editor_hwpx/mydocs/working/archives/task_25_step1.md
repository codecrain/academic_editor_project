# 타스크 25 - 1단계 완료 보고서: WASM API — 컨트롤/셀 레이아웃 정보 제공

## 변경 파일

### 1. `src/renderer/render_tree.rs`
- `TableNode`에 문서 좌표 필드 3개 추가: `section_index`, `para_index`, `control_index`
- `ImageNode`에 문서 좌표 필드 3개 추가: `section_index`, `para_index`, `control_index`

### 2. `src/renderer/layout.rs`
- `layout_table()` 2곳: TableNode 생성 시 문서 좌표 태깅 (본문 표 → `Some()`, 임베디드 표 → `None`)
- `layout_body_picture()`: 파라미터 3개 추가 (`section_index`, `para_index`, `control_index`), ImageNode에 전달
- ImageNode 생성 2곳: 셀 내부 이미지는 `None`, 본문 이미지는 문서 좌표 설정

### 3. `src/wasm_api.rs`
- `getPageControlLayout` WASM API 바인딩 추가
- `get_page_control_layout_native()` 구현:
  - 렌더트리를 재귀 순회하여 Table, Image 노드 수집
  - Table: 바운딩 박스 + rowCount/colCount + 문서 좌표 + cells 배열
  - Image: 바운딩 박스 + 문서 좌표
  - TableCell: 바운딩 박스 + row/col/span + cellIdx
- 테스트 2개 추가

## JSON 출력 예시

```json
{
  "controls": [
    {
      "type": "table",
      "x": 85.3, "y": 100.0, "w": 500.0, "h": 200.0,
      "rowCount": 2, "colCount": 2,
      "secIdx": 0, "paraIdx": 0, "controlIdx": 0,
      "cells": [
        {"x": 85.3, "y": 100.0, "w": 250.0, "h": 100.0, "row": 0, "col": 0, "rowSpan": 1, "colSpan": 1, "cellIdx": 0},
        {"x": 335.3, "y": 100.0, "w": 250.0, "h": 100.0, "row": 0, "col": 1, "rowSpan": 1, "colSpan": 1, "cellIdx": 1}
      ]
    },
    {
      "type": "image",
      "x": 200.0, "y": 400.0, "w": 300.0, "h": 200.0,
      "secIdx": 0, "paraIdx": 3, "controlIdx": 0
    }
  ]
}
```

## 테스트 결과

- 전체 테스트: **346개 통과** (기존 344 + 신규 2)
- 빌드: 성공
