# 타스크 77 최종 결과보고서: 페이지 하단 표 셀 내 이미지 처리

## 요약

`samples/20250130-hongbo.hwp`에서 표6(문단30, 4행×1열)이 페이지를 넘길 때, 이미지만 있는 셀(행2)이 인트라-로우 분할되어 이미지가 완전히 누락되는 문제를 해결하였다. 이미지 셀 행의 인트라-로우 분할을 금지하여 행 전체를 다음 페이지로 이동시킨다.

## 근본 원인

1. 이미지만 있는 셀의 문단이 `compose_paragraph()`에서 이미지 크기의 단일 "줄"(373.7px)로 구성됨
2. 페이지네이션에서 인트라-로우 분할 시 `split_end_content_limit=338.8` 적용
3. `compute_cell_line_ranges()`에서 373.7 > 338.8이므로 줄 범위 `(0, 0)` 반환
4. `layout_partial_table()`에서 `start_line >= end_line` → `continue` → 이미지 컨트롤도 건너뜀

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/height_measurer.rs` | `MeasuredTable::is_row_splittable()` 메서드 추가. 행의 모든 셀이 단일 줄(≤1)이면 분할 불가로 판별 |
| `src/renderer/pagination.rs` | 인트라-로우 분할 조건에 `mt.is_row_splittable(r)` 검사 추가 (2곳) |
| `src/wasm_api.rs` | 회귀 테스트 1개 추가 (`test_task77_image_cell_no_intra_row_split`) |

## 핵심 수정

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| 첫 행 오버플로 분할 조건 (740행) | `if can_intra_split` | `if can_intra_split && mt.is_row_splittable(r)` |
| 중간 행 부분 배치 조건 (758행) | `if can_intra_split` | `if can_intra_split && mt.is_row_splittable(r)` |
| 페이지네이션 결과 | rows=0..3 (split_end=338.8) | rows=0..2 (split 없음) |

## 검증 결과

- 492개 Rust 테스트 통과 (기존 491 + 신규 1)
- SVG 내보내기: 20250130-hongbo.hwp 정상
- WASM 빌드 성공
- Vite 빌드 성공
- 웹 브라우저 렌더링 정상 확인
