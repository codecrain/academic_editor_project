# rhwp 리팩토링 후 남은 과제

> **기준**: 타스크 142 완료 후 (2026-02-22)  
> **선행 작업**: 1,200줄 상한 규칙 기반 6단계 파일 분할 리팩토링  
> **테스트**: 582개 전량 통과, Clippy 경고 0  

---

## 리팩토링 성과 요약

| 지표 | Before | After | 변화 |
|---|---|---|---|
| 최대 파일 크기 (비테스트/비자동생성) | 24,586줄 | 1,482줄 | 📉 94% |
| wasm_api.rs | 24,586줄 단일 | 1,839줄 + 12 모듈 | ✅ |
| layout.rs | 8,709줄 단일 | 1,128줄 + 10 모듈 | ✅ |
| pagination.rs | 2,265줄 | engine.rs(1,482) + tests.rs | ✅ |
| ShapeObject 패턴 매칭 | 61회 | 24회 | 📉 61% (`common()` 추가) |
| `common()` 메서드 활용 | 0 | 13회 | ✅ |
| 테스트 수 | 488개 | 582개 | 📈 +94개 |
| Clippy 경고 | 미측정 | 0 | ✅ |
| 종합 점수 (추정) | 5.4/10 | **~7.0/10** | +1.6 |

---

## 남은 과제

### P0 — Quick Win (각 1~2일, API 변경 없음)

#### 1. Lazy Pagination (CQRS Stage 1)

**현황**: `self.paginate()` **45회**, `raw_stream = None` **55회**가 각 모듈에 분산 반복.

| 모듈 | paginate() | raw_stream=None |
|---|---|---|
| `text_editing.rs` | 14 | 9 |
| `table_ops.rs` | 13 | 13 |
| `html_import.rs` | 5 | 2 |
| `object_ops.rs` | 4 | 6 |
| `clipboard.rs` | 4 | 2 |
| `rendering.rs` | 2 | 1 |
| `document.rs` | 2 | 0 |
| `formatting.rs` | 0 | 4 |
| `wasm_api.rs` (진입점) | 1 | 0 |
| **합계** | **45** | **55**(테스트 18 포함) |

**제안**: `mark_dirty()` + `ensure_paginated()` 도입.
- Command에서 `paginate()` 호출 제거 → `mark_dirty(section_idx)` 1줄로 통합
- Query 시점에 `ensure_paginated()` 지연 실행
- **효과**: AI Agent 일괄 편집 시 paginate N회 → 1회

**상세**: [CQRS 분석 문서](cqrs-analysis.md) Stage 1 참조.

---

#### 2. JSON 유틸리티 통합

**현황**: 수동 JSON 파싱 함수 `parse_u32()`, `parse_bool()` 등이 여전히 분산.

| 모듈 | 파싱 함수 사용 | `format!("{{` 사용 |
|---|---|---|
| `rendering.rs` | 13 | 4 |
| `table_ops.rs` | 8 | 9 |
| `text_editing.rs` | — | 10 |
| `cursor_rect.rs` | — | 4 |
| `clipboard.rs` | — | 3 |
| `object_ops.rs` | — | 2 |
| 기타 | — | 7 |
| **합계** | **21** | **39** |

**제안**:
- `helpers.rs`에 JSON 파싱/생성 유틸리티 통합
- 중기적으로 `serde_json` 도입 검토 (WASM 바이너리 크기 트레이드오프)
- 최소한 `format!("{{\"ok\":true}}")` 패턴을 매크로 or 헬퍼로 추출

---

#### 3. ShapeObject::common() 활용 범위 확대

**현황**: `common()` 메서드가 추가되어 13곳에서 사용 중이나, 여전히 8-variant 매칭이 **24회** 남아 있음.

| 위치 | 패턴 매칭 수 | `.common()` 사용 |
|---|---|---|
| `shape_layout.rs` | 21 | 2 |
| `table_cell_content.rs` | 3 | 0 |
| `layout.rs` (진입점) | 0 | 1 |
| 기타 layout 모듈 | 0 | 10 |

**제안**: `shape_layout.rs`의 21회 매칭 분석 → `common()` 외 도형별 속성 접근에는 별도 trait 메서드 (`fn shape_points()`, `fn fill_style()` 등) 추가 검토.

---

### P1 — 중기 개선 (3~5일)

#### 4. 거대 함수 분해

파일 분할은 완료되었으나, **함수 수준의 복잡도**는 아직 미해결:

| 함수 | 파일 | 현재 줄 수 | 목표 | 비고 |
|---|---|---|---|---|
| `build_render_tree()` | `layout.rs` | ~900줄 | ≤100줄 | 7~10개 하위 함수로 분해 |
| `paginate_with_measured()` | `pagination/engine.rs` | ~1,450줄 | ≤100줄 | 표 분할, 다단, 머리말 등 단계별 분리 |
| `layout_composed_paragraph()` | `paragraph_layout.rs` | ~400줄 | ≤100줄 | 텍스트 런, 인라인 요소, 정렬 분리 |
| `layout_table()` | `table_layout.rs` | ~1,191줄 | ≤200줄 | 열/행 계산, 셀 렌더링, 테두리 분리 |

**기준**: [코드 복잡도 권고](code-complexity-recommendations.md)의 Cognitive Complexity ≤ 15.

---

#### 5. Command/Query 파일 분리 (CQRS Stage 2)

현재 12개 wasm_api 모듈을 **Command/Query로 재분류**:

```
현재:                           CQRS 재분류:
wasm_api/                       wasm_api/
├── text_editing.rs             ├── commands/
├── table_ops.rs                │   ├── text_editing.rs    (C)
├── formatting.rs               │   ├── table_ops.rs       (C)
├── clipboard.rs                │   ├── formatting.rs      (C)
├── object_ops.rs               │   ├── clipboard.rs       (C)
├── html_import.rs              │   ├── object_ops.rs      (C)
├── html_table_import.rs        │   ├── html_import.rs     (C)
├── cursor_nav.rs               │   └── html_table_import.rs(C)
├── cursor_rect.rs              ├── queries/
├── rendering.rs                │   ├── cursor_nav.rs      (Q)
├── document.rs                 │   ├── cursor_rect.rs     (Q)
└── helpers.rs                  │   ├── rendering.rs       (Q)
                                │   └── document_info.rs   (Q)
                                ├── document.rs            (혼합→분리)
                                └── helpers.rs
```

**상세**: [CQRS 분석](cqrs-analysis.md) Stage 2 참조.

---

#### 6. 표 레이아웃 코드 통합

`table_layout.rs`(1,191줄)과 `table_partial.rs`(1,102줄)의 셀 레이아웃 로직에 유사 패턴이 여전히 존재. 공통 셀 렌더링 헬퍼 추출로 ~200줄 중복 제거 가능.

---

### P2 — 장기 개선 (1~3주)

#### 7. Hexagonal Architecture 적용

3개 배포 경로(WASM, PyO3, MCP)를 위한 Core/Adapter 분리:

```
Core Domain (순수 Rust)          Adapters (외부 바인딩)
┌─────────────────────┐         ┌─────────────────┐
│ HwpEngine            │ ◄────── │ WASM Adapter    │
│ ├── TextEditor       │         ├─────────────────┤
│ ├── TableEditor      │ ◄────── │ PyO3 Adapter    │
│ ├── Renderer         │         ├─────────────────┤
│ └── Serializer       │ ◄────── │ MCP Server      │
└─────────────────────┘         └─────────────────┘
```

**전제 조건**: P1-5(Command/Query 분리) 완료 후 착수.

---

#### 8. Parser/Serializer Trait 추상화

현재 `parser::parse_hwp()`, `serializer::serialize_hwp()`는 구체 함수. Trait으로 추상화하면:
- 테스트 시 모킹 가능
- 새로운 포맷(HWPX) 추가 시 OCP 준수
- DIP 점수 향상

---

#### 9. Event Sourcing + Batch Command (CQRS Stage 3)

MCP 서버의 Batch Tool 지원을 위한 Event 기반 아키텍처:
- Command → Event 발행 → Projection(paginate) 재구축
- 편집 이력(Undo/Redo) 자연스러운 구현
- 증분 페이지네이션 (변경된 섹션만 재계산)

**상세**: [CQRS 분석](cqrs-analysis.md) Stage 3 참조.

---

#### 10. 테스트 커버리지 확대

582개 테스트가 통과하지만, 다음 영역에 테스트가 부족:

| 영역 | 현재 | 필요 |
|---|---|---|
| 도형 레이아웃 (shape_layout) | ❌ | 기본 도형 + 그룹 + 회전 |
| 텍스트박스 콘텐츠 | ❌ | 오버플로우, 인라인 요소 |
| 각주 레이아웃 | ❌ | 페이지 하단 배치 |
| 다단 레이아웃 | ❌ | 2단/3단 배치, 단 구분선 |
| 캡션 레이아웃 | ❌ | 표 위/아래/좌/우 캡션 |
| 표 페이지 분할 | 최소 | 인트라-로우, 머리행 반복 |

**목표**: 라인 커버리지 ≥ 70% (현재 미측정, `cargo-tarpaulin`으로 측정 권장).

---

## 예상 점수 로드맵

| 단계 | 작업 | 종합 점수 |
|---|---|---|
| ✅ 현재 (타스크 142 완료) | 파일 분할 + common() + 테스트 94개 추가 | **~7.0/10** |
| P0 완료 | Lazy Pagination + JSON 통합 + common() 확대 | **~7.8/10** |
| P1 완료 | 거대 함수 분해 + CQRS 분리 + 표 통합 | **~8.5/10** |
| P2 완료 | Hexagonal + Trait 추상화 + Event Sourcing | **~9.2/10** |

---

## 참조 문서

| 문서 | 내용 |
|---|---|
| [2차 코드리뷰](r-code-review-2nd.md) | 종합 진단 및 Top 5 문제 |
| [CQRS 분석](cqrs-analysis.md) | Lazy Pagination ~ Event Sourcing 3단계 |
| [코드 복잡도 권고](code-complexity-recommendations.md) | Cognitive Complexity, Hexagonal, 변이 테스트 |
| [리팩토링 전략](code-refactoring-strategy.md) | 4Phase 전략 (P0~P2와 정렬) |
