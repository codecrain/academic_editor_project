# 표 아키텍처 리팩토링 계획서 (5단계)

## 1. 목적

뷰어 패러다임에서 편집기 패러다임으로 전환하기 위해, 표 객체 처리 아키텍처를 5단계에 걸쳐 점진적으로 리팩토링한다. 각 단계는 독립적으로 완결되며, 이전 단계의 성과 위에 다음 단계를 구축한다.

## 2. 전제 조건

- 각 단계 완료 후 **모든 기존 테스트 통과** + **WASM/Vite 빌드 성공** 필수
- 각 단계는 **기존 동작을 깨지 않는** 비파괴적 리팩토링
- HWP 파일 파싱/직렬화 포맷 변경 없음 (라운드트립 보존)

## 3. 참조 문서

- [표 아키텍처 현황 분석 보고서](../report/table_architecture_review.md)
- [알고리즘 조사 보고서](../report/table_algorithm_research.md)

---

## 단계 1: Dense Grid 인덱스 + MeasuredTable 전달

### 목표

- O(n) 셀 탐색 → O(1) 셀 탐색
- 높이 이중 계산 제거 (measure_table + layout_table 중복)

### 범위

| 항목 | 파일 | 변경 내용 |
|------|------|----------|
| Dense Grid | `src/model/table.rs` | `cell_grid: Vec<Option<usize>>` 필드 추가, `rebuild_grid()` 메서드 |
| Grid 접근 API | `src/model/table.rs` | `cell_at(row, col) -> Option<&Cell>` O(1) 메서드 |
| Grid 동기화 | `src/model/table.rs` | `insert_row/column`, `delete_row/column`, `merge_cells`, `split_cell` 후 `rebuild_grid()` 호출 |
| find_cell 대체 | `src/wasm_api.rs` | `find_cell_at_row_col()` → `table.cell_at(row, col)` 전환 |
| MeasuredTable 전달 | `src/renderer/layout.rs` | `layout_table()` 시그니처에 `&MeasuredTable` 추가, 행 높이 재계산 코드 제거 |
| MeasuredTable 저장 | `src/wasm_api.rs` | `paginate()` 결과의 `MeasuredSection`을 `self.measured` 필드에 보존 |

### 설계

```rust
// src/model/table.rs

impl Table {
    /// 2D 그리드 인덱스: grid[row * col_count + col] = Some(cell_idx)
    /// 병합 셀의 span 영역 전체가 앵커 셀 인덱스를 가리킴
    pub cell_grid: Vec<Option<usize>>,

    /// O(1) 셀 접근
    pub fn cell_at(&self, row: u16, col: u16) -> Option<&Cell> {
        let idx = (row as usize) * (self.col_count as usize) + (col as usize);
        self.cell_grid.get(idx)?.map(|i| &self.cells[i])
    }

    /// 그리드 재구축 (구조 변경 후 호출)
    pub fn rebuild_grid(&mut self) {
        let rc = self.row_count as usize;
        let cc = self.col_count as usize;
        self.cell_grid = vec![None; rc * cc];
        for (idx, cell) in self.cells.iter().enumerate() {
            for r in cell.row..(cell.row + cell.row_span) {
                for c in cell.col..(cell.col + cell.col_span) {
                    let gi = (r as usize) * cc + (c as usize);
                    if gi < self.cell_grid.len() {
                        self.cell_grid[gi] = Some(idx);
                    }
                }
            }
        }
    }
}
```

### 검증

- 기존 `find_cell_at_row_col()` 호출부 전수 치환
- 행/열 추가/삭제/병합/분할 후 grid 정합성 테스트
- `layout_table()` 행 높이가 `MeasuredTable.row_heights`와 동일한지 비교 테스트
- 전체 Rust 테스트 통과 + WASM/Vite 빌드

### 영향도

- **성능**: 모든 셀 접근이 O(1)로 개선
- **위험**: 낮음 — 내부 인덱스 추가, 외부 인터페이스 불변
- **공수**: 소

---

## 단계 2: 통합 표 레이아웃 엔진

### 목표

- `layout_table()` (630줄) + `layout_nested_table()` (250줄) → 단일 재귀 함수 통합
- 중첩 표 렌더링 코드 중복 제거

### 범위

| 항목 | 파일 | 변경 내용 |
|------|------|----------|
| 함수 통합 | `src/renderer/layout.rs` | `layout_table_unified()` 신규, depth 파라미터 |
| 페이지 분할 분기 | `src/renderer/layout.rs` | `depth == 0`일 때만 `PartialTable` 처리 |
| 열 폭/행 높이 | `src/renderer/layout.rs` | 공통 `calc_col_widths()`, `calc_row_heights()` 추출 |
| 셀 렌더링 | `src/renderer/layout.rs` | 공통 `render_cell_content()` 추출 |
| 중첩 재귀 | `src/renderer/layout.rs` | `Control::Table` → `layout_table_unified(depth+1)` 재귀 |
| 기존 함수 제거 | `src/renderer/layout.rs` | `layout_nested_table()`, `calc_nested_table_height()` 제거 |

### 설계

```rust
/// 통합 표 레이아웃 (최상위 + 중첩 공용)
fn layout_table_unified(
    &self,
    tree: &mut PageRenderTree,
    parent_node: &mut RenderNode,
    table: &Table,
    area: &LayoutRect,
    section_index: usize,
    styles: &ResolvedStyleSet,
    bin_data_content: &[BinDataContent],
    depth: usize,                          // 0=최상위, 1+=중첩
    partial: Option<&PartialTableInfo>,    // depth==0일 때만 Some
) -> f64 {
    let col_widths = self.calc_col_widths(table);
    let row_heights = self.calc_row_heights(table, &col_widths, styles);

    // depth==0이고 partial이 있으면 start_row..end_row만 렌더
    let (start_row, end_row) = match partial {
        Some(p) => (p.start_row, p.end_row),
        None => (0, table.row_count as usize),
    };

    // 셀 렌더링 (공통)
    for cell in &table.cells {
        // ... 공통 셀 렌더링 로직 ...
        for ctrl in &para.controls {
            if let Control::Table(nested) = ctrl {
                // 재귀: depth + 1, partial = None (중첩은 분할 안 함)
                self.layout_table_unified(
                    tree, &mut cell_node, nested,
                    &inner_area, section_index, styles, bin_data_content,
                    depth + 1, None,
                );
            }
        }
    }
}
```

### 검증

- 중첩 표가 있는 샘플 HWP 파일 렌더링 비교 (리팩토링 전후 동일)
- `layout_nested_table` 함수 참조 0건 확인
- 전체 Rust 테스트 통과 + WASM/Vite 빌드

### 영향도

- **코드**: ~880줄 → ~500줄 (중복 제거)
- **위험**: 중간 — 렌더링 로직 변경이므로 시각적 회귀 가능
- **공수**: 중

---

## 단계 3: 경로 기반 접근 + 재귀적 높이 측정

### 목표

- 3단계 고정 인덱싱 → 임의 깊이 경로 기반 접근
- `calc_cell_controls_height() → 0` 제거 → 재귀적 높이 측정
- 중첩 표 편집 API 기반 마련

### 범위

| 항목 | 파일 | 변경 내용 |
|------|------|----------|
| PathSegment 정의 | `src/model/` (신규) | `DocumentPath`, `PathSegment` 타입 |
| 경로 기반 접근 | `src/wasm_api.rs` | `get_table_by_path()`, `get_cell_by_path()` |
| 기존 API 유지 | `src/wasm_api.rs` | `get_table_mut()` → 내부적으로 `get_table_by_path()` 위임 |
| 재귀 높이 측정 | `src/renderer/height_measurer.rs` | `measure_table()` 내 셀 높이 계산에서 중첩 표 재귀 측정 |
| calc 수정 | `src/renderer/layout.rs` | `calc_cell_controls_height()` → 중첩 표 높이 실제 계산 |
| 프론트엔드 경로 | `rhwp-studio/src/core/types.ts` | `DocumentPath` 타입 + 중첩 표 hitTest 확장 |

### 설계

```rust
// src/model/path.rs (신규)

/// 문서 트리 경로 세그먼트
#[derive(Debug, Clone)]
pub enum PathSegment {
    /// 본문 문단
    Paragraph(usize),
    /// 컨트롤 (표, 그림 등)
    Control(usize),
    /// 표 셀 (row, col)
    Cell(u16, u16),
}

/// 문서 트리 내 임의 위치를 가리키는 경로
pub type DocumentPath = Vec<PathSegment>;
```

```rust
// src/wasm_api.rs

/// 경로 기반 표 접근 (임의 깊이 중첩 지원)
fn get_table_by_path(
    &mut self,
    section_idx: usize,
    path: &[PathSegment],
) -> Result<&mut Table, HwpError> {
    let mut paragraphs = &mut self.document.sections[section_idx].paragraphs;
    let mut current_table: Option<&mut Table> = None;

    for segment in path {
        match segment {
            PathSegment::Paragraph(idx) => { /* paragraphs[idx] 접근 */ }
            PathSegment::Control(idx) => { /* controls[idx] → Table 추출 */ }
            PathSegment::Cell(row, col) => {
                /* 현재 table의 cell_at(row, col) → cell.paragraphs 진입 */
            }
        }
    }
    current_table.ok_or(HwpError::RenderError("경로에 표 없음".into()))
}
```

```rust
// src/renderer/height_measurer.rs

/// 재귀적 셀 높이 측정 (중첩 표 포함)
fn measure_cell_content_recursive(
    &self,
    cell: &Cell,
    table_padding: &Padding,
    styles: &ResolvedStyleSet,
) -> f64 {
    let mut content_height = 0.0;

    for para in &cell.paragraphs {
        // 문단 텍스트 높이
        content_height += self.measure_paragraph_height(para, styles);

        // 중첩 표 높이 (재귀)
        for ctrl in &para.controls {
            if let Control::Table(nested) = ctrl {
                let nested_measured = self.measure_table(nested, 0, 0, styles);
                content_height += nested_measured.total_height;
            }
        }
    }
    content_height
}
```

### 검증

- 중첩 표 셀 편집 시 부모 셀 높이 정확도 테스트
- 3단계 중첩 표가 있는 HWP 파일로 경로 접근 테스트
- 기존 `get_table_mut()` 호출부 동작 불변 확인
- 전체 Rust 테스트 통과 + WASM/Vite 빌드

### 영향도

- **기능**: 중첩 표 편집의 기술적 기반 완성
- **위험**: 중간 — 높이 측정 로직 변경 (렌더링 결과 미세 변화 가능)
- **공수**: 중

---

## 단계 4: 페이지 분할 최적화 + Bottom-Up Dirty 전파

### 목표

- 행 선형 스캔 → Prefix Sum + 이진 탐색
- 중첩 표 높이 변경의 부모 표 역전파
- Orphan/Widow 페널티 모델

### 범위

| 항목 | 파일 | 변경 내용 |
|------|------|----------|
| Prefix Sum | `src/renderer/height_measurer.rs` | `MeasuredTable`에 `cumulative_heights: Vec<f64>` 추가 |
| 이진 탐색 분할 | `src/renderer/pagination.rs` | 행 루프 → `partition_point()` 기반 분할점 결정 |
| Penalty 모델 | `src/renderer/pagination.rs` | `BreakPenalty` 구조체, orphan/widow/merged-span 가중치 |
| Dirty 비트 | `src/model/table.rs` | `Table`에 `dirty: bool`, `has_dirty_children: bool` 추가 |
| 역전파 | `src/wasm_api.rs` | 셀 편집 시 dirty 마킹 → 부모 경로 상향 전파 |
| 조건부 리플로우 | `src/wasm_api.rs` | dirty 표만 재측정, 높이 불변이면 리페이지네이션 스킵 |

### 설계

```rust
// Prefix Sum 기반 페이지 분할
impl MeasuredTable {
    /// 누적 행 높이 (prefix sum)
    pub cumulative_heights: Vec<f64>,

    /// 사전 계산
    pub fn build_cumulative(&mut self, cell_spacing: f64) {
        self.cumulative_heights = vec![0.0; self.row_heights.len() + 1];
        for (i, &h) in self.row_heights.iter().enumerate() {
            let cs = if i > 0 { cell_spacing } else { 0.0 };
            self.cumulative_heights[i + 1] = self.cumulative_heights[i] + h + cs;
        }
    }

    /// O(log R) 분할점 결정
    pub fn find_break_row(&self, available: f64, start_row: usize) -> usize {
        let base = self.cumulative_heights[start_row];
        let target = base + available;
        self.cumulative_heights[start_row..]
            .partition_point(|&h| h <= target)
            + start_row - 1
    }
}
```

```rust
// Bottom-Up Dirty 전파
impl Table {
    pub dirty: bool,
    pub has_dirty_children: bool,
}

// wasm_api.rs — 셀 편집 시
fn on_cell_edited(&mut self, path: &[PathSegment]) {
    // 1. 해당 셀의 문단 compose 캐시 무효화
    // 2. 경로를 역순으로 순회하며 dirty 마킹
    for depth in (0..path.len()).rev() {
        if let Some(table) = self.get_table_at_depth(path, depth) {
            let old_height = table.measured.as_ref().map(|m| m.total_height);
            // 해당 행만 재측정
            self.remeasure_row(table, affected_row);
            let new_height = table.measured.as_ref().map(|m| m.total_height);

            if old_height == new_height {
                break;  // 조기 종료: 높이 불변이면 상위 전파 불필요
            }
            table.dirty = true;
        }
    }
}
```

### 검증

- 대용량 표(100행 이상) 페이지 분할 성능 벤치마크
- 중첩 표 셀 편집 → 부모 표 높이 역전파 동작 테스트
- 조기 종료 시나리오 (높이 불변) 테스트
- Penalty 모델: orphan/widow 행 회피 시각 검증
- 전체 Rust 테스트 통과 + WASM/Vite 빌드

### 영향도

- **성능**: 페이지 분할 O(R) → O(log R), dirty 표만 재측정
- **위험**: 중간 — 페이지네이션 결과 미세 변화 가능 (penalty 도입)
- **공수**: 중

---

## 단계 5: 증분 리플로우 (Comemo + Relayout Boundary)

### 목표

- 전체 섹션 리플로우 → 변경된 부분만 리플로우
- `compose_paragraph()`, `measure_table()` 자동 캐싱
- 표를 Relayout Boundary로 선언

### 범위

| 항목 | 파일 | 변경 내용 |
|------|------|----------|
| comemo 의존성 | `Cargo.toml` | `comemo` 크레이트 추가 |
| compose 메모이제이션 | `src/renderer/composer.rs` | `compose_paragraph()` → `#[comemo::memoize]` |
| measure 메모이제이션 | `src/renderer/height_measurer.rs` | `measure_paragraph()`, `measure_table()` 메모이제이션 |
| Relayout Boundary | `src/wasm_api.rs` | 표 내부 편집 시 `compose_section()` 스킵 조건 |
| 부분 리페이지네이션 | `src/renderer/pagination.rs` | 변경된 표 이후부터만 페이지 분할 재개 |
| composed 부분 갱신 | `src/wasm_api.rs` | `composed[sec]` 전체 교체 → 변경 문단만 갱신 |

### 설계

```rust
// Cargo.toml
[dependencies]
comemo = "0.4"

// src/renderer/composer.rs
#[comemo::memoize]
pub fn compose_paragraph(para: &Paragraph) -> ComposedParagraph {
    // 기존 로직 그대로 (순수 함수)
}

// src/renderer/height_measurer.rs
#[comemo::memoize]
fn measure_paragraph_cached(
    para: &Paragraph,
    composed: &ComposedParagraph,
    styles: &ResolvedStyleSet,
) -> MeasuredParagraph {
    // 기존 로직
}
```

```rust
// src/wasm_api.rs — Relayout Boundary 적용

fn insert_text_in_cell(&mut self, ...) {
    // 1. 텍스트 삽입 (기존)
    self.document.sections[sec].raw_stream = None;

    // 2. Relayout Boundary: 표 내부 편집이면 compose_section() 스킵
    //    해당 셀 문단만 compose (comemo가 자동 캐싱)
    let composed_para = compose_paragraph(&cell_para);
    self.composed[sec][para_idx] = composed_para;  // 부분 갱신

    // 3. measure_section() 재호출
    //    → comemo가 변경 없는 문단/표는 자동 스킵
    //    → 실질 비용: 변경된 셀의 문단만 재측정
    let measured = measurer.measure_section(...);

    // 4. 표 높이 변경 여부 확인 (단계 4의 dirty 전파)
    if table_height_changed {
        // 부분 리페이지네이션: 해당 표 이후부터만
        self.repaginate_from(sec, para_idx);
    }
}
```

### 검증

- 성능 벤치마크: 셀 편집 응답 시간 측정 (리팩토링 전후 비교)
  - 목표: 셀 글자 입력 시 O(1) 응답 (높이 불변 케이스)
- comemo 캐시 히트율 모니터링
- 20페이지 이상 문서에서 표 편집 시 리플로우 범위 확인
- 메모리 사용량 측정 (comemo 캐시 오버헤드)
- 전체 Rust 테스트 통과 + WASM/Vite 빌드

### 영향도

- **성능**: 셀 편집 O(P + T×C) → O(1)~O(dirty) — 극대 개선
- **위험**: 높음 — 리플로우 파이프라인 근본 변경, comemo 의존성 추가
- **공수**: 대

---

## 4. 단계별 의존관계

```
단계 1 (Dense Grid + MeasuredTable)
  │
  ├── 단계 2 (통합 레이아웃 엔진) ─── 단계 1의 grid 활용
  │
  └── 단계 3 (경로 접근 + 재귀 높이) ─── 단계 1의 cell_at() 활용
       │
       └── 단계 4 (Prefix Sum + Dirty 전파) ─── 단계 3의 경로/재귀 필요
            │
            └── 단계 5 (증분 리플로우) ─── 단계 1~4 모두 기반
```

- 단계 1은 모든 후속 단계의 기반
- 단계 2와 단계 3은 **병렬 진행 가능** (상호 독립)
- 단계 4는 단계 3 완료 후
- 단계 5는 단계 1~4 모두 완료 후 (최종 통합)

---

## 5. 전체 일정 및 기대 효과

| 단계 | 핵심 알고리즘 | 공수 | 주요 효과 |
|------|-------------|------|----------|
| 1 | Dense Grid + Cache 전달 | 소 | O(1) 셀 접근, 이중 계산 제거 |
| 2 | 재귀 통합 함수 | 중 | 코드 ~380줄 감소, 유지보수 단일화 |
| 3 | Path Encoding + Constraint Propagation | 중 | 중첩 표 편집 기반, 높이 정확성 |
| 4 | Prefix Sum + Bottom-Up Dirty | 중 | O(log R) 분할, 조기 종료 역전파 |
| 5 | Comemo + Relayout Boundary | 대 | O(1) 셀 편집 응답, 극대 성능 |

### 누적 기대 효과

```
단계 1 완료: 셀 접근 O(n) → O(1), 렌더 비용 50% 감소
단계 2 완료: + 코드 복잡도 감소, 중첩 표 로직 통합
단계 3 완료: + 중첩 표 편집 가능, 높이 재귀 측정
단계 4 완료: + 페이지 분할 최적화, dirty 조기 종료
단계 5 완료: + 셀 편집 O(P) → O(1), 편집기 수준 인터랙티브 성능
```

---

## 6. 위험 요소 및 완화 전략

| 위험 | 영향 | 완화 |
|------|------|------|
| 렌더링 회귀 (단계 2) | 중 | 리팩토링 전후 픽셀 비교 테스트 |
| 높이 미세 변화 (단계 3) | 중 | HWP 메타데이터 vs 재귀 계산 차이 허용 범위 정의 |
| comemo WASM 호환성 (단계 5) | 높 | 단계 5 착수 전 PoC 빌드로 확인 |
| 캐시 메모리 증가 (단계 5) | 낮 | comemo 캐시 크기 제한 설정 |
| HWP 직렬화 영향 (전 단계) | 높 | 매 단계 저장→재로드→한컴오피스 열기 검증 |

---

*작성일: 2026-02-15*
