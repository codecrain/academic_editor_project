# 타스크 59: 표 셀 내부 줄 단위 페이지 분할 — 수행계획서

## 목표

현재 `PartialTable`의 행 단위 분할을 확장하여, `page_break: CellBreak` 속성이 설정된 표에서 **셀 내부 문단을 줄 단위로 분할**하여 페이지 여백까지 채우는 intra-row splitting 구현.

## 현황 분석

- **문제**: 높이가 큰 행이 잔여 공간보다 크면 통째로 다음 페이지로 이동 → 빈 공간 발생 (k-water-rfp.hwp 5쪽 하단 ~432px 공백)
- **원인**: `pagination.rs` 행 분할 루프(line 592)가 행 경계에서만 분할, 행 내부 셀 콘텐츠 분할 미지원
- **기존 인프라**: `layout_composed_paragraph(start_line, end_line)` 줄 범위 렌더링 이미 지원 (PartialParagraph용)

## 핵심 설계

1. **MeasuredCell**: 셀별 줄 단위 측정 데이터 (line_heights, para_line_counts)
2. **PartialTable 확장**: `split_start_content_offset`, `split_end_content_limit` 필드 추가
3. **공유 content_offset**: 모든 셀이 동일 기준으로 독립적 줄 범위 계산
4. **기존 호환**: 디폴트 (0.0, 0.0) → 기존 동작 100% 유지

## 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/height_measurer.rs` | MeasuredCell 구조체, measure_table 확장, 헬퍼 메서드 |
| `src/renderer/pagination.rs` | PartialTable 확장, 인트라-로우 분할 로직, 유닛 테스트 |
| `src/renderer/layout.rs` | layout_partial_table 분할 행 렌더링 |

## 구현 단계

| 단계 | 내용 | 파일 |
|------|------|------|
| 1 | 데이터 구조 확장 + 측정 로직 | height_measurer.rs, pagination.rs |
| 2 | Pagination 행 내부 분할 로직 | pagination.rs |
| 3 | Layout 분할 행 셀 렌더링 | layout.rs |
| 4 | 빌드 검증 + 테스트 + 시각 확인 | 전체 |

## 검증 방법

- WASM 빌드 + 전체 테스트 통과
- k-water-rfp.hwp SVG: 5쪽 하단까지 표 내용 채워짐, 6쪽 이어서 렌더링
- 기존 파일 동작 변화 없음 확인
