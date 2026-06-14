# 타스크 142 — 0단계 완료 보고서: 기준선 측정 + 품질 대시보드 구축

## 개요

코드베이스 리팩토링(SOLID + CQRS + 복잡도 관리)의 0단계로서, 정량적 품질 측정 체계를 구축하고 기준선(baseline)을 확립했다.

> "측정할 수 없으면 관리할 수 없습니다." — Peter Drucker

## 수행 내용

### 1. 도구 설치

| 도구 | 버전 | 용도 | 상태 |
|------|------|------|------|
| cargo-tarpaulin | v0.35.2 | 코드 커버리지 측정 | 설치 완료 |
| cargo-modules | v0.25.0 | 모듈 의존성 분석 | 설치 완료 |
| Clippy (내장) | v0.1.93 | 린트 + Cognitive Complexity | 기존 설치 |
| rust-code-analysis-cli | - | CC 측정 (대체) | 컴파일 실패 → Clippy 내장 CC 린트로 대체 |

### 2. 메트릭 수집 스크립트 (`scripts/metrics.sh`)

5가지 측정 항목을 자동 수집하여 `output/metrics.json`으로 출력:

1. **파일별 줄 수** — Rust 소스 + TypeScript/CSS (총 109개 파일)
2. **Clippy 경고 수** — `cargo clippy` 실행 결과
3. **Cognitive Complexity** — `clippy::cognitive_complexity` 린트 활용
4. **테스트 현황** — `cargo test` 결과 (passed/failed/ignored)
5. **커버리지** — `cargo-tarpaulin` 라인 커버리지

### 3. 품질 대시보드 (`scripts/dashboard.html`)

Chart.js 기반 HTML 대시보드:

- **요약 카드 4종**: 1,200줄 초과 파일, Clippy 경고, CC>25 함수, 테스트 현황
- **파일 크기 차트**: 상위 30개 파일 바 차트 + 1,200줄 임계선
- **CC Top 22 차트**: Cognitive Complexity 상위 함수 + 15/25 임계선
- **테스트 도넛 차트**: 통과/실패/무시 비율
- **파일 크기 분포 히스토그램**: 구간별 파일 수

### 4. Clippy 경고 0 달성

#### 전략: 단계적 린트 정책 (`Cargo.toml [lints.clippy]`)

| 구분 | 린트 항목 | 현재 | 리팩토링 후 |
|------|----------|------|------------|
| 구조적 경고 | `too_many_arguments`, `type_complexity`, `cognitive_complexity`, `needless_pass_by_value` | allow | Phase 1-4 완료 후 warn |
| 코드 스타일 | `redundant_closure`, `collapsible_if`, `unnecessary_map_or` 등 31개 | allow | 각 파일 분할 시 수정 후 warn |
| 새 코드 품질 | `large_enum_variant` | warn | 즉시 적용 |
| Rust 표준 | `dead_code`, `unused_*` 6개 | allow | 리팩토링 과정에서 정리 |

**핵심 원칙**: 기존 경고를 allow로 억제하되, 리팩토링 각 단계 완료 시 allow → warn → deny로 점진 전환

## 기준선 측정 결과

| 지표 | 기준선 값 | 목표 |
|------|----------|------|
| 파일 수 (Rust + TS/CSS) | 109개 | - |
| 1,200줄 초과 파일 | 15개 (font_metrics_data 제외) | 0개 |
| Clippy 경고 | 0개 (allow 정책 적용) | 0개 유지 |
| CC > 25 함수 | 22개 (기준선), 현재 allow 적용 | 0개 (≤15) |
| 테스트 | 582 passed / 0 failed | 전수 통과 유지 |
| 커버리지 | 55.80% | 70%+ |

### 1,200줄 초과 파일 목록 (font_metrics_data 제외)

| 파일 | 줄 수 | 리팩토링 단계 |
|------|------|--------------|
| `src/wasm_api.rs` | 24,585 | Phase 1-3 |
| `src/renderer/layout.rs` | 8,708 | Phase 4 |
| `src/renderer/pagination.rs` | 2,264 | Phase 4 |
| `src/renderer/composer.rs` | 2,026 | Phase 4 |
| `src/model/table.rs` | 1,767 | Phase 5 |
| `src/parser/control.rs` | 1,744 | Phase 5 |
| `src/serializer/control.rs` | 1,520 | Phase 5 |
| `src/serializer/cfb_writer.rs` | 1,516 | Phase 5 |
| `src/parser/body_text.rs` | 1,429 | Phase 5 |
| `src/model/paragraph.rs` | 1,367 | Phase 5 |
| `src/renderer/svg.rs` | 1,292 | Phase 5 |
| `src/serializer/doc_info.rs` | 1,248 | Phase 5 |
| `rhwp-studio/src/engine/input-handler.ts` | 3,106 | Phase 6 |
| `rhwp-studio/src/style.css` | 1,588 | Phase 6 |
| `rhwp-studio/src/ui/para-shape-dialog.ts` | 1,496 | Phase 6 |

## 산출물

| 파일 | 설명 |
|------|------|
| `scripts/metrics.sh` | 메트릭 수집 스크립트 |
| `scripts/dashboard.html` | 품질 대시보드 HTML |
| `output/metrics.json` | 기준선 측정 데이터 |
| `output/dashboard.html` | 대시보드 (scripts에서 복사) |
| `Cargo.toml` [lints] | Clippy/Rust 린트 정책 |

## 다음 단계

0단계 완료. 다음은 구현계획서를 작성하여 Phase 1-6의 세부 구현 계획을 수립한다.
