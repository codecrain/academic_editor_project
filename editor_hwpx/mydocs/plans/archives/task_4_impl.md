# 타스크 4 - 구현 계획서: 렌더러 구현 (텍스트/표/폰트)

## 설계 원칙 (재확인)

```
DocInfo → 스타일 목록 구성 → 문서 구조 구성 → 렌더링 순서 계산 → SVG 출력
```

## 단계 구성 (4단계)

### 1단계: 스타일 목록 구성 (Style Resolution)

DocInfo 참조 테이블을 렌더링에서 바로 사용할 수 있는 해소된 스타일 목록으로 변환한다.

- `src/renderer/style_resolver.rs` 생성 - 스타일 해소 모듈
  - `ResolvedCharStyle` 구조체:
    ```
    CharShape[id] + FontFace[lang][font_id] → {
        font_family: String,     // FontFace에서 조회한 폰트명
        font_size: f64,          // CharShape.base_size → px 변환
        bold: bool,              // CharShape.bold
        italic: bool,            // CharShape.italic
        text_color: ColorRef,    // CharShape.text_color
        underline: UnderlineType,
        strike_color: ColorRef,
        letter_spacing: f64,     // CharShape.spacings[lang] → px
        ratio: f64,              // CharShape.ratios[lang] → 장평 비율
    }
    ```
  - `ResolvedParaStyle` 구조체:
    ```
    ParaShape[id] → {
        alignment: Alignment,
        line_spacing: f64,       // 줄간격 (px 또는 비율)
        line_spacing_type: LineSpacingType,
        margin_left: f64,        // 왼쪽 여백 (px)
        margin_right: f64,       // 오른쪽 여백 (px)
        indent: f64,             // 들여쓰기 (px)
        spacing_before: f64,     // 문단 간격 위 (px)
        spacing_after: f64,      // 문단 간격 아래 (px)
    }
    ```
  - `ResolvedBorderStyle` 구조체:
    ```
    BorderFill[id] → {
        borders: [BorderLine; 4],  // 좌/우/상/하 테두리
        fill_color: Option<ColorRef>,
    }
    ```
  - `ResolvedStyleSet` 구조체:
    ```
    ResolvedStyleSet {
        char_styles: Vec<ResolvedCharStyle>,     // char_shapes[id]에 대응
        para_styles: Vec<ResolvedParaStyle>,      // para_shapes[id]에 대응
        border_styles: Vec<ResolvedBorderStyle>,  // border_fills[id]에 대응
    }
    ```
  - `resolve_styles(doc_info: &DocInfo, dpi: f64) -> ResolvedStyleSet` 함수
    - CharShape.font_ids[0] (한글) → DocInfo.font_faces[0][font_id].name 조회
    - CharShape.base_size → HWPUNIT → px 변환
    - ParaShape 여백/간격 → HWPUNIT → px 변환
    - BorderFill → 테두리/배경 정보 추출

**검증**: DocInfo 스타일 해소 단위 테스트 (폰트명, 크기, 볼드, 색상 매핑 검증)

### 2단계: 문서 구조 구성 (Document Composition)

문단의 텍스트를 줄 단위로 분할하고, 각 줄 내에서 CharShapeRef 경계에 따라 다중 TextRun으로 분할한다. 인라인 컨트롤(표/도형) 삽입 위치를 식별한다.

- `src/renderer/composer.rs` 생성 - 문서 구성 모듈
  - `ComposedTextRun` 구조체:
    ```
    ComposedTextRun {
        text: String,           // 줄 내 텍스트 조각
        char_style_id: u32,     // ResolvedStyleSet.char_styles 인덱스
    }
    ```
  - `ComposedLine` 구조체:
    ```
    ComposedLine {
        runs: Vec<ComposedTextRun>,  // 스타일별 텍스트 조각들
        line_seg: LineSeg,           // 원본 LineSeg (높이, 베이스라인 등)
    }
    ```
  - `ComposedParagraph` 구조체:
    ```
    ComposedParagraph {
        lines: Vec<ComposedLine>,           // 줄별 텍스트
        para_style_id: u16,                 // 문단 스타일 ID
        inline_controls: Vec<InlineControl>, // 인라인 컨트롤 위치
    }
    ```
  - `InlineControl` 구조체:
    ```
    InlineControl {
        line_index: usize,       // 삽입될 줄 인덱스
        control_index: usize,    // Paragraph.controls 내 인덱스
        control_type: InlineControlType,  // Table, Shape 등
    }
    ```
  - `compose_paragraph(para: &Paragraph, styles: &ResolvedStyleSet) -> ComposedParagraph` 함수
    - LineSeg.text_start 기반 줄 범위 계산:
      - line[i] 텍스트 범위: `text_start[i]..text_start[i+1]` (마지막 줄은 끝까지)
    - 각 줄 내 CharShapeRef 교차 구간 분할:
      - CharShapeRef가 줄 범위와 겹치는 구간마다 별도 TextRun 생성
    - 인라인 컨트롤 위치 식별:
      - 텍스트 내 제어 문자(0x000B 등) 위치 → 해당 줄 인덱스 매핑
  - `compose_section(section: &Section, styles: &ResolvedStyleSet) -> Vec<ComposedParagraph>` 함수

**검증**: 문단 분할 단위 테스트 (줄별 텍스트 추출, CharShapeRef 구간 분할, 컨트롤 위치 식별)

### 3단계: 레이아웃 파이프라인 + 텍스트 렌더링

ResolvedStyleSet과 ComposedDocument를 레이아웃 파이프라인에 전달하여 텍스트가 올바른 스타일로 렌더링되도록 한다.

- `src/renderer/layout.rs` 수정 - LayoutEngine 확장
  - `build_render_tree()` 시그니처 변경:
    ```rust
    pub fn build_render_tree(
        &self,
        page_content: &PageContent,
        paragraphs: &[Paragraph],
        composed: &[ComposedParagraph],  // 추가
        styles: &ResolvedStyleSet,        // 추가
    ) -> PageRenderTree
    ```
  - `layout_paragraph()` 수정:
    - ComposedParagraph.lines를 순회
    - 각 ComposedLine의 runs를 TextRun 노드로 변환
    - TextRunNode.style에 ResolvedCharStyle → TextStyle 변환 적용
    - 여러 TextRun의 x 좌표를 순차적으로 배치 (이전 TextRun의 폭만큼 이동)
  - `resolved_to_text_style(styles: &ResolvedStyleSet, char_style_id: u32) -> TextStyle` 함수

- `src/renderer/pagination.rs` 수정 - 인라인 컨트롤 감지
  - `paginate()` 내 문단 순회 시 인라인 컨트롤 확인:
    - `Paragraph.controls`에 `Control::Table`이 있으면 `PageItem::Table` 생성
    - 표가 있는 문단은 표 전후 텍스트를 별도 항목으로 분리

- `src/wasm_api.rs` 수정 - 파이프라인 연결
  - `HwpDocument`에 `styles: ResolvedStyleSet` 필드 추가
  - `from_bytes()` / `paginate()`에서 `resolve_styles()` 호출
  - `build_page_tree()`에서 composed 데이터와 styles 전달

- `src/renderer/mod.rs` 수정 - 새 모듈 등록
  - `pub mod style_resolver;`
  - `pub mod composer;`

**검증**: 실제 HWP 파일 SVG 출력에서 텍스트 폰트명/크기/볼드 반영 확인

### 4단계: 표 렌더링 + 통합 검증

표를 셀 레이아웃으로 변환하여 SVG에 렌더링한다. 전체 파이프라인 통합 테스트와 실제 HWP 파일 검증을 수행한다.

- `src/renderer/layout.rs` 수정 - 표 레이아웃 구현
  - `layout_table()` 메서드 추가:
    ```rust
    fn layout_table(
        &self,
        tree: &mut PageRenderTree,
        col_node: &mut RenderNode,
        table: &Table,
        col_area: &LayoutRect,
        y_start: f64,
        styles: &ResolvedStyleSet,
    ) -> f64
    ```
    - Table.cells 순회 → 셀 위치/크기 계산
    - 각 셀의 x 좌표: 이전 열 너비 합산
    - 각 셀의 y 좌표: y_start + 이전 행 높이 합산
    - 셀 너비: Cell.width (HWPUNIT → px)
    - 셀 높이: Table.row_sizes[row] (HWPUNIT → px)
    - 셀 내 문단 재귀 레이아웃 (compose + layout)
    - TableNode, TableCellNode 렌더 노드 생성

- `src/renderer/svg.rs` 수정 - 표 SVG 렌더링
  - `render_node()`에 `RenderNodeType::Table` 처리 추가:
    - `<g>` 그룹으로 표 전체 감싸기
  - `render_node()`에 `RenderNodeType::TableCell` 처리 추가:
    - 셀 배경: `<rect>` (fill 있으면)
    - 셀 테두리: `<rect>` (stroke)
    - 셀 내 텍스트: 자식 노드(TextLine/TextRun)로 재귀 렌더링

- `src/renderer/svg.rs` 수정 - 텍스트 장식
  - `draw_text()`에 밑줄/취소선 추가:
    - `text-decoration="underline"` 또는 별도 `<line>` 요소

- 통합 검증:
  - 기존 177개 테스트 유지 확인
  - 실제 HWP 파일 (`통합재정통계(2014.8월).hwp`) SVG 출력 검증:
    - 제목 텍스트 ("통 합 재 정 통 계") 표시 확인
    - 표 (통합재정수입/지출) 테두리 + 셀 텍스트 표시 확인
    - 본문 텍스트 폰트/크기/볼드 반영 확인
  - `cargo build` + `cargo test` 통과 확인

**검증**: 원본 스크린샷과 비교 가능한 수준의 SVG 출력 달성

## 생성/수정 파일 예상

| 파일 | 단계 | 설명 |
|------|------|------|
| `src/renderer/style_resolver.rs` | 1 | 스타일 해소 모듈 (신규) |
| `src/renderer/composer.rs` | 2 | 문서 구성 모듈 (신규) |
| `src/renderer/mod.rs` | 3 | 새 모듈 등록 |
| `src/renderer/layout.rs` | 3, 4 | 레이아웃 엔진 확장 |
| `src/renderer/pagination.rs` | 3 | 인라인 컨트롤 감지 |
| `src/renderer/svg.rs` | 4 | 표 렌더링 + 텍스트 장식 |
| `src/wasm_api.rs` | 3 | 파이프라인 연결 |

## 데이터 흐름 요약

```
DocInfo
  │
  ├─ resolve_styles() ──→ ResolvedStyleSet ─────────────────────┐
  │                                                              │
Section.paragraphs                                               │
  │                                                              │
  ├─ compose_section() ──→ Vec<ComposedParagraph> ──┐            │
  │                                                  │            │
  │   paginate() ──→ PaginationResult ──┐            │            │
  │                                      │            │            │
  └─ LayoutEngine.build_render_tree(     │            │            │
         page_content,                   ◄─┘          │            │
         paragraphs,                                  │            │
         composed,                       ◄────────────┘            │
         styles,                         ◄─────────────────────────┘
     ) ──→ PageRenderTree
                │
                └─ SvgRenderer.render_tree() ──→ SVG String
```

## 상태

- 작성일: 2026-02-05
- 상태: 승인 완료
