# 타스크 142 구현계획서: 코드베이스 리팩토링

## 목표

| 지표 | 현재 | 목표 |
|------|------|------|
| 1,200줄 초과 파일 | 15개 | 0개 |
| Clippy 경고 | 0 (allow 정책) | 0 (warn/deny 정책) |
| Cognitive Complexity > 25 | 22개 함수 | 0개 (≤15) |
| 테스트 | 582 passed | 전수 유지 |
| 커버리지 | 55.80% | 70%+ |

## 대상 파일 (1,200줄 초과, font_metrics_data 제외)

### Rust (12개)

| 파일 | 줄 수 | 단계 |
|------|------|------|
| `src/wasm_api.rs` | 24,585 | 1단계 |
| `src/renderer/layout.rs` | 8,708 | 2단계 |
| `src/renderer/pagination.rs` | 2,264 | 3단계 |
| `src/renderer/composer.rs` | 2,026 | 3단계 |
| `src/renderer/svg.rs` | 1,292 | 3단계 |
| `src/model/table.rs` | 1,767 | 4단계 |
| `src/parser/control.rs` | 1,744 | 4단계 |
| `src/serializer/control.rs` | 1,520 | 4단계 |
| `src/serializer/cfb_writer.rs` | 1,516 | 4단계 |
| `src/parser/body_text.rs` | 1,429 | 5단계 |
| `src/model/paragraph.rs` | 1,367 | 5단계 |
| `src/serializer/doc_info.rs` | 1,248 | 5단계 |

### TypeScript/CSS (3개)

| 파일 | 줄 수 | 단계 |
|------|------|------|
| `rhwp-studio/src/engine/input-handler.ts` | 3,106 | 6단계 |
| `rhwp-studio/src/style.css` | 1,588 | 6단계 |
| `rhwp-studio/src/ui/para-shape-dialog.ts` | 1,496 | 6단계 |

---

## 1단계: wasm_api.rs 모듈 분할

### 현황 분석

- **24,585줄** — 프로젝트 최대 파일
- 구성: `#[wasm_bindgen]` 메서드 87개 (1,681줄), `_native` 메서드 87개 (9,628줄), 헬퍼 함수 46개 (776줄), 테스트 112개 (13,074줄), 비공개 메서드 89개
- 테스트가 전체의 **53%** (13,074줄)

### 분할 전략: distributed `impl` 패턴

Rust는 하나의 struct에 대해 여러 파일에서 `impl` 블록을 분산 정의할 수 있다. `HwpDocument` struct 정의는 한 곳에 유지하되, 기능별로 메서드를 분리한다.

```
src/
├── wasm_api.rs              ← HwpDocument struct + #[wasm_bindgen] shim (얇은 위임 계층)
├── wasm_api/
│   ├── mod.rs               ← pub mod 선언
│   ├── document.rs          ← 문서 생성/로딩/저장/설정 native 메서드
│   ├── rendering.rs         ← 렌더링/페이지 정보/페이지트리 native 메서드
│   ├── text_editing.rs      ← 텍스트 삽입/삭제/문단 분리·병합 native 메서드
│   ├── table_ops.rs         ← 표 생성/행열/셀 조작/속성 native 메서드
│   ├── cursor_hit.rs        ← 커서/히트테스트/라인정보/선택영역 native 메서드
│   ├── formatting.rs        ← 글자모양/문단모양/폰트 적용 native 메서드
│   ├── clipboard.rs         ← 클립보드/HTML 내보내기·붙이기 native 메서드
│   ├── helpers.rs           ← JSON 파싱/색상 변환/HTML 처리 등 46개 헬퍼
│   └── tests.rs             ← 112개 테스트 함수
```

### 각 모듈 상세

#### `wasm_api.rs` (본체, ~800줄 이내)
- `HwpDocument` struct 정의 (16개 필드)
- `HwpError` enum 정의
- `ClipboardData` struct 정의
- `#[wasm_bindgen] impl HwpDocument` 블록: 87개 shim 메서드 (각 메서드 5-10줄, JsValue 변환만 수행)
- `HwpViewer` struct + impl

#### `wasm_api/document.rs` (~600줄)
- `from_bytes()`, `create_blank_document_native()`
- `export_hwp_native()`, `convert_to_editable_native()`
- `document()`, `set_document()`
- 설정 관련: DPI, fallback font, paragraph marks, transparent borders

#### `wasm_api/rendering.rs` (~800줄)
- `render_page_svg/html/canvas_native()`
- `get_page_info/def_native()`, `set_page_def_native()`
- `get_page_text_layout_native()`, `get_page_control_layout_native()`
- `build_page_tree()`, `build_page_tree_cached()`
- 캐시 무효화, composition 관련 비공개 메서드 13개

#### `wasm_api/text_editing.rs` (~800줄)
- `insert_text_native()`, `delete_text_native()`
- `insert_text_in_cell_native()`, `delete_text_in_cell_native()`
- `split_paragraph_native()`, `merge_paragraph_native()`
- `split_paragraph_in_cell_native()`, `merge_paragraph_in_cell_native()`
- `reflow_paragraph()`, `reflow_cell_paragraph()` 비공개 메서드

#### `wasm_api/table_ops.rs` (~1,100줄)
- 행/열 삽입·삭제 native 메서드 4개
- 셀 병합·분할 native 메서드 4개
- 표 생성·삭제 native 메서드 2개
- 표/셀 속성 get/set native 메서드 6개
- 표 크기 조정, 이동, bbox 관련 메서드
- 그림 삽입·삭제·속성 관련 메서드

#### `wasm_api/cursor_hit.rs` (~1,100줄)
- `hit_test_native()`, `get_cursor_rect_native/in_cell/by_path()`
- `get_caret_position_native()`, `get_line_info_native()`
- `get_selection_rects_native()`, `delete_range_native()`
- `move_vertical_native/by_path()`
- 경로 탐색 비공개 메서드 (resolve_paragraph, parse_cell_path 등)
- 커서/선택 관련 비공개 메서드 (handle_body_boundary, enter_paragraph 등)

#### `wasm_api/formatting.rs` (~600줄)
- `get_char/para_properties_at_native()`
- `get_cell_char/para_properties_at_native()`
- `apply_char/para_format_native()`, `_in_cell` 변형
- `find_or_create_font_id_native()`
- `parse_char_shape_mods()`, `parse_para_shape_mods()` 관련 로직

#### `wasm_api/clipboard.rs` (~1,100줄)
- 클립보드 기본 native 메서드 6개 (has/get/clear/copy/paste)
- `copy_selection_in_cell_native()`, `copy_control_native()`
- `paste_internal_in_cell_native()`
- HTML export/import native 메서드 6개
- HTML 파싱 관련 비공개 메서드

#### `wasm_api/helpers.rs` (~800줄)
- JSON 파싱 유틸리티 (json_bool, json_i32, json_u16, json_str, json_color 등)
- 색상 변환 (css_color_to_bgr, color_ref_to_css 등)
- HTML 처리 (ascii_starts_with_ci, find_closing_tag, parse_inline_style 등)
- CSS 파싱 (parse_css_dimension_pt, parse_css_border_shorthand 등)
- 보더 변환 (border_line_type_to_u8_val, border_fills_equal 등)

#### `wasm_api/tests.rs` (~1,100줄 이하, 나머지는 기능별 테스트 파일에 분산)
- 테스트 13,074줄은 기능별로 분산 배치:
  - `tests/wasm_api_document_tests.rs` — 문서 생성/로딩
  - `tests/wasm_api_rendering_tests.rs` — 렌더링
  - `tests/wasm_api_table_tests.rs` — 표 조작
  - `tests/wasm_api_text_tests.rs` — 텍스트 편집
  - `tests/wasm_api_clipboard_tests.rs` — 클립보드/HTML
  - `tests/wasm_api_formatting_tests.rs` — 서식
  - `tests/wasm_api_cursor_tests.rs` — 커서/히트테스트

### 위험 관리
- `#[wasm_bindgen]` 메서드는 본체 파일에 유지 (WASM 바인딩 제약)
- `pub(crate)` 가시성으로 모듈 간 접근 제어
- 각 모듈 이동 후 즉시 `cargo clippy` + `cargo test` 검증

### 검증 기준
- `cargo clippy` 경고 0 유지
- `cargo test` 582개 전수 통과
- Docker WASM 빌드 성공

---

## 2단계: renderer/layout.rs 분할

### 현황 분석

- **8,708줄** — 두 번째 대형 파일
- `LayoutEngine` struct의 22개 메서드 그룹
- 테스트 ~740줄 (lines 7965-8701)

### 분할 전략: 디렉토리 모듈화

```
src/renderer/layout/
├── mod.rs               ← LayoutEngine struct + 핵심 진입점 (render_tree_for_page 등)
├── text_measurement.rs  ← 텍스트 폭 측정, MeasureCache, 문자 클러스터 분할
├── table_layout.rs      ← layout_table(), layout_partial_table(), 셀 높이 계산
├── shape_layout.rs      ← layout_shape(), layout_group_child_affine(), 도형 처리
├── picture_layout.rs    ← layout_picture(), layout_caption(), 이미지 배치
├── footnote_layout.rs   ← layout_footnote_area(), 각주 번호매기기
├── border_rendering.rs  ← 셀 테두리 수집/렌더링, 투명 테두리
├── utils.rs             ← 색상/스타일 변환, 폰트 문자열 빌드, 넘버링 포맷
└── tests.rs             ← 25+ 레이아웃 테스트
```

### 각 모듈 예상 규모

| 모듈 | 예상 줄 수 | 주요 내용 |
|------|----------|----------|
| `mod.rs` | ~800 | LayoutEngine struct, 페이지/문단 레이아웃 진입점 |
| `text_measurement.rs` | ~600 | cached_js_measure, measure_char_width_*, estimate_text_width |
| `table_layout.rs` | ~1,100 | layout_table, layout_partial_table, calc_cell_*, vertical_cell_text |
| `shape_layout.rs` | ~700 | layout_shape, layout_group_child, layout_shape_object |
| `picture_layout.rs` | ~500 | layout_picture, layout_body_picture, layout_caption, compute_object_position |
| `footnote_layout.rs` | ~400 | layout_footnote_area, layout_footnote_paragraph_with_number |
| `border_rendering.rs` | ~500 | build_row_col_x, collect_cell_borders, render_edge_borders |
| `utils.rs` | ~600 | build_1000pt_font_string, 스타일 변환, 숫자 포맷 |
| `tests.rs` | ~740 | 레이아웃 테스트 전체 |

### 위험 관리
- `LayoutEngine`의 `&self` / `&mut self` 메서드가 여러 모듈에 분산되므로, struct 필드 접근을 `pub(crate)`로 관리
- table_layout ↔ shape_layout 간 호출 관계 주의 (embedded table 등)

---

## 3단계: renderer/ 나머지 분할 (pagination, composer, svg)

### 3-A. pagination.rs (2,264줄 → 디렉토리)

```
src/renderer/pagination/
├── mod.rs               ← Paginator struct + paginate() 진입점
├── state.rs             ← PaginationState 상태 머신 (paginate_with_measured 분해)
├── header_footer.rs     ← 머리말/꼬리말 수집·적용
├── footnote.rs          ← 각주 수집·높이 계산·배치
└── tests.rs             ← 페이지네이션 테스트
```

**핵심 리팩토링**: `paginate_with_measured()` 함수가 **1,460줄** → PaginationState struct로 상태를 추출하고 단계별 메서드로 분해

### 3-B. composer.rs (2,026줄 → 디렉토리)

```
src/renderer/composer/
├── mod.rs               ← compose_section(), compose_paragraph() 진입점, 데이터 구조
├── tokenization.rs      ← tokenize_paragraph(), measure_token_width()
├── line_filling.rs      ← fill_lines(), reflow_line_segs()
├── inline_controls.rs   ← identify_inline_controls(), CharOverlap 주입
└── tests.rs             ← 컴포저 테스트
```

### 3-C. svg.rs (1,292줄 → 디렉토리)

```
src/renderer/svg/
├── mod.rs               ← SvgRenderer struct + render_tree() + Renderer trait impl
├── gradient.rs          ← create_gradient_def(), build_gradient_stops()
├── image_rendering.rs   ← render_image_node(), positioned/tiled image, clip path
└── tests.rs             ← SVG 테스트
```

### 검증 기준
- 3-A, 3-B, 3-C 각각 완료 후 `cargo clippy` + `cargo test` 검증
- pagination 분할 후 CC 감소 확인 (paginate_with_measured CC 대폭 감소 예상)

---

## 4단계: parser + serializer 대형 파일 분할

### 4-A. parser/control.rs (1,744줄)

```
src/parser/
├── control.rs           ← parse_control() 디스패치만 유지 (~100줄)
├── control_table.rs     ← parse_table_control, parse_table_record, parse_cell (~250줄)
├── control_shape.rs     ← parse_gso_control, shape_component_full, 서브타입 (~600줄)
├── control_simple.rs    ← auto_number, bookmark, char_overlap 등 단순 컨트롤 (~200줄)
├── control_hf.rs        ← header/footer/footnote/endnote/comment (~150줄)
```

### 4-B. serializer/control.rs (1,520줄)

parser/control.rs와 대칭 구조:

```
src/serializer/
├── control.rs           ← serialize_control() 디스패치만 유지 (~100줄)
├── control_table.rs     ← serialize_table, serialize_table_record (~200줄)
├── control_shape.rs     ← serialize_shape_control, serialize_shape_component (~300줄)
├── control_simple.rs    ← 단순 컨트롤 직렬화 (~150줄)
├── control_hf.rs        ← header/footer/footnote 직렬화 (~100줄)
├── control_common.rs    ← serialize_common_obj_attr, 공통 헬퍼 (~150줄)
```

### 4-C. serializer/cfb_writer.rs (1,516줄)

```
src/serializer/
├── cfb_writer.rs        ← serialize_hwp, write_hwp_cfb, compress_stream (~200줄)
├── cfb_writer_tests.rs  ← 라운드트립 테스트 (~1,300줄) - #[cfg(test)]로 분리
```

### 4-D. model/table.rs (1,767줄)

```
src/model/
├── table.rs             ← Table/Cell struct 정의 + grid/dimension 메서드 (~500줄)
├── table_ops.rs         ← insert/delete row/column, merge/split cell (~500줄)
├── table_tests.rs       ← 표 테스트 (~780줄) - #[cfg(test)]
```

### 검증 기준
- parser/serializer 대칭 구조 유지 확인
- 라운드트립 테스트 전수 통과

---

## 5단계: 나머지 Rust 대형 파일 + 린트 정책 전환

### 5-A. parser/body_text.rs (1,429줄)

```
src/parser/
├── body_text.rs         ← parse_body_text_section(), 레코드 트리 처리 (~500줄)
├── body_text_para.rs    ← 문단 상세 파싱 (para_header, char_shapes, line_segs) (~500줄)
├── body_text_tests.rs   ← 테스트 (~430줄)
```

### 5-B. model/paragraph.rs (1,367줄)

데이터 구조 중심 파일 — 분할 효과가 크지 않을 수 있으나 1,200줄 초과:

```
src/model/
├── paragraph.rs         ← Paragraph struct + 핵심 메서드 (~700줄)
├── paragraph_ops.rs     ← 문단 조작 메서드 (split, merge 등) (~400줄)
├── paragraph_tests.rs   ← 테스트 (~270줄)
```

### 5-C. serializer/doc_info.rs (1,248줄)

```
src/serializer/
├── doc_info.rs          ← serialize_doc_info() 진입점 + 속성/매핑 (~400줄)
├── doc_info_styles.rs   ← char_shape, para_shape, style 직렬화 (~400줄)
├── doc_info_misc.rs     ← tab_def, numbering, bullet, bin_data 직렬화 (~250줄)
├── doc_info_tests.rs    ← 테스트 (~200줄)
```

### 5-D. 린트 정책 전환

Rust 파일 분할이 완료되면 `Cargo.toml [lints.clippy]` 정책을 전환:

| 린트 | Phase 0 | 5단계 완료 후 |
|------|---------|-------------|
| `too_many_arguments` | allow | warn |
| `type_complexity` | allow | warn |
| `cognitive_complexity` | allow | warn |
| `needless_pass_by_value` | allow | warn |
| 코드 스타일 31개 | allow | warn (분할 시 수정된 항목) |

### 검증 기준
- 모든 Rust 파일 ≤ 1,200줄
- `cargo clippy` 경고 0 (warn 정책에서도)
- CC > 25 함수 0개 목표, 불가 시 CC > 15 함수 목록 문서화
- `cargo test` 582개+ 전수 통과

---

## 6단계: rhwp-studio TS/CSS 분할

### 6-A. input-handler.ts (3,106줄)

```
rhwp-studio/src/engine/
├── input-handler.ts            ← InputHandler class + 초기화/이벤트 등록 (~400줄)
├── input-handler-mouse.ts      ← 마우스 클릭/드래그/호버 처리 (~600줄)
├── input-handler-keyboard.ts   ← 키보드 입력 처리 (~400줄)
├── input-handler-text.ts       ← 텍스트 입력/IME 컴포지션 (~300줄)
├── input-handler-table.ts      ← 표 셀 조작/크기조정/이동 (~500줄)
├── input-handler-picture.ts    ← 그림 삽입/이동/리사이즈 (~400줄)
├── input-handler-clipboard.ts  ← 복사/붙이기/잘라내기 (~300줄)
```

### 6-B. style.css (1,588줄)

CSS 접두어 규칙에 맞춰 파일 분할:

```
rhwp-studio/src/styles/
├── index.css             ← @import 모음 + body/기본 스타일 (~50줄)
├── menu-bar.css          ← .md-* 메뉴바 스타일 (~150줄)
├── toolbar.css           ← .tb-* 도구 상자 스타일 (~150줄)
├── style-bar.css         ← .sb-* 서식 도구 모음 (~150줄)
├── status-bar.css        ← .stb-* 상태 표시줄 (~80줄)
├── editor.css            ← #scroll-container, 편집 영역 (~150줄)
├── dialogs.css           ← .dialog-* 공통 대화상자 (~200줄)
├── char-shape-dialog.css ← .cs-* 글자모양 대화상자 (~100줄)
├── para-shape-dialog.css ← .ps-* 문단모양 대화상자 (~100줄)
├── table.css             ← 표 편집 UI (~100줄)
├── picture.css           ← 그림 편집 UI (~80줄)
├── context-menu.css      ← 컨텍스트 메뉴 (~60줄)
```

### 6-C. para-shape-dialog.ts (1,496줄)

탭별 분할:

```
rhwp-studio/src/ui/
├── para-shape-dialog.ts         ← ParaShapeDialog class + 초기화/적용/취소 (~400줄)
├── para-shape-basic-tab.ts      ← 기본 탭 (정렬, 여백, 간격) (~350줄)
├── para-shape-extended-tab.ts   ← 확장 탭 (과부금지, 다음문단과 함께 등) (~200줄)
├── para-shape-tab-tab.ts        ← 탭 설정 탭 (~250줄)
├── para-shape-border-tab.ts     ← 테두리/배경 탭 (~300줄)
```

### 검증 기준
- `npx tsc --noEmit` 성공
- 브라우저 수동 테스트: 모든 UI 기능 정상 동작
- 모든 TS/CSS 파일 ≤ 1,200줄

---

## 최종 메트릭 검증

6단계 완료 후 `scripts/metrics.sh` 실행:

| 지표 | 기준선 | 목표 |
|------|--------|------|
| 1,200줄 초과 파일 | 15개 | 0개 |
| Clippy 경고 (warn 정책) | 274개 (기준선) | 0개 |
| CC > 25 함수 | 22개 | 0개 |
| CC > 15 함수 | 미측정 | 최소화 (목록 문서화) |
| 테스트 | 582 passed | 582+ passed |
| 커버리지 | 55.80% | 70%+ |

## 단계별 일정 및 커밋 전략

| 단계 | 대상 | 예상 분할 파일 수 | 커밋 단위 |
|------|------|-----------------|----------|
| 1단계 | wasm_api.rs (24,585줄) | 10개 모듈 | 모듈 2-3개씩 |
| 2단계 | layout.rs (8,708줄) | 9개 모듈 | 모듈 2-3개씩 |
| 3단계 | pagination + composer + svg (5,582줄) | 12개 모듈 | 모듈 단위별 |
| 4단계 | parser + serializer + table (6,547줄) | 14개 모듈 | 파일별 |
| 5단계 | body_text + paragraph + doc_info + 린트 (4,044줄) | 10개 모듈 | 파일별 |
| 6단계 | TS/CSS (6,190줄) | 24개 파일 | 컴포넌트별 |

**각 단계 완료 시**:
1. `cargo clippy` + `cargo test` (Rust)
2. `npx tsc --noEmit` (6단계)
3. `scripts/metrics.sh` 메트릭 수집
4. 단계별 완료 보고서 작성
5. `local/task142` 브랜치에 커밋
