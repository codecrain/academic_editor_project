# rhwp 프로젝트 SOLID 원칙 기반 코드 리뷰 보고서

> **대상**: rhwp Rust 코드베이스 (타스크 141 기준)  
> **평가 기준**: SOLID 원칙 (10점 만점)  
> **작성일**: 2026-02-22  

---

## 종합 점수: 5.2 / 10.0

| SOLID 원칙 | 점수 | 평가 요약 |
|---|---|---|
| **S** — 단일 책임 원칙 (SRP) | 3 / 10 | 다수의 God Object/File이 존재하여 심각하게 미흡 |
| **O** — 개방-폐쇄 원칙 (OCP) | 6 / 10 | Renderer trait 등 일부 추상화가 잘 되어 있으나 불완전 |
| **L** — 리스코프 치환 원칙 (LSP) | 7 / 10 | trait 구현체들이 계약을 잘 준수함 |
| **I** — 인터페이스 분리 원칙 (ISP) | 5 / 10 | Renderer trait이 적절하나, wasm_api의 거대 인터페이스 문제 |
| **D** — 의존성 역전 원칙 (DIP) | 5 / 10 | 모듈 간 계층은 잘 분리되었으나 구체 타입 직접 의존 다수 |

---

## 1. 단일 책임 원칙 (SRP) — 3/10 🔴

SRP 위반이 프로젝트의 가장 심각한 구조적 문제이다.

### 1.1 Critical: `wasm_api.rs` — 24,586줄, 568개 아이템

프로젝트에서 가장 심각한 SRP 위반. 하나의 `HwpDocument` 구조체가 다음 **모든 책임**을 동시에 담당한다:

- 파일 로드/파싱
- SVG/HTML/Canvas 렌더링
- 페이지네이션
- 텍스트 편집 (삽입/삭제/분할/병합)
- 표 편집 (행/열 삽입/삭제/병합/분할)
- 글자 모양/문단 모양 변경
- 클립보드 (복사/붙여넣기/HTML 변환)
- 용지 설정
- 직렬화/저장
- 진단/디버그

**이것은 전형적인 God Object 패턴이다.** 568개의 메서드가 하나의 struct에 집중되어 있어, 어떤 기능 하나를 수정하더라도 24,000줄 파일 전체에 영향을 미칠 수 있다.

### 1.2 Critical: `renderer/layout.rs` — 8,709줄

레이아웃 배치, 폰트 매트릭스 계산, WASM JS 브릿지 캐시, 문단 번호 상태 관리, 텍스트 위치 계산 등 **다수의 관심사**가 하나의 파일에 혼재한다.

### 1.3 Major: `renderer/pagination.rs` — `paginate_with_measured()` 단일 함수 1,456줄

이 함수 하나가 페이지 분할의 모든 로직(표 분할, 다단 처리, 머리말/꼬리말 배치, 각주 배치, 도형 배치, 바탕쪽 처리)을 포함한다. **함수 수준에서의 SRP 위반**으로, 각 관심사를 별도 함수/모듈로 분리해야 한다.

### 1.4 Major: `main.rs` — 990줄

CLI 진입점이 `export_svg`, `show_info`, `dump_controls`, `diag_document`, `convert_hwp` 등 여러 서브커맨드를 직접 구현한다. `clap` 같은 CLI 프레임워크 미사용.

### 1.5 긍정적 사례

- `model/` 모듈은 비교적 잘 분리됨 (document, paragraph, table, style, control 등)
- `parser/` 모듈의 서브 모듈 분리도 양호 (cfb_reader, doc_info, body_text, header 등)
- `serializer/` 모듈이 parser의 역방향으로 대칭적 구조를 유지 ✅

---

## 2. 개방-폐쇄 원칙 (OCP) — 6/10 🟡

### 2.1 긍정적 사례: `Renderer` trait (renderer/mod.rs:239-257)

```rust
pub trait Renderer {
    fn begin_page(&mut self, width: f64, height: f64);
    fn end_page(&mut self);
    fn draw_text(&mut self, text: &str, x: f64, y: f64, style: &TextStyle);
    fn draw_rect(&mut self, ...);
    fn draw_line(&mut self, ...);
    fn draw_ellipse(&mut self, ...);
    fn draw_image(&mut self, ...);
    fn draw_path(&mut self, commands: &[PathCommand], style: &ShapeStyle);
}
```

`SvgRenderer`, `CanvasRenderer`, `HtmlRenderer`, `WebCanvasRenderer` 4개 구현체가 존재. PDF 백엔드를 추가할 때 기존 코드 수정 없이 새 구현체만 추가하면 된다. **OCP의 모범 사례.**

### 2.2 긍정적 사례: `RenderObserver` / `RenderWorker` trait (scheduler.rs)

비동기 렌더링 스케줄링을 위한 추상화가 잘 설계되어 있다.

### 2.3 문제점: 파서/직렬화기의 확장성 부족

- `ParseError` enum이 통합 에러 타입으로 잘 설계되었으나, 새로운 파싱 단계 추가 시 enum에 variant를 추가해야 함 (닫힌 구조)
- HWP 컨트롤 타입(`Control` enum)에 새 타입 추가 시 parser/control.rs, serializer/control.rs, layout.rs 등 다수 파일을 동시에 수정해야 함
- `NumberFormat`, `AutoNumberType` 등의 enum도 확장 시 match 분기가 산재한 여러 파일을 수정해야 함

### 2.4 문제점: `wasm_api.rs`의 조건부 컴파일

`#[cfg(target_arch = "wasm32")]`와 `#[cfg(not(target_arch = "wasm32"))]`가 코드 전반에 산재. 새 플랫폼 추가 시 기존 코드 수정 필요.

---

## 3. 리스코프 치환 원칙 (LSP) — 7/10 🟢

### 3.1 긍정적 사례

- `Renderer` trait의 4개 구현체(`SvgRenderer`, `CanvasRenderer`, `HtmlRenderer`, `WebCanvasRenderer`)가 trait 계약을 충실히 이행
- `From<HwpxError> for ParseError` 등 에러 변환이 정보 손실 없이 구현

### 3.2 미흡한 부분

- `Renderer` trait 구현체 간 **행동 차이**가 존재할 가능성: `draw_image`에서 CanvasRenderer는 빈 구현, SvgRenderer는 base64 인코딩 등 — 테스트로 동등성 검증 부족
- `RenderBackend::from_str()`이 표준 `std::str::FromStr` trait을 구현하지 않고 자체 메서드로 정의

---

## 4. 인터페이스 분리 원칙 (ISP) — 5/10 🟡

### 4.1 긍정적 사례: `Renderer` trait

8개의 핵심 드로잉 메서드만 포함하여 인터페이스가 간결하다. 각 백엔드가 필요한 것만 구현. **ISP 모범 사례.**

### 4.2 문제점: `HwpDocument` (wasm_api.rs)의 거대 인터페이스

`#[wasm_bindgen] impl HwpDocument` 블록에 **100개 이상의 공개 메서드**가 있다. JS에서 호출하는 클라이언트 입장에서 "문서 렌더링만 필요한 뷰어"와 "편집이 필요한 에디터"가 **같은 인터페이스**를 사용해야 한다.

분리 제안:
| 인터페이스 영역 | 책임 |
|---|---|
| `HwpViewer` | 로드, 렌더링, 페이지 정보 |
| `HwpEditor` | 텍스트/표 편집, 서식 변경 |
| `HwpSerializer` | 직렬화, 저장 |
| `HwpClipboard` | 복사/붙여넣기 |

### 4.3 문제점: trait 부재

프로젝트 전체에서 비즈니스 로직 수준의 trait이 `Renderer`, `RenderObserver`, `RenderWorker` 세 개뿐이다. 파싱, 직렬화, 편집 등의 핵심 기능에 trait 추상화가 없어 테스트 시 모킹이 어렵고 구현체 교체가 불가능하다.

---

## 5. 의존성 역전 원칙 (DIP) — 5/10 🟡

### 5.1 긍정적 사례: 모듈 간 계층 분리

```
lib.rs
 ├── model/     (데이터 모델 — 의존성 없음) ✅
 ├── parser/    (model에 의존) ✅
 ├── renderer/  (model에 의존) ✅
 ├── serializer/(model에 의존) ✅
 └── wasm_api   (전체에 의존) ⚠️
```

`model`이 순수 데이터 계층으로 외부 의존성이 없다. parser → model ← renderer 구조로 의존성 방향이 안쪽(모델)을 향한다.

### 5.2 문제점: 구체 타입 직접 의존

- `layout.rs`가 `SvgRenderer`, `CanvasRenderer` 등 구체 타입을 직접 참조하는 대신 `dyn Renderer`를 사용하는 부분도 있으나 혼재
- `wasm_api.rs`가 `parser::parse_hwp()`, `serializer::serialize_hwp()` 등 **구체 함수**를 직접 호출. 추상화 계층(예: `trait DocumentParser`)이 없음
- `layout.rs`의 `#[cfg(target_arch = "wasm32")]` 블록이 JS 인터페이스에 직접 의존하여 컴파일 타겟에 따라 코드가 크게 달라짐

### 5.3 문제점: wasm_api의 양방향 의존

`wasm_api.rs`가 4개 모듈 모두에 직접 의존하며, 동시에 `HwpDocument` 내부에서 모든 로직을 직접 구현한다. Facade 패턴으로 위임하는 것이 아니라 비즈니스 로직 자체를 포함하고 있어, 실질적으로 **모든 모듈의 변경이 이 파일에 영향**을 미친다.

---

## 파일 크기 분포 (상위 15개)

| 순위 | 파일 | 줄 수 | 비고 |
|---|---|---|---|
| 1 | `wasm_api.rs` | 24,586 | 🔴 God Object |
| 2 | `renderer/font_metrics_data.rs` | 9,818 | 자동 생성 데이터 (허용) |
| 3 | `renderer/layout.rs` | 8,709 | 🔴 다중 책임 |
| 4 | `renderer/pagination.rs` | 2,265 | 🟡 거대 함수 포함 |
| 5 | `renderer/composer.rs` | 2,027 | 양호 |
| 6 | `model/table.rs` | 1,768 | 양호 (도메인 복잡성) |
| 7 | `parser/control.rs` | 1,744 | 양호 |
| 8 | `serializer/control.rs` | 1,520 | 양호 |
| 9 | `serializer/cfb_writer.rs` | 1,516 | 양호 |
| 10 | `parser/body_text.rs` | 1,429 | 양호 |
| | **총계** | **78,463줄** | |

---

## 개선 우선순위 권장

### P0 (즉시 착수 권장)

1. **`wasm_api.rs` 분할**: 문서 뷰잉, 편집, 직렬화, 클립보드를 별도 모듈로 분리. `HwpDocument`는 Facade로 위임만 수행.

### P1 (중기 개선)

2. **`paginate_with_measured()` 1,456줄 함수 분해**: 표 분할, 다단 처리, 머리말/꼬리말 등을 별도 함수로 추출
3. **`layout.rs` 분할**: 텍스트 측정, WASM 캐시, 번호 상태 관리를 별도 파일로 분리

### P2 (장기 개선)

4. **파서/직렬화기에 trait 추상화 도입**: 테스트 용이성 향상
5. **`main.rs`에 CLI 프레임워크 도입**: `clap` 크레이트 활용
6. **`HwpDocument` 인터페이스를 역할별로 분리**: Viewer / Editor / Serializer

---

## 결론

rhwp 프로젝트는 **모듈 수준의 아키텍처**(model/parser/renderer/serializer 4계층)와 **Renderer trait 추상화**에서 좋은 설계 판단을 보여준다. 특히 model 계층이 순수 데이터로 외부 의존성이 없는 점, parser↔serializer가 대칭 구조를 유지하는 점은 유지보수에 유리하다.

그러나 `wasm_api.rs`(24,586줄)라는 거대한 God Object와, `paginate_with_measured()`(1,456줄), `layout.rs`(8,709줄) 등의 초대형 파일/함수가 SRP를 심각하게 위반하고 있어, 프로젝트 전체의 SOLID 점수를 크게 끌어내리고 있다. 이러한 구조적 부채가 향후 제품화(Phase 1~2) 과정에서 개발 속도를 저해하고 버그 발생 가능성을 높일 수 있으므로, `wasm_api.rs` 분할을 최우선으로 진행할 것을 권고한다.
