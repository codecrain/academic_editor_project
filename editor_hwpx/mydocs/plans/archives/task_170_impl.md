# 타스크 170: 글자모양 심화 속성 — 구현계획서

## 구현 단계 (3단계)

### 1단계: Rust 모델 + 파서 + 시리얼라이저

**`src/model/style.rs`** — CharShape에 4개 필드 추가:
- `emphasis_dot: u8` (0~6, 강조점 종류)
- `underline_shape: u8` (0~10, 표 27 선 종류)
- `strike_shape: u8` (0~10, 표 27 선 종류)
- `kerning: bool`

CharShapeMods에 동일 4개 Option 필드 + apply_to() 구현.
PartialEq에도 4개 필드 비교 추가.

**`src/parser/doc_info.rs`** — parse_char_shape에서 비트 추출:
```rust
let underline_shape = ((attr >> 4) & 0x0F) as u8;    // bits 4-7
let emphasis_dot = ((attr >> 21) & 0x0F) as u8;      // bits 21-24
let strike_shape = ((attr >> 26) & 0x0F) as u8;      // bits 26-29
let kerning = (attr & (1 << 30)) != 0;                // bit 30
```

**`src/serializer/doc_info.rs`** — serialize_char_shape에서 역방향 비트 기록.

### 2단계: JSON 연동 + 프론트엔드 연결

**`src/document_core/commands/formatting.rs`** — build_char_properties_json:
- `emphasisDot`, `underlineShape`, `strikeShape`, `kerning` 4개 필드 추가

**`src/document_core/helpers.rs`** — parse_char_shape_mods:
- JSON에서 `emphasisDot` (u8), `underlineShape` (u8), `strikeShape` (u8), `kerning` (bool) 파싱

**`rhwp-studio/src/core/types.ts`** — CharProperties 인터페이스에 4개 필드 추가

**`rhwp-studio/src/ui/char-shape-dialog.ts`**:
- 강조점 select: 문자열 값 → 숫자 값(0~6) 전환, 6종 옵션
- 밑줄 모양 select: 문자열 값 → 숫자 값(0~10) 전환, 11종 옵션
- 취소선 모양 select: 문자열 값 → 숫자 값(0~10) 전환, 11종 옵션
- 커닝 체크박스: private 필드 참조 저장 + show()/collectMods() 연결
- show(): 백엔드 값으로 초기화 (TODO 제거)
- collectMods(): 변경값 mods에 포함

### 3단계: 렌더링

**ResolvedCharStyle** (`style_resolver.rs`): 4개 필드 추가
**TextStyle** (`mod.rs`): 5개 필드 추가 (emphasis_dot, underline_shape, strike_shape, underline_color, strike_color)
**resolved_to_text_style** (`text_measurement.rs`): 새 필드 매핑

**SVG 렌더러** (`svg.rs`):
- `draw_line_shape()` 헬퍼: 선 모양별 SVG 출력
  - 0=실선 (stroke-dasharray 없음)
  - 1=긴점선 ("8 4"), 2=점선 ("2 2"), 3=일점쇄선 ("8 4 2 4")
  - 4=이점쇄선 ("8 4 2 4 2 4"), 5=긴파선 ("12 4"), 6=원형점 ("1 3" + round linecap)
  - 7=이중선 (2개 line), 8=가는+굵은 (2개 line), 9=굵은+가는 (2개 line), 10=삼중선 (3개 line)
- 밑줄: underline_color 우선, draw_line_shape 호출
- 취소선: strike_color 우선, draw_line_shape 호출
- 강조점: 글자 상단 중앙에 종류별 유니코드 문자 배치 (크기 30%)

**Canvas 렌더러** (`web_canvas.rs`):
- `draw_line_shape_canvas()` + `draw_single_canvas_line()`: Canvas API 기반 동일 구현
- set_line_dash() 호출로 대시 패턴 표현
- 강조점: fill_text()로 문자 배치

**HTML 렌더러** (`html.rs`):
- CSS text-decoration-style로 기본 매핑 (solid/dashed/dotted/double/wavy)

## 검증

| 시나리오 | 기대 결과 |
|---------|----------|
| 강조점 있는 HWP 파일 SVG 내보내기 | 글자 위에 ●/○ 등 표시 |
| 글자모양 대화상자에서 강조점 설정 | emphasisDot 값 저장, 렌더링 반영 |
| 밑줄 모양 "점선" 설정 | 점선 패턴 밑줄 렌더링 |
| 취소선 모양 "이중선" 설정 | 이중 취소선 렌더링 |
| 커서를 강조점 텍스트로 이동 | 대화상자에 강조점 종류 표시 |
| HWP 저장 후 한컴에서 열기 | 강조점/밑줄모양/취소선모양 정상 표시 |
