# 타스크 102 — 5단계 완료 보고서

## 단계명
증분 리플로우 (Relayout Boundary + 선택적 재구성 + 증분 문단 측정)

## 작업 기간
2026-02-17

## 수정 내역

### 서브스텝 5-1: 셀 편집 Relayout Boundary (`src/wasm_api.rs`)
- `mark_section_dirty()` 메서드 추가: 구역 dirty 표시만 수행 (재조판 스킵)
- 카테고리 A 셀 편집 함수 7곳의 `recompose_section()` → `mark_section_dirty()` 치환:
  - `insert_text_in_cell_native`, `delete_text_in_cell_native`, `delete_range_native` (cell 분기), `paste_internal_in_cell_native` (single/multi), `paste_html_in_cell_native` (single/multi)
- 누락된 `table.dirty = true` 마킹 5곳 추가 (paste, delete_range 셀 편집)
- **효과**: 셀 텍스트 편집 시 전체 구역 compose_section() O(N) 완전 스킵

### 서브스텝 5-2: 선택적 문단 재구성 (`src/wasm_api.rs`)
- `recompose_paragraph(section_idx, para_idx)`: 단일 문단만 재조판
- `insert_composed_paragraph(section_idx, para_idx)`: composed 벡터에 새 항목 삽입
- `remove_composed_paragraph(section_idx, para_idx)`: composed 벡터에서 항목 제거
- 카테고리 B 본문 편집 함수 10곳의 `recompose_section()` → 선택적 재구성으로 치환:
  - 단일 문단 편집 4곳: `recompose_paragraph()` 단일 호출
  - 문단 분할: `recompose_paragraph()` + `insert_composed_paragraph()`
  - 문단 병합: `remove_composed_paragraph()` + `recompose_paragraph()`
  - 범위 삭제: 중간 문단 역순 `remove_composed_paragraph()` + 병합 후 `recompose_paragraph()`
  - 다중 문단 붙여넣기: 삽입 문단 `insert_composed_paragraph()` + 원본 `recompose_paragraph()`
- `rebuild_section()` 1곳은 기존 `recompose_section()` 유지 (전체 스타일 변경)
- **효과**: 본문 텍스트 편집 시 O(N) → O(1) per paragraph compose

### 서브스텝 5-3: 증분 문단 측정 (`src/wasm_api.rs`, `src/renderer/height_measurer.rs`)
- `dirty_paragraphs: Vec<Option<Vec<bool>>>` 필드 추가
  - None = 전체 dirty (초기 로드, recompose_section 후)
  - Some(vec) = 문단별 dirty 비트맵
- `mark_paragraph_dirty()` 메서드: 개별 문단 dirty 비트 설정
- `measure_section_selective()` 메서드 추가 (height_measurer.rs):
  - dirty_paras == None → `measure_section_incremental()` 폴백 (표 수준 캐싱)
  - dirty_paras == Some(bits) → non-dirty 문단 측정 캐시 재사용 + 표 dirty 항상 체크
- `paginate()` 연동:
  - 이전 측정 존재 시 `measure_section_selective()` 사용
  - 페이지네이션 완료 후 `dirty_paragraphs[idx] = Some(vec![false; para_count])` 초기화
- insert/remove_composed_paragraph에 dirty 비트맵 insert/remove 동기
- **효과**: 미변경 문단 측정 O(1) 캐시 재사용, 셀 편집 시 구역 문단 전체 측정 스킵

## 테스트 결과
- 564개 테스트 통과
- WASM 빌드 성공
- Vite 빌드 성공

## 수정 파일
| 파일 | 변경 |
|------|------|
| `src/wasm_api.rs` | `mark_section_dirty()`, `recompose_paragraph()`, `insert/remove_composed_paragraph()`, `mark_paragraph_dirty()`, `dirty_paragraphs` 필드, 카테고리 A 7곳 + 카테고리 B 10곳 치환, `paginate()` selective 측정 연동 |
| `src/renderer/height_measurer.rs` | `measure_section_selective()` 메서드 추가 (~75줄) |

## 성능 개선 효과

| 편집 유형 | 개선 전 | 개선 후 |
|-----------|---------|---------|
| 셀 텍스트 편집 | O(N) compose + O(N) measure | compose 스킵 + O(table) measure |
| 본문 텍스트 편집 | O(N) compose + O(N) measure | O(1) compose + O(1) measure |
| 표 구조 변경 | O(N) compose + O(N) measure | O(N) compose + O(dirty) measure |

## 5단계 리팩토링 최종 성과

| 단계 | 핵심 알고리즘 | 효과 |
|------|-------------|------|
| 1 | Dense Grid O(1) 셀 접근 | 셀 탐색 O(n)→O(1), 행 높이 이중 계산 제거 |
| 2 | 통합 표 레이아웃 (depth 재귀) | ~288줄 순감소, 중첩 표 로직 통합 |
| 3 | DocumentPath + 재귀적 높이 측정 | 임의 깊이 중첩 표 접근/측정 |
| 4 | Section dirty + Prefix Sum + 표 dirty | O(log R) 분할, dirty 구역/표만 재처리 |
| 5 | Relayout Boundary + 선택적 재구성 + 증분 측정 | 셀/본문 편집 O(N)→O(1) |
