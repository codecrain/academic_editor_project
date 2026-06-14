# 타스크 36: 표 테두리 처리 고도화 - 2단계 완료 보고서

## 2단계 목표

인접 셀 테두리 중복 제거: 각 셀이 독립적으로 4방향 테두리를 그리던 방식에서, 엣지 기반 수집/병합/렌더링으로 전환하여 인접 셀 경계에서의 테두리 이중 렌더링 문제를 해결한다.

## 수행 내역

### 2-1. 테두리 병합 규칙 구현

`merge_border()` 함수를 구현하여 같은 위치의 두 테두리 중 우선순위가 높은 것을 선택한다.

**병합 우선순위:**
1. 선이 있는 것 > 없는 것 (None)
2. 굵은 선 > 가는 선 (`border_width_to_px()` 비교)
3. 이중선/삼중선 > 단일선 (종류별 우선순위 점수)

| 선 종류 | 우선순위 |
|---------|---------|
| None | 0 |
| Solid, Dash, Dot 등 단일선 | 1 |
| Wave, DoubleWave | 2 |
| Double, ThinThickDouble, ThickThinDouble | 3 |
| ThinThickThinTriple | 4 |

### 2-2. 엣지 그리드 기반 수집 구조

표의 모든 테두리를 그리드 형태로 수집한다.

```
h_edges[row_boundary][col]: 수평 엣지
  - row_boundary: 0..=row_count (행 경계선)
  - col: 0..col_count (열 인덱스)

v_edges[col_boundary][row]: 수직 엣지
  - col_boundary: 0..=col_count (열 경계선)
  - row: 0..row_count (행 인덱스)
```

**병합 셀 처리:**
- col_span=2인 셀의 상단 테두리: h_edges[row][col], h_edges[row][col+1] 두 슬롯에 설정
- row_span=3인 셀의 좌측 테두리: v_edges[col][row], v_edges[col][row+1], v_edges[col][row+2] 세 슬롯에 설정
- 같은 슬롯에 두 셀의 테두리가 겹치면 `merge_border()`로 병합

### 2-3. 연속 세그먼트 병합 렌더링

같은 행/열 경계선에서 연속된 같은 스타일의 엣지 세그먼트를 하나의 Line으로 병합하여 렌더링한다.

**이유:** 이중선/삼중선의 경우 `create_parallel_lines()`에서 오프셋을 사용하므로, 분리된 세그먼트가 교차점에서 시각적 결함을 일으킬 수 있다. 연속 병합으로 이를 방지한다.

**예시:** 2×2 표의 상단 테두리
- 기존: 셀(0,0) Line(x0→x1) + 셀(1,0) Line(x1→x2) = 2개 라인
- 변경: 병합 Line(x0→x2) = 1개 라인

### 2-4. 4개 테이블 레이아웃 함수 수정

| 함수 | 변경 내용 |
|------|----------|
| `layout_table()` | 셀별 테두리 → 엣지 그리드 수집 + 표 노드에 일괄 렌더링 |
| `layout_partial_table()` | 동일. render_rows 매핑으로 렌더링 행 기준 그리드 구성 |
| `layout_nested_table()` | 동일 |
| `layout_embedded_table()` | 동일 |

**layout_partial_table 특수 처리:**
- `render_rows` 배열을 기반으로 그리드 차원 결정
- 셀 행 인덱스를 렌더 행 인덱스로 매핑하여 그리드에 수집
- `grid_row_y = render_row_y + [partial_table_height]`

### 2-5. 테스트 업데이트

`test_layout_table_basic` 테스트를 엣지 기반 구조에 맞게 수정:
- 기존: 각 셀 노드에 4개 이상의 Line 자식 확인
- 변경: 표 노드에 6개 이상의 Line 자식 확인 (2×2 표: 수평 3줄 + 수직 3줄)

## 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/layout.rs` | 4개 헬퍼 함수 추가, 4개 레이아웃 함수 수정, 테스트 수정 |

### 추가된 함수

| 함수 | 역할 |
|------|------|
| `merge_border()` | 두 테두리 중 우선순위가 높은 것 선택 |
| `merge_edge_slot()` | 엣지 그리드 슬롯에 테두리 병합 저장 |
| `collect_cell_borders()` | 셀의 4방향 테두리를 그리드에 수집 |
| `render_edge_borders()` | 그리드에서 Line 노드 생성 (연속 세그먼트 병합) |

## 검증 결과

- **단위 테스트**: 416개 전체 통과
- **k-water-rfp.hwp**: 30페이지 전체 SVG 내보내기 성공
- **전체 샘플**: 20개 HWP 파일 모두 정상 내보내기 확인
- **WASM 빌드**: 정상 완료
- **SVG 출력 확인**: 테두리 라인이 표 노드의 자식으로 올바르게 생성됨

## 구조 변경 요약

```
[기존: 셀별 독립 테두리]
Table
  ├── Cell(0,0)
  │   ├── Background Rect
  │   ├── Text ...
  │   ├── Line (좌) ← 중복!
  │   ├── Line (우)
  │   ├── Line (상)
  │   └── Line (하) ← 중복!
  ├── Cell(0,1)
  │   ├── Background Rect
  │   ├── Text ...
  │   ├── Line (좌) ← 중복!
  │   ├── Line (우)
  │   ├── Line (상) ← 중복!
  │   └── Line (하)
  └── ...

[변경: 엣지 기반 중복 제거]
Table
  ├── Cell(0,0)
  │   ├── Background Rect
  │   └── Text ...
  ├── Cell(0,1)
  │   ├── Background Rect
  │   └── Text ...
  ├── ... (더 이상 셀에 테두리 없음)
  ├── Line (수평 엣지 0)  ← 표 노드의 자식
  ├── Line (수평 엣지 1)
  ├── Line (수평 엣지 2)
  ├── Line (수직 엣지 0)
  ├── Line (수직 엣지 1)
  └── Line (수직 엣지 2)
```
