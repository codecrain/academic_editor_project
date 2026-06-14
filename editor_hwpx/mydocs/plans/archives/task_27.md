# 타스크 27: 표 페이지 나누기 — 수행계획서

## 1. 개요

페이지 본문 영역 높이를 초과하는 큰 표를 **행 단위로 분할**하여 여러 페이지에 걸쳐 렌더링하는 기능을 구현한다.

### 현재 문제점

- 현재 표는 `PageItem::Table`로 **통째로** 한 페이지에 배치됨
- 표가 페이지보다 크면 다음 페이지로 이동하지만, 표 자체가 페이지보다 크면 **페이지 밖으로 넘침**
- 샘플 파일 `k-water-rfp.hwp`에는 21행×7열(표6), 32행×4열(표7), 28행×13열(표15) 등 대형 표가 다수 존재
- 한컴 오피스는 이런 표를 행 경계에서 자동으로 나누어 표시함

### 기존 인프라

| 항목 | 상태 | 설명 |
|------|------|------|
| `TablePageBreak` enum | 파싱됨, 미사용 | `None`, `CellBreak` 값 존재 |
| `Table.repeat_header` | 파싱됨, 미사용 | 제목행 반복 여부 |
| `MeasuredTable.row_heights` | 측정됨 | 행별 높이(px) 사전 계산 |
| `PageItem::Table` | 전체 표만 | 부분 표 지원 없음 |
| `layout_table()` | 전체 렌더링 | 행 범위 지정 불가 |

## 2. 목표

- 페이지 높이를 초과하는 표를 행 단위로 분할하여 여러 페이지에 렌더링
- `repeat_header`가 true인 경우 연속 페이지에 첫 행(제목행)을 반복
- 기존 381개 테스트 통과 유지
- `k-water-rfp.hwp` 샘플의 대형 표가 올바르게 여러 페이지에 분할되어 렌더링

## 3. 샘플 분석

`samples/k-water-rfp.hwp` (30페이지, 2구역):
- 모든 표가 `쪽나눔=나누지 않음` (TablePageBreak::None)으로 설정됨
- 그러나 한컴 오피스에서는 페이지를 초과하는 표는 나누어 표시
- 즉, `None`이라도 표가 페이지보다 크면 강제 분할 필요

## 4. 변경 범위

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/pagination.rs` | `PageItem::PartialTable` 추가, 행 단위 분할 로직 |
| `src/renderer/layout.rs` | `layout_table()` → 행 범위 지정 지원, `layout_partial_table()` 추가 |
| `src/renderer/height_measurer.rs` | `MeasuredTable`에 cell_spacing 정보 추가 (필요시) |

## 5. 구현 단계 (3단계)

### 1단계: PageItem::PartialTable 및 페이지네이션 분할 로직
- `PageItem::PartialTable { para_index, control_index, start_row, end_row, is_continuation }` 추가
- 페이지네이터에서 표 높이가 남은 영역 초과 시 행별로 누적하여 분할점 결정
- `repeat_header` 지원: 연속 페이지에 제목행 높이도 고려

### 2단계: layout_table 행 범위 렌더링
- `layout_table()`에 `start_row`, `end_row` 파라미터 추가 (또는 별도 `layout_partial_table` 함수)
- 지정된 행 범위의 셀만 렌더링
- `is_continuation`이면 제목행(행0)을 앞에 추가 렌더링
- 행 범위에 걸치는 병합 셀(row_span) 처리

### 3단계: 테스트 및 검증
- 단위 테스트 (페이지네이션 분할, 부분 렌더링)
- `k-water-rfp.hwp` SVG 출력 검증
- WASM 빌드 확인
- 기존 381개 테스트 통과 확인

## 6. 위험 요소

- 병합 셀(row_span > 1)이 분할 경계에 걸칠 경우 처리 복잡
- `쪽나눔=나누지 않음`인 표도 강제 분할해야 하는 조건 판단
- `repeat_header` 시 제목행에 병합 셀이 있는 경우
