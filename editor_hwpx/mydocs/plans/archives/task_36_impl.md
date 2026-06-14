# 타스크 36: 표 테두리 처리 고도화 - 구현 계획서

## 현재 렌더링 파이프라인 분석

```
HWP Parser                   Style Resolver              Layout Engine              SVG Renderer
─────────────               ────────────────            ──────────────             ─────────────
BorderFill {                ResolvedBorderStyle {       ShapeStyle {               <rect fill="#color"/>
  borders: [4],               borders: [4],              fill_color: Option,       (no <defs>)
  fill: Fill {                fill_color: Option,         stroke_color,            (no <linearGradient>)
    fill_type,              }                             ...
    solid,                  ↑ gradient LOST              }
    gradient, ←─파싱됨       (line 518: _ => None)       ↑ gradient 전달 불가
    image,
  }
}
```

**핵심 문제**: 4개 레이어 모두 그라데이션을 지원하지 않음

## 단계별 구현 계획

### 1단계: 그라데이션 채우기 렌더링 (P0)

k-water-rfp.hwp 1페이지 표의 상단/하단 장식 셀 배경이 투명하게 렌더링되는 문제를 해결한다.

#### 1-1. 데이터 모델 확장

**`src/renderer/mod.rs`** — `ShapeStyle` 구조체 확장
```rust
pub struct ShapeStyle {
    pub fill_color: Option<ColorRef>,
    pub gradient: Option<GradientFillInfo>,  // 추가
    pub stroke_color: Option<ColorRef>,
    pub stroke_width: f64,
    pub stroke_dash: StrokeDash,
    pub opacity: f64,
}

/// 그라데이션 채우기 렌더링 정보
#[derive(Debug, Clone)]
pub struct GradientFillInfo {
    pub gradient_type: i16,      // 1:Linear, 2:Radial, 3:Conical, 4:Square
    pub angle: i16,              // 기울임 (도)
    pub center_x: i16,          // 가로 중심 (%)
    pub center_y: i16,          // 세로 중심 (%)
    pub colors: Vec<ColorRef>,   // 색상 목록
    pub positions: Vec<f64>,     // 정규화된 위치 (0.0~1.0)
}
```

**`src/renderer/style_resolver.rs`** — `ResolvedBorderStyle` 확장
```rust
pub struct ResolvedBorderStyle {
    pub borders: [BorderLine; 4],
    pub fill_color: Option<ColorRef>,
    pub gradient: Option<GradientFillInfo>,  // 추가
}
```

#### 1-2. 스타일 해소 (resolve) 로직 수정

**`src/renderer/style_resolver.rs`** — `resolve_single_border_style()` 수정
- `FillType::Gradient` 케이스에서 `GradientFill` → `GradientFillInfo`로 변환
- positions의 정규화 (HWP의 0~100 → 0.0~1.0)

#### 1-3. 레이아웃 엔진 수정

**`src/renderer/layout.rs`** — 셀 배경 렌더링 (line 1161~1179)
- `border_style.gradient`가 있으면 `ShapeStyle.gradient`에 전달
- gradient가 있으면 fill_color 대신 gradient 사용

**`src/renderer/layout.rs`** — `drawing_to_shape_style()` (line 4092)
- 그리기 개체의 gradient도 동일하게 처리

#### 1-4. SVG 렌더러 확장

**`src/renderer/svg.rs`**
- `SvgRenderer`에 `defs: Vec<String>`, `gradient_counter: u32` 필드 추가
- `begin_page()` 후 `<defs>` 섹션 삽입 구조 마련
- `render_tree()` 시 1패스: 트리 순회하며 gradient 정의 수집 → 2패스: 렌더링
  - 또는 단순 접근: gradient가 있는 rect 렌더링 시 즉시 `<defs>`에 추가하고 `fill="url(#gradN)"`로 참조
- `draw_rect()` 확장: `ShapeStyle.gradient`가 있으면:
  - `<linearGradient>` 또는 `<radialGradient>` 정의 생성
  - angle → SVG 좌표계 변환 (x1,y1,x2,y2)
  - 각 color stop → `<stop offset="N%" stop-color="#RGB"/>`
  - `<rect fill="url(#gradN)"/>` 출력

**SVG 그라데이션 출력 예시:**
```xml
<defs>
  <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#d6e6fe"/>
    <stop offset="100%" stop-color="#000080"/>
  </linearGradient>
</defs>
<rect x="10" y="20" width="500" height="11" fill="url(#grad1)"/>
```

#### 1-5. 테스트 및 검증

- `resolve_single_border_style` 단위 테스트 (gradient 케이스)
- SVG 렌더러 gradient 출력 테스트
- `docker compose run --rm dev cargo run --release -- export-svg samples/k-water-rfp.hwp --page 0`로 결과 확인

#### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/mod.rs` | `GradientFillInfo` 구조체 추가, `ShapeStyle` 확장 |
| `src/renderer/style_resolver.rs` | `ResolvedBorderStyle` 확장, gradient 해소 로직 |
| `src/renderer/layout.rs` | 셀 배경 gradient 전달, `drawing_to_shape_style()` 수정 |
| `src/renderer/svg.rs` | `<defs>`, `<linearGradient>` 생성, `draw_rect()` 확장 |
| `src/renderer/render_tree.rs` | 변경 없음 (ShapeStyle이 이미 포함) |

---

### 2단계: 인접 셀 테두리 중복 제거 (P1)

현재 각 셀이 독립적으로 4방향 테두리를 모두 그리며, 인접 셀 경계에서 테두리가 2회 렌더링된다.

#### 2-1. 엣지 기반 테두리 수집

**`src/renderer/layout.rs`** — `layout_table()` 내부

표의 모든 수평/수직 엣지를 수집하는 구조:

```rust
struct TableEdge {
    x1: f64, y1: f64, x2: f64, y2: f64,
    border: BorderLine,
}
```

- 수평 엣지: 각 행의 상단/하단 경계 (row_count + 1개의 수평선)
- 수직 엣지: 각 열의 좌측/우측 경계 (col_count + 1개의 수직선)

#### 2-2. 인접 셀 테두리 병합 규칙

같은 위치의 두 테두리 중 하나를 선택하는 우선순위:
1. 선 종류가 있는 것 > 없는 것 (None)
2. 굵은 선 > 가는 선
3. 이중선/삼중선 > 단일선
4. 셀 내부 테두리 < 셀 외부 테두리 (테두리 충돌 시)

#### 2-3. 셀 개별 테두리 → 엣지 렌더링 전환

- 기존: 각 cell_node에 4방향 Line 추가 (line 1330~1350)
- 변경: 모든 셀 처리 후, 수집된 엣지 목록을 순회하며 한 번씩만 렌더링
- 엣지 노드는 `table_node`의 자식으로 추가 (셀 위에 그려짐)

#### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | 엣지 수집 로직, 테두리 병합 규칙, 엣지 기반 렌더링 |

---

### 3단계: 테두리 꼭짓점 처리 및 페이지 분할 경계선 (P2, P3)

#### 3-1. 꼭짓점(Corner) 처리

교차하는 수평/수직 테두리의 교차점에서:
- 같은 굵기: 자연스러운 교차 (기존 유지)
- 다른 굵기: 굵은 선이 가는 선 위로 (z-order 조정)
- 이중선 교차: 내부선/외부선 별도 처리

#### 3-2. 페이지 분할 시 경계선

**`src/renderer/layout.rs`** — `layout_partial_table()` 수정
- 분할된 표의 상단/하단에 `table.border_fill_id`의 테두리 스타일 적용
- 첫 페이지: 원래 상단 테두리 + 하단에 표 외곽 테두리
- 마지막 페이지: 상단에 표 외곽 테두리 + 원래 하단 테두리
- 중간 페이지: 상/하단 모두 표 외곽 테두리

#### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | 꼭짓점 z-order, `layout_partial_table()` 경계선 |

---

### 4단계: 대각선 테두리 렌더링 (P4)

#### 4-1. DiagonalLine → SVG Line 변환

**`src/renderer/layout.rs`**
- `DiagonalLine` 구조체의 `diagonal_type`, `width`, `color` 활용
- 셀 영역 내 대각선 좌표 계산:
  - Slash(0): 좌하→우상 (x1,y1+h) → (x1+w,y1)
  - BackSlash(1): 좌상→우하 (x1,y1) → (x1+w,y1+h)
  - Crooked(2): 양방향 모두
- `create_border_line_nodes()`와 동일한 스타일 적용

#### 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/renderer/layout.rs` | 대각선 렌더링 노드 생성 |
| `src/renderer/style_resolver.rs` | `ResolvedBorderStyle`에 diagonal 전달 (필요 시) |

---

## 의존 관계

```
1단계 (그라데이션) ──→ 독립 수행 가능
2단계 (테두리 중복) ──→ 독립 수행 가능 (1단계와 병렬 가능하나 순차 진행)
3단계 (꼭짓점/분할) ──→ 2단계에 의존 (엣지 기반 구조 필요)
4단계 (대각선) ──→ 독립 수행 가능
```

## 위험 요소

| 위험 | 대응 |
|------|------|
| SVG `<defs>` 삽입 시 기존 출력 구조 변경 | 렌더링 순서 주의 (defs → 본문 요소) |
| 각도 변환 오류 (HWP 각도 → SVG 좌표) | k-water-rfp.hwp의 실제 각도값으로 검증 |
| 엣지 기반 전환 시 기존 테스트 깨짐 | 기존 단일 문서 출력 비교 테스트 |
| Canvas/HTML 백엔드 호환성 | 현재는 SVG만 대상, Canvas는 후속 대응 |

## 검증 기준

- k-water-rfp.hwp 1페이지: 상단/하단 파란색 그라데이션 바 렌더링 확인
- 기존 테스트 (`docker compose run --rm test`) 전체 통과
- 다른 샘플 문서 회귀 테스트 (기존 SVG 출력 비교)
