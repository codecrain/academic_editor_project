# 타스크 27: 표 페이지 나누기 — 구현계획서

## 대상 문제

`samples/k-water-rfp.hwp` 5-6페이지:
- 표2(4행×4열, 15셀): 총 높이 ~1053px, 페이지 본문 영역 ~1010px
- 현재: 표가 통째로 6페이지로 밀려 overflow (y=1166 > 페이지높이 1122)
- 목표: 5페이지 하단에 표 시작, 넘치는 행은 6페이지에 제목행 반복 후 계속

## 구현 단계 (3단계)

---

### 1단계: PageItem::PartialTable + 페이지네이션 분할 로직

**파일**: `src/renderer/pagination.rs`

#### 1-1. PageItem enum 확장

```rust
/// 표의 일부 행만 배치 (페이지 분할)
PartialTable {
    para_index: usize,
    control_index: usize,
    /// 시작 행 (inclusive)
    start_row: usize,
    /// 끝 행 (exclusive)
    end_row: usize,
    /// 연속 페이지 여부 (true면 제목행 반복)
    is_continuation: bool,
},
```

#### 1-2. 표 분할 로직 (paginate_with_measured 내)

기존 표 처리 블록(lines 308-391)을 수정:

```
IF effective_height <= available_remaining:
    → 기존처럼 PageItem::Table 전체 배치
ELSE:
    → 행별 누적 높이로 현재 페이지에 들어갈 행 범위 결정
    → PageItem::PartialTable { start_row: 0, end_row: split_row }
    → 나머지 행은 루프로 새 페이지에 PartialTable (is_continuation=true)
    → repeat_header 시 제목행 높이도 available에서 차감
```

행 높이 정보는 `MeasuredTable.row_heights` + cell_spacing으로 누적 계산.

#### 1-3. MeasuredTable에 cell_spacing 필드 추가

**파일**: `src/renderer/height_measurer.rs`

```rust
pub struct MeasuredTable {
    // ... 기존 필드
    pub cell_spacing: f64,  // 새 필드
}
```

---

### 2단계: layout_table 행 범위 렌더링

**파일**: `src/renderer/layout.rs`

#### 2-1. PageItem::PartialTable 처리 분기 추가

layout 함수의 PageItem 매칭에 PartialTable 케이스 추가:

```rust
PageItem::PartialTable { para_index, control_index, start_row, end_row, is_continuation } => {
    y_offset = self.layout_partial_table(
        &mut tree, &mut col_node, paragraphs,
        *para_index, *control_index,
        section_index, styles, col_area, y_offset,
        bin_data_content,
        *start_row, *end_row, *is_continuation,
    );
}
```

#### 2-2. layout_partial_table() 함수 추가

기존 `layout_table()` 로직을 재사용하되:
- 열 폭 계산: 전체 셀 기준 (동일)
- 행 높이 계산: 전체 행 기준 (동일)
- 셀 렌더링: `start_row..end_row` 범위의 셀만 렌더링
- `is_continuation && repeat_header`: 먼저 행0(제목행) 셀 렌더링, 그 아래에 start_row~end_row 렌더링
- row_y 좌표: 렌더링 범위에 맞게 재계산 (0부터 시작)
- 병합 셀(row_span) 처리: 범위에 걸치면 클리핑

#### 2-3. 기존 layout_table()과 코드 공유

`layout_table()`은 `layout_partial_table(start_row=0, end_row=row_count, is_continuation=false)`으로 위임하여 중복 제거.

---

### 3단계: 테스트 및 검증

#### 3-1. 단위 테스트

- 페이지네이션: 표가 페이지를 넘을 때 PartialTable 생성 확인
- 페이지네이션: repeat_header 시 연속 페이지에 제목행 높이 반영
- 레이아웃: PartialTable 렌더링 시 올바른 행 범위만 출력

#### 3-2. 통합 검증

- `docker compose run --rm test` → 기존 381개 + 신규 테스트 통과
- `docker compose run --rm wasm` → WASM 빌드 성공
- `k-water-rfp.hwp` SVG 출력: 5-6페이지에 표가 분할 렌더링
