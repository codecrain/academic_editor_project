# rhwp 코드 리팩토링 전략

> **기준**: [SOLID 코드 리뷰](r-code-review-report.md) 현재 5.2점 → 목표 9.2점 이상  
> **원칙**: 기존 488개 테스트 전량 통과 유지, 외부 API 호환성 보장  
> **작성일**: 2026-02-22  

---

## 점수 향상 로드맵

| SOLID 원칙 | 현재 | 목표 | 핵심 수단 |
|---|---|---|---|
| **SRP** | 3 → | 9 | wasm_api.rs 분할, layout.rs 분할, 거대 함수 분해 |
| **OCP** | 6 → | 9 | 파서/직렬화 trait 추상화, 플랫폼 격리 |
| **LSP** | 7 → | 10 | trait 구현 일관성 검증, 표준 trait 구현 |
| **ISP** | 5 → | 9 | HwpDocument 역할별 인터페이스 분리 |
| **DIP** | 5 → | 9 | trait 기반 의존성 주입, 구체 타입 의존 제거 |
| **종합** | **5.2** → | **9.2** | |

---

## 페이즈 구성

```
Phase 1 ─── wasm_api.rs 분할 (SRP +4, ISP +3, DIP +2)
  │          가장 큰 점수 향상, 가장 높은 위험
  │
Phase 2 ─── 거대 함수/파일 분해 (SRP +2)
  │          paginate_with_measured 1,456줄 → 10개 이하 함수
  │          layout.rs 8,709줄 → 4~5개 모듈
  │
Phase 3 ─── trait 추상화 도입 (OCP +3, DIP +3, LSP +2)
  │          Parser/Serializer/Editor trait, 표준 trait 구현
  │
Phase 4 ─── main.rs 정리 및 폴리싱 (SRP +1, OCP +1)
             CLI 프레임워크 도입, 최종 점검
```

---

## Phase 1: wasm_api.rs 분할 (목표: SRP 3→7, ISP 5→8, DIP 5→7)

### 1.1 현황 진단

`wasm_api.rs`는 24,586줄, 568개 아이템으로 프로젝트 전체(78,463줄)의 **31%**를 차지한다.

**내부 구조 분석 결과**, 메서드는 이미 명확한 패턴으로 분류 가능하다:

| 기능 영역 | WASM 바인딩 | 네이티브 구현 | 테스트 |
|---|---|---|---|
| 뷰잉/렌더링 | `render_page_svg()` 등 | `render_page_native()` 등 | `test_render_*` |
| 텍스트 편집 | `insert_text()` 등 | `insert_text_native()` 등 | `test_insert_text_*` |
| 표 편집 | `insert_table_row()` 등 | `create_table_native()` 등 | `test_*_table_*` |
| 서식 변경 | `apply_char_format()` 등 | `apply_char_format_native()` 등 | `test_apply_*` |
| 클립보드 | `copy_selection()` 등 | `copy_selection_native()` 등 | `test_clipboard_*` |
| HTML 변환 | `paste_html()` 등 | `paste_html_native()` 등 | `test_paste_html_*` |
| 직렬화/저장 | `export_hwp()` 등 | `export_hwp_native()` 등 | `test_export_*` |
| 진단/정보 | `get_page_info()` 등 | 동일 | `test_*_info_*` |

> **핵심 발견**: 모든 WASM 메서드는 `_native` 접미사 네이티브 구현체를 호출하는 **얇은 래퍼**이다. 이 구조를 활용하면 네이티브 구현체를 별도 모듈로 이동하고 WASM 바인딩은 위임만 수행하도록 분할할 수 있다.

### 1.2 분할 전략: 역할별 모듈 분리

```
src/
├── wasm_api.rs              ← Facade (HwpDocument + WASM 바인딩만 유지)
├── wasm_api/                ← [신규] 네이티브 구현 모듈
│   ├── mod.rs               ← HwpDocument 구조체 정의 + 공통 유틸리티
│   ├── viewer.rs            ← 뷰잉: 렌더링, 페이지 정보, DPI
│   ├── text_editor.rs       ← 텍스트 편집: 삽입/삭제/분할/병합
│   ├── table_editor.rs      ← 표 편집: 행/열 CRUD, 셀 병합/분할
│   ├── formatting.rs        ← 서식: 글자/문단 모양 변경, 폰트
│   ├── clipboard.rs         ← 클립보드: 복사/붙여넣기
│   ├── html_converter.rs    ← HTML 변환: 내보내기/가져오기
│   ├── serializer.rs        ← 직렬화: HWP 저장, 빈 문서 생성
│   ├── diagnostics.rs       ← 진단: 문서 정보, 디버그
│   └── cursor.rs            ← 커서 이동, 히트 테스트
```

### 1.3 구현 방법

**핵심 원칙**: Rust의 `impl` 블록은 여러 파일에서 분산 정의할 수 있다. `HwpDocument` 구조체를 `wasm_api/mod.rs`에 정의하고, 각 역할별 모듈에서 `impl HwpDocument` 블록으로 메서드를 구현한다.

```rust
// src/wasm_api/mod.rs
pub struct HwpDocument {
    pub(crate) doc: Document,
    pub(crate) composed: Vec<Vec<ComposedParagraph>>,
    pub(crate) pagination: Vec<PaginationResult>,
    pub(crate) render_trees: Vec<Vec<PageRenderTree>>,
    pub(crate) clipboard: Option<ClipboardData>,
    pub(crate) dpi: f64,
    // ...
}

// 공통 헬퍼 메서드
impl HwpDocument {
    pub(crate) fn repaginate_section(&mut self, section_idx: usize) { ... }
    pub(crate) fn get_section(&self, idx: usize) -> Result<&Section, HwpError> { ... }
}
```

```rust
// src/wasm_api/text_editor.rs
use super::HwpDocument;

impl HwpDocument {
    pub fn insert_text_native(&mut self, ...) -> Result<String, HwpError> { ... }
    pub fn delete_text_native(&mut self, ...) -> Result<String, HwpError> { ... }
    pub fn split_paragraph_native(&mut self, ...) -> Result<String, HwpError> { ... }
    // ...
}
```

```rust
// src/wasm_api.rs (최종 형태 — WASM 바인딩 Facade)
mod wasm_api_impl; // 또는 pub mod wasm_api 내부 모듈

#[wasm_bindgen]
impl HwpDocument {
    // 각 메서드는 네이티브 구현을 호출하는 1~3줄 래퍼
    pub fn insert_text(&mut self, ...) -> Result<String, JsValue> {
        self.insert_text_native(...).map_err(|e| e.into())
    }
}
```

### 1.4 테스트 분할

현재 wasm_api.rs 내 `#[cfg(test)] mod tests` 블록에 약 170개 이상의 테스트가 있다. 이를 기능별로 분리한다:

```
src/wasm_api/
├── tests/
│   ├── viewer_tests.rs
│   ├── text_editor_tests.rs
│   ├── table_editor_tests.rs
│   ├── formatting_tests.rs
│   ├── clipboard_tests.rs
│   ├── html_converter_tests.rs
│   ├── serializer_tests.rs
│   └── diagnostics_tests.rs
```

### 1.5 위험 관리

| 위험 | 대응 |
|---|---|
| WASM 바인딩 호환성 깨짐 | JS 인터페이스는 그대로 유지 — 내부 모듈화만 수행 |
| `pub(crate)` 가시성 문제 | `HwpDocument` 필드를 `pub(crate)`로 설정하여 같은 크레이트 내 접근 허용 |
| 순환 의존성 | 공통 헬퍼를 `mod.rs`에 배치하여 방지 |
| 단계별 검증 불가 | 한 모듈씩 이동 후 `cargo test` 실행으로 점진적 검증 |

---

## Phase 2: 거대 함수/파일 분해 (목표: SRP 7→9)

### 2.1 `paginate_with_measured()` 1,456줄 → 10개 이하 함수

현재 이 함수는 다음 모든 책임을 포함한다:

| 책임 | 추출 함수명 (제안) | 예상 줄 수 |
|---|---|---|
| 표 분할 (인트라-로우) | `split_table_across_pages()` | ~300 |
| 다단 처리 | `layout_multi_column()` | ~200 |
| 머리말/꼬리말 배치 | `resolve_header_footer()` | ~150 |
| 각주 배치 | `layout_footnotes()` | ~150 |
| 도형/이미지 배치 | `layout_floating_shapes()` | ~100 |
| 바탕쪽 처리 | `resolve_master_page()` | ~50 |
| 페이지 경계 판정 | `advance_page()` | ~100 |
| 본문 문단 배치 | `layout_body_paragraphs()` | ~200 |
| 진입점/조정 | `paginate_with_measured()` (리팩토링 후) | ~100 |

**구현 방법**: 함수 추출(Extract Function) 리팩토링. 지역 변수를 컨텍스트 구조체로 묶어 전달한다.

```rust
/// 페이지네이션 진행 상태
struct PaginationContext<'a> {
    paragraphs: &'a [Paragraph],
    measured: &'a MeasuredSection,
    page_def: &'a PageDef,
    column_def: &'a ColumnDef,
    current_page: PageContent,
    current_y: f64,
    // ...
}
```

### 2.2 `layout.rs` 8,709줄 → 4~5개 모듈

| 분리 대상 | 신규 파일 | 예상 줄 수 | 이유 |
|---|---|---|---|
| WASM JS 측정 캐시 | `renderer/wasm_measure.rs` | ~150 | 플랫폼 의존 코드 격리 |
| 텍스트 위치 계산 | `renderer/text_layout.rs` | ~2,000 | 독립적 관심사 |
| 표 레이아웃 | `renderer/table_layout.rs` | ~2,000 | 독립적 관심사 |
| 문단 번호 상태 | `renderer/numbering.rs` | ~200 | 독립적 관심사 |
| 도형 레이아웃 | `renderer/shape_layout.rs` | ~1,500 | 독립적 관심사 |
| 핵심 레이아웃 | `renderer/layout.rs` (잔존) | ~2,800 | 조정/진입점 |

### 2.3 `main.rs` 990줄 → 모듈화

```
src/
├── main.rs              ← 진입점만 (50줄 이하)
├── cli/
│   ├── mod.rs           ← CLI 파싱 (clap 크레이트)
│   ├── export_svg.rs    ← SVG 내보내기 명령
│   ├── show_info.rs     ← 문서 정보 명령
│   ├── dump_controls.rs ← 컨트롤 덤프 명령
│   ├── convert.rs       ← 변환 명령
│   └── diagnostics.rs   ← 진단 명령
```

---

## Phase 3: trait 추상화 도입 (목표: OCP 6→9, DIP 5→9, LSP 7→10)

### 3.1 핵심 trait 설계

```rust
// src/parser/mod.rs
pub trait DocumentParser {
    fn parse(&self, data: &[u8]) -> Result<Document, ParseError>;
    fn detect_format(&self, data: &[u8]) -> FileFormat;
}

// src/serializer/mod.rs
pub trait DocumentSerializer {
    fn serialize(&self, doc: &Document) -> Result<Vec<u8>, SerializeError>;
}

// src/wasm_api/mod.rs (또는 별도 editor 모듈)
pub trait TextEditor {
    fn insert_text(&mut self, section: usize, para: usize, offset: usize, text: &str) -> Result<(), HwpError>;
    fn delete_text(&mut self, section: usize, para: usize, offset: usize, count: usize) -> Result<usize, HwpError>;
    fn split_paragraph(&mut self, section: usize, para: usize, offset: usize) -> Result<usize, HwpError>;
    fn merge_paragraph(&mut self, section: usize, para: usize) -> Result<usize, HwpError>;
}

pub trait TableEditor {
    fn insert_row(&mut self, section: usize, para: usize, ctrl: usize, row: u16, below: bool) -> Result<(), HwpError>;
    fn insert_column(&mut self, section: usize, para: usize, ctrl: usize, col: u16, right: bool) -> Result<(), HwpError>;
    fn delete_row(&mut self, section: usize, para: usize, ctrl: usize, row: u16) -> Result<(), HwpError>;
    fn delete_column(&mut self, section: usize, para: usize, ctrl: usize, col: u16) -> Result<(), HwpError>;
    fn merge_cells(&mut self, ...) -> Result<(), HwpError>;
    fn split_cell(&mut self, ...) -> Result<(), HwpError>;
}
```

### 3.2 표준 trait 구현

| 현재 | 개선 |
|---|---|
| `RenderBackend::from_str()` 자체 메서드 | `impl std::str::FromStr for RenderBackend` |
| `ParseError` 수동 `Display` | `thiserror` 크레이트 활용 |
| `HwpError` 수동 변환 | `impl From<ParseError> for HwpError` 등 체계적 변환 |

### 3.3 플랫폼 코드 격리

```rust
// src/renderer/measure.rs
pub trait TextMeasurer {
    fn measure_char_width(&self, font: &str, ch: char, font_size: f64) -> f64;
}

// src/renderer/native_measure.rs
pub struct NativeMeasurer { /* font_metrics_data 기반 */ }
impl TextMeasurer for NativeMeasurer { ... }

// src/renderer/wasm_measure.rs
#[cfg(target_arch = "wasm32")]
pub struct WasmMeasurer { /* JS measureText 호출 */ }
#[cfg(target_arch = "wasm32")]
impl TextMeasurer for WasmMeasurer { ... }
```

이렇게 하면 `#[cfg(target_arch = "wasm32")]`가 각 모듈의 선언부에만 존재하고, 비즈니스 로직에서는 `dyn TextMeasurer`로 추상화된다.

---

## Phase 4: 폴리싱 (목표: 전 항목 9점 이상)

### 4.1 CLI 프레임워크 도입

`clap` 크레이트를 사용하여 서브커맨드를 선언적으로 정의한다.

```rust
#[derive(Parser)]
#[command(name = "rhwp", about = "HWP 문서 처리 도구")]
enum Cli {
    ExportSvg(ExportSvgArgs),
    Info(InfoArgs),
    Dump(DumpArgs),
    Convert(ConvertArgs),
    Diag(DiagArgs),
}
```

### 4.2 모듈 간 의존성 검증

최종 의존성 구조:

```
                    ┌──────────┐
                    │  model/  │  ← 순수 데이터 (의존성 없음)
                    └──┬───┬───┘
                 ┌─────┘   └─────┐
          ┌──────▼──────┐ ┌──────▼──────┐
          │  parser/    │ │ serializer/ │  ← model에만 의존
          └──────┬──────┘ └──────┬──────┘
                 │               │
          ┌──────▼───────────────▼──────┐
          │       renderer/             │  ← model에만 의존
          │  ┌──────────┐ ┌──────────┐  │
          │  │ layout/  │ │ paginate │  │  ← Measurer trait 의존
          │  └──────────┘ └──────────┘  │
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │       wasm_api/             │  ← Facade (위임만)
          │  ┌────────┐ ┌────────┐     │
          │  │ viewer │ │ editor │ ... │  ← trait 구현
          │  └────────┘ └────────┘     │
          └─────────────────────────────┘
```

### 4.3 문서화 보강

각 모듈의 `//!` doc comment를 강화하고, `pub` 아이템에 `///` 문서 주석을 100% 달성한다.

---

## 실행 순서 및 예상 효과

| 단계 | Phase | 작업 | SOLID 점수 변화 | 위험도 |
|---|---|---|---|---|
| 1 | P1 | `wasm_api/mod.rs` 구조체 분리 | SRP +1 | 낮음 |
| 2 | P1 | `wasm_api/viewer.rs` 메서드 이동 | SRP +0.5, ISP +0.5 | 낮음 |
| 3 | P1 | `wasm_api/text_editor.rs` 이동 | SRP +0.5 | 낮음 |
| 4 | P1 | `wasm_api/table_editor.rs` 이동 | SRP +0.5 | 낮음 |
| 5 | P1 | `wasm_api/formatting.rs` 이동 | SRP +0.5 | 낮음 |
| 6 | P1 | `wasm_api/clipboard.rs` 이동 | SRP +0.5 | 낮음 |
| 7 | P1 | `wasm_api/html_converter.rs` 이동 | SRP +0.5 | 낮음 |
| 8 | P1 | `wasm_api/serializer.rs` + 나머지 | SRP +0.5, ISP +2.5 | 낮음 |
| 9 | P1 | 테스트 분리 + 전체 검증 | — | 중간 |
| 10 | P2 | `paginate_with_measured()` 함수 분해 | SRP +1 | 중간 |
| 11 | P2 | `layout.rs` 모듈 분할 | SRP +1 | 중간 |
| 12 | P3 | Parser/Serializer trait 도입 | OCP +1.5, DIP +2 | 낮음 |
| 13 | P3 | TextMeasurer trait 도입 | OCP +1, DIP +1.5 | 중간 |
| 14 | P3 | Editor trait 도입 | OCP +0.5, DIP +0.5 | 낮음 |
| 15 | P3 | 표준 trait 구현 (FromStr, thiserror) | LSP +3 | 낮음 |
| 16 | P4 | CLI clap 도입, main.rs 정리 | SRP +1, OCP +1 | 낮음 |

---

## 검증 계획

모든 단계에서 다음을 반복한다:

```bash
# 1. 네이티브 빌드 (컴파일 검증)
cargo build

# 2. 테스트 전량 통과 (기능 회귀 검증)
cargo test

# 3. WASM 빌드 (크로스 컴파일 검증)
# Docker 환경 사용
docker compose --env-file .env.docker run --rm wasm

# 4. 릴리즈 빌드 (최적화 검증)
cargo build --release
```

**Phase 1 완료 시 추가 검증**:
- wasm_api.rs가 WASM 바인딩 래퍼만 포함 (2,000줄 이하)
- 각 모듈 파일이 3,000줄 이하
- `cargo doc --no-deps` 문서 생성 정상

**최종 완료 시**:
- SOLID 리뷰 재평가 → 9.2점 이상 달성 확인
- 모든 파일이 3,000줄 이하 (font_metrics_data.rs 제외)
- 모든 함수가 200줄 이하
- trait 테스트에서 mock 구현 가능 확인

---

## 전략 요약

wasm_api.rs(24,586줄)의 God Object를 역할별 모듈로 분할하는 것이 **가장 큰 점수 향상**(SRP +4, ISP +3, DIP +2)을 가져온다. 이미 내부적으로 WASM 래퍼 + `_native` 구현체 쌍 패턴이 존재하므로, Rust의 분산 `impl` 블록을 활용하면 **API 변경 없이** 모듈화가 가능하다.

Phase 2의 거대 함수/파일 분해와 Phase 3의 trait 추상화까지 완료하면, 5.2점에서 9.2점 이상으로의 도약이 실현 가능하다.
