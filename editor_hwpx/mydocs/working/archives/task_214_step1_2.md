# Task 214 — 1~2단계 완료보고서

## 완료 내용

### 1단계: TypesetEngine 프레임워크 구축

- `src/renderer/typeset.rs` 신설 (993줄)
- `TypesetEngine` 구조체: 단일 패스 조판 엔진
- `TypesetState` 구조체: 페이지/단 상태 관리 (기존 PaginationState와 동일한 역할)
- `FormattedParagraph` 구조체: format() 결과 (줄별 높이, spacing)
- 핵심 메서드:
  - `typeset_section()` — 진입점
  - `format_paragraph()` — 문단 높이 계산 (HeightMeasurer::measure_paragraph 통합)
  - `typeset_paragraph()` — fits → place/split 흐름
  - `split_table_into_pages()` — 표 행 분할 (Phase 2 호환용)
- `src/renderer/mod.rs`에 `pub mod typeset` 등록

### 2단계: 문단 조판 구현 + 기존 경로 비교 검증

- `format_paragraph()`: 기존 HeightMeasurer::measure_paragraph와 동일한 로직
  - line_seg/composed 기반 줄 높이 계산
  - spacing_before/after 반영
  - line_spacing_type별 보정 (Percent/Fixed/SpaceOnly/Minimum)
  - trailing line_spacing 제외한 height_for_fit 계산
- `typeset_paragraph()`: 기존 paginate_text_lines와 동일한 흐름
  - 전체 배치 (FullParagraph)
  - 줄 단위 분할 (PartialParagraph)
  - 다단 문단 처리 (detect_column_breaks_in_paragraph)
  - 강제 쪽/단 나누기 처리
- 표 문단: 기존 MeasuredTable 활용 호환 처리 (Phase 2 전환 대상)
- 머리말/꼬리말/쪽 번호 할당: 기존 finalize_pages 로직 재현

## 테스트 결과

### 단위 테스트 (7개)
- `test_typeset_engine_creation` — 생성자 확인
- `test_typeset_empty_paragraphs` — 빈 문서 1페이지 보장
- `test_typeset_single_paragraph` — 단일 문단 기존과 일치
- `test_typeset_page_overflow` — 100개 문단 페이지 분할 일치
- `test_typeset_line_split` — 50줄 문단 줄 단위 분할 일치
- `test_typeset_mixed_paragraphs` — 혼합 높이 문단 일치
- `test_typeset_page_break` — 강제 쪽 나누기 2페이지 일치

### 통합 테스트 (3개, 실제 HWP 파일)
- `test_typeset_vs_paginator_p222` — p222.hwp (3개 구역, 비-표 구역 일치 확인)
- `test_typeset_vs_paginator_hongbo` — 20250130-hongbo.hwp (표 많은 복잡한 문서)
- `test_typeset_vs_paginator_biz_plan` — biz_plan.hwp

### 전체 테스트
- **694개 PASS** (기존 684 + 새 테스트 10개), 0 FAIL

## 알려진 제한사항

- 표 포함 구역에서 기존 Paginator와 페이지 수 차이 발생 가능 (p222.hwp sec2: 44 vs 43)
  - 원인: 표 행 분할/캡션/머리행 반복/각주 등 세부 로직 미구현
  - Phase 2에서 표 조판 전환 시 해결 예정
