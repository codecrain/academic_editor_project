# 타스크 166 구현 계획서: 다단 편집 설계 및 구현

## 개요

| 항목 | 내용 |
|------|------|
| 타스크 | 166 (백로그 B-006 승격) |
| 제목 | 다단 편집 설계 및 구현 |
| 단계 | 3단계 (최소 구현) |
| 작성일 | 2026-02-26 |

## 기존 인프라 분석

### 렌더 트리 구조

```
Page → Body → Column(0) → TextLine → TextRun
                         → TextLine → TextRun
              Column(1) → TextLine → TextRun
                         → TextLine → TextRun
```

- `RenderNodeType::Column(u16)` 노드가 단 영역을 감싸고, 그 안에 TextLine/TextRun 존재
- 하나의 문단이 두 단에 걸칠 수 있음 → `PartialParagraph { start_line, end_line }`

### 기존 데이터

- `para_column_map[section_idx][para_idx] = column_index` — 문단의 **주 소속 단** (페이지네이션에서 결정)
- `PageContent.column_contents: Vec<ColumnContent>` — 각 단에 배치된 문단/표 목록
- `PageAreas.column_areas: Vec<Rect>` — 단별 본문 영역 좌표

### 현재 문제점

1. `find_cursor_in_node()` — Column 노드를 무시하고 재귀 탐색 → 같은 `(sec, para)`의 TextRun이 다른 칼럼에 있을 때 첫 번째 매칭(잘못된 칼럼)을 반환
2. `collect_runs()` — Column 정보 없이 모든 TextRun 수집 → "같은 Y 라인" 폴백에서 다른 칼럼의 TextRun과 매칭
3. `handle_body_boundary()` — 다음 문단 인덱스로만 이동 시도 → 칼럼0 바닥에서 칼럼1 상단 이동 불가
4. `collect_matching_runs()` — Column 정보 없이 매칭 → 수직 이동 시 잘못된 칼럼의 TextRun 참조
5. `get_selection_rects_native()` — 선택 영역 계산 시 칼럼 구분 없음 → 1단계/2단계 수정이 적용되면 자동 해결 예상

---

## 1단계: cursor_rect.rs 칼럼 추적 (커서 좌표 + 히트 테스트)

### 1-1. `find_cursor_in_node()`에 칼럼 추적 추가

**파일:** `src/document_core/queries/cursor_rect.rs:32-76`

현재 시그니처:
```rust
fn find_cursor_in_node(
    node: &RenderNode, sec: usize, para: usize, offset: usize, page_index: u32,
) -> Option<CursorHit>
```

수정 시그니처:
```rust
fn find_cursor_in_node(
    node: &RenderNode, sec: usize, para: usize, offset: usize, page_index: u32,
    current_column: Option<u16>,
) -> Option<CursorHit>
```

수정 내용:
- `Column(col_idx)` 노드 진입 시 `current_column = Some(col_idx)` 전파
- TextRun 매칭은 기존 로직 유지 (char_start 범위로 이미 구분됨)
- 같은 문단이 두 칼럼에 걸치는 `PartialParagraph` 경우, 렌더 트리의 TextRun은 이미 각 칼럼 Column 노드 안에 있으므로 별도 필터 불필요
- **핵심**: `find_cursor_in_node`은 깊이 우선 탐색이므로, Column(0)의 TextRun과 Column(1)의 TextRun 중 올바른 것을 먼저 찾아야 함 → `char_start` 범위 매칭이 이미 이를 보장하나, 빈 문단 폴백(`find_para_line`)에서 칼럼 구분이 필요

### 1-2. `find_para_line()`에 칼럼 추적 추가

**파일:** `src/document_core/queries/cursor_rect.rs:94-117`

현재 시그니처:
```rust
fn find_para_line(node: &RenderNode, sec: usize, para: usize) -> Option<(f64, f64, f64)>
```

수정 시그니처:
```rust
fn find_para_line(node: &RenderNode, sec: usize, para: usize, current_column: Option<u16>) -> Option<(f64, f64, f64)>
```

수정 내용:
- `Column(col_idx)` 노드에서 `current_column` 전파
- TextRun/TextLine 매칭 시 칼럼 구분은 이미 트리 구조로 보장됨

### 1-3. `RunInfo`에 `column_index` 필드 추가

**파일:** `src/document_core/queries/cursor_rect.rs:140-153`

```rust
struct RunInfo {
    // ... 기존 필드 ...
    column_index: Option<u16>,  // 추가
}
```

### 1-4. `collect_runs()`에 칼럼 추적 추가

**파일:** `src/document_core/queries/cursor_rect.rs:155-181`

현재 시그니처:
```rust
fn collect_runs(node: &RenderNode, runs: &mut Vec<RunInfo>)
```

수정 시그니처:
```rust
fn collect_runs(node: &RenderNode, runs: &mut Vec<RunInfo>, current_column: Option<u16>)
```

수정 내용:
- `Column(col_idx)` 노드 진입 시 `current_column = Some(col_idx)` 전파
- `RunInfo` 생성 시 `column_index: current_column` 설정

### 1-5. "같은 Y 라인" 폴백에서 칼럼 필터링

**파일:** `src/document_core/queries/cursor_rect.rs:278-293`

현재 로직:
```rust
let mut same_line_runs: Vec<&RunInfo> = runs.iter()
    .filter(|r| y >= r.bbox_y && y <= r.bbox_y + r.bbox_h)
    .collect();
```

수정 로직:
- 클릭 좌표 `(x, y)`가 속한 칼럼을 `PageAreas.column_areas`에서 결정
- 해당 칼럼의 RunInfo만 필터링

```rust
// 클릭 좌표로 소속 칼럼 결정
let click_column = self.find_column_at_x(page_num, x);

let mut same_line_runs: Vec<&RunInfo> = runs.iter()
    .filter(|r| y >= r.bbox_y && y <= r.bbox_y + r.bbox_h)
    .filter(|r| r.column_index == click_column || r.column_index.is_none())
    .collect();
```

### 1-6. "가장 가까운 줄" 폴백에서도 칼럼 필터링

**파일:** `src/document_core/queries/cursor_rect.rs:295-325`

수정 내용:
- `closest` 찾을 때 클릭 좌표가 속한 칼럼의 run만 후보로 사용
- 칼럼 내에 run이 없으면 전체에서 가장 가까운 줄 사용 (기존 폴백)

### 1-7. 헬퍼: `find_column_at_x()`

**파일:** `src/document_core/queries/cursor_rect.rs` (또는 `mod.rs`)

```rust
/// 클릭 x 좌표가 속한 칼럼 인덱스를 반환한다.
fn find_column_at_x(&self, page_num: u32, x: f64) -> Option<u16> {
    let (page_content, _, _) = self.find_page(page_num).ok()?;
    let layout = &page_content.layout;
    for (i, area) in layout.column_areas.iter().enumerate() {
        if x >= area.x && x <= area.x + area.width {
            return Some(i as u16);
        }
    }
    None
}
```

### 예상 변경량
- cursor_rect.rs: ~40줄 수정/추가
- mod.rs (또는 cursor_rect.rs): ~15줄 헬퍼 추가

---

## 2단계: cursor_nav.rs 칼럼 경계 인식 수직 이동

### 2-1. `handle_body_boundary()`에 칼럼 경계 처리 추가

**파일:** `src/document_core/queries/cursor_nav.rs:610-645`

현재 로직:
```rust
let target_para_i = para as i32 + delta;
// target_para_i < 0 이면 이전 구역, >= section.paragraphs.len() 이면 다음 구역
```

수정 로직:
```
1. 현재 문단의 소속 칼럼 확인: para_column_map[sec][para]
2. delta > 0 (아래로):
   a. 같은 칼럼의 다음 문단이 있으면 → 기존 로직 (다음 문단으로)
   b. 같은 칼럼에 다음 문단이 없으면 → 다음 칼럼의 첫 문단 찾기
   c. 다음 칼럼도 없으면 → 다음 페이지 칼럼0 첫 문단 (기존 로직)
3. delta < 0 (위로):
   a. 같은 칼럼의 이전 문단이 있으면 → 기존 로직 (이전 문단으로)
   b. 같은 칼럼에 이전 문단이 없으면 → 이전 칼럼의 마지막 문단 찾기
   c. 이전 칼럼도 없으면 → 이전 페이지 마지막 칼럼 마지막 문단 (기존 로직)
```

구체적 수정:
- `handle_body_boundary()` 함수 시작 부분에서 `para_column_map`과 `pagination` 데이터를 조회
- 칼럼 경계 조건 감지 시 `find_adjacent_column_first_last_para()` 헬퍼 호출

### 2-2. 헬퍼: `find_adjacent_column_paragraph()`

**위치:** `src/document_core/queries/cursor_nav.rs`

```rust
/// 현재 문단에서 같은 칼럼의 인접 문단을 찾는다.
/// 같은 칼럼에 인접 문단이 없으면, 인접 칼럼의 첫/마지막 문단을 반환한다.
fn find_adjacent_column_paragraph(
    &self,
    sec: usize,
    para: usize,
    delta: i32,  // +1 또는 -1
) -> Option<(usize, usize)>  // (section_index, para_index)
```

구현 전략:
1. `para_column_map[sec][para]`로 현재 칼럼 확인
2. 인접 문단(`para + delta`)의 칼럼이 현재와 같으면 → `Some((sec, para + delta))`
3. 인접 문단이 다른 칼럼이거나 범위 초과이면:
   - `pagination` 데이터에서 현재 페이지의 `column_contents` 검색
   - delta > 0: 다음 칼럼(current_col + 1)의 `items[0]` → 해당 문단의 첫 줄
   - delta < 0: 이전 칼럼(current_col - 1)의 `items.last()` → 해당 문단의 마지막 줄
4. 인접 칼럼도 없으면 → `None` (기존 로직으로 폴백: 다음/이전 페이지)

### 2-3. 헬퍼: `find_page_and_column_for_paragraph()`

**위치:** `src/document_core/queries/cursor_nav.rs`

```rust
/// 문단이 배치된 (페이지 인덱스, 칼럼 인덱스)를 반환한다.
fn find_page_and_column_for_paragraph(
    &self,
    sec: usize,
    para: usize,
) -> Option<(usize, u16)>  // (local_page_index, column_index)
```

### 2-4. `collect_matching_runs()`에 칼럼 추적 (선택적)

**파일:** `src/document_core/queries/cursor_nav.rs:525-566`

`RunMatch`에 `column_index: Option<u16>` 필드 추가:
- `Column(col_idx)` 노드 진입 시 추적
- `find_char_at_x_on_line()`에서 정확한 칼럼의 TextRun만 사용

이 수정은 2단 문서에서 같은 문단이 두 칼럼에 나뉘어 배치된 경우(`PartialParagraph`) preferredX 계산의 정확성을 보장한다.

### 예상 변경량
- cursor_nav.rs: ~80줄 수정/추가

---

## 3단계: 선택 영역 칼럼 너비 제한 + 검증

### 3-1. 핵심 요구사항: 선택 블럭이 해당 단 너비 내에서만 렌더링

2단/3단 문서에서 텍스트 선택(블럭 지정) 시, 하이라이트 사각형은 **해당 단의 좌우 경계 안**에서만 그려져야 한다.

예시 (2단):
```
┌───────────┐ ┌───────────┐
│ 칼럼0      │ │ 칼럼1      │
│ ████ 선택 │ │            │  ← 칼럼0 선택: 칼럼0 너비 내
│ ██████████│ │            │  ← 줄 전체 선택: area_right까지만
│ ████      │ │            │
└───────────┘ └───────────┘
```

### 3-2. 기존 인프라 활용

`get_selection_rects_native()`에 이미 `find_column_area()` 헬퍼가 존재:

```rust
// cursor_nav.rs:984-1001
let find_column_area = |page: u32, rx: f64| -> (f64, f64) {
    // rx 좌표로 소속 칼럼의 (area_left, area_right) 반환
    // column_areas에서 rx가 속하는 영역 탐색
};
```

이 헬퍼가 `rh.x` (오른쪽 커서 좌표)를 기준으로 소속 칼럼을 결정하고, 줄 전체 선택 시 `rect_x = area_left`, `width = area_right - rect_x`로 칼럼 경계를 제한한다.

**1단계의 커서 좌표 수정이 적용되면** `rh.x`가 항상 올바른 칼럼 내 좌표를 반환하므로, `find_column_area()`가 정확한 칼럼 영역을 반환하게 된다.

### 3-3. 추가 수정이 필요한 경우

**PartialParagraph 케이스**: 한 문단이 칼럼0과 칼럼1에 걸침

현재 `get_selection_rects_native()`는 문단별 → 줄별로 rect를 생성한다. 같은 문단의 줄 A가 칼럼0에, 줄 B가 칼럼1에 있을 때:

- 줄 A의 `find_cursor!()` → 칼럼0 내 좌표 반환 → `find_column_area()` → 칼럼0 영역
- 줄 B의 `find_cursor!()` → 칼럼1 내 좌표 반환 → `find_column_area()` → 칼럼1 영역

즉, **줄별로 칼럼 영역이 자동 결정**되므로 PartialParagraph도 정상 동작 예상.

만약 1단계 수정 후에도 `find_body_cursor`가 잘못된 칼럼의 TextRun을 반환하는 경우:
- `find_body_cursor`/`find_cell_cursor`에 `current_column: Option<u16>` 파라미터 추가
- `Column(col_idx)` 노드에서 전파

### 3-4. 칼럼 간 선택 (크로스-칼럼 선택)

칼럼0 중간 → 칼럼1 중간까지 드래그 선택 시:

```
┌───────────┐ ┌───────────┐
│    ████████│ │            │  ← 칼럼0: 선택 시작점 ~ area_right
│ ██████████│ │            │  ← 칼럼0: area_left ~ area_right (전체 줄)
│ ██████████│ │            │  ← 칼럼0: 마지막 줄도 전체
│            │ │██████████ │  ← 칼럼1: area_left ~ area_right (전체 줄)
│            │ │████       │  ← 칼럼1: area_left ~ 선택 끝점
└───────────┘ └───────────┘
```

이 동작은 현재 문단 순서(칼럼0의 문단들 → 칼럼1의 문단들)대로 순회하면서 줄별 rect를 생성하는 기존 로직이 자연스럽게 처리한다. 각 줄의 `find_column_area()`가 올바른 칼럼 영역을 반환하기만 하면 된다.

### 3-5. 검증

**자동 테스트:**
```bash
cargo test    # 기존 608개 테스트 전부 통과 (회귀 없음)
```

**수동 테스트 (Studio):**
1. 2단/3단 문서 열기
2. 각 칼럼 영역 클릭 → 정확한 위치에 커서 배치
3. ArrowDown — 칼럼0 바닥 → 칼럼1 상단 이동
4. ArrowUp — 칼럼1 상단 → 칼럼0 바닥 이동
5. Home/End → 현재 칼럼 줄 시작/끝으로 이동
6. **칼럼 내 선택** — 드래그 시 하이라이트가 해당 칼럼 너비 내에서만 표시
7. **칼럼 간 선택** — 칼럼0→칼럼1 드래그 시 각 칼럼에 독립적 하이라이트
8. **줄 전체 선택** — 하이라이트가 칼럼 우측 경계(area_right)까지만 확장
9. 불균등 칼럼 너비 문서에서 검증

**엣지 케이스:**
- 한 문단이 칼럼0에서 시작하여 칼럼1로 이어지는 경우 (PartialParagraph)
- 단 수 변경 경계 (`ColumnBreakType::MultiColumn`) 전후 이동/선택
- 다단 내 표 (표는 단 하나를 차지)
- 빈 칼럼 (콘텐츠 없는 칼럼)
- 3단에서 칼럼0→칼럼2 전체 선택

### 예상 변경량
- cursor_nav.rs (선택 영역): ~20줄 수정 (필요 시)
- 테스트/검증: 기존 테스트 활용 + Studio 수동 검증

---

## 수정 대상 파일 요약

| 파일 | 단계 | 수정 내용 |
|------|------|-----------|
| `src/document_core/queries/cursor_rect.rs` | 1 | `find_cursor_in_node`, `find_para_line`, `collect_runs`, `RunInfo`, 히트 테스트 폴백 칼럼 필터, `find_column_at_x` |
| `src/document_core/queries/cursor_nav.rs` | 2, 3 | `handle_body_boundary`, `find_adjacent_column_paragraph`, `find_page_and_column_for_paragraph`, `collect_matching_runs`, 선택 영역 확인 |

## 검증 방법

```bash
cargo test                              # 608개 테스트 통과
# Studio에서 다단 샘플 수동 테스트
```
