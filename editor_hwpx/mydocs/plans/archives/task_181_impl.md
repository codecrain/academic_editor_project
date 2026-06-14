# 타스크 181: 한컴 수식 렌더링 기능 구현 — 구현 계획서

## 1단계: 모델 + 바이너리/HWPX 파서

### 목표
수식 스크립트 문자열을 HWP/HWPX 양쪽에서 추출하여 `Control::Equation`에 저장

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/model/control.rs` | `Equation` 구조체 정의, `Control::Equation(Box<Equation>)` variant 추가 |
| `src/parser/control.rs` | `CTRL_EQUATION` 분기 추가 → `parse_equation_control()` |
| `src/parser/hwpx/section.rs` | `parse_equation()` 수정: `<hp:script>` 요소에서 스크립트 추출 |
| `src/serializer/control.rs` | `Control::Equation` 직렬화 처리 (라운드트립) |

### 모델 정의

```rust
// src/model/control.rs
pub struct Equation {
    pub common: CommonObjAttr,           // 위치, 크기, 배치 속성
    pub script: String,                  // 수식 스크립트 ("1 over 2" 등)
    pub font_size: u32,                  // 글자 크기 (HWPUNIT)
    pub color: u32,                      // 글자 색 (0x00BBGGRR)
    pub baseline: i16,                   // 기준선 오프셋
    pub font_name: String,              // 수식 글꼴명
    pub raw_ctrl_data: Vec<u8>,         // 라운드트립용 원본 데이터
}
```

### 바이너리 파싱 (HWPTAG_EQEDIT 레코드)

```
CTRL_HEADER (eqed)
  ├── ctrl_data: CommonObjAttr (위치/크기)
  └── HWPTAG_EQEDIT (child record)
      ├── attr: u32 (4바이트)
      ├── script_len: u16 (2바이트)
      ├── script: WCHAR[script_len] (UTF-16LE)
      ├── font_size: u32 (4바이트)
      ├── color: u32 (4바이트)
      ├── baseline: i16 (2바이트)
      ├── version_info: WCHAR 문자열
      └── font_name: WCHAR 문자열
```

### 검증
- cargo test 통과
- 수식 포함 HWP 파일 로드 시 `Control::Equation` 생성 확인
- `eprintln!`으로 추출된 스크립트 출력 검증

---

## 2단계: 수식 토크나이저 + 기호 매핑 + AST 파서

### 목표
수식 스크립트 문자열을 토큰화하고 AST(추상 구문 트리)로 변환

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/equation/mod.rs` | 모듈 선언 |
| `src/renderer/equation/tokenizer.rs` | 토크나이저 (Python tokenizer.py 포팅) |
| `src/renderer/equation/symbols.rs` | 명령어 → Unicode 매핑 (Python symbols.py 포팅) |
| `src/renderer/equation/ast.rs` | EqNode enum + EqRow 정의 |
| `src/renderer/equation/parser.rs` | 재귀 하강 파서 (Python latex.py 참조) |
| `src/renderer/mod.rs` | `pub mod equation;` 추가 |

### 토큰 타입

```rust
enum TokenType {
    Command,      // OVER, SQRT, alpha 등
    Number,       // 123, 3.14
    Symbol,       // +, -, =, <, > 등
    Text,         // 한글/기타 문자
    LBrace, RBrace, LParen, RParen, LBracket, RBracket,
    Subscript,    // _
    Superscript,  // ^
    Whitespace,   // ~, `, #, &
    Eof,
}
```

### AST 노드 (핵심)

```rust
enum EqNode {
    Row(Vec<EqNode>),                              // 수평 나열
    Text(String),                                   // 일반 텍스트
    Number(String),                                 // 숫자
    Symbol(char),                                   // 단일 기호
    MathSymbol(String),                             // 유니코드 수학 기호
    Fraction { numer: Box<EqNode>, denom: Box<EqNode> },
    Sqrt { index: Option<Box<EqNode>>, body: Box<EqNode> },
    Superscript { base: Box<EqNode>, sup: Box<EqNode> },
    Subscript { base: Box<EqNode>, sub: Box<EqNode> },
    SubSup { base: Box<EqNode>, sub: Box<EqNode>, sup: Box<EqNode> },
    BigOp { symbol: String, sub: Option<Box<EqNode>>, sup: Option<Box<EqNode>> },
    Limit { sub: Option<Box<EqNode>> },
    Matrix { rows: Vec<Vec<EqNode>>, style: MatrixStyle },
    Cases { rows: Vec<EqNode> },
    Paren { left: String, right: String, body: Box<EqNode> },
    Decoration { kind: DecoKind, body: Box<EqNode> },
    FontStyle { style: FontStyleKind, body: Box<EqNode> },
    Space(SpaceKind),
    Newline,
    Group(Vec<EqNode>),
}
```

### 파서 구조

재귀 하강 파서:
- `parse_expression()` → `EqNode::Row`
- `parse_element()` → 개별 노드
- `parse_command()` → 명령어별 분기 (OVER, SQRT, MATRIX 등)
- `parse_group()` → `{}` 그룹
- `parse_subscript_superscript()` → 첨자 처리

OVER 분수 처리: 최상위/그룹 레벨에서 OVER 토큰 발견 시, 앞쪽을 분자, 뒤쪽을 분모로 분할.

### 검증
- 단위 테스트: 토크나이저 (10+ 케이스), 파서 (10+ 케이스)
- 스크립트 예: `"1 over 2"`, `"E=mc^2"`, `"sum_{i=0}^n"`, `"matrix{a & b # c & d}"`

---

## 3단계: SVG 레이아웃 엔진 + 렌더링

### 목표
AST를 크기·위치가 결정된 레이아웃 박스 트리로 변환하고, SVG 요소로 출력

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/equation/layout.rs` | 레이아웃 엔진 (AST → LayoutBox) |
| `src/renderer/equation/svg_render.rs` | SVG 요소 생성 (LayoutBox → SVG 문자열) |
| `src/renderer/render_tree.rs` | `RenderNodeType::Equation` variant 추가 |
| `src/renderer/layout.rs` | `Control::Equation` 레이아웃 처리 |
| `src/renderer/layout/shape_layout.rs` | 수식 컨트롤 레이아웃 분기 |
| `src/renderer/svg.rs` | `RenderNodeType::Equation` SVG 출력 |
| `src/renderer/height_measurer.rs` | 수식 높이 측정 |
| `src/renderer/pagination/engine.rs` | 수식 페이지네이션 처리 |

### 레이아웃 박스

```rust
struct LayoutBox {
    x: f64, y: f64,           // 부모 기준 상대 좌표
    width: f64, height: f64,  // 크기
    baseline: f64,             // 기준선 (아래에서 위로)
    content: LayoutContent,
}

enum LayoutContent {
    Text { text: String, font_size: f64, italic: bool },
    Line { x1: f64, y1: f64, x2: f64, y2: f64 },     // 분수선
    Radical { body_width: f64, body_height: f64 },     // √ 기호
    Group(Vec<LayoutBox>),
}
```

### 주요 배치 규칙

| 구조 | 규칙 |
|------|------|
| **분수** | `width = max(numer.w, denom.w) + 여백`, 분수선 y = 중앙 - offset, 분자/분모 각각 중앙 정렬 |
| **위첨자** | `font_size *= 0.7`, y = base.y - base.height * 0.5 |
| **아래첨자** | `font_size *= 0.7`, y = base.y + base.height * 0.3 |
| **루트** | √ 경로 + 상단 가로선, body 오른쪽 배치 |
| **큰 연산자** | 기호 확대(1.5x), 위/아래 첨자 수직 중앙 |
| **행렬** | 열폭 = 각 열 최대값, 행높이 = 각 행 최대값, 셀 중앙 정렬 |
| **괄호** | 내용 높이에 비례하여 스케일 |

### RenderNodeType::Equation

```rust
pub struct EquationNode {
    pub svg_content: String,     // 사전 렌더링된 SVG 요소들
    pub section_index: usize,
    pub para_index: usize,
    pub control_index: usize,
}
```

수식은 자체 좌표계 내에서 SVG 요소를 미리 생성하고, 최종 출력 시 translate로 위치만 조정.

### 검증
- cargo test 통과
- SVG 내보내기로 수식 렌더링 시각적 확인
- 기본 수식: 분수, 첨자, 루트, 적분/시그마, 행렬

---

## 4단계: 통합 테스트 + 엣지케이스 + WASM 빌드

### 목표
수식 포함 실제 HWP 파일 렌더링 품질 검증, WASM 빌드 확인

### 내용

- 수식 포함 샘플 HWP 파일 SVG 내보내기 검증
- HWPX 파일 수식 렌더링 검증
- 인라인(treat_as_char) 수식 레이아웃 검증
- 페이지 분할 시 수식 처리 검증
- WASM Docker 빌드
- 615+ 기존 테스트 + 신규 수식 테스트 모두 통과
