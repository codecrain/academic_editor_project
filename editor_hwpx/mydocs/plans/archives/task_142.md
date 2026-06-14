# 타스크 142 수행계획서: 코드베이스 리팩토링 (SOLID + CQRS + 복잡도 관리)

> **작성일**: 2026-02-22
> **목표**: 전 파일 1,200줄 이내, SOLID 5.2→9.2점, Cognitive Complexity ≤15
> **원칙**: 488개 테스트 전량 통과 유지, 외부 API(WASM/JS) 호환성 보장

---

## 1. 현황 분석

### 1.1 Rust — 1,200줄 초과 파일 (12개)

| # | 파일 | 줄 수 | 비고 |
|---|------|------:|------|
| 1 | wasm_api.rs | 24,585 | 코드 12,024 + 테스트 12,561 (전체의 31%) |
| 2 | renderer/layout.rs | 8,708 | 텍스트/표/도형 레이아웃 혼재 |
| 3 | renderer/pagination.rs | 2,264 | paginate_with_measured 1,456줄 포함 |
| 4 | renderer/composer.rs | 2,026 | 문단 조합 |
| 5 | model/table.rs | 1,767 | 표 모델 |
| 6 | parser/control.rs | 1,744 | 컨트롤 파서 |
| 7 | serializer/control.rs | 1,520 | 컨트롤 직렬화 |
| 8 | serializer/cfb_writer.rs | 1,516 | CFB 쓰기 |
| 9 | parser/body_text.rs | 1,429 | 본문 파서 |
| 10 | model/paragraph.rs | 1,367 | 문단 모델 |
| 11 | renderer/svg.rs | 1,292 | SVG 렌더러 |
| 12 | serializer/doc_info.rs | 1,248 | 문서정보 직렬화 |

※ `font_metrics_data.rs` (9,818줄)는 자동 생성 데이터이므로 제외

### 1.2 TypeScript/CSS — 1,200줄 초과 파일 (3개)

| # | 파일 | 줄 수 | 비고 |
|---|------|------:|------|
| 1 | engine/input-handler.ts | 3,106 | 키보드/마우스/IME/표/그림 핸들러 혼재 |
| 2 | style.css | 1,588 | 전체 스타일 단일 파일 |
| 3 | ui/para-shape-dialog.ts | 1,496 | 4탭 대화상자 |

### 1.3 wasm_api.rs 상세 분석

| 항목 | 수량 |
|------|-----:|
| `#[wasm_bindgen]` 메서드 | 116 |
| `_native` 구현체 | 87 |
| `#[test]` 함수 | 112 |
| `mod tests` 줄 수 | 12,561 (51%) |
| 비즈니스 로직 코드 | 12,024 (49%) |

---

## 2. 리팩토링 범위 및 제외

### 포함

- 1,200줄 초과 파일 15개의 모듈 분할
- wasm_api.rs의 역할별 impl 블록 분리
- 거대 함수 분해 (paginate_with_measured 등)
- rhwp-studio TS/CSS 파일 분할
- 정량적 코드 품질 측정 체계 도입

### 제외

- trait 추상화 (Phase 3) — 별도 타스크로 분리 검토
- CLI clap 도입 (Phase 4) — 별도 타스크로 분리 검토
- font_metrics_data.rs — 자동 생성 데이터
- 새 기능 추가, 버그 수정

### 이유

Phase 1~2(파일/함수 분할)만으로도 변경량이 매우 크다. trait 추상화와 CLI 프레임워크는 분할 완료 후 안정적으로 진행하는 것이 위험도를 낮춘다.

---

## 3. 구현 전략

### 3.1 Rust: wasm_api.rs 분할 (24,585줄 → 모듈당 ≤1,200줄)

Rust의 분산 `impl` 블록을 활용하여 `HwpDocument` 구조체는 한 곳에 정의하고, 메서드를 역할별 파일로 분리한다.

```
src/
├── wasm_api.rs              ← #[wasm_bindgen] 래퍼만 (≤1,200줄)
├── wasm_api/
│   ├── mod.rs               ← HwpDocument 구조체 + 공통 헬퍼
│   ├── viewer.rs            ← 렌더링, 페이지 정보, DPI
│   ├── text_editor.rs       ← 텍스트 삽입/삭제/분할/병합
│   ├── table_editor.rs      ← 표 행/열 CRUD, 셀 병합/분할
│   ├── formatting.rs        ← 글자/문단 모양 변경
│   ├── clipboard.rs         ← 복사/붙여넣기
│   ├── html_converter.rs    ← HTML 내보내기/가져오기
│   ├── serializer.rs        ← HWP 저장, 빈 문서 생성
│   ├── cursor.rs            ← 커서 이동, 히트 테스트
│   ├── picture.rs           ← 그림 삽입/선택/이동/리사이즈
│   └── diagnostics.rs       ← 문서 정보, 디버그
├── wasm_api/tests/
│   ├── mod.rs
│   ├── viewer_tests.rs
│   ├── text_editor_tests.rs
│   ├── table_editor_tests.rs
│   ├── formatting_tests.rs
│   ├── clipboard_tests.rs
│   ├── html_converter_tests.rs
│   ├── serializer_tests.rs
│   └── picture_tests.rs
```

### 3.2 Rust: renderer/ 분할

```
src/renderer/
├── layout.rs (8,708줄) → 분할:
│   ├── layout.rs            ← 진입점 + 공통 (≤1,200줄)
│   ├── text_layout.rs       ← 텍스트 위치/줄바꿈 계산
│   ├── table_layout.rs      ← 표 레이아웃
│   ├── shape_layout.rs      ← 도형/이미지/텍스트박스
│   ├── numbering_layout.rs  ← 문단 번호/글머리표
│   ├── footnote_layout.rs   ← 각주/미주 레이아웃
│   └── header_footer_layout.rs ← 머리말/꼬리말
│
├── pagination.rs (2,264줄) → 분할:
│   ├── pagination.rs        ← 진입점 (≤1,200줄)
│   └── page_break.rs        ← 페이지 경계/표 분할 로직
│
├── composer.rs (2,026줄) → 분할:
│   ├── composer.rs           ← 진입점 (≤1,200줄)
│   └── composer_table.rs     ← 표 조합 전용
```

### 3.3 Rust: 기타 1,200줄 초과 파일

| 파일 | 줄 수 | 분할 전략 |
|------|------:|----------|
| model/table.rs | 1,767 | table.rs + table_cell.rs |
| parser/control.rs | 1,744 | control.rs + control_shape.rs |
| serializer/control.rs | 1,520 | control.rs + control_shape.rs |
| serializer/cfb_writer.rs | 1,516 | cfb_writer.rs + cfb_storage.rs |
| parser/body_text.rs | 1,429 | body_text.rs + char_shape_reader.rs |
| model/paragraph.rs | 1,367 | paragraph.rs + paragraph_ops.rs |
| renderer/svg.rs | 1,292 | svg.rs + svg_shape.rs |
| serializer/doc_info.rs | 1,248 | doc_info.rs + doc_info_style.rs |

### 3.4 TypeScript/CSS: rhwp-studio 분할

```
rhwp-studio/src/engine/
├── input-handler.ts (3,106줄) → 분할:
│   ├── input-handler.ts      ← 진입점 + 이벤트 바인딩
│   ├── keyboard-handler.ts   ← 키보드 이벤트
│   ├── mouse-handler.ts      ← 마우스 이벤트
│   ├── ime-handler.ts        ← IME 입력
│   └── object-handler.ts     ← 표/그림 객체 상호작용

rhwp-studio/src/ui/
├── para-shape-dialog.ts (1,496줄) → 분할:
│   ├── para-shape-dialog.ts  ← 대화상자 프레임 + 탭 전환
│   ├── para-indent-tab.ts    ← 들여쓰기/간격 탭
│   └── para-line-tab.ts      ← 줄간격/정렬 탭

rhwp-studio/src/
├── style.css (1,588줄) → 분할:
│   ├── style.css             ← 공통/레이아웃
│   ├── toolbar.css           ← 도구상자/서식도구모음
│   └── dialog.css            ← 대화상자 공통
```

---

## 4. 위험 관리

| 위험 | 영향도 | 대응 |
|------|--------|------|
| WASM API 호환성 깨짐 | 높음 | `#[wasm_bindgen]` 래퍼는 시그니처 변경 없이 유지 |
| 테스트 회귀 | 높음 | 모듈 이동 후 매번 `cargo test` 실행 |
| `pub(crate)` 가시성 문제 | 중간 | HwpDocument 필드를 `pub(crate)`로 설정 |
| 순환 의존성 | 중간 | 공통 헬퍼를 mod.rs에 배치 |
| TS import 경로 변경 | 낮음 | 파일 분할 후 import 일괄 수정 + `npx tsc --noEmit` 검증 |

---

## 5. 정량적 코드 품질 측정 체계 도입

### 5.1 도구 현황 및 도입 계획

| # | 도구 | 용도 | 설치 여부 | 도입 시점 |
|---|------|------|----------|----------|
| 1 | **Clippy** (v0.1.93) | 정적 분석 + 코드 스타일 | 설치됨 | 리팩토링 시작 전 — 경고 0 달성 + 룰셋 설정 |
| 2 | **rust-code-analysis-cli** (v0.0.25) | Cognitive Complexity 측정 | 미설치 → 설치 | 리팩토링 전/후 비교 — 거대 함수 분해 기준 |
| 3 | **cargo-modules** (v0.25.0) | 모듈 의존성 분석 | 미설치 → 설치 | 분할 전/후 Coupling 시각화 |
| 4 | **cargo-tarpaulin** (v0.35.2) | 라인 커버리지 | 미설치 → 설치 | 리팩토링 완료 후 기준선 측정 |
| 5 | **cargo-mutants** (v26.2.0) | 변이 테스트 | 미설치 | 후순위 — 별도 타스크 |

### 5.2 Clippy 경고 현황 및 목표

- **현재**: 경고 271개 (44개 카테고리), 설정 파일 없음
- **자동 수정 가능**: 128개 (`cargo clippy --fix`)
- **수동 수정 필요**: 143개
- **목표**: **경고 0개** + `Cargo.toml`에 `[lints.clippy]` 룰셋 설정

```toml
# Cargo.toml에 추가할 룰셋
[lints.clippy]
cognitive_complexity = "warn"
too_many_arguments = "warn"
too_many_lines = "warn"
large_enum_variant = "warn"
needless_pass_by_value = "warn"
```

### 5.3 Cognitive Complexity 기준

```
✅ 모든 함수: Cognitive Complexity ≤ 15
⚠️ 경고 임계: Cognitive Complexity > 10
🔴 블록 임계: Cognitive Complexity > 25 (새 코드에서 불허)
```

리팩토링 전 기준선 측정 → 리팩토링 후 재측정으로 **개선 효과를 정량적으로 검증**한다.

### 5.4 측정 결과 기록

리팩토링 전/후 메트릭을 `mydocs/report/task_142_metrics.md`에 기록:
- 파일별 줄 수 분포
- Clippy 경고 수
- Cognitive Complexity Top 20 함수
- 모듈 의존성 그래프
- (선택) 라인 커버리지

### 5.5 코드 품질 대시보드

관리자가 시각적으로 현황을 파악할 수 있는 HTML 대시보드를 구현한다.

**측정 스크립트** (`scripts/metrics.sh`):
- `cargo clippy` → Clippy 경고 수
- `rust-code-analysis-cli -m -p src/ -O json` → Cognitive Complexity
- `wc -l src/**/*.rs` → 파일별 줄 수
- `cargo test` → 테스트 통과/실패 수
- 결과를 `output/metrics.json`에 JSON으로 집계

**대시보드** (`output/dashboard.html`) — 정적 HTML + Chart.js:

| 패널 | 시각화 | 데이터 소스 |
|------|--------|------------|
| 파일 크기 분포 | 가로 막대 차트 (1,200줄 기준선 표시) | wc -l |
| Cognitive Complexity Top 20 | 가로 막대 (15/25 임계선) | rust-code-analysis |
| Clippy 경고 | 숫자 카드 (현재/목표) | cargo clippy |
| 테스트 현황 | 원형 차트 (통과/실패) | cargo test |
| 모듈 의존성 | 테이블 (Ce/Ca/Instability) | cargo-modules |
| 리팩토링 전/후 비교 | Before/After 쌍 차트 | 기록 데이터 |

**실행**:
```bash
./scripts/metrics.sh          # 측정 실행 → output/metrics.json
open output/dashboard.html    # 브라우저에서 대시보드 열기
```

외부 서버 불필요. Chart.js CDN으로 시각화하며, `output/`은 `.gitignore` 대상이므로 저장소에 포함되지 않는다.

---

## 6. 검증 계획

매 단계 완료 시:

```bash
# Rust
cargo test                    # 488개 테스트 전량 통과
cargo clippy                  # 경고 0
docker compose --env-file .env.docker run --rm wasm  # WASM 빌드

# TypeScript
npx tsc --noEmit              # 타입 검사
npx vite build                # 프론트엔드 빌드

# 정량 측정 (1단계 완료 후부터)
rust-code-analysis-cli -m -p src/ -O json  # Cognitive Complexity
cargo modules dependencies                  # 모듈 의존성
```

---

## 7. 구현 단계 (안)

| 단계 | 내용 | 예상 변경 파일 |
|------|------|---------------|
| 0단계 | 정량 측정 기준선 + Clippy 경고 0 달성 + 대시보드 구축 | Cargo.toml, 전체 소스, scripts/metrics.sh, output/dashboard.html |
| 1단계 | wasm_api.rs 구조체 분리 + 공통 헬퍼 이동 | wasm_api.rs, wasm_api/mod.rs |
| 2단계 | wasm_api.rs _native 메서드 역할별 이동 (10개 모듈) | wasm_api/*.rs |
| 3단계 | wasm_api.rs 테스트 분리 (8개 테스트 파일) | wasm_api/tests/*.rs |
| 4단계 | renderer/ 분할 (layout, pagination, composer, svg) | renderer/*.rs |
| 5단계 | 기타 Rust 파일 분할 (model, parser, serializer) | 8개 파일 |
| 6단계 | rhwp-studio TS/CSS 분할 + 최종 정량 측정 + 대시보드 Before/After 비교 | engine/*.ts, ui/*.ts, *.css |

> 구현 계획서에서 각 단계의 세부 사항을 확정합니다.
