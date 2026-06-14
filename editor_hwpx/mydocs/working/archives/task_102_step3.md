# 타스크 102 — 3단계 완료 보고서

## 단계명
경로 기반 접근 + 재귀적 높이 측정

## 작업 기간
2026-02-17

## 수정 내역

### 1. PathSegment/DocumentPath 타입 정의 (`src/model/path.rs` 신규)
- `PathSegment` 열거형: `Paragraph(usize)`, `Control(usize)`, `Cell(u16, u16)`
- `DocumentPath = Vec<PathSegment>`: 임의 깊이 문서 트리 경로
- `path_from_flat()`: 기존 3-tuple → DocumentPath 변환 유틸리티
- 테스트 2개: `test_path_from_flat`, `test_nested_path_construction`

### 2. 경로 기반 표 접근 (`src/wasm_api.rs`)
- `navigate_path_to_table()`: 자유 함수, 재귀적 패턴 매칭으로 임의 깊이 중첩 표 접근
  - 종단: `[Paragraph(pi), Control(ci)]` → 해당 표 반환
  - 재귀: `[Paragraph(pi), Control(ci), Cell(r,c), ...rest]` → 셀 내 paragraphs에서 재귀
- `get_table_by_path()`: 구역 인덱스 + DocumentPath 기반 가변 참조 획득
- `get_table_mut()`: `path_from_flat()` → `get_table_by_path()` 위임 (기존 8개 호출부 무변경)

### 3. 재귀적 높이 측정 (`src/renderer/height_measurer.rs`)
- `measure_table()` → `measure_table_impl(depth)` 분리 (기존 공개 시그니처 유지)
- `MAX_NESTED_DEPTH = 10`: 무한 재귀 방어
- `cell_controls_height()`: 셀 내 중첩 표 총 높이 계산 헬퍼 (pub)
- content_height 계산 3곳에 중첩 표 높이 추가:
  - 2단계 row_span==1 셀 (line ~286)
  - 2-c단계 병합 셀 (line ~381)
  - MeasuredCell line_heights 구축 (line ~478): 중첩 표를 추가 줄로 반영

### 4. calc_cell_controls_height 실제 구현 (`src/renderer/layout.rs`)
- 기존: `0.0` 상수 반환 (셀 내 중첩 표 높이 무시)
- 변경: `HeightMeasurer::cell_controls_height()` 호출하여 실제 중첩 표 높이 반환
- 시그니처: `(cell)` → `(cell, styles)` — 호출부 4곳 수정

## 테스트 결과
- 556개 테스트 통과 (기존 554 + path.rs 2개)
- WASM 빌드 성공
- Vite 빌드 성공

## 수정 파일
| 파일 | 변경 |
|------|------|
| `src/model/path.rs` | 신규 60줄: PathSegment, DocumentPath, path_from_flat, 테스트 2개 |
| `src/model/mod.rs` | +1줄: `pub mod path;` |
| `src/wasm_api.rs` | navigate_path_to_table() 추가, get_table_by_path() 추가, get_table_mut() 위임 리팩토링 |
| `src/renderer/height_measurer.rs` | measure_table_impl(depth), cell_controls_height(), 3곳 중첩 표 높이 반영 |
| `src/renderer/layout.rs` | calc_cell_controls_height() 실제 구현 + 호출부 4곳 시그니처 수정 |

## 효과
- **높이 측정 정확성**: 중첩 표를 포함한 셀의 행 높이가 정확히 산출됨 (기존: 텍스트만 측정)
- **페이지네이션**: MeasuredCell에 중첩 표 높이가 줄 단위로 반영되어 셀 분할 정확도 향상
- **확장성**: DocumentPath로 임의 깊이 중첩 표 편집 기반 확보 (기존: 최상위 표만 접근 가능)
