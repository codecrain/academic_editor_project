# 타스크 166 - 3단계 완료 보고서: 선택 영역 칼럼 너비 제한 + 검증

## 작업 내용

다단 문서에서 선택 블럭(하이라이트)이 각 칼럼의 너비 내에 올바르게 표시되도록 검증 및 버그 수정

### 수정 파일

| 파일 | 수정 내용 |
|------|-----------|
| `src/document_core/queries/cursor_nav.rs` | `get_selection_rects_native()` tree_cache 로딩 조건 버그 수정 |

### 상세 변경사항

#### 1. tree_cache 로딩 조건 수정

**수정 전 (버그):**
```rust
if cell_ctx.is_none() && !tree_cache.iter().any(|(p, _)| page_nums.contains(p)) {
```
- `tree_cache`는 `page_nums` 엔트리로 초기화되므로 이 조건은 항상 `false`
- 결과: 선택 범위의 중간 문단이 다른 페이지에 있을 때 렌더 트리가 로드되지 않아 해당 줄의 선택 사각형 생성 실패

**수정 후:**
```rust
if cell_ctx.is_none() {
```
- 항상 현재 문단의 페이지를 확인하여 tree_cache에 없으면 추가
- 이미 캐시된 페이지는 `!tree_cache.iter().any(|(p, _)| *p == pn)` 체크로 건너뜀
- 다단 문서에서 페이지 경계를 넘는 선택 영역도 정확하게 표시

#### 2. 기존 칼럼 영역 처리 검증

`find_column_area(page, rx)` 헬퍼가 이미 올바르게 동작함을 확인:

```
선택 시나리오: 칼럼0 문단1 → 칼럼1 문단4

칼럼0                  칼럼1
┌───────────────┐   ┌───────────────┐
│ Para 0        │   │ Para 3 ██████ │ ← 칼럼1의 area_left~area_right 내
│ Para 1 ██████ │   │ Para 4 ███    │ ← partial_start: lh.x~rh.x
│ Para 2 ██████ │   │               │
└───────────────┘   └───────────────┘
  칼럼0 너비 내         칼럼1 너비 내
```

- 줄 단위로 `find_column_area(rh.page, rh.x)` 호출
- `rh.x`는 해당 줄의 텍스트 위치이므로 자동으로 올바른 칼럼의 영역이 반환됨
- `selection_continues` 시 `area_right - rect_x` → 해당 칼럼 오른쪽 끝까지만 확장 (다른 칼럼으로 넘어가지 않음)
- `partial_start` 시 `lh.x ~ rh.x` → 칼럼 내 커서 간 거리

#### 3. PartialParagraph 선택 검증

같은 문단이 두 칼럼에 걸칠 때:
- 줄 단위 순회에서 각 줄의 커서 좌표(`lh.x`, `rh.x`)는 해당 줄이 렌더링된 칼럼의 좌표계에 있음
- `find_column_area`가 각 줄마다 올바른 칼럼 영역을 반환
- 결과: 칼럼0의 줄들은 칼럼0 너비 내, 칼럼1의 줄들은 칼럼1 너비 내에 독립적 사각형 생성

## 테스트 결과

```
cargo test: 608 passed; 0 failed
```

## 전체 타스크 166 변경 요약

| 단계 | 파일 | 핵심 변경 |
|------|------|-----------|
| 1단계 | `cursor_rect.rs` | `RunInfo.column_index`, `collect_runs()` 칼럼 추적, 히트 테스트 폴백 칼럼 필터링, `find_column_at_x()` |
| 2단계 | `cursor_nav.rs` | `get_column_area_for_paragraph()`, `transform_preferred_x_across_columns()`, `find_column_for_line()`, CASE A/B preferredX 변환 |
| 3단계 | `cursor_nav.rs` | tree_cache 로딩 버그 수정, 기존 `find_column_area` 검증 |

총 변경: cursor_rect.rs +51줄, cursor_nav.rs +114줄
