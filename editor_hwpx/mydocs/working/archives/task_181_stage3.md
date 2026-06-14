# 타스크 181 — 3단계 완료 보고서: SVG 레이아웃 엔진 + 렌더링

## 목표
수식 AST를 SVG로 렌더링하고, 기존 레이아웃/페이지네이션/SVG 파이프라인에 통합

## 완료 내역

### 1. RenderNodeType::Equation 추가 (`src/renderer/render_tree.rs`)
- `EquationNode` 구조체: `svg_content` (SVG 조각 문자열), `color` (u32), `font_size` (f64)
- `RenderNodeType::Equation(EquationNode)` variant 추가

### 2. 수식 레이아웃 엔진 (`src/renderer/equation/layout.rs`)
- `LayoutBox` 구조체: x, y, width, height, baseline, kind
- `LayoutKind` enum: Row, Text, Number, Symbol, MathSymbol, Function, Fraction, Sqrt, Superscript, Subscript, SubSup, BigOp, Limit, Matrix, Paren, Decoration, FontStyle, Space, Newline, Empty
- `EqLayout` 구조체: AST → LayoutBox 변환
- 각 수식 요소별 레이아웃 계산:
  - `layout_fraction()`: 분수선 기준 분자/분모 수직 배치
  - `layout_sqrt()`: √ 기호 + 인덱스 + 본체
  - `layout_superscript/subscript/subsup()`: 첨자 위치/크기 계산
  - `layout_big_op()`: 큰 연산자(∫,∑,∏) + 위아래 첨자
  - `layout_limit()`: 극한(lim) + 아래첨자
  - `layout_matrix()`: 행렬 셀 배치 + 괄호 스타일
  - `layout_paren()`: 자동 크기 괄호
  - `layout_decoration()`: 장식(hat, bar, vec 등)
- 기준선 정렬 (Row 내 자식 노드들의 baseline 기준 수직 정렬)
- 비율 상수: SCRIPT_SCALE(0.7), BIG_OP_SCALE(1.5), FRAC_LINE_PAD(0.15) 등
- 단위 테스트: 4개 (simple_text, fraction, superscript, eq01_script)

### 3. 수식 SVG 렌더러 (`src/renderer/equation/svg_render.rs`)
- `render_equation_svg()`: LayoutBox → SVG 조각 문자열
- 재귀 렌더링: LayoutKind별 SVG 요소 생성
  - 텍스트: `<text>` (이탤릭/로만/볼드 스타일 반영)
  - 분수선: `<line>`
  - 괄호: `<path>` (2차 베지어 곡선)
  - 제곱근: `<path>` (V 모양 + 수평선)
  - 장식: `<path>`, `<circle>` (hat, tilde, dot, bar, vec 등)
- `draw_stretch_bracket()`: 늘림 괄호 렌더링 (6종: `()`, `[]`, `{}`, `|`)
- `draw_decoration()`: 15종 장식 기호 렌더링
- `escape_xml()`: XML 특수문자 이스케이프
- `eq_color_to_svg()`: HWP 색상(0x00BBGGRR) → SVG 색상(#rrggbb) 변환
- 단위 테스트: 4개 (simple_text, fraction, paren, eq01)

### 4. 파이프라인 통합

#### 4-1. 페이지네이션 (`src/renderer/pagination/engine.rs`)
- `Control::Equation(_)` → `PageItem::Shape` (기존 Shape/Picture와 동일 경로)

#### 4-2. 본문 레이아웃 (`src/renderer/layout.rs`)
- `Control::Equation(_)` 분기 추가 (바탕쪽 컨트롤 처리)

#### 4-3. 도형 레이아웃 (`src/renderer/layout/shape_layout.rs`)
- `layout_shape()`: Equation 컨트롤 전용 분기 (스크립트 → AST → Layout → SVG → EquationNode)
- 글상자(TextBox) 내부 수식 렌더링: 인라인/절대 위치 모두 지원
- 인라인 너비 계산에 수식 포함

#### 4-4. 표 레이아웃 (`src/renderer/layout/table_layout.rs`)
- 셀 높이 측정: `Control::Equation` 높이 반영
- 셀 내 수식 렌더링: 인라인(treat_as_char)/비인라인 모두 지원

#### 4-5. 분할 표 레이아웃 (`src/renderer/layout/table_partial.rs`)
- 분할 셀 내 수식 렌더링 지원

#### 4-6. 문단 컴포저 (`src/renderer/composer.rs`)
- treat_as_char 수식 인라인 너비 수집
- 인라인 컨트롤 식별: `Control::Equation` 포함

#### 4-7. 높이 측정 (`src/renderer/height_measurer.rs`)
- `measure_pictures_in_paragraph()`: 수식 높이 합산
- `has_picture` 검사: `Control::Equation` 포함

#### 4-8. SVG 렌더러 (`src/renderer/svg.rs`)
- `RenderNodeType::Equation`: `<g transform="translate(x,y)">` + SVG 조각 출력

## 테스트 결과

- **656개 통과** (기존 648 + 신규 8)
- cargo build: 성공
- eq-01.hwp SVG 내보내기 검증:
  - 3개 수식 모두 렌더링 확인
  - 수식 요소 정상 출력: 텍스트("평점", "입찰가격평가"), 기호(×), 분수선(`<line>`), 괄호(`<path>`)

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `src/renderer/equation/mod.rs` | `layout`, `svg_render` 모듈 추가 |
| `src/renderer/equation/layout.rs` | 수식 레이아웃 엔진 (신규) |
| `src/renderer/equation/svg_render.rs` | 수식 SVG 렌더러 (신규) |
| `src/renderer/render_tree.rs` | `EquationNode`, `RenderNodeType::Equation` 추가 |
| `src/renderer/svg.rs` | Equation 노드 렌더링 |
| `src/renderer/layout.rs` | `Control::Equation` 분기 |
| `src/renderer/layout/shape_layout.rs` | 수식 레이아웃 (본문 + 글상자) |
| `src/renderer/layout/table_layout.rs` | 수식 레이아웃 (표 셀) |
| `src/renderer/layout/table_partial.rs` | 수식 레이아웃 (분할 표) |
| `src/renderer/pagination/engine.rs` | 수식 페이지네이션 |
| `src/renderer/height_measurer.rs` | 수식 높이 측정 |
| `src/renderer/composer.rs` | 수식 인라인 컨트롤 처리 |
