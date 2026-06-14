# rhwp 프로젝트 2차 코드 리뷰 보고서

> **대상**: rhwp Rust 코드베이스 (78,463줄, 4개 모듈)  
> **범위**: 1차 SOLID 리뷰 + `wasm_api.rs` · `layout.rs` 심층 분석 결과 통합  
> **작성일**: 2026-02-22  

---

## 리뷰 경과

| 단계 | 보고서 | 평가 대상 | 점수 |
|---|---|---|---|
| 1차 | [r-code-review-report.md](r-code-review-report.md) | 프로젝트 전체 SOLID 원칙 | 5.2 / 10 |
| 2차-A | [wasm-api-quality-report.md](wasm-api-quality-report.md) | `wasm_api.rs` — 12개 항목 세부 평가 | 4.8 / 10 |
| 2차-B | [layout-quality-report.md](layout-quality-report.md) | `layout.rs` — 12개 항목 세부 평가 | 4.5 / 10 |

---

## 종합 진단: 프로젝트 코드 품질 점수

### 프로젝트 전체: 5.4 / 10.0

| 평가 영역 | 점수 | 근거 |
|---|---|---|
| **아키텍처** | 7 / 10 | model/parser/renderer/serializer 4계층 분리 양호, Renderer trait 모범 사례 |
| **파일 구조** | 3 / 10 | 2개 파일(wasm_api + layout)이 전체의 42% 차지 |
| **함수 복잡도** | 3 / 10 | 921줄(build_render_tree), 1,456줄(paginate_with_measured) 거대 함수 |
| **코드 중복** | 3 / 10 | JSON 파서 13회, ShapeObject 매칭 61회, 표 보일러플레이트 8회 반복 |
| **에러 처리** | 7 / 10 | Result + HwpError 일관, unwrap 최소화 |
| **문서화** | 7 / 10 | 698개 문서 주석, 92% 커버리지 |
| **테스트** | 6 / 10 | 488개 통과, 그러나 layout 영역 커버리지 부족 |
| **타입 안전성** | 5 / 10 | 수동 JSON 파싱, as 무검증 캐스팅 |
| **네이밍** | 8 / 10 | 일관된 규칙 (_native, _in_cell, layout_*) |
| **확장성** | 4 / 10 | Renderer trait만 양호, 나머지 영역 확장 시 다수 파일 수정 필요 |

---

## 발견된 핵심 문제 — Top 5

### 🔴 1. God Object: `wasm_api.rs` (24,586줄, 568개 아이템)

`HwpDocument` 하나의 struct에 **9개 역할**(로드, 렌더링, 텍스트 편집, 표 편집, 서식, 클립보드, HTML 변환, 직렬화, 커서/히트)이 혼재한다. 프로젝트 전체의 31%가 이 파일에 집중되어 있다.

| 정량 지표 | 값 |
|---|---|
| 공개 메서드 (WASM 바인딩) | 100+ |
| 네이티브 구현체 (_native) | 200+ |
| JSON 파서 중복 정의 | 13회 |
| `format!("{{` 수동 JSON 생성 | 39회 |
| `raw_stream = None` 반복 | 55회 |
| `self.paginate()` 호출 | 45회 |

**영향**: 모든 기능 변경이 이 파일을 건드려야 하므로 merge conflict 확률 극대화, 코드 리뷰 부담, 신규 개발자 온보딩 비용 증가.

### 🔴 2. 거대 함수: `build_render_tree()` 921줄, `paginate_with_measured()` 1,456줄

두 함수가 각각 **페이지의 모든 요소 배치**와 **모든 페이지 분할 로직**을 단독 처리한다.

| 함수 | 파일 | 줄 수 | 매개변수 |
|---|---|---|---|
| `paginate_with_measured()` | pagination.rs | 1,456 | — |
| `build_render_tree()` | layout.rs | 921 | 12 |
| `layout_composed_paragraph()` | layout.rs | 421 | 14 |
| `layout_table()` | layout.rs | 500+ | 16 |
| `layout_inline_table_paragraph()` | layout.rs | 372 | 12 |

업계 권장 함수 크기(50~100줄)의 **10~29배**.

### 🔴 3. ShapeObject 패턴 매칭 61회 반복

`ShapeObject` enum에 `common()` 메서드가 없어, 8개 variant를 매칭하는 동일한 코드가 layout.rs에서 **최소 6개 위치, 61회** 반복된다.

```rust
// 이 8줄 블록이 6곳에서 반복
let common = match shape {
    ShapeObject::Line(s) => &s.common,
    ShapeObject::Rectangle(s) => &s.common,
    ShapeObject::Ellipse(s) => &s.common,
    ShapeObject::Arc(s) => &s.common,
    ShapeObject::Polygon(s) => &s.common,
    ShapeObject::Curve(s) => &s.common,
    ShapeObject::Group(g) => &g.common,
    ShapeObject::Picture(p) => &p.common,
};
```

새 도형 타입 추가 시 **6곳 이상 동시 수정** 필요 → OCP 위반.

### 🟡 4. JSON 유틸리티 부재 (serde 미사용)

`serde`를 의도적으로 사용하지 않아 발생하는 문제:

- **파싱**: `parse_u32()`, `parse_bool()` 등 동일한 함수가 **4개 다른 위치에 13회** 중복 정의
- **생성**: `format!("{{\"ok\":true,...}}` 패턴이 **39회** — 특수문자 이스케이프 누락 위험
- **타입 안전성**: JSON 키 오타를 컴파일 타임에 감지 불가

### 🟡 5. 표 레이아웃 코드 이중화

`layout_table()` (본문용)과 `layout_embedded_table()` (텍스트박스 내부용)이 **~200줄의 거의 동일한 로직**을 반복한다: 열 폭 계산 → 행 높이 계산 → 누적 위치 → 셀 배경 → 테두리 수집 → 셀 패딩 → 셀 내 문단 레이아웃.

---

## 확인된 강점

### ✅ 1. 아키텍처 설계 (7/10)

```
model/ (순수 데이터, 외부 의존성 0)
  ↑         ↑         ↑
parser/ → model ← renderer/
                     ↑
               serializer/
```

의존성 방향이 **안쪽(model)**을 향하는 깨끗한 계층 구조. parser↔serializer 대칭 구조 유지.

### ✅ 2. Renderer Trait 추상화 (8/10)

```rust
pub trait Renderer {
    fn begin_page(&mut self, width: f64, height: f64);
    fn draw_text(&mut self, text: &str, x: f64, y: f64, style: &TextStyle);
    fn draw_rect(&mut self, ...);
    // 총 8개 핵심 메서드
}
```

4개 구현체(SVG, Canvas, HTML, WebCanvas)가 존재하며, PDF 백엔드 추가 시 기존 코드 수정 불필요. **OCP + ISP 모범 사례.**

### ✅ 3. 에러 처리 패턴 (7/10)

- 통합 `HwpError` enum + `Result<T, HwpError>` 일관 사용
- `From<HwpError> for JsValue`로 WASM 에러 브릿지 완비
- `unwrap()`/`expect()` 최소 사용 (테스트 외 거의 없음)
- 인덱스 접근 시 `.get()` + `ok_or_else()` 안전 패턴

### ✅ 4. 문서화 (7/10)

| 파일 | 문서 주석 수 | 아이템 수 | 커버리지 |
|---|---|---|---|
| wasm_api.rs | 523 | 568 | 92% |
| layout.rs | 175 | 133 | 100%+ |
| **합계** | 698+ | 701 | ~100% |

한국어 문서 일관 사용, HWP 스펙 참조 명시, Phase 구분 주석으로 기능 영역 구분.

### ✅ 5. WASM 래퍼 패턴 (6/10)

```rust
// WASM 바인딩 (얇은 래퍼)
pub fn insert_text(...) -> Result<String, JsValue> {
    self.insert_text_native(...).map_err(|e| e.into())
}

// 네이티브 구현체 (테스트 가능)
pub fn insert_text_native(...) -> Result<String, HwpError> {
    // 실제 로직
}
```

WASM 바인딩과 비즈니스 로직을 분리하여 **네이티브 환경에서 직접 테스트 가능**. 이 패턴 덕분에 Rust의 분산 `impl` 블록을 활용한 파일 분할이 **API 변경 없이** 가능.

---

## 두 핵심 파일 비교 분석

| 항목 | wasm_api.rs | layout.rs |
|---|---|---|
| **줄 수** | 24,586 | 8,709 |
| **최대 함수 크기** | ~200줄 | **921줄** |
| **역할 수** | 9개 | 7개 |
| **테스트 수** | 112개 (53%) | 22개 (8.6%) |
| **핵심 중복 패턴** | JSON 파서 13회 | ShapeObject 매칭 61회 |
| **종합 점수** | 4.8/10 | 4.5/10 |
| **성격** | 양은 많지만 함수는 단순 | 양은 적지만 함수가 극도로 복잡 |
| **리팩토링 난이도** | 중 (분산 impl 활용 가능) | **고** (거대 함수 분해 필요) |

> **핵심 인사이트**: wasm_api.rs는 **양적 문제** (파일이 너무 큼), layout.rs는 **질적 문제** (함수가 너무 복잡). 접근 전략이 다르다.

---

## 리팩토링 우선순위 (종합)

기존 488개 테스트 전량 통과와 외부 API 호환성을 유지하면서, **점수 향상 효과가 큰 순서**로 배열한다.

### P0 — 즉시 착수 (SOLID +3.0점 예상)

| # | 작업 | 효과 | 난이도 |
|---|---|---|---|
| 1 | **`ShapeObject::common()` 메서드 추가** | 61회 중복 → 1줄, OCP 개선 | ⭐ 낮음 |
| 2 | **JSON 유틸리티 통합** (parse_u32 등 → 단일 모듈) | DRY 개선, 13회 중복 제거 | ⭐ 낮음 |
| 3 | **표 편집 후처리 헬퍼 추출** (`invalidate_and_repaginate()`) | 8개 함수 보일러플레이트 제거 | ⭐ 낮음 |

> P0은 **코드 변경량이 적고 위험이 낮지만 효과가 큰** 빠른 성과(Quick win).

### P1 — 중기 개선 (SOLID +2.5점 예상)

| # | 작업 | 효과 | 난이도 |
|---|---|---|---|
| 4 | **`wasm_api.rs` 역할별 모듈 분할** | SRP +4, ISP +3, 유지보수성 대폭 향상 | ⭐⭐ 중간 |
| 5 | **`build_render_tree()` 921줄 분해** | 함수 복잡도 개선, 프로파일링 가능 | ⭐⭐ 중간 |
| 6 | **표 레이아웃 통합** (layout_table + layout_embedded_table) | 200줄 중복 제거 | ⭐⭐ 중간 |

### P2 — 장기 개선 (SOLID +1.5점 예상)

| # | 작업 | 효과 | 난이도 |
|---|---|---|---|
| 7 | **`paginate_with_measured()` 1,456줄 분해** | 단일 함수 복잡도 해소 | ⭐⭐⭐ 높음 |
| 8 | **Parser/Serializer trait 추상화** | OCP/DIP 향상, 테스트 모킹 가능 | ⭐⭐⭐ 높음 |
| 9 | **layout.rs 파일 분할** (텍스트/표/도형/각주 → 별도 파일) | SRP, 확장성 향상 | ⭐⭐⭐ 높음 |
| 10 | **main.rs CLI 정리** (clap 도입) | SRP, OCP 소폭 향상 | ⭐⭐ 중간 |

---

## 리팩토링 후 예상 점수

| 단계 | 작업 | 예상 점수 |
|---|---|---|
| 현재 | — | **5.4 / 10** |
| P0 완료 후 | Quick win 3건 | **6.8 / 10** |
| P1 완료 후 | 파일 분할 + 함수 분해 | **8.2 / 10** |
| P2 완료 후 | trait 추상화 + 전체 정리 | **9.2+ / 10** |

---

## 제품화에 대한 영향 평가

### 현재 코드 품질이 제품화에 미치는 리스크

| 리스크 | 현재 영향 | P0 완료 후 |
|---|---|---|
| **Phase 1 (HTML→HWP)** | 🟡 중간 — wasm_api.rs에 새 메서드 추가 시 파일 확장 부담 | 🟢 낮음 |
| **Phase 2 (MCP 서버)** | 🔴 높음 — 네이티브 API 설계 시 God Object 구조가 장애물 | 🟡 중간 |
| **PyO3 바인딩** | 🟡 중간 — 568개 메서드 중 공개 API 선별 필요 | 🟢 낮음 |
| **멀티 개발자 협업** | 🔴 높음 — 단일 파일 집중으로 merge conflict 빈발 | 🟢 낮음 |

### 권고

**P0 3건을 즉시 실행한 후 Phase 1 제품화에 착수**하는 것이 최적의 전략이다. P0은 코드 변경량이 적고(각 1일 이내), API를 변경하지 않으며, 기존 테스트에 영향을 주지 않으면서도 후속 작업의 기반을 마련한다.

P1(파일 분할)은 Phase 1과 **병행** 가능하다. Rust의 분산 `impl` 블록을 활용하면 `HwpDocument`의 공개 API는 그대로 유지하면서 구현체만 역할별 파일로 이동할 수 있다.

---

## 결론

rhwp 프로젝트는 **기능적 완성도가 매우 높다**: 488개 테스트 통과, HWP 바이너리의 읽기·렌더링·편집·저장 전 과정이 동작하며, 한컴오피스 호환성이 검증되었다. 아키텍처 수준의 모듈 분리(model/parser/renderer/serializer)와 Renderer trait 추상화는 좋은 설계 판단이다.

그러나 **구현 수준의 품질이 아키텍처 수준을 따라가지 못하고 있다**. 전체 코드의 42%가 2개 파일에 집중되어 있고, 921줄·1,456줄의 거대 함수가 존재하며, 동일 코드가 최대 61회까지 반복된다. 이는 POC 단계에서의 빠른 개발 속도를 우선시한 결과로, 제품화 전에 **반드시 해결해야 할 기술 부채**이다.

다행히 **리팩토링 진입 장벽이 낮다**: P0 3건(ShapeObject::common, JSON 유틸리티, 표 편집 헬퍼)은 각각 1일 이내에 완료 가능하며, API 호환성에 영향을 주지 않는다. 이 Quick win만으로 종합 점수를 5.4 → 6.8로 끌어올릴 수 있다.

> **한 줄 요약**: "설계는 좋고 기능은 완벽하지만, 구현이 설계를 따라잡아야 제품이 된다."
