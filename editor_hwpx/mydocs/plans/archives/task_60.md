# 타스크 60: 표의 셀 높이 처리 개선 — 수행계획서

## 목표

셀 내 문단의 spacing_before/spacing_after 및 마지막 줄 line_spacing이 높이 측정에서 누락되어 텍스트가 셀 테두리 바깥으로 오버플로하는 문제 수정.

## 현황 분석

- **문제**: 셀 내 렌더링된 텍스트가 셀 하단 테두리를 넘어 그려짐
- **증거**: k-water-rfp_023.svg "사업개요" 셀 — 하단 테두리 y=1028.87, 마지막 텍스트 y=1035.52 (6.65px 오버플로)
- **원인**: `layout_composed_paragraph()`는 spacing_before/after + 마지막 줄 line_spacing을 포함하여 y를 전진시키지만, 셀 행 높이 측정 코드(height_measurer.rs, layout.rs)에서는 이들을 포함하지 않음
- **참고**: 독립 문단의 `measure_paragraph()`는 이미 올바르게 spacing 포함 (line 187)

## 핵심 설계

셀 행 높이 계산의 7곳을 동일 패턴으로 수정:
1. 각 문단에서 `styles.para_styles`로 spacing_before/spacing_after 조회
2. content_height에 합산
3. 마지막 줄 line_spacing 제외 로직 제거

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/height_measurer.rs` | measure_table() styles 전달, spacing 합산, MeasuredCell spacing fold |
| `src/renderer/layout.rs` | 4곳 높이 계산 수정 + compute_cell_line_ranges spacing fold |

## 구현 단계

| 단계 | 내용 | 파일 |
|------|------|------|
| 1 | height_measurer.rs 수정 | height_measurer.rs |
| 2 | layout.rs 수정 | layout.rs |
| 3 | 빌드 + 테스트 + 시각 검증 | 전체 |

## 검증 방법

- 네이티브 빌드 + WASM 빌드 성공
- 기존 테스트 전 통과
- k-water-rfp.hwp SVG: 셀 내 텍스트가 테두리 안에 포함
- 기존 파일 SVG: 레이아웃 깨짐 없음
