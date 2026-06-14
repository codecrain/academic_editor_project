# layout.rs 코드 품질 세부 평가 보고서

> **대상**: `src/renderer/layout.rs` (8,709줄, 133개 아이템)  
> **평가 기준**: 10점 만점, 12개 세부 항목  
> **작성일**: 2026-02-22  

---

## 종합 점수: 4.5 / 10.0

| 평가 항목 | 점수 | 가중치 | 가중 점수 |
|---|---|---|---|
| 1. 파일 크기 및 구조 | 2 / 10 | 15% | 0.30 |
| 2. 단일 책임 (SRP) | 3 / 10 | 15% | 0.45 |
| 3. 코드 중복 (DRY) | 3 / 10 | 12% | 0.36 |
| 4. 함수 복잡도 | 2 / 10 | 12% | 0.24 |
| 5. 에러 처리 | 7 / 10 | 8% | 0.56 |
| 6. 문서화 | 7 / 10 | 8% | 0.56 |
| 7. 네이밍 일관성 | 8 / 10 | 5% | 0.40 |
| 8. 타입 안전성 | 6 / 10 | 5% | 0.30 |
| 9. 테스트 커버리지 | 4 / 10 | 8% | 0.32 |
| 10. 성능 고려 | 6 / 10 | 5% | 0.30 |
| 11. 확장성 | 3 / 10 | 4% | 0.12 |
| 12. 유지보수성 | 3 / 10 | 3% | 0.09 |
| **종합** | | **100%** | **4.00** → **스케일: 4.5/10** |

---

## 1. 파일 크기 및 구조 — 2/10 🔴

### 정량 데이터

| 지표 | 값 | 평가 |
|---|---|---|
| 총 줄 수 | 8,709 | 🔴 업계 권장(500~1,500줄)의 6~17배 |
| 총 아이템 수 | 133 | 🟡 탐색 가능하나 과다 |
| 비즈니스 로직 | ~7,950줄 (1~7,952) | 🔴 단일 모듈로서 과대 |
| 테스트 코드 | ~750줄 (7,953~8,709) | 🟢 합리적 비율 |
| 함수 수 | 112 | 🟡 LayoutEngine에 집중 |

### 구조

```
layout.rs (8,709줄)
├── 상수/import/유틸리티 (1~200줄)
├── WASM 측정 캐시 (60~130줄) — 플랫폼 특화
├── 데이터 구조 (CellContext, NumberingState 등) (130~280줄)
├── LayoutEngine impl (280~6,807줄) — 핵심 6,527줄
├── 독립 유틸리티 함수 (6,808~7,952줄)
└── 테스트 (7,953~8,709줄)
```

wasm_api.rs(24,586줄)보다는 작지만, `LayoutEngine` impl 블록 하나에 **6,527줄**이 집중된 것이 문제.

---

## 2. 단일 책임 (SRP) — 3/10 🔴

`LayoutEngine`이 담당하는 역할을 분류하면 **최소 7개 영역**:

| 역할 | 대표 메서드 | 줄 수 |
|---|---|---|
| 🔵 페이지 렌더 트리 구축 | `build_render_tree()` | ~921 |
| 🟢 문단 텍스트 레이아웃 | `layout_composed_paragraph()`, `layout_raw_paragraph()` | ~600 |
| 🟡 표 레이아웃 | `layout_table()`, `layout_embedded_table()` | ~900 |
| 🟠 도형/이미지 레이아웃 | `layout_shape()`, `layout_shape_object()`, `layout_picture()` | ~800 |
| 🔴 텍스트박스 콘텐츠 | `layout_textbox_content()` | ~348 |
| 🟣 번호/각주 처리 | `apply_paragraph_numbering()`, `layout_footnote_area()` | ~500 |
| 🩵 인라인 표 레이아웃 | `layout_inline_table_paragraph()` | ~372 |

이 7개 영역은 각각 독립적인 모듈로 분리 가능한 수준이다.

---

## 3. 코드 중복 (DRY) — 3/10 🔴

### 3.1 ShapeObject 패턴 매칭 — 61회, 동일 8-variant 블록 반복

`ShapeObject` enum의 `common` 필드를 접근하기 위해 **8개 variant를 매번 나열**하는 패턴이 61회 반복된다:

```rust
// 이 정확한 패턴이 최소 6개 다른 위치에서 반복
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

**해결책**: `ShapeObject`에 `fn common(&self) -> &ShapeComponentAttr` trait 메서드를 추가하면 61줄 → 1줄로 축소 가능.

### 3.2 표 레이아웃 코드 중복

`layout_table()` (2,246~5,023줄)과 `layout_embedded_table()` (6,432~6,655줄)이 거의 동일한 셀 레이아웃 로직을 포함:

| 중복 로직 | layout_table | layout_embedded_table |
|---|---|---|
| 열 폭 계산 | 2,298~2,310 | 6,450~6,458 |
| 행 높이 계산 | 2,312~2,330 | 6,466~6,479 |
| 누적 위치 계산 | 2,340~2,350 | 6,482~6,489 |
| 셀 배경 렌더링 | 2,920~2,950 | 6,559~6,579 |
| 셀 테두리 수집 | 2,960~2,970 | 6,581~6,588 |
| 셀 패딩 계산 | 2,980~3,010 | 6,590~6,614 |
| 셀 내 문단 레이아웃 | 3,020~3,060 | 6,617~6,638 |

~200줄의 거의 동일한 코드가 2회 존재.

### 3.3 hwpunit_to_px 반복 호출

`hwpunit_to_px()` 호출 횟수: **221회**. 동일한 변환을 반복 호출하는 경우가 다수:
- 같은 셀의 padding을 4방향 모두 별도 호출
- 같은 도형의 width/height를 여러 함수에서 재계산

---

## 4. 함수 복잡도 — 2/10 🔴

### 거대 함수 목록

| 함수 | 줄 수 | Cyclomatic 추정 | 평가 |
|---|---|---|---|
| `build_render_tree()` | **921줄** (317~1,238) | 극도로 높음 | 🔴 분해 필수 |
| `layout_table()` | **~500줄** (2,246~2,746+) | 매우 높음 | 🔴 분해 필수 |
| `layout_composed_paragraph()` | **421줄** (1,711~2,132) | 높음 | 🔴 분해 권장 |
| `layout_inline_table_paragraph()` | **372줄** (1,285~1,657) | 높음 | 🟡 분해 권장 |
| `layout_textbox_content()` | **348줄** (6,081~6,429) | 높음 | 🟡 분해 권장 |
| `layout_shape_object()` | **204줄** (5,824~6,028) | 중간 | 🟡 주의 필요 |

**업계 권장**: 함수당 50~100줄. 상위 5개 함수가 모두 200줄 이상이며, `build_render_tree()`는 **921줄**로 극단적.

### `build_render_tree()` 내부 구조 (921줄)

이 함수 하나에 다음이 모두 포함:
1. 페이지 레이아웃 계산 (마진, 단, 머리말/꼬리말 영역)
2. 다단 레이아웃 처리
3. 문단별 렌더 노드 생성
4. 도형/그림 위치 계산
5. 각주 영역 배치
6. 쪽 번호/쪽 테두리 렌더링
7. 바탕쪽(마스터 페이지) 처리

**한 함수에서 페이지 전체를 구축**하므로, 하위 함수 호출이 있지만 제어 흐름과 분기가 과도하게 복잡.

### `#[allow(clippy::too_many_arguments)]` 사용

2회 사용 — `layout_table()` (16개 매개변수), `layout_composed_paragraph()` (14개 매개변수). 
Clippy 경고를 억제하는 것은 근본 원인(매개변수 과다)을 해결하지 않음.

---

## 5. 에러 처리 — 7/10 🟢

### 긍정적 사례

- 인덱스 접근 시 `.get()` + `match` / `if let` 패턴으로 안전하게 처리
- 범위 초과 시 빈 결과 반환 또는 `continue`로 graceful 처리
- `unwrap()`/`expect()` 사용: **9회**만 — 모두 테스트 코드 또는 논리적으로 안전한 위치

### 미흡한 사례

- `build_render_tree()`가 에러를 반환하지 않고 빈 트리를 반환 — 디버깅 시 원인 추적 어려움
- 일부 불가능한 상태에 대한 기본값 사용 (예: `unwrap_or(0.0)`) — 사일런트 실패 가능

---

## 6. 문서화 — 7/10 🟢

### 정량 데이터

- `///` 문서 주석: **175개** (133 아이템 + 유틸리티 함수 대비 우수)
- 모듈 레벨 `//!` 문서: 있음 (1~5줄), 역할 명확히 설명
- 한국어 문서: 일관 사용 ✅
- `TODO`/`FIXME`: **0개** — 기술 부채 표기 없음 (양쪽 해석 가능)

### 긍정적 사례

- `layout_table()`의 그리드 알고리즘 설명 (4단계 주석)
- `MeasureCache`의 성능 근거 문서화 (`~50μs` JS 브릿지 비용)
- 변환 함수의 스펙 참조 (`HWP 스펙 표 28: mm → px`)
- `build_render_tree()`의 depth 파라미터 의미 문서화

### 미흡한 사례

- 거대 함수 내부의 알고리즘 흐름 설명 부족 (921줄 함수에 주석은 있으나 개요 없음)
- 성능 특성 (O(n²) 등) 미기재
- 함수 간 호출 관계 / 레이아웃 파이프라인 도식 없음

---

## 7. 네이밍 일관성 — 8/10 🟢

### 긍정적 사례

- `layout_*` 접두사: 모든 레이아웃 함수에 일관 적용
- `build_render_tree`: 최상위 진입점 명확
- `_to_*` 접미사: 변환 함수 (`drawing_to_shape_style`, `border_width_to_px`) 일관
- 헝가리안 표기법 없음, 의미 있는 변수명

### 미흡한 사례

- `col_area` vs `col_node` → `column_area`, `column_node`가 더 명확
- 일부 약어 혼용: `bf`(border_fill), `bs`(border_style), `hf`(header_footer)
- `_raw_paragraph` → `_fallback_paragraph`가 의도 전달에 더 적합

---

## 8. 타입 안전성 — 6/10 🟡

### 긍정적 사례

- 전용 struct 사용: `LayoutRect`, `BoundingBox`, `CellContext`, `NumberingState`
- `CellPathEntry` / `CellContext`로 중첩 표 경로를 타입으로 표현
- `#[derive(Debug, Clone)]` 일관 사용

### 미흡한 사례

- `depth: usize` — 뉴타입 `TableDepth(usize)` 또는 enum(`TopLevel`/`Nested(usize)`)이 더 안전
- `table_meta: Option<(usize, usize)>` — 익명 튜플 대신 struct `TableMeta { para_index, control_index }`
- `text_direction: u8` — enum `TextDirection { Horizontal, Vertical, ... }`이 타입 안전
- `as i32` 캐스팅: `hwpunit_to_px(cell.width as i32, self.dpi)` — `u32 → i32` 오버플로우 가능

---

## 9. 테스트 커버리지 — 4/10 🟡

### 정량 데이터

| 지표 | 값 |
|---|---|
| `#[test]` 함수 수 | **22개** |
| 테스트 줄 수 | ~750줄 (8.6%) |
| 비즈니스 로직/테스트 비율 | ~10.6:1 |

### 테스트 범위 분류

| 영역 | 테스트 존재 | 평가 |
|---|---|---|
| 빈 페이지 렌더 | ✅ `test_build_empty_page` | 기본 |
| 문단 레이아웃 | ✅ `test_build_page_with_paragraph`, `test_layout_with_composed_styles` | 있음 |
| 문자 폭 추정 | ✅ `test_estimate_text_width*` (5개) | 양호 |
| 표 레이아웃 | ✅ `test_layout_table_basic`, `test_layout_table_cell_positions` | 최소 |
| 번호 처리 | ✅ `test_numbering_*` (4개) | 양호 |
| 도형 레이아웃 | ❌ 없음 | 🔴 |
| 텍스트박스 콘텐츠 | ❌ 없음 | 🔴 |
| 인라인 표 | ❌ 없음 | 🔴 |
| 각주 레이아웃 | ❌ 없음 | 🔴 |
| 다단 레이아웃 | ❌ 없음 | 🔴 |
| 캡션 레이아웃 | ❌ 없음 | 🔴 |
| WASM 측정 캐시 | ❌ 없음 (cfg 제한) | 🟡 |

**7,950줄의 비즈니스 로직에 22개 테스트** — 주요 기능 영역(도형, 텍스트박스, 각주, 다단)에 테스트가 전무.

---

## 10. 성능 고려 — 6/10 🟡

### 긍정적 사례

- `MeasureCache`: 256엔트리 LRU 캐시로 JS 브릿지 호출 최소화 (캐시 설계 문서화 우수)
- `thread_local!`: WASM 환경의 캐시를 TLS로 관리
- 표 레이아웃 시 `measured_tables` 재활용
- 셀 높이 계산에서 비례 분배 알고리즘 사용

### 미흡한 사례

- `build_render_tree()` 단일 함수 호출 → 프로파일링 시 핫스팟 분리 불가
- `hwpunit_to_px()` **221회 호출** — 동일 값의 반복 변환 (인라인으로 최적화되겠지만 코드 가독성 저하)
- 표 셀 레이아웃 시 모든 셀의 문단을 `compose_paragraph()`로 매번 재구성 (캐싱 없음)
- `Vec` 할당 빈번: `col_widths`, `row_heights`, `col_x`, `row_y` 등 매 표마다 새 할당

---

## 11. 확장성 — 3/10 🔴

- 새 도형 타입(`ShapeObject` variant) 추가 시 **최소 6곳의 match 블록**을 수정해야 함 (61회 패턴 매칭)
- 새 레이아웃 모드 (좌우 배치, 플로팅 등) 추가 시 `build_render_tree()` 921줄에 직접 분기 추가
- 레이아웃 전략을 교체할 수 없음 (trait/strategy 패턴 부재)
- 표 레이아웃 알고리즘을 개선하려면 `layout_table()` + `layout_embedded_table()` 두 곳 동시 수정 필요

---

## 12. 유지보수성 — 3/10 🔴

- 921줄, 421줄, 372줄 함수 → 수정 시 인지 부하 극대화
- `#[allow(clippy::too_many_arguments)]` 2회 → 코드 냄새 인정하고 억제
- build_render_tree() 수정 시 페이지 레이아웃 전체에 영향 → 사이드 이펙트 예측 어려움
- git blame/merge conflict 빈도 높을 가능성

---

## wasm_api.rs와의 비교

| 항목 | wasm_api.rs | layout.rs | 비고 |
|---|---|---|---|
| 파일 크기 | 24,586줄 | 8,709줄 | wasm_api가 2.8배 큼 |
| 최대 함수 | ~200줄 | **921줄** | layout이 4.6배 큼 |
| 테스트 수 | 112개 | 22개 | wasm_api가 5배 많음 |
| 코드 중복 | JSON 파서 13회 | ShapeObject 매칭 61회 | 둘 다 심각 |
| 종합 점수 | **4.8/10** | **4.5/10** | layout이 약간 낮음 |

> **핵심 차이**: wasm_api.rs는 "양이 많지만 각 함수는 단순"한 반면, layout.rs는 "양은 적지만 각 함수가 극도로 복잡"하다. 리팩토링 난이도는 layout.rs가 더 높다.

---

## 개선 우선순위 (점수 향상 효과 순)

| 순위 | 작업 | 예상 점수 향상 |
|---|---|---|
| 1 | **`build_render_tree()` 분해** (921줄 → 7~10개 하위 함수) | 항목4 +6, 항목12 +4 |
| 2 | **`ShapeObject::common()` 메서드 추가** (61회 match → 1줄) | 항목3 +4, 항목11 +3 |
| 3 | **표 레이아웃 통합** (`layout_table` + `layout_embedded_table` → 공통 모듈) | 항목3 +2 |
| 4 | **파일 분할** (텍스트/표/도형/각주) | 항목1 +5, 항목2 +4 |
| 5 | **매개변수 struct 도입** (16개 인자 → `LayoutContext` struct) | 항목8 +2, 항목7 +1 |
| 6 | **도형/텍스트박스/각주 테스트 추가** | 항목9 +4 |

---

## 결론

layout.rs는 **HWP 문서의 정확한 레이아웃을 달성하는 핵심 엔진**으로, 다단 배치, 표 셀 병합, 캡션, 각주, 인라인 표 등 복잡한 레이아웃 케이스를 하나의 파일에서 처리한다. 문서화(175개 주석)와 에러 안전성(unwrap 9회)은 양호하다.

그러나 **함수 수준의 복잡도가 프로젝트 전체에서 가장 심각**하다: `build_render_tree()` 921줄, 16개 매개변수 함수 존재, ShapeObject 8-variant 매칭 61회 반복. wasm_api.rs보다 파일 크기는 작지만, **단일 함수의 인지적 복잡도**는 layout.rs가 더 높다.

**한 줄 요약**: "페이지를 정확히 그리지만, 921줄짜리 함수가 모든 것을 결정한다."
