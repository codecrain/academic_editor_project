# 타스크 198 최종 결과 보고서 — 표 페이지 경계 분할 처리 검증 및 버그 수정

## 개요

표가 페이지 경계에 걸쳐지는 상황에서 행 단위 분리 처리의 정확성을 검증하고, 발견된 5건의 버그를 수정함.

## 발견 및 수정된 버그

### BUG-1: 비-TAC 표 높이 추적 불일치 (pagination ↔ layout)

| 항목 | 내용 |
|------|------|
| 증상 | 페이지 후반부 표가 body area를 초과하여 렌더링 |
| 원인 | 레이아웃에서 비-TAC 표 아래에 호스트 문단의 `line_spacing`을 추가하지만, 페이지네이션의 `host_spacing`에는 미포함 |
| 수정 | `engine.rs` — `host_spacing` 계산에 비-TAC 표의 `line_spacing` 추가 |

### BUG-2: PartialTable 최종 배치 시 spacing_after 누락

| 항목 | 내용 |
|------|------|
| 증상 | 분할 표의 마지막 부분 배치 시 높이 추적 오차 |
| 원인 | `split_table_rows`의 PartialTable 최종 배치에서 `spacing_after` 미포함 |
| 수정 | `engine.rs` — 최종 배치에 `spacing_after` 추가 |

### BUG-3: 중첩 표가 PartialTable 셀 경계 초과 렌더링

| 항목 | 내용 |
|------|------|
| 증상 | PartialTable의 셀 내 중첩 표가 셀 높이를 초과하여 body area 밖에 렌더링 |
| 원인 | 비분할 행에서 중첩 표를 `split_ref=None`으로 전달하여 전체 높이 렌더링 |
| 수정 | `table_partial.rs` — 비분할 행에서도 중첩 표가 가용 공간 초과 시 `NestedTableSplit` 적용 |

### BUG-4: TAC 표 높이 이중 계산 (line_end 보정 오류)

| 항목 | 내용 |
|------|------|
| 증상 | 페이지 31 표40-표41 사이 비정상적으로 큰 간격 (~173px 공백) |
| 원인 | TAC 표의 `line_end` 보정 시 `seg_height`(표 높이) 범위까지 허용하여, 비첫페이지에서 vpos 기반 line_end가 실제 위치와 크게 다를 때 표 높이가 이중 적용됨 |
| 수정 | `layout.rs` — TAC line_end 보정 가드를 `seg_height` → `line_spacing * 2 + 1000 HU`로 축소하여 소폭 보정만 허용 |

추가 개선: vpos 보정을 page_index==0 전용에서 전체 페이지로 확장 (vpos_page_base / vpos_lazy_base 사용)

### BUG-5: 자리차지(text_wrap=1) 표의 spacing_before 이중 계산

| 항목 | 내용 |
|------|------|
| 증상 | 페이지 44-45 등에서 표 분할 시 남은 페이지 여유가 있는데도 행이 다음 페이지로 넘어감 (~6.67px/표 누적 오차) |
| 원인 | 자리차지(text_wrap=1) 비-TAC 표는 레이아웃에서 `v_offset` 기반 절대 위치로 배치되어 `spacing_before`가 y_offset에 반영되지 않지만, 페이지네이션의 `host_spacing`에는 `spacing_before`가 포함되어 표당 500HU(~6.67px)의 누적 오차 발생 |
| 수정 | `engine.rs` — 자리차지 비-TAC 표의 `host_spacing`에서 `spacing_before` 제외 |

추가 개선: `layout_partial_table`에서 `MeasuredTable` 행 높이를 사용하도록 개선 (pagination과 layout 간 행 높이 일관성 보장)

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/pagination/engine.rs` | BUG-1: host_spacing에 line_spacing 추가, BUG-2: 최종 배치에 spacing_after 추가, BUG-5: 자리차지 표 host_spacing에서 spacing_before 제외 |
| `src/renderer/layout/table_partial.rs` | BUG-3: 비분할 행 중첩 표에 NestedTableSplit 적용, BUG-5: MeasuredTable 행 높이 사용 |
| `src/renderer/layout.rs` | BUG-4: TAC line_end 보정 가드 축소, vpos 보정 전체 페이지 확장 |
| `src/renderer/pagination/tests.rs` | S1~S4 단위 테스트 4개 추가 |

## 테스트 결과

### 네이티브 단위 테스트

- 전체: **681 passed**, 0 failed, 1 ignored
  - 기존 677개 + 신규 4개

### 신규 테스트 목록

| 테스트 | 검증 내용 |
|--------|-----------|
| `test_table_split_10rows_at_page_bottom` (S1) | 10행 표 페이지 하단 분할, 행 범위 연속성 |
| `test_table_split_50rows_multi_page` (S2) | 50행 대형 표 3+페이지 분할, 전체 행 커버 |
| `test_table_split_with_nested_table` (S3) | 중첩 표 포함 외부 표 분할 |
| `test_table_height_within_body_area` (S4) | 콘텐츠 높이가 body area 이내 (B-011 재현) |

### SVG 내보내기 검증 (hwpp-001.hwp)

- 67페이지 전체 검사: **오버플로우 0건**
- 페이지 44-45 (BUG-5 수정 대상): 표 분할 위치 정상화, 빈 공간 최소화

### WASM 빌드

- Docker WASM 빌드 성공

## B-011 해결 상태

- hwpp-001.hwp의 표 오버플로우 문제 해결 완료
- 67페이지 전체에서 표 콘텐츠가 body area 이내로 렌더링됨
