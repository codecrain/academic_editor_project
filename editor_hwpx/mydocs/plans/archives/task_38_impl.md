# 타스크 38 구현계획서: HTML 표 붙여넣기 → HWP 표 컨트롤 변환

## 구현 단계 (3단계)

---

## 1단계: HTML 표 구조 파싱 및 중간 표현

### 목표
HTML `<table>` 태그를 파싱하여 행/열 구조, 셀 속성(colspan/rowspan/크기/스타일)을 추출하는 중간 구조체를 생성한다.

### 구현 내용

#### 1-1. 중간 구조체 정의
```rust
struct ParsedTableCell {
    row: u16,
    col: u16,
    col_span: u16,
    row_span: u16,
    width_pt: f64,       // CSS width (pt 단위, 0이면 미지정)
    height_pt: f64,      // CSS height (pt 단위, 0이면 미지정)
    padding: [f64; 4],   // [left, right, top, bottom] (pt)
    border_styles: [ParsedBorder; 4], // [left, right, top, bottom]
    background_color: Option<u32>,    // BGR 색상
    content_html: String,             // 셀 내부 HTML
    is_header: bool,                  // <th> 태그 여부
}

struct ParsedBorder {
    width_pt: f64,
    color: u32,          // BGR
    style: &'static str, // "solid", "dashed", "dotted", "double", "none"
}

struct ParsedTable {
    rows: Vec<Vec<ParsedTableCell>>,
    col_count: u16,
    row_count: u16,
}
```

#### 1-2. HTML 파싱 로직
- `<tr>` 단위 행 추출
- 각 행에서 `<td>`/`<th>` 순서대로 셀 추출 (기존 td/th 분리 파싱을 통합)
- `colspan`, `rowspan` 속성 파싱 (기본값 1)
- 셀 인라인 `style` 속성에서 CSS 값 추출:
  - `width`, `height` → pt/px 단위 파싱
  - `border-top`, `border-right`, `border-bottom`, `border-left` → 두께/색상/스타일
  - `border` (축약형) → 4방향 동일 적용
  - `padding`, `padding-left/right/top/bottom` → 여백
  - `background-color`, `background` → 배경색

#### 1-3. colspan/rowspan 그리드 정규화
- colspan/rowspan에 따른 실제 col 인덱스 계산
- 셀 점유 그리드(occupied grid) 생성하여 정확한 위치 할당
- `col_count`: 최대 열 수 계산

### 수정 파일
- `src/wasm_api.rs`: `parse_table_html()` 내부 재구현

### 테스트
- 기존 429 테스트 통과 유지
- HTML 테이블 구조 파싱 단위 테스트 추가 (3×3 기본 표, colspan/rowspan 표)

---

## 2단계: HWP Table Control 생성

### 목표
1단계에서 파싱한 중간 구조체를 HWP 네이티브 Table Control로 변환한다.

### 구현 내용

#### 2-1. 셀 크기 계산 및 HWPUNIT 변환
- CSS pt → HWPUNIT: `value * 100.0`
- CSS px → HWPUNIT: `value * 75.0`
- 미지정 셀 크기: 페이지 폭 기준 균등 분할
  - 기본 페이지 폭 42520 HWPUNIT (A4, 좌우 여백 제외) 활용
  - `col_width = total_width / col_count`
- 행 높이: 미지정 시 기본값 1000 HWPUNIT (~3.5mm)

#### 2-2. BorderFill 생성 및 등록
```rust
fn create_border_fill_for_cell(&mut self, cell: &ParsedTableCell) -> u16
```
- CSS border → `BorderLine` 변환:
  - width(pt) → `width` 인덱스 (0: 0.1mm, 1: 0.12mm, ..., 기본 1)
  - color → BGR `ColorRef`
  - style → `BorderLineType` (solid→Solid, dashed→Dash, dotted→Dot, double→Double, none→None)
- CSS background-color → `Fill.solid` (`SolidFill`)
- 기존 BorderFill 목록에서 동일 항목 검색 → 있으면 재사용, 없으면 추가
- border_fill_id 반환

#### 2-3. Cell 구조체 생성
```rust
fn build_table_cell(&mut self, parsed: &ParsedTableCell) -> Cell
```
- `row`, `col`, `col_span`, `row_span` 설정
- `width`, `height` → HWPUNIT 변환
- `padding` → HWPUNIT16 변환
- `border_fill_id` → 2-2에서 생성한 ID
- `paragraphs` → 셀 content_html을 기존 인라인 파서로 파싱
  - `parse_html_to_paragraphs()` 재귀 호출 (셀 내 `<p>`, `<span>` 등)
  - 빈 셀이면 기본 빈 Paragraph 1개
- `is_header` → `<th>` 태그 여부

#### 2-4. Table 구조체 조립
```rust
fn build_table_from_parsed(&mut self, parsed: &ParsedTable) -> Table
```
- `row_count`, `col_count` 설정
- `cells`: 모든 Cell을 행 우선 순서로 수집
- `row_sizes`: 각 행의 셀 수 (`vec![col_count as HwpUnit16; row_count]` 기본)
- `cell_spacing`: 0 (기본)
- `padding`: 기본값 (0)
- `border_fill_id`: 표 전체 테두리 (기본 BorderFill 사용 또는 신규 생성)
- `page_break`: `TablePageBreak::None`
- `repeat_header`: `<th>` 행이 있으면 `true`
- `raw_ctrl_data`: 기본 16바이트 (CommonObjAttr 크기/위치)

#### 2-5. Table Control Paragraph 생성
- `copy_control_native()` 패턴 참고 (wasm_api.rs:2105-2129)
- `text: "\u{0002}"` (DrawTableObject 제어문자)
- `controls: vec![Control::Table(Box::new(table))]`
- `char_count: 2` (제어문자 + 암시적 문단 끝)
- `char_offsets: vec![0]`
- `char_shapes`: 현재 문서 기본 CharShape ID 사용
- `line_segs`: 기본 LineSeg
- `has_para_text: true`

### 수정 파일
- `src/wasm_api.rs`: `parse_table_html()` 완전 재구현, 헬퍼 함수 추가
- `src/model/style.rs`: BorderFill 비교/생성 헬퍼 (필요시)

### 테스트
- Table Control 생성 단위 테스트 (기본 2×2 표, 셀 크기/테두리 검증)
- 기존 테스트 통과 유지

---

## 3단계: 통합, 호환성, 테스트

### 목표
Table Control이 문서에 올바르게 삽입되고 렌더링되는지 검증하며, 다양한 HTML 소스에 대한 호환성을 확보한다.

### 구현 내용

#### 3-1. 붙여넣기 통합 검증
- `paste_html_native()`에서 Table Control 포함 문단의 삽입 동작 확인
  - 단일 표만 붙여넣기: 표 문단이 올바르게 삽입되는지
  - 텍스트 + 표 혼합 붙여넣기: 표 앞뒤 텍스트 문단 정상 처리
- 셀 내 문단의 CharShape/ParaShape가 DocInfo에 올바르게 등록되는지 확인
- 삽입 후 `reflow_paragraph`, `compose_section`, `paginate` 동작 확인

#### 3-2. CSS → HWPUNIT 정밀도 개선
- pt 단위 소수점 처리 (`0.28pt` 같은 세밀한 테두리 두께)
- 여백 및 셀 크기에서 반올림 처리
- 표 전체 폭이 페이지 폭을 초과하지 않도록 클램핑

#### 3-3. 다양한 소스 호환성
- HWP 에디터 출력 HTML (MSO 스타일 포함)
- `<table>` style 속성의 `border-collapse` 처리
- `<td>` 내 `<p>`, `<span>`, `<b>`, `<i>` 등 인라인 서식 처리
- 크기 미지정 셀 (width/height 없는 경우) 기본값 적용

#### 3-4. 테스트 추가
- HTML→Table Control 변환 통합 테스트:
  - 3×3 기본 표 (균등 크기)
  - colspan/rowspan 병합 표
  - CSS 테두리/배경색 표
  - 서식 텍스트 포함 셀
  - 크기 미지정 표 (자동 크기 계산)
- WASM 빌드 성공 확인

### 수정 파일
- `src/wasm_api.rs`: 통합 조정, 테스트 추가
- `web/editor.js`: 디버그 로그 정리 (필요시)

### 테스트
- 기존 429 + 신규 테스트 전체 통과
- WASM 빌드 성공

---

## 파일 변경 범위 요약

| 파일 | 단계 | 변경 내용 |
|------|------|-----------|
| `src/wasm_api.rs` | 1-3 | `parse_table_html()` 재구현, 중간 구조체, Table/Cell 생성, BorderFill 등록, 테스트 |
| `src/model/style.rs` | 2 | BorderFill 비교 헬퍼 (필요시) |
| `web/editor.js` | 3 | 디버그 로그 정리 (필요시) |

## 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| HTML 표 구조가 정규적이지 않은 경우 | 그리드 정규화로 누락 셀 보정, 기본값 적용 |
| 셀 크기 미지정 | 페이지 폭 기준 균등 분할 |
| BorderFill 과다 생성 | 동일 스타일 검색으로 재사용 |
| 표 폭이 페이지 초과 | 최대 폭 클램핑 |
