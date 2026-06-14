# 타스크 31 - 2단계 완료보고서: 편집 영역 여백 제한 검증

## 작업 내용

편집 시 텍스트 플로우가 용지의 좌우 여백을 제외한 구역 내로 제한되는지 전체 파이프라인을 검증하였다.

## 검증 결과

### Reflow 파이프라인 (텍스트 줄바꿈)

`wasm_api.rs:reflow_paragraph()` 검증:
1. `PageLayoutInfo::from_page_def()` → `PageAreas::from_page_def()` 호출
2. `body_area` 계산: `content_left = margin_left + margin_gutter`, `content_right = page_width - margin_right`
3. `col_area = column_areas[0] = body_area` (단일 컬럼 시)
4. `available_width = col_area.width - para_margin_left - para_margin_right`
5. `reflow_line_segs()`에서 `available_width`를 기준으로 줄바꿈

**결론**: 페이지 좌우 여백이 올바르게 제외됨

### Rendering 파이프라인 (텍스트 위치 결정)

`layout.rs:build_paragraph_tree()` 검증:
1. TextLine BBox: `x = col_area.x + effective_margin_left` (좌측 여백 포함)
2. TextLine 너비: `col_area.width - effective_margin_left - margin_right` (양쪽 여백 반영)
3. 텍스트 정렬: `x_start`가 `col_area.x` 기준으로 정렬됨 (Left, Center, Right)
4. `collect_text_runs()`가 `node.bbox.x`를 출력 → 여백 오프셋 포함

**결론**: 렌더링 위치에 페이지 여백이 올바르게 반영됨

### 일관성 검증

- Reflow와 Rendering 모두 동일한 `PageDef`에서 `PageLayoutInfo`를 생성
- 양쪽 모두 `estimate_text_width()`로 글자 너비 계산
- `col_area.width`(여백 제외 너비)가 모든 경로에서 동일하게 사용됨

## 코드 변경 사항

**변경 없음** — 현재 코드가 이미 페이지 여백을 올바르게 처리하고 있음

## 검증

- `docker compose run --rm test` — 390개 테스트 통과
- `docker compose run --rm wasm` — WASM 빌드 성공

## 관련 코드 위치

| 파일 | 위치 | 역할 |
|------|------|------|
| `src/model/page.rs:131` | `PageAreas::from_page_def()` | 페이지 여백 → body_area 계산 |
| `src/renderer/page_layout.rs:50` | `PageLayoutInfo::from_page_def()` | HWP → px 변환 |
| `src/wasm_api.rs:786` | `reflow_paragraph()` | 편집 시 줄바꿈 너비 결정 |
| `src/renderer/layout.rs:592` | TextLine BBox | 렌더링 위치에 여백 반영 |
| `src/renderer/composer.rs:374` | `reflow_line_segs()` | available_width 기준 줄바꿈 |
