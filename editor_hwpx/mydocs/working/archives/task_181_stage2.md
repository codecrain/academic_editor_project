# 타스크 181 — 2단계 완료 보고서: 토크나이저 + 기호 매핑 + AST 파서

## 목표
수식 스크립트 문자열을 토큰화하고 AST(추상 구문 트리)로 변환

## 완료 내역

### 1. 토크나이저 (`src/renderer/equation/tokenizer.rs`)
- `TokenType` enum: Command, Number, Symbol, Text, 괄호 6종, Subscript/Superscript, Whitespace, Quoted, Eof
- `Tokenizer` 구조체: char 기반 스캐너
- 다중 문자 기호: `<=`, `>=`, `!=`, `==`, `<<`, `>>`, `<<<`, `>>>`, `->`
- 따옴표 문자열 처리: `"1234567890"` → `Quoted` 토큰
- 비-ASCII 연속 문자(한글) 통합: `"평점"` → 단일 `Text` 토큰
- 단위 테스트: 12개

### 2. 기호 매핑 (`src/renderer/equation/symbols.rs`)
- Unicode 직접 매핑 (LaTeX 대신 SVG 렌더링용)
- 매핑 테이블: GREEK_LOWER(29), GREEK_UPPER(25), SPECIAL_SYMBOLS(30+), OPERATORS(60+), BIG_OPERATORS(35+), ARROWS(20+), BRACKETS(6), FUNCTIONS(25+)
- `lookup_symbol()`: 통합 조회
- `lookup_function()`: 함수 이름 조회
- `DECORATIONS` / `FONT_STYLES`: 장식/글꼴 매핑
- `DecoKind`(15종), `FontStyleKind`(3종) enum 정의
- `is_structure_command()`, `is_big_operator()`, `is_function()` 판별 함수
- 단위 테스트: 7개

### 3. AST 노드 정의 (`src/renderer/equation/ast.rs`)
- `EqNode` enum: 21개 variant
  - Row, Text, Number, Symbol, MathSymbol, Function
  - Fraction, Atop, Sqrt, Superscript, Subscript, SubSup
  - BigOp, Limit, Matrix, Cases, Pile, Paren
  - Decoration, FontStyle, Color, Space, Newline, Quoted, Empty
- `MatrixStyle`(4종), `SpaceKind`(3종), `PileAlign`(3종) enum
- `simplify()` 메서드: Row 중첩 제거

### 4. 재귀 하강 파서 (`src/renderer/equation/parser.rs`)
- `EqParser` 구조체: 토큰 리스트 → AST 변환
- 명령어 대소문자 무시 비교 (`cmd_eq()`) — 스펙 규정 준수
- 최상위 OVER 분수 감지 (`has_toplevel_over`) — LEFT/RIGHT, 중괄호 내부 제외
- 주요 파싱 메서드:
  - `parse_fraction()`: 분수 (OVER 기준 분자/분모 분리)
  - `parse_sqrt()`: 제곱근 (SQRT x, SQRT(n) of x)
  - `parse_big_op()`: 큰 연산자 (INT, SUM, PROD 등 + 첨자)
  - `parse_limit()`: 극한 (lim, Lim)
  - `parse_matrix()`: 행렬 (MATRIX, PMATRIX, BMATRIX, DMATRIX)
  - `parse_cases()`: 조건식 (CASES)
  - `parse_pile()`: 세로 쌓기 (PILE, LPILE, RPILE)
  - `parse_left_right()`: 자동 크기 괄호 (LEFT-RIGHT)
  - `parse_color()`: 색상 (COLOR{R,G,B}{body})
  - `parse_decoration()`: 글자 장식 (hat, bar, vec 등)
  - `parse_group()`: 중괄호 그룹 (내부 OVER 자동 분수 처리)
  - `try_parse_scripts()`: 첨자 (`_`, `^`) 파싱
- 단위 테스트: 14개 (실제 수식 포함)

### 5. 모듈 등록 (`src/renderer/equation/mod.rs`, `src/renderer/mod.rs`)

## 핵심 설계 결정

1. **Unicode 직접 매핑**: Python 참조 코드의 LaTeX 문자열 대신 Unicode 문자로 매핑 → SVG `<text>` 요소에서 직접 렌더링 가능
2. **대소문자 무시 비교**: 스펙에 따라 그리스 문자/화살표/lim/image/prime 제외한 명령어는 대소문자 구분 없음
3. **그룹 내 OVER 자동 처리**: `{a over b}` → 자동으로 Fraction 노드 생성
4. **첨자 파싱 분리**: `parse_group()`에서는 첨자를 파싱하지 않고, 호출자(`parse_element`, `parse_big_op` 등)가 적절한 레벨에서 처리

## 테스트 결과

- **648개 통과** (기존 615 + 신규 33)
- cargo build: 성공
- 실제 수식 스크립트 파싱 검증:
  - `"평점=입찰가격평가~배점한도 TIMES LEFT ( {최저입찰가격} over {해당입찰가격} RIGHT )"` → Row + Paren(Fraction) 구조 정상 생성

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `src/renderer/equation/mod.rs` | 모듈 선언 (신규) |
| `src/renderer/equation/tokenizer.rs` | 토크나이저 (신규) |
| `src/renderer/equation/symbols.rs` | 기호 매핑 (신규) |
| `src/renderer/equation/ast.rs` | AST 노드 정의 (신규) |
| `src/renderer/equation/parser.rs` | 재귀 하강 파서 (신규) |
| `src/renderer/mod.rs` | `pub mod equation;` 추가 |
