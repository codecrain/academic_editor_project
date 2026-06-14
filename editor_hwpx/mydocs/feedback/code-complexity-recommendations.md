# rhwp 코드 복잡도 관리 방법론 권고

> **대상**: rhwp 코드베이스 (78,463줄, POC → 제품화 단계)  
> **목적**: SOLID 이외의 정량적 품질 관리 프레임워크 도입 제안  
> **작성일**: 2026-02-22  
> **선행 리뷰**: [2차 코드리뷰](r-code-review-2nd.md) (5.4/10), [CQRS 분석](cqrs-analysis.md)  

---

## 왜 SOLID만으로 부족한가

SOLID은 **설계 원칙**(정성적)이지, **측정 도구**(정량적)가 아니다.

| rhwp의 핵심 문제 | SOLID이 감지하는가? | 정량 측정 가능한가? |
|---|---|---|
| `build_render_tree()` 921줄 | "SRP 위반" 정도만 진단 | ❌ "얼마나 나쁜지" 수치 없음 |
| 중첩 `if`/`match` 10단계 | 진단 불가 | ❌ |
| wasm_api.rs → 4개 모듈 의존 | "DIP 위반" 정도 | ❌ 결합 강도 수치 없음 |
| 테스트가 실제 버그를 잡는가? | 범위 밖 | ❌ |

**제안**: SOLID(정성) + 아래 5개 방법론(정량)을 조합하여 **자동화된 품질 게이팅** 체계를 구축한다.

---

## 1. Cognitive Complexity (인지 복잡도) — ⭐ 최우선 도입

### 개요

SonarQube가 제안한 메트릭으로, "**사람이 이 코드를 읽을 때 얼마나 어려운가**"를 수치화한다. 기존 Cyclomatic Complexity(순환 복잡도)의 한계를 보완:

| | Cyclomatic (CC) | Cognitive |
|---|---|---|
| 측정 대상 | 분기 경로 수 | 이해 난이도 |
| 중첩 처리 | 가중치 없음 | **중첩 시 가중치 증가** |
| `match` 처리 | 분기 수만큼 +1 | 의미 단위로 +1 |

```rust
// CC: 3, Cognitive: 3 — 동일 (순차적, 읽기 쉬움)
if a { ... }
if b { ... }
if c { ... }

// CC: 3, Cognitive: 6 — Cognitive이 더 높음 (중첩, 읽기 어려움)
if a {                    // +1
    if b {                // +2 (중첩 깊이 1)
        if c { ... }      // +3 (중첩 깊이 2)
    }
}
```

### rhwp에 적용하면

| 함수 | 줄 수 | CC (추정) | Cognitive (추정) | 판정 |
|---|---|---|---|---|
| `build_render_tree()` | 921 | 80+ | **150+** | 🔴 즉시 분해 |
| `paginate_with_measured()` | 1,456 | 100+ | **200+** | 🔴 즉시 분해 |
| `layout_composed_paragraph()` | 421 | 40+ | **70+** | 🔴 분해 권장 |
| `layout_table()` | 500+ | 50+ | **90+** | 🔴 분해 권장 |
| 일반 _native 메서드 | ~50 | 5~10 | 5~15 | 🟢 양호 |

### 도입 기준

```
✅ 모든 함수: Cognitive Complexity ≤ 15
⚠️ 경고 임계: Cognitive Complexity > 10
🔴 블록 임계: Cognitive Complexity > 25 (새 코드에서 불허)
```

### Rust 도구

- **`rust-code-analysis`**: Mozilla 개발, Rust 네이티브 CC/Cognitive 측정
- **`cargo-sonar`**: SonarQube 연동 시
- **커스텀 CI**: `rust-code-analysis-cli --metrics` 출력을 파싱하여 임계치 초과 시 빌드 실패

```bash
# 설치
cargo install rust-code-analysis-cli

# 측정
rust-code-analysis-cli -m -p src/renderer/layout.rs -O json
```

---

## 2. Coupling & Cohesion (결합도/응집도) — 아키텍처 건강도

### 개요

| 메트릭 | 의미 | 목표 |
|---|---|---|
| **Afferent Coupling (Ca)** | 이 모듈에 **의존하는** 외부 모듈 수 | 핵심 모듈은 높아도 OK |
| **Efferent Coupling (Ce)** | 이 모듈이 **의존하는** 외부 모듈 수 | 낮을수록 좋음 |
| **Instability (I)** | Ce / (Ca + Ce) | 0에 가까울수록 안정 |
| **Cohesion** | 모듈 내 요소들의 관련성 | 높을수록 좋음 |

### rhwp 현재 상태

```
모듈별 Coupling 분석 (추정):

model/         Ca=4  Ce=0  I=0.00  ✅ 완전 안정 (순수 데이터)
parser/        Ca=1  Ce=1  I=0.50  ✅ 적정
serializer/    Ca=1  Ce=1  I=0.50  ✅ 적정
renderer/      Ca=1  Ce=1  I=0.50  ✅ 적정
wasm_api.rs    Ca=0  Ce=4  I=1.00  🔴 완전 불안정 (모든 모듈에 의존)
```

`wasm_api.rs`의 Instability = 1.0은 **"이 모듈은 모든 변경의 영향을 받는다"**는 의미. God Object 문제를 수치로 확인.

### Cohesion 관점

`wasm_api.rs`의 `HwpDocument`는 9개 역할(텍스트 편집, 표 편집, 렌더링, 직렬화...)을 포함하므로 **Cohesion이 극도로 낮다**. "응집도가 낮은 클래스는 분할해야 한다"는 원칙의 정량적 근거를 제공.

### 도입 기준

```
✅ 모든 모듈: Efferent Coupling (Ce) ≤ 3
✅ 안정 모듈 (model, parser): Instability (I) ≤ 0.3
⚠️ 경고: 단일 파일이 4개 이상 모듈에 의존
```

### Rust 도구

```bash
# 의존성 그래프 시각화
cargo install cargo-depgraph
cargo depgraph | dot -Tpng > deps.png

# 모듈 간 의존성 분석
cargo install cargo-modules
cargo modules dependencies
```

---

## 3. Hexagonal Architecture (헥사고날 아키텍처) — 멀티 타겟 설계

### 왜 필요한가

rhwp는 **3가지 배포 경로**를 목표한다:

| 배포 | 인터페이스 | 현재 상태 |
|---|---|---|
| WASM (npm) | `#[wasm_bindgen]` | ✅ 구현됨 |
| Python (PyPI) | PyO3 바인딩 | ❌ 미구현 |
| MCP 서버 | JSON-RPC over stdio | ❌ 미구현 |

현재 비즈니스 로직이 `wasm_api.rs`에 직접 구현되어 있으므로, PyO3와 MCP에서 **같은 로직을 중복 구현**해야 하는 위험이 있다.

### 적용 구조

```
                    ┌─────────────────────────────┐
                    │      Core Domain             │
                    │      (순수 Rust, 외부 의존 0) │
                    │                              │
                    │  HwpEngine                    │
                    │  ├── TextEditor              │
                    │  ├── TableEditor             │
                    │  ├── Formatter               │
                    │  ├── Renderer                │
                    │  └── Serializer              │
                    └──────┬───────┬───────┬───────┘
                           │       │       │
              ┌────────────▼──┐ ┌──▼────┐ ┌▼──────────┐
              │ WASM Adapter  │ │ PyO3  │ │ MCP Server│
              │ (현재 wasm_   │ │Adapter│ │ Adapter   │
              │  api.rs에서   │ │(신규) │ │ (신규)    │
              │  분리)        │ │       │ │           │
              └───────────────┘ └───────┘ └───────────┘
```

### 분리 기준

| 계층 | 포함 | 불포함 |
|---|---|---|
| **Core** | 문서 모델 조작, 편집 로직, 레이아웃, 렌더링 | `#[wasm_bindgen]`, JSON 변환, JsValue |
| **Adapter** | 바인딩 변환, 에러 매핑, JSON 직렬화 | 비즈니스 로직 |

### 현재 위반 사례

```rust
// wasm_api.rs — Core와 Adapter가 혼재
pub fn insert_text_native(&mut self, ...) -> Result<String, HwpError> {
    // ① Core 로직 (분리 대상)
    let para = &mut self.document.sections[si].paragraphs[pi];
    para.text.insert_str(offset, text);
    self.reflow_paragraph(si, pi);

    // ② Adapter 로직 (WASM 전용)
    self.sections[si].raw_stream = None;
    self.paginate();
    Ok(format!("{{\"ok\":true,\"offset\":{}}}", new_offset))  // JSON 생성
}
```

**Core로 추출 후**:

```rust
// core/text_editor.rs
impl HwpEngine {
    pub fn insert_text(&mut self, si: usize, pi: usize, offset: usize, text: &str)
        -> Result<InsertResult, HwpError>
    {
        let para = &mut self.document.sections[si].paragraphs[pi];
        para.text.insert_str(offset, text);
        self.reflow_paragraph(si, pi);
        Ok(InsertResult { para_idx: pi, offset: new_offset })
    }
}

// adapters/wasm.rs — 얇은 래퍼
#[wasm_bindgen]
pub fn insert_text(&mut self, ...) -> Result<String, JsValue> {
    let result = self.engine.insert_text(si, pi, offset, text)?;
    self.mark_dirty(si);
    Ok(serde_json::to_string(&result)?)
}

// adapters/mcp.rs — 동일 Core 사용
fn handle_insert_text(&mut self, params: Value) -> Result<Value, McpError> {
    let result = self.engine.insert_text(si, pi, offset, text)?;
    Ok(json!(result))
}
```

---

## 4. 테스트 품질 메트릭 — 변이 테스트 + 커버리지

### 현재 테스트 현황의 한계

| 영역 | 테스트 수 | 문제 |
|---|---|---|
| wasm_api.rs | 112개 | 양호하나 에러 케이스 부족 |
| layout.rs | 22개 | 🔴 도형/텍스트박스/각주/다단 테스트 **전무** |
| pagination.rs | — | 🔴 표 분할 엣지 케이스 미검증 |

"488개 테스트 통과"는 **코드가 올바르다는 증거가 아니다**. 테스트가 실제로 버그를 잡는지 검증해야 한다.

### 4.1 라인 커버리지

```bash
# 설치 및 실행
cargo install cargo-tarpaulin
cargo tarpaulin --out Html --output-dir coverage/
```

도입 기준:
```
✅ 전체 라인 커버리지: ≥ 70%
✅ Core 모듈 (model, parser, renderer): ≥ 80%
⚠️ 경고: 신규 코드 커버리지 < 80%
```

### 4.2 변이 테스트 (Mutation Testing)

코드를 **의도적으로 깨뜨린 후**, 테스트가 이를 감지하는지 확인:

```bash
cargo install cargo-mutants
cargo mutants --in-place  # 변이 생성 → 테스트 실행 → 결과 보고
```

| 변이 유형 | 예시 | 테스트가 잡아야 함 |
|---|---|---|
| 부등호 반전 | `width > 0` → `width < 0` | ✅ |
| 상수 변경 | `7200` → `7201` (HWPUNIT) | ✅ |
| 조건 제거 | `if merged { ... }` → 삭제 | ✅ |
| 반환값 변경 | `Ok(result)` → `Ok(default)` | ✅ |

**변이 점수(Mutation Score)** = 잡힌 변이 / 전체 변이. 목표: **≥ 60%**

---

## 5. 정적 분석 강화 — Clippy 확장 룰셋

### 현재 상태

`#[allow(clippy::too_many_arguments)]`가 **2회** 사용 — Clippy 경고를 **억제**하고 있다.

### 권장 Clippy 릴셋

```toml
# Cargo.toml 또는 .clippy.toml
[lints.clippy]
cognitive_complexity = "warn"     # Cognitive Complexity 임계치
too_many_arguments = "warn"       # 매개변수 7개 초과 경고
too_many_lines = "warn"           # 함수 100줄 초과 경고
large_enum_variant = "warn"       # enum variant 크기 불균형
needless_pass_by_value = "warn"   # 불필요한 소유권 전달
```

**`#[allow]` 정책**: 새 코드에서 `#[allow(clippy::too_many_arguments)]` 사용 금지. 기존 코드는 리팩토링 시 제거.

---

## 종합: rhwp 품질 대시보드 제안

| 카테고리 | 방법론 | 도구 | 기준 | CI 자동화 |
|---|---|---|---|---|
| 설계 원칙 | SOLID | 수동 리뷰 | 종합 ≥ 8.0/10 | ❌ |
| **함수 복잡도** | **Cognitive Complexity** | `rust-code-analysis` | **함수당 ≤ 15** | ✅ |
| 모듈 건강도 | Coupling/Cohesion | `cargo-modules` | Ce ≤ 3, I ≤ 0.5 | ✅ |
| 아키텍처 | Hexagonal | 수동 설계 | Core/Adapter 분리 | ❌ |
| 테스트 품질 | 변이 테스트 + 커버리지 | `cargo-mutants`, `cargo-tarpaulin` | 커버리지 ≥ 70%, 변이 ≥ 60% | ✅ |
| 린팅 | Clippy 확장 | `cargo clippy` | warning 0 | ✅ |

### 도입 우선순위

| 순위 | 방법론 | 이유 | 도입 비용 |
|---|---|---|---|
| 1 | **Cognitive Complexity** | 거대 함수 분해의 객관적 기준, CI 자동화 가능 | ⭐ 낮음 |
| 2 | **Hexagonal Architecture** | 3개 배포 경로(WASM/PyO3/MCP) 지원의 필수 전제 | ⭐⭐ 중간 |
| 3 | **라인 커버리지** | layout.rs 테스트 사각지대 수치화 | ⭐ 낮음 |
| 4 | **Clippy 확장 룰셋** | 새 코드의 품질 자동 게이팅 | ⭐ 낮음 |
| 5 | **Coupling 분석** | 모듈 분할 시 효과 측정 | ⭐ 낮음 |
| 6 | **변이 테스트** | 테스트 품질의 궁극적 검증 | ⭐⭐ 중간 |

---

## 결론

SOLID은 **"이 코드가 좋은 설계인가?"**에 답하지만, **"얼마나 나쁜가?"**, **"개선되고 있는가?"**에는 답하지 못한다.

rhwp의 제품화 단계에서는 **정량적 메트릭의 자동 추적**이 필수적이다. Cognitive Complexity로 함수 분해 기준을 세우고, Hexagonal Architecture로 멀티 타겟 배포를 설계하며, 변이 테스트로 테스트 품질을 검증하는 체계를 구축하면, 코드 품질이 **시간이 지남에 따라 측정 가능하게 개선**된다.

> *"측정할 수 없으면 관리할 수 없다." — Peter Drucker*
