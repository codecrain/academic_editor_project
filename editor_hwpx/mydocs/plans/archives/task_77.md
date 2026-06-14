# 타스크 77 수행계획서: 페이지 하단 표 셀 내 이미지 처리

## 배경

`samples/20250130-hongbo.hwp`에서 표6(문단30, 4행×1열)이 페이지를 넘길 때, 셀 내 이미지가 올바르게 렌더링되지 않는 문제가 있다.

### 문서 구조

```
표6 [구역0:문단30]: 4행×1열, 셀 4개, cell_spacing=0
  셀[0]: row=0, cell.height=22839(304.5px) → 그림3 (bin_data_id=6)
  셀[1]: row=1, cell.height=3860(51.5px) → 텍스트만
  셀[2]: row=2, cell.height=22839(304.5px) → 그림4 (bin_data_id=1)
  셀[3]: row=3, cell.height=3860(51.5px) → 텍스트만
```

### 측정 데이터 (MeasuredTable)

```
row_heights: [379.4, 149.4, 377.5, 52.3]
MeasuredCell:
  row=0: total_content_h=375.7, line_heights=[375.7]  ← 이미지가 단일 "줄"로 측정됨
  row=1: total_content_h=145.6, line_heights=[24.3, 24.3, 24.3, 24.3, 24.3, 24.3]
  row=2: total_content_h=373.7, line_heights=[373.7]  ← 이미지가 단일 "줄"로 측정됨
  row=3: total_content_h=48.5, line_heights=[24.3, 24.3]
```

### 페이지네이션 결과 (현재)

```
PAGE 2: Table(27) + Para(28) + Para(29) + PartialTable(30, rows=0..3, split_end=338.8)
  body_area: y=94.5, height=933.6 (y_max=1028.1)
PAGE 3: PartialTable(30, rows=2..4, split_start=338.8) + Para(31)
```

### 현재 렌더링

| 페이지 | 기대 | 실제 |
|--------|------|------|
| PAGE 2 | 셀0(그림3) + 셀1(텍스트) | 셀0(그림3)만 렌더링, 셀2 빈 공간 |
| PAGE 3 | 셀2(그림4, 전체) + 셀3(텍스트) | 셀2(그림4) 렌더링 |

### 근본 원인

1. 이미지만 있는 셀의 문단이 `compose_paragraph()`에서 이미지 크기의 단일 "줄"(373.7px)로 구성됨
2. 인트라-로우 분할 시 `split_end_content_limit=338.8` 적용
3. `compute_cell_line_ranges()`에서 373.7 > 338.8이므로 줄 범위 `(0, 0)` 반환
4. `layout_partial_table()`에서 `start_line >= end_line` → `continue` → **문단의 이미지 컨트롤도 건너뜀**
5. 텍스트 셀은 줄 단위로 분할 가능하지만, 이미지 셀은 단일 줄이라 분할 불가 → 이미지 완전 누락

### HWP 동작 원칙

- 셀 내 텍스트가 편집 용지를 초과하면 → 다음 페이지에 셀을 독립적으로 렌더링 (인트라-로우 분할)
- 셀에 오직 그림만 있는 경우 → 이미지는 잘릴 수 없으므로 **행 전체를 다음 페이지로 이동**

## 목표

페이지를 넘기는 표(PartialTable)에서 이미지만 있는 셀의 행은 인트라-로우 분할하지 않고, 행 전체를 다음 페이지로 넘겨서 이미지가 잘리지 않고 완전하게 렌더링되도록 수정한다.

## 수행 범위

1. **페이지네이션**: 행의 모든 셀이 단일 줄(이미지)일 때 인트라-로우 분할 금지 → 해당 행 전체를 다음 페이지로 이동
2. 기대 결과: PAGE 2 = rows 0..2 (셀0 이미지 + 셀1 텍스트), PAGE 3 = rows 2..4 (셀2 이미지 전체 + 셀3 텍스트)
3. 회귀 테스트 추가 및 검증
